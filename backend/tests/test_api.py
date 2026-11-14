from __future__ import annotations

import pytest

from tests.conftest import ADMIN_B2B, ADMIN_B2G, CONTRIB_B2G

META = {"submitted_by": "Test User", "organization": "ORS Test"}


@pytest.fixture()
def wp25_rows():
    from scripts.import_wp25 import DEFAULT_SOURCE, convert

    return convert(DEFAULT_SOURCE)[0]


def _xlsx(rows):
    from pipeline.template import build_workbook

    return {"file": ("data.xlsx", build_workbook(rows),
                     "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}


def test_wp25_import(wp25_rows):
    assert len(wp25_rows) == 14
    rennes = next(r for r in wp25_rows if r["territory_code"] == "35238")
    assert rennes["territory_type"] == "urbain" and rennes["population"] == 225_000
    assert rennes["social_qpv_pct"] == 9.3
    assert {r["territory_type"] for r in wp25_rows} == {"urbain", "semi-urbain", "rural"}


def test_auth_required(client):
    assert client.get("/api/datasets").status_code == 401
    assert client.get("/api/datasets", headers={"X-API-Key": "nope"}).status_code == 401


def test_preview_flags_errors(client, wp25_rows):
    rows = [dict(wp25_rows[0]), dict(wp25_rows[0]), {**wp25_rows[1], "env_score": "abc"},
            {**wp25_rows[2], "territory_code": "99999"}, {**wp25_rows[3], "sport_score": 140},
            {**wp25_rows[4], "territory_type": "banlieue"}]
    r = client.post("/api/ingest/preview", files=_xlsx(rows), headers=CONTRIB_B2G)
    assert r.status_code == 200
    codes = sorted(i["code"] for i in r.json()["issues"] if i["severity"] == "error")
    assert codes == ["duplicate", "invalid_value", "invalid_value", "invalid_value", "invalid_value"]


def test_codes_and_french_decimals(client, wp25_rows):
    rows = [{**wp25_rows[6], "territory_code": 6088, "env_score": "81,5", "social_qpv_pct": "NA"},
            {"territory_code": "1", "territory_name": "Ain", "period": 2025, "env_score": 50}]
    body = client.post("/api/ingest/preview-manual", json={"rows": rows}, headers=CONTRIB_B2G).json()
    assert body["error_count"] == 0, body["issues"]
    nice, ain = body["rows"]
    assert nice["territory_code"] == "06088" and nice["values"]["env_score"] == 81.5
    assert nice["values"]["social_qpv_pct"] is None
    assert ain["territory_code"] == "01"  # départements still accepted


def test_full_pipeline_and_publication(client, wp25_rows):
    r = client.post("/api/ingest/upload", files=_xlsx(wp25_rows), data=META, headers=CONTRIB_B2G)
    assert r.status_code == 201, r.text
    ds = r.json()
    assert ds["status"] == "PENDING_APPROVAL"

    detail = client.get(f"/api/datasets/{ds['id']}", headers=CONTRIB_B2G).json()
    states = [e["to_state"] for e in detail["events"]]
    assert states == ["RECEIVED", "VALIDATED", "CLEANED", "NORMALIZED", "AGGREGATED", "PENDING_APPROVAL"]
    assert len(detail["table"]) == 14

    assert client.get("/api/analytics/overview", headers=CONTRIB_B2G).json()["territories"] == []
    assert client.post(f"/api/datasets/{ds['id']}/approve", json={}, headers=CONTRIB_B2G).status_code == 403

    r = client.post(f"/api/datasets/{ds['id']}/approve", json={"comment": "ok"}, headers=ADMIN_B2G)
    assert r.json()["status"] == "PUBLISHED"
    ov = client.get("/api/analytics/overview", headers=ADMIN_B2G).json()
    assert len(ov["territories"]) == 14
    rennes = next(t for t in ov["territories"] if t["code"] == "35238")
    assert rennes["context"] == {"level": "commune", "territory_type": "urbain", "population": 225000.0,
                                 "density_km2": 4470.0, "source_global_score": 74.0}
    # Versailles has no QPV data → SOCIAL missing → coverage 85 %.
    versailles = next(t for t in ov["territories"] if t["code"] == "78646")
    assert versailles["dimensions"]["SOCIAL"]["score"] is None and versailles["composite"]["coverage"] == 0.85

    rural = client.get("/api/analytics/overview?territory_type=rural", headers=ADMIN_B2G).json()
    assert {t["code"] for t in rural["territories"]} == {"66124", "63236", "13102"}

    sport_only = client.get("/api/analytics/overview?weights=SPORT:1,ENV:0,HEALTH:0,SOCIAL:0",
                            headers=ADMIN_B2G).json()
    for t in sport_only["territories"]:
        assert t["composite"]["score"] == t["dimensions"]["SPORT"]["score"]

    csv = client.get("/api/analytics/export.csv", headers=ADMIN_B2G)
    assert csv.status_code == 200 and "Rennes" in csv.text and "urbain" in csv.text

    assert client.post(f"/api/datasets/{ds['id']}/reject", json={}, headers=ADMIN_B2G).status_code == 409


def test_admin_override_reprocesses(client, wp25_rows):
    ds = client.post("/api/ingest/manual", json={**META, "rows": wp25_rows}, headers=ADMIN_B2G).json()
    detail = client.get(f"/api/datasets/{ds['id']}", headers=ADMIN_B2G).json()
    victoret = next(r for r in detail["table"] if r["territory_code"] == "13102")
    r = client.post(f"/api/datasets/{ds['id']}/override", headers=ADMIN_B2G,
                    json={"row": victoret["source_row"], "column": "sport_score", "value": 100,
                          "reason": "scores dupliqués de Mont-Dore"})
    assert r.status_code == 200 and r.json()["status"] == "PENDING_APPROVAL"
    detail = client.get(f"/api/datasets/{ds['id']}", headers=ADMIN_B2G).json()
    cell = next(r for r in detail["table"] if r["territory_code"] == "13102")["cells"]["sport_score"]
    assert cell["raw_value"] == 100 and cell["score"] == 10 and "overridden" in cell["flags"]


def test_tenant_isolation(client, wp25_rows):
    ds = client.post("/api/ingest/manual", json={**META, "rows": wp25_rows}, headers=ADMIN_B2G).json()
    client.post(f"/api/datasets/{ds['id']}/approve", json={}, headers=ADMIN_B2G)

    assert client.get("/api/datasets", headers=ADMIN_B2B).json() == []
    assert client.get(f"/api/datasets/{ds['id']}", headers=ADMIN_B2B).status_code == 404
    assert client.post(f"/api/datasets/{ds['id']}/reject", json={}, headers=ADMIN_B2B).status_code == 404
    assert client.get("/api/analytics/overview", headers=ADMIN_B2B).json()["territories"] == []


def test_tenant_geographic_scope(client, wp25_rows):
    # B2B tenant is limited to Rennes / Nantes / Brest → the 11 other communes are rejected.
    r = client.post("/api/ingest/manual", json={**META, "rows": wp25_rows}, headers=ADMIN_B2B)
    assert r.status_code == 422
    issues = r.json()["detail"]["report"]["issues"]
    assert sum(1 for i in issues if i["code"] == "out_of_tenant_scope") == 11


def test_commune_contours_from_cache(client):
    fc = client.get("/api/geo/communes?codes=35238,44109,BAD", headers=ADMIN_B2G).json()
    assert sorted(f["properties"]["code"] for f in fc["features"]) == ["35238", "44109"]


def test_catalog_exposes_weight_sources(client):
    cat = client.get("/api/analytics/catalog", headers=ADMIN_B2G).json()
    sport = next(d for d in cat["dimensions"] if d["code"] == "SPORT")
    assert sport["weight_basis"]["basis"] == "evidence" and len(sport["weight_basis"]["evidence"]) == 8
    assert cat["composite_basis"]["source"]["url"].startswith("https://link.springer.com")
