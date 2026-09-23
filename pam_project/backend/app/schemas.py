import uuid
from datetime import datetime
from ipaddress import ip_address

from pydantic import BaseModel, Field, field_validator


class AccessRequestCreate(BaseModel):
    target_system: str = Field(min_length=7, max_length=45)
    requested_role: str = Field(min_length=2, max_length=255)
    justification: str = Field(min_length=10, max_length=4000)
    duration_minutes: int = Field(ge=15, le=43200)

    @field_validator("target_system")
    @classmethod
    def validate_target_ip(cls, value: str) -> str:
        try:
            return str(ip_address(value))
        except ValueError as exc:
            raise ValueError("Target server must be a valid IPv4 or IPv6 address") from exc


class AccessRequestDecision(BaseModel):
    approved: bool
    comment: str = Field(min_length=3, max_length=4000)


class AccessRequestOut(BaseModel):
    id: uuid.UUID
    requester_username: str
    target_system: str
    requested_role: str
    justification: str
    duration_minutes: int
    status: str
    decision_by_username: str | None
    decision_comment: str | None
    created_at: datetime
    decided_at: datetime | None
    access_expires_at: datetime | None
    connect_issued_at: datetime | None

    model_config = {"from_attributes": True}


class AuditEventOut(BaseModel):
    id: uuid.UUID
    actor_username: str
    event_type: str
    detail: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConnectOut(BaseModel):
    redirect_url: str
