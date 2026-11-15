"""Commune report (JSON, printed as PDF by the web page), diseases of the commune, and the solutions assistant."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

import assistant
import report
from config import Principal
from db import get_db
from geo import territory_name
from models import ChatConversation
from security import get_principal

router = APIRouter(prefix="/api", tags=["rapport"])

CODE = Query(..., min_length=5, max_length=5, pattern=r"^[0-9AB]{5}$", description="Code INSEE de la commune")


def _report(db: Session, principal: Principal, ville: str) -> dict[str, Any]:
    try:
        return report.build_report(db, principal, ville.upper())
    except report.NotTracked as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cette commune n'est pas suivie par la plateforme.") from exc


@router.get("/rapport")
def rapport(ville: str = CODE, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict[str, Any]:
    return _report(db, principal, ville)


@router.get("/maladies")
def maladies(ville: str = CODE, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict[str, Any]:
    r = _report(db, principal, ville)
    return {**r["diseases"], "code": r["code"], "name": r["name"], "population": r["population"], "departement": r["departement"]}


class ChatIn(BaseModel):
    ville: str = Field(min_length=5, max_length=5)
    question: str = Field(min_length=1, max_length=4000)
    # Continue a saved conversation (its history is sent to the model); none = a new conversation.
    conversation_id: str | None = Field(default=None, max_length=32)


def _owner(principal: Principal) -> str:
    """Conversations belong to one user: the account e-mail, or the API-key name, within its tenant."""
    return f"{principal.tenant.id}:{principal.display_name}"


def _conversation(db: Session, principal: Principal, cid: str) -> ChatConversation:
    conv = db.get(ChatConversation, cid)
    if conv is None or conv.owner != _owner(principal):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation introuvable.")
    return conv


def _summary(c: ChatConversation) -> dict[str, Any]:
    return {"id": c.id, "title": c.title, "ville": c.city_code, "ville_nom": territory_name(c.city_code),
            "messages": len(c.messages or []), "updated_at": c.updated_at.isoformat()}


@router.get("/assistant/status")
def assistant_status(_: Principal = Depends(get_principal)) -> dict[str, Any]:
    return {"configured": assistant.configured(), "model": assistant.model()}


@router.get("/assistant/conversations")
def conversations(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    """The user's saved conversations, most recent first."""
    rows = db.scalars(select(ChatConversation).where(ChatConversation.owner == _owner(principal))
                      .order_by(ChatConversation.updated_at.desc()).limit(100))
    return [_summary(c) for c in rows]


@router.get("/assistant/conversations/{cid}")
def conversation(cid: str, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict[str, Any]:
    c = _conversation(db, principal, cid)
    return {**_summary(c), "items": c.messages or []}


@router.delete("/assistant/conversations/{cid}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_conversation(cid: str, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> Response:
    db.delete(_conversation(db, principal, cid))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/assistant/chat")
def chat(body: ChatIn, principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Ask a question; the question and the answer are saved in the conversation (created on the first question)."""
    conv = _conversation(db, principal, body.conversation_id) if body.conversation_id else None
    ville = conv.city_code if conv else body.ville.upper()
    r = _report(db, principal, ville)
    history = [{"role": m["role"], "content": m["content"]} for m in (conv.messages if conv else [])]
    try:
        out = assistant.answer(report.to_markdown(r), r["name"], [*history, {"role": "user", "content": body.question}])
    except assistant.AssistantUnavailable as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except assistant.AssistantError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    now = datetime.now(UTC)
    if conv is None:
        title = body.question.strip().replace("\n", " ")
        conv = ChatConversation(owner=_owner(principal), tenant_id=principal.tenant.id, city_code=ville,
                                title=title[:117] + "…" if len(title) > 118 else title, messages=[])
        db.add(conv)
    # A new list (not an in-place append) so that SQLAlchemy saves the JSON column.
    conv.messages = [*(conv.messages or []),
                     {"role": "user", "content": body.question, "at": now.isoformat()},
                     {"role": "assistant", "content": out["reply"], "structured": out.get("structured"), "at": now.isoformat()}]
    conv.updated_at = now
    db.commit()
    return {**out, "conversation_id": conv.id, "title": conv.title}
