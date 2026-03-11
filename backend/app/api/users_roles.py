from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.auth import User, Role, Permission
from app.schemas.auth import UserOut, UserUpdate, RoleOut, RoleCreate, PermissionOut
from app.api.auth import get_current_user
from app.core.security import get_password_hash

router = APIRouter(prefix="/users-roles", tags=["users-roles"])

# USERS
@router.get("/users", response_model=List[UserOut])
async def list_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="No tiene permisos")
    return db.query(User).all()

@router.patch("/users/{user_id}/roles", response_model=UserOut)
async def update_user_roles(
    user_id: int, 
    role_ids: List[int], 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="No tiene permisos")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    roles = db.query(Role).filter(Role.id.in_(role_ids)).all()
    user.roles = roles
    db.commit()
    db.refresh(user)
    return user

@router.patch("/users/{user_id}/password")
async def update_user_password(
    user_id: int,
    password_data: dict, # simple dict for now: {"password": "..."}
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="No tiene permisos")
    
    new_password = password_data.get("password")
    if not new_password:
        raise HTTPException(status_code=400, detail="Password es requerido")
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    user.hashed_password = get_password_hash(new_password)
    db.commit()
    return {"message": "Password actualizado"}

@router.patch("/users/{user_id}/status", response_model=UserOut)
async def toggle_user_status(
    user_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="No tiene permisos")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    user.is_active = not user.is_active
    db.commit()
    db.refresh(user)
    return user

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="No tiene permisos")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    db.delete(user)
    db.commit()
    return {"message": "Usuario eliminado"}

# ROLES
@router.get("/roles", response_model=List[RoleOut])
async def list_roles(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Role).all()

@router.post("/roles", response_model=RoleOut)
async def create_role(
    role_in: RoleCreate, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="No tiene permisos")
    
    new_role = Role(name=role_in.name, description=role_in.description)
    if role_in.permission_ids:
        perms = db.query(Permission).filter(Permission.id.in_(role_in.permission_ids)).all()
        new_role.permissions = perms
        
    db.add(new_role)
    db.commit()
    db.refresh(new_role)
    return new_role

@router.put("/roles/{role_id}", response_model=RoleOut)
async def update_role(
    role_id: int,
    role_in: RoleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="No tiene permisos")
    
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    
    role.name = role_in.name
    role.description = role_in.description
    
    if role_in.permission_ids is not None:
        perms = db.query(Permission).filter(Permission.id.in_(role_in.permission_ids)).all()
        role.permissions = perms
        
    db.commit()
    db.refresh(role)
    return role

@router.delete("/roles/{role_id}")
async def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="No tiene permisos")
    
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    
    db.delete(role)
    db.commit()
    return {"message": "Rol eliminado"}

# PERMISSIONS
@router.get("/permissions", response_model=List[PermissionOut])
async def list_permissions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Permission).all()
