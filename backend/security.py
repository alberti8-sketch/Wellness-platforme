from __future__ import annotations

import hmac
from collections.abc import Callable

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from config import Principal, Role, principals, tenant_by_id
from db import get_db


def get_principal(
    x_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Principal:
    """A signed-in user (Authorization: Bearer) or an API key (X-API-Key: demo accounts and integrations)."""
    if authorization:
        from routers.auth import user_from_token  # local import: the auth router imports this module's users

        user = user_from_token(db, authorization)
        if user is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expirée, reconnectez-vous.")
        return Principal(user.email, Role.VIEWER, tenant_by_id(user.tenant_id))
    if not x_api_key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Connexion requise.")
    for key, principal in principals().items():
        if hmac.compare_digest(key.encode(), x_api_key.encode()):
            return principal
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Clé API invalide.")


def require(role: Role) -> Callable[[Principal], Principal]:
    def _dep(principal: Principal = Depends(get_principal)) -> Principal:
        if not principal.can(role):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Rôle « {role} » requis.")
        return principal

    return _dep
