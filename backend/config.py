"""Runtime configuration: database, CORS, tenants and API-key principals.

MVP authentication is API-key based (header `X-API-Key`). Each key maps to a
principal bound to exactly ONE tenant; every query in the API is filtered by
that tenant id. Replace with OIDC/SSO before production.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from enum import StrEnum
from functools import lru_cache
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

DATABASE_URL = os.getenv("WELLNESS_DATABASE_URL", f"sqlite:///{BASE_DIR / 'wellness.db'}")
CORS_ORIGINS = [o.strip() for o in os.getenv("WELLNESS_CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
MAX_UPLOAD_BYTES = int(os.getenv("WELLNESS_MAX_UPLOAD_BYTES", str(5 * 1024 * 1024)))
MAX_ROWS = int(os.getenv("WELLNESS_MAX_ROWS", "5000"))


class Role(StrEnum):
    VIEWER = "viewer"
    CONTRIBUTOR = "contributor"  # can upload
    ADMIN = "admin"  # can upload, override, approve, reject


class StakeholderType(StrEnum):
    B2B = "B2B"  # corporate wellness
    B2G = "B2G"  # municipal / government health


@dataclass(frozen=True)
class Tenant:
    id: str
    name: str
    stakeholder_type: StakeholderType
    # Territory codes this tenant may submit/see. None = no geographic restriction.
    allowed_territories: frozenset[str] | None = None


@dataclass(frozen=True)
class Principal:
    display_name: str
    role: Role
    tenant: Tenant

    def can(self, role: Role) -> bool:
        order = [Role.VIEWER, Role.CONTRIBUTOR, Role.ADMIN]
        return order.index(self.role) >= order.index(role)


_DEMO_TENANTS = {
    "b2g-sante-publique": Tenant("b2g-sante-publique", "Observatoire régional de santé (démo)", StakeholderType.B2G),
    "b2b-corp-wellness": Tenant(
        "b2b-corp-wellness",
        "Groupe Industriel — Qualité de vie au travail (démo)",
        StakeholderType.B2B,
        frozenset({"75", "69", "13"}),
    ),
}

_DEMO_KEYS = {
    "demo-b2g-admin": ("Admin ORS (démo)", Role.ADMIN, "b2g-sante-publique"),
    "demo-b2g-contrib": ("Chargé d'études ORS (démo)", Role.CONTRIBUTOR, "b2g-sante-publique"),
    "demo-b2b-admin": ("Responsable QVT (démo)", Role.ADMIN, "b2b-corp-wellness"),
}


@lru_cache
def principals() -> dict[str, Principal]:
    """Load principals from WELLNESS_PRINCIPALS_FILE (JSON) or fall back to demo keys.

    JSON format:
      {"tenants": {"<id>": {"name": "...", "stakeholder_type": "B2G", "allowed_territories": ["75"]}},
       "keys": {"<api-key>": {"name": "...", "role": "admin", "tenant": "<id>"}}}
    """
    path = os.getenv("WELLNESS_PRINCIPALS_FILE")
    if path:
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
        tenants = {
            tid: Tenant(
                tid,
                t["name"],
                StakeholderType(t["stakeholder_type"]),
                frozenset(t["allowed_territories"]) if t.get("allowed_territories") else None,
            )
            for tid, t in raw["tenants"].items()
        }
        return {
            key: Principal(k["name"], Role(k["role"]), tenants[k["tenant"]]) for key, k in raw["keys"].items()
        }
    return {key: Principal(name, role, _DEMO_TENANTS[tid]) for key, (name, role, tid) in _DEMO_KEYS.items()}


def tenant_by_id(tenant_id: str) -> Tenant:
    for p in principals().values():
        if p.tenant.id == tenant_id:
            return p.tenant
    raise KeyError(tenant_id)


@lru_cache
def departements() -> dict[str, str]:
    """Reference list of French metropolitan departments (code -> name)."""
    return json.loads((BASE_DIR / "data" / "departements.json").read_text(encoding="utf-8"))
