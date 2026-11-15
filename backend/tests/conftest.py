from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("WELLNESS_DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    # Re-import modules bound to the database URL so each test gets a fresh DB.
    for mod in [m for m in list(sys.modules) if m.split(".")[0] in
                {"config", "db", "models", "main", "routers", "pipeline", "security", "schemas", "geo", "app", "ml_tree", "external_data", "commune_domains", "auth", "report", "diseases", "assistant"}]:
        del sys.modules[mod]
    from fastapi.testclient import TestClient

    import main

    with TestClient(main.app) as c:
        yield c


ADMIN_B2G = {"X-API-Key": "demo-b2g-admin"}
CONTRIB_B2G = {"X-API-Key": "demo-b2g-contrib"}
ADMIN_B2B = {"X-API-Key": "demo-b2b-admin"}

os.environ.setdefault("PYTHONHASHSEED", "0")
