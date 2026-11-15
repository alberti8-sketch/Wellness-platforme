"""Simple e-mail / password accounts: PBKDF2 password hashing and opaque bearer tokens.

Passwords are hashed with PBKDF2-HMAC-SHA256 (random 16-byte salt, 310,000 iterations — OWASP 2023);
sessions are random 32-byte tokens, of which only the SHA-256 is stored, valid SESSION_DAYS days.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from datetime import UTC, datetime, timedelta

ITERATIONS = 310_000
SESSION_DAYS = int(os.getenv("WELLNESS_SESSION_DAYS", "30"))
# Tenant (and therefore data perimeter) given to self-registered accounts.
USER_TENANT = os.getenv("WELLNESS_USER_TENANT", "b2g-sante-publique")

# The tool is designed for elected mayors and their municipal teams.
JOBS = [
    "Maire",
    "Adjoint·e au maire",
    "Conseiller·e municipal·e",
    "Directeur·rice général·e des services",
    "Agent de la collectivité",
    "Autre",
]


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)
    return f"pbkdf2_sha256${ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt, digest = stored.split("$")
    except ValueError:
        return False
    if algo != "pbkdf2_sha256":
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iterations))
    return hmac.compare_digest(candidate.hex(), digest)


def new_token() -> tuple[str, str]:
    """(token given to the client, hash stored in the database)."""
    token = secrets.token_urlsafe(32)
    return token, token_hash(token)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def session_expiry() -> datetime:
    return datetime.now(UTC) + timedelta(days=SESSION_DAYS)
