import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, require_group
from app.database import get_db
from app.models import AccessRequest, AuditEvent
from app.schemas import AccessRequestCreate, AccessRequestDecision, AccessRequestOut, AuditEventOut

router = APIRouter(prefix="/api/requests", tags=["access requests"])
Db = Annotated[Session, Depends(get_db)]


def identity(claims: dict) -> tuple[str, str]:
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Token is missing subject")
    return sub, claims.get("preferred_username") or sub


def event(request: AccessRequest, actor: dict, event_type: str, detail: str | None = None) -> AuditEvent:
    sub, username = identity(actor)
    return AuditEvent(request=request, actor_sub=sub, actor_username=username, event_type=event_type, detail=detail)


@router.post("", response_model=AccessRequestOut, status_code=status.HTTP_201_CREATED)
def create_request(
    payload: AccessRequestCreate,
    user: Annotated[dict, Depends(require_group("pam_users"))],
    db: Db,
):
    sub, username = identity(user)
    request = AccessRequest(requester_sub=sub, requester_username=username, **payload.model_dump())
    db.add(request)
    db.flush()
    db.add(event(request, user, "REQUESTED", "Access request submitted"))
    db.commit()
    db.refresh(request)
    return request


@router.get("/mine", response_model=list[AccessRequestOut])
def list_my_requests(user: Annotated[dict, Depends(require_group("pam_users"))], db: Db):
    sub, _ = identity(user)
    return db.scalars(select(AccessRequest).where(AccessRequest.requester_sub == sub).order_by(AccessRequest.created_at.desc())).all()


@router.get("/pending", response_model=list[AccessRequestOut])
def list_pending_requests(user: Annotated[dict, Depends(require_group("approvers"))], db: Db):
    return db.scalars(select(AccessRequest).where(AccessRequest.status == "PENDING").order_by(AccessRequest.created_at.asc())).all()


@router.post("/{request_id}/decision", response_model=AccessRequestOut)
def decide_request(
    request_id: uuid.UUID,
    payload: AccessRequestDecision,
    user: Annotated[dict, Depends(require_group("approvers"))],
    db: Db,
):
    request = db.get(AccessRequest, request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Access request not found")
    sub, username = identity(user)
    if request.requester_sub == sub:
        raise HTTPException(status_code=403, detail="Approvers cannot decide their own requests")
    if request.status != "PENDING":
        raise HTTPException(status_code=409, detail="Only pending requests can be decided")

    request.status = "APPROVED" if payload.approved else "REJECTED"
    request.decision_by_sub = sub
    request.decision_by_username = username
    request.decision_comment = payload.comment
    request.decided_at = datetime.now(timezone.utc)
    db.add(event(request, user, request.status, payload.comment))
    db.commit()
    db.refresh(request)
    return request


@router.get("/{request_id}/events", response_model=list[AuditEventOut])
def request_events(
    request_id: uuid.UUID,
    user: Annotated[dict, Depends(get_current_user)],
    db: Db,
):
    request = db.get(AccessRequest, request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Access request not found")
    sub, _ = identity(user)
    if request.requester_sub != sub and "approvers" not in user.get("groups", []):
        raise HTTPException(status_code=403, detail="Not permitted to view this audit trail")
    return db.scalars(select(AuditEvent).where(AuditEvent.request_id == request_id).order_by(AuditEvent.created_at.asc())).all()
