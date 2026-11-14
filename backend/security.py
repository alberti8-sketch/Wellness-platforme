from __future__ import annotations

import hmac
from collections.abc import Callable

from fastapi import Depends, Header, HTTPException, status

from config import Principal, Role, principals


def get_principal(x_api_key: str | None = Header(default=None)) -> Principal:
    if not x_api_key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "En-tête X-API-Key manquant.")
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
