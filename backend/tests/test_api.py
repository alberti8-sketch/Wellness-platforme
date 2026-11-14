from __future__ import annotations

from tests.conftest import ADMIN_B2B, ADMIN_B2G, CONTRIB_B2G

from scripts.generate_samples import SAMPLE_ROWS

META = {"submitted_by": "Test User", "organization": "ORS Test"}


def _xlsx(rows):
    from pipeline.template import build_workbook

    return {"file": ("data.xlsx", build_workbook(rows),
                     "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}


def test_auth_required(client):
    assert client.get("/api/datasets").status_code == 401
    assert client.get("/api/datasets", headers={"X-API-Key": "nope"}).status_code == 401


def test_preview_flags_errors(client):
    rows = [dict(SAMPLE_ROWS[0]), dict(SAMPLE_ROWS[0]), {**SAMPLE_ROWS[1], "env_pm25_ugm3": "abc"},
            {**SAMPLE_ROWS[2], "territory_code": "999"}, {**SAMPLE_ROWS[3], "pa_active_adults_pct": 140}]
    r = client.post("/api/ingest/preview", files=_xlsx(rows), headers=CONTRIB_B2G)
    assert r.status_code == 200
    codes = sorted(i["code"] for i in r.json()["issues"] if i["severity"] == "error")
    assert codes == ["duplicate", "invalid_value", "invalid_value", "invalid_value"]


def test_french_decimals_and_missing_tokens(client):
    rows = [{**SAMPLE_ROWS[0], "env_pm25_ugm3": "11,2", "env_no2_ugm3": "NA", "territory_code": "1",
             "territory_name": "Ain"}]
    r = client.post("/api/ingest/preview-manual", json={"rows": rows}, headers=CONTRIB_B2G)
    body = r.json()
    assert body["error_count"] == 0, body["issues"]
    assert body["rows"][0]["territory_code"] == "01"
    assert body["rows"][0]["values"]["env_pm25_ugm3"] == 11.2
    assert body["rows"][0]["values"]["env_no2_ugm3"] is None


def test_full_pipeline_and_publication(client):
    r = client.post("/api/ingest/upload", files=_xlsx(SAMPLE_ROWS), data=META, headers=CONTRIB_B2G)
    assert r.status_code == 201, r.text
    ds = r.json()
    assert ds["status"] == "PENDING_APPROVAL"

    detail = client.get(f"/api/datasets/{ds['id']}", headers=CONTRIB_B2G).json()
    states = [e["to_state"] for e in detail["events"]]
    assert states == ["RECEIVED", "VALIDATED", "CLEANED", "NORMALIZED", "AGGREGATED", "PENDING_APPROVAL"]
    assert len(detail["table"]) == 5

    # Not visible in analytics before approval.
    assert client.get("/api/analytics/overview", headers=CONTRIB_B2G).json()["territories"] == []
    # Contributors cannot approve.
    assert client.post(f"/api/datasets/{ds['id']}/approve", json={}, headers=CONTRIB_B2G).status_code == 403

    r = client.post(f"/api/datasets/{ds['id']}/approve", json={"comment": "ok"}, headers=ADMIN_B2G)
    assert r.json()["status"] == "PUBLISHED"
    ov = client.get("/api/analytics/overview", headers=ADMIN_B2G).json()
    assert {t["code"] for t in ov["territories"]} == {"75", "69", "59", "13", "23"}
    assert all(1 <= t["composite"]["score"] <= 10 for t in ov["territories"])

    # Re-weighting changes the composite deterministically.
    pa_only = client.get("/api/analytics/overview?weights=PA:1,MOB:0,ENV:0,NUT:0", headers=ADMIN_B2G).json()
    for t in pa_only["territories"]:
        assert t["composite"]["score"] == t["dimensions"]["PA"]["score"]

    csv = client.get("/api/analytics/export.csv", headers=ADMIN_B2G)
    assert csv.status_code == 200 and "Creuse" in csv.text

    # Terminal state: cannot re-approve.
    assert client.post(f"/api/datasets/{ds['id']}/reject", json={}, headers=ADMIN_B2G).status_code == 409


def test_admin_override_reprocesses(client):
    ds = client.post("/api/ingest/manual", json={**META, "rows": SAMPLE_ROWS}, headers=ADMIN_B2G).json()
    detail = client.get(f"/api/datasets/{ds['id']}", headers=ADMIN_B2G).json()
    paris = next(r for r in detail["table"] if r["territory_code"] == "75")
    r = client.post(f"/api/datasets/{ds['id']}/override", headers=ADMIN_B2G,
                    json={"row": paris["source_row"], "column": "env_pm25_ugm3", "value": 5, "reason": "correction"})
    assert r.status_code == 200 and r.json()["status"] == "PENDING_APPROVAL"
    detail = client.get(f"/api/datasets/{ds['id']}", headers=ADMIN_B2G).json()
    cell = next(r for r in detail["table"] if r["territory_code"] == "75")["cells"]["env_pm25_ugm3"]
    assert cell["raw_value"] == 5 and cell["score"] == 10 and "overridden" in cell["flags"]


def test_tenant_isolation(client):
    ds = client.post("/api/ingest/manual", json={**META, "rows": SAMPLE_ROWS}, headers=ADMIN_B2G).json()
    client.post(f"/api/datasets/{ds['id']}/approve", json={}, headers=ADMIN_B2G)

    # Another tenant can neither list, read, act on nor see analytics of that dataset.
    assert client.get("/api/datasets", headers=ADMIN_B2B).json() == []
    assert client.get(f"/api/datasets/{ds['id']}", headers=ADMIN_B2B).status_code == 404
    assert client.post(f"/api/datasets/{ds['id']}/reject", json={}, headers=ADMIN_B2B).status_code == 404
    assert client.get("/api/analytics/overview", headers=ADMIN_B2B).json()["territories"] == []


def test_tenant_geographic_scope(client):
    # B2B tenant is limited to 75/69/13 → Nord (59) and Creuse (23) are rejected.
    r = client.post("/api/ingest/manual", json={**META, "rows": SAMPLE_ROWS}, headers=ADMIN_B2B)
    assert r.status_code == 422
    issues = r.json()["detail"]["report"]["issues"]
    assert sorted(i["column"] for i in issues if i["code"] == "out_of_tenant_scope") == ["territory_code"] * 2
