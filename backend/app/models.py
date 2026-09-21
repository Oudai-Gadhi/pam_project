import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AccessRequest(Base):
    __tablename__ = "access_requests"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    requester_sub: Mapped[str] = mapped_column(String(255), index=True)
    requester_username: Mapped[str] = mapped_column(String(255))
    target_system: Mapped[str] = mapped_column(String(255), index=True)
    requested_role: Mapped[str] = mapped_column(String(255))
    justification: Mapped[str] = mapped_column(Text)
    duration_minutes: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", index=True)
    decision_by_sub: Mapped[str | None] = mapped_column(String(255), nullable=True)
    decision_by_username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    decision_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    events: Mapped[list["AuditEvent"]] = relationship(back_populates="request", cascade="all, delete-orphan")


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("access_requests.id", ondelete="CASCADE"), index=True)
    actor_sub: Mapped[str] = mapped_column(String(255))
    actor_username: Mapped[str] = mapped_column(String(255))
    event_type: Mapped[str] = mapped_column(String(50))
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    request: Mapped[AccessRequest] = relationship(back_populates="events")
