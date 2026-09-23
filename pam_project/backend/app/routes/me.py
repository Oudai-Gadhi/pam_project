from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user, get_user_groups

router = APIRouter(prefix="/api", tags=["identity"])


@router.get("/me")
async def get_me(user: Annotated[dict, Depends(get_current_user)]) -> dict:
    """
    Returns verified JWT claims for the caller.
    Groups are normalized to a list for consistent frontend/backend consumption.
    """
    return {
        "sub": user.get("sub"),
        "preferred_username": user.get("preferred_username"),
        "email": user.get("email"),
        "name": user.get("name"),
        "groups": get_user_groups(user),
        "iss": user.get("iss"),
        "aud": user.get("aud"),
        "exp": user.get("exp"),
    }
