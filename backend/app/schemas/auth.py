from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import datetime

class PermissionBase(BaseModel):
    name: str
    codename: str
    module: Optional[str] = None

class PermissionOut(PermissionBase):
    id: int
    class Config:
        from_attributes = True

class RoleBase(BaseModel):
    name: str
    description: Optional[str] = None

class RoleCreate(RoleBase):
    permission_ids: Optional[List[int]] = []

class RoleOut(RoleBase):
    id: int
    permissions: List[PermissionOut] = []
    class Config:
        from_attributes = True

class UserBase(BaseModel):
    username: str
    email: EmailStr

class UserCreate(UserBase):
    password: str
    role_ids: List[int] = []

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    role_ids: Optional[List[int]] = None

class UserOut(UserBase):
    id: int
    is_active: bool
    is_superuser: bool
    roles: List[RoleOut] = []
    created_at: datetime
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None
