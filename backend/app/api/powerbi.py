from fastapi import APIRouter, Depends, HTTPException
from app.services.powerbi import PowerBIService
from app.api.auth import get_current_user
from app.models.auth import User

router = APIRouter(prefix="/powerbi", tags=["powerbi"])

@router.get("/embed-params")
async def get_powerbi_embed_params(current_user: User = Depends(get_current_user)):
    try:
        service = PowerBIService()
        params = service.get_embed_params()
        return params
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
