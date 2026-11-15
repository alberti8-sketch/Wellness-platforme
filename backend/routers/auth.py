"""Accounts for elected officials and municipal teams: register, sign in, profile, sign out."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

import auth
from config import Principal, Role, tenant_by_id
from db import get_db
from geo import territory_name
from models import User, UserSession
from routers.analytics import build_overview, parse_weights

router = APIRouter(prefix="/api/auth", tags=["auth"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _tracked_cities(db: Session) -> list[dict[str, Any]]:
    """Communes with published scores for the self-registration tenant (the cities a user can pick)."""
    viewer = Principal("inscription", Role.VIEWER, tenant_by_id(auth.USER_TENANT))
    ov = build_overview(db, viewer, None, parse_weights(None))
    return sorted(
        ({"code": t.code, "name": t.name, "type": t.context.territory_type} for t in ov.territories if len(t.code) == 5),
        key=lambda c: c["name"],
    )


class RegisterIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    email: str = Field(max_length=254)
    password: str = Field(min_length=8, max_length=128)
    job: str = Field(min_length=1, max_length=80)
    city_code: str = Field(min_length=5, max_length=5)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        if not EMAIL_RE.match(v):
            raise ValueError("Adresse e-mail invalide")
        return v.lower()


class LoginIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    email: str = Field(max_length=254)
    password: str = Field(max_length=128)


def _user_out(u: User) -> dict[str, Any]:
    return {"email": u.email, "job": u.job, "city_code": u.city_code, "city_name": territory_name(u.city_code)}


def _open_session(db: Session, user: User) -> dict[str, Any]:
    token, digest = auth.new_token()
    db.add(UserSession(token_hash=digest, user_id=user.id, expires_at=auth.session_expiry()))
    db.commit()
    return {"token": token, "user": _user_out(user)}


def _bearer(authorization: str | None) -> str | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return authorization[7:].strip() or None


def user_from_token(db: Session, authorization: str | None) -> User | None:
    """The signed-in user for an Authorization: Bearer header, if the session exists and has not expired."""
    token = _bearer(authorization)
    if token is None:
        return None
    s = db.get(UserSession, auth.token_hash(token))
    if s is None:
        return None
    expires = s.expires_at if s.expires_at.tzinfo else s.expires_at.replace(tzinfo=UTC)
    if expires < datetime.now(UTC):
        db.delete(s)
        db.commit()
        return None
    return db.get(User, s.user_id)


@router.get("/options")
def options(db: Session = Depends(get_db)) -> dict[str, Any]:
    """Public: the jobs and the cities offered in the sign-up form."""
    return {"jobs": auth.JOBS, "cities": _tracked_cities(db)}


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(body: RegisterIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    if body.city_code not in {c["code"] for c in _tracked_cities(db)}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Cette commune n'est pas encore suivie par la plateforme.")
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Un compte existe déjà avec cette adresse e-mail.")
    user = User(email=body.email, password_hash=auth.hash_password(body.password), job=body.job,
                city_code=body.city_code, tenant_id=auth.USER_TENANT)
    db.add(user)
    db.flush()
    return _open_session(db, user)


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    # Same message whether the e-mail or the password is wrong.
    if user is None or not auth.verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "E-mail ou mot de passe incorrect.")
    return _open_session(db, user)


@router.get("/me")
def me(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> dict[str, Any]:
    user = user_from_token(db, authorization)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expirée, reconnectez-vous.")
    return _user_out(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def logout(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> Response:
    token = _bearer(authorization)
    if token:
        s = db.get(UserSession, auth.token_hash(token))
        if s is not None:
            db.delete(s)
            db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
