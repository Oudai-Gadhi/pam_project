import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, require_group
from app.database import get_db
from app.config import get_settings
from app.models import AccessRequest, AuditEvent
from app.schemas import AccessRequestCreate, AccessRequestDecision, AccessRequestOut, AuditEventOut, ConnectOut
from app.services.guacamole import build_redirect_url
from app.services.vault import VaultError, issue_ssh_credential

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


def requester_ip(request: Request) -> str | None:
    # The backend is only reachable through the frontend proxy in Compose.
    # nginx overwrites this header with the browser-facing address.
    forwarded = request.headers.get("x-forwarded-for")
    return forwarded.split(",", 1)[0].strip() if forwarded else (request.client.host if request.client else None)


def registered_target(target_name: str, target_user: str) -> dict:
    target = get_settings().targets.get(target_name)
    if not target or not isinstance(target, dict):
        raise HTTPException(status_code=422, detail="Target server is not registered for PAM access")
    if target_user not in target.get("users", []):
        raise HTTPException(status_code=422, detail="Target Linux user is not permitted for this server")
    if not isinstance(target.get("host"), str) or not target["host"]:
        raise HTTPException(status_code=503, detail="Target server configuration is incomplete")
    return target


@router.post("", response_model=AccessRequestOut, status_code=status.HTTP_201_CREATED)
def create_request(
    payload: AccessRequestCreate,
    http_request: Request,
    user: Annotated[dict, Depends(require_group("pam_users"))],
    db: Db,
):
    sub, username = identity(user)
    registered_target(payload.target_system, payload.requested_role)
    request = AccessRequest(
        requester_sub=sub,
        requester_username=username,
        requester_ip=requester_ip(http_request),
        **payload.model_dump(),
    )
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
    if payload.approved:
        request.access_expires_at = request.decided_at + timedelta(minutes=request.duration_minutes)
    db.add(event(request, user, request.status, payload.comment))
    db.commit()
    db.refresh(request)
    return request


@router.post("/{request_id}/connect", response_model=ConnectOut)
def connect_request(
    request_id: uuid.UUID,
    user: Annotated[dict, Depends(require_group("pam_users"))],
    db: Db,
):
    """Mint one short-lived SSH certificate and hand it directly to Guacamole.

    Private key material is created only after the requester clicks Connect and
    never committed to the PAM database.
    """
    request = db.scalar(select(AccessRequest).where(AccessRequest.id == request_id).with_for_update())
    if request is None:
        raise HTTPException(status_code=404, detail="Access request not found")
    sub, username = identity(user)
    if request.requester_sub != sub:
        raise HTTPException(status_code=403, detail="Only the requester can open this session")
    if request.status != "APPROVED":
        raise HTTPException(status_code=409, detail="Only approved requests can start a session")
    if request.connect_issued_at is not None:
        raise HTTPException(status_code=409, detail="A connection link has already been issued for this request")
    if request.access_expires_at is None or request.access_expires_at <= datetime.now(timezone.utc):
        request.status = "EXPIRED"
        db.add(event(request, user, "EXPIRED", "Approval window expired before a session started"))
        db.commit()
        raise HTTPException(status_code=409, detail="The approved access window has expired")

    target = registered_target(request.target_system, request.requested_role)
    seconds_remaining = (request.access_expires_at - datetime.now(timezone.utc)).total_seconds()
    ttl_minutes = max(1, int(seconds_remaining // 60))
    try:
        credential = issue_ssh_credential(
            get_settings(), principal=request.requested_role, ttl_minutes=ttl_minutes
        )
    except VaultError:
        raise HTTPException(status_code=503, detail="Credential issuer is unavailable; no session was created")

    request.connect_issued_at = datetime.now(timezone.utc)
    request.certificate_serial = credential.serial_number
    request.status = "ACTIVE"
    db.add(event(request, user, "SESSION_ISSUED", f"Vault certificate serial {credential.serial_number}"))
    db.commit()

    return ConnectOut(
        redirect_url=build_redirect_url(
            get_settings(),
            username=username,
            request_id=str(request.id),
            target_host=target["host"],
            target_port=int(target.get("port", 22)),
            target_username=request.requested_role,
            expires_at=request.access_expires_at,
            credential=credential,
        )
    )


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
