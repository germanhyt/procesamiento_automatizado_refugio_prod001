from fastapi import APIRouter, Depends, HTTPException
from app.services.powerbi import PowerBIService
from app.api.auth import get_current_user
from app.models.auth import User

router = APIRouter(prefix="/powerbi", tags=["powerbi"])


def _user_has_permission(user: User, codename: str) -> bool:
    if user.is_superuser:
        return True
    for role in user.roles or []:
        for perm in getattr(role, "permissions", []) or []:
            if getattr(perm, "codename", None) == codename:
                return True
    return False


@router.get("/embed-params")
async def get_powerbi_embed_params(current_user: User = Depends(get_current_user)):
    if not _user_has_permission(current_user, "dashboard:view"):
        raise HTTPException(status_code=403, detail="No tiene permisos para ver el dashboard")
    try:
        service = PowerBIService()
        params = service.get_embed_params()
        return params
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
