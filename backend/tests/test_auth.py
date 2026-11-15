"""E-mail / password accounts: register, sign in, data access with the session, sign out."""

from __future__ import annotations

import pytest

from tests.conftest import ADMIN_B2G, CONTRIB_B2G

META = {"submitted_by": "Test User", "organization": "ORS Test"}
NEW = {"email": "Maire@Rennes.fr", "password": "motdepasse-sur", "job": "Maire", "city_code": "35238"}


@pytest.fixture()
def published(client):
    """The 14 WP25 cities published for the B2G tenant (the cities offered at sign-up)."""
    from pipeline.template import build_workbook
    from scripts.import_wp25 import load_converted

    files = {"file": ("data.xlsx", build_workbook(load_converted()),
                      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    ds = client.post("/api/ingest/upload", files=files, data=META, headers=CONTRIB_B2G).json()
    client.post(f"/api/datasets/{ds['id']}/approve", json={}, headers=ADMIN_B2G)
    return client


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_password_hashing():
    import auth

    h = auth.hash_password("secret-123")
    assert h.startswith("pbkdf2_sha256$") and "secret-123" not in h
    assert auth.verify_password("secret-123", h)
    assert not auth.verify_password("secret-124", h)
    assert auth.hash_password("secret-123") != h  # random salt


def test_options_are_public(published):
    body = published.get("/api/auth/options").json()
    assert body["jobs"][0] == "Maire"
    assert {"code": "35238", "name": "Rennes", "type": "urbain"} in body["cities"]
    assert len(body["cities"]) == 14


def test_register_login_me_logout(published):
    c = published
    r = c.post("/api/auth/register", json=NEW)
    assert r.status_code == 201, r.text
    token, user = r.json()["token"], r.json()["user"]
    assert user == {"email": "maire@rennes.fr", "job": "Maire", "city_code": "35238", "city_name": "Rennes"}

    # The session gives access to the data, read-only.
    ov = c.get("/api/analytics/overview", headers=bearer(token))
    assert ov.status_code == 200 and len(ov.json()["territories"]) == 14
    assert c.get("/api/me", headers=bearer(token)).json()["role"] == "viewer"

    login = c.post("/api/auth/login", json={"email": "MAIRE@rennes.fr", "password": NEW["password"]})
    assert login.status_code == 200 and login.json()["user"]["city_code"] == "35238"
    assert c.get("/api/auth/me", headers=bearer(login.json()["token"])).json()["email"] == "maire@rennes.fr"

    assert c.post("/api/auth/logout", headers=bearer(token)).status_code == 204
    assert c.get("/api/auth/me", headers=bearer(token)).status_code == 401
    assert c.get("/api/analytics/overview", headers=bearer(token)).status_code == 401


def test_register_errors(published):
    c = published
    assert c.post("/api/auth/register", json=NEW).status_code == 201
    assert c.post("/api/auth/register", json={**NEW, "email": "maire@rennes.fr"}).status_code == 409
    assert c.post("/api/auth/register", json={**NEW, "email": "x@y.fr", "city_code": "75056"}).status_code == 422
    assert c.post("/api/auth/register", json={**NEW, "email": "pas-un-mail"}).status_code == 422
    assert c.post("/api/auth/register", json={**NEW, "email": "a@b.fr", "password": "court"}).status_code == 422


def test_bad_credentials(published):
    c = published
    c.post("/api/auth/register", json=NEW)
    bad_pw = c.post("/api/auth/login", json={"email": NEW["email"], "password": "mauvais-mdp"})
    unknown = c.post("/api/auth/login", json={"email": "inconnu@x.fr", "password": "mauvais-mdp"})
    assert bad_pw.status_code == unknown.status_code == 401
    assert bad_pw.json()["detail"] == unknown.json()["detail"]  # no hint on which one is wrong
    assert c.get("/api/analytics/overview", headers=bearer("faux-jeton")).status_code == 401


def test_session_user_cannot_upload(published):
    token = published.post("/api/auth/register", json=NEW).json()["token"]
    r = published.post("/api/ingest/upload", files={"file": ("a.csv", b"x", "text/csv")}, data=META, headers=bearer(token))
    assert r.status_code == 403
