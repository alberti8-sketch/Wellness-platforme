"""Commune domain map endpoint (served from a small synthetic CSV)."""

from __future__ import annotations

from tests.conftest import ADMIN_B2G

CSV = """code,name,dep,population,density_km2,lat,lon,bike_share,bike_parking_1000,fastfood_10k,restaurant_10k,sport_10k,gp_10k,size_class,sport_rate_size,walk_class,walk_score,walk_safety,walk_comfort,walk_effort,walk_services
35238,Rennes,35,225081,4500.0,48.11,-1.68,24.37,69.18,24.6,30.1,17.6,16.0,100k+,72,C,10.65,11.0,9.8,10.1,11.2
01007,Ambronay,01,2841,84.3,46.01,5.36,1.94,0.0,10.56,17.6,59.84,17.6,rural,65,,,,,,
"""


def test_domaines_endpoint(client, tmp_path, monkeypatch):
    (tmp_path / "communes_domaines_2024.csv").write_text(CSV, encoding="utf-8")
    monkeypatch.setenv("WELLNESS_ML_DIR", str(tmp_path))
    r = client.get("/api/communes/domaines", headers=ADMIN_B2G)
    assert r.status_code == 200, r.text
    body = r.json()
    cols = body["columns"]
    rows = {row[cols.index("code")]: dict(zip(cols, row, strict=True)) for row in body["rows"]}
    assert rows["35238"]["walk_class"] == "C" and rows["35238"]["bike_share"] == 24.37
    assert rows["01007"]["walk_score"] is None and rows["01007"]["dep"] == "01"
    assert body["indicators"]["fastfood_10k"]["direction"] == "lower_is_better"
    assert body["sport_rate"]["by_size"]["100k+"]["rate"] == 72
    assert body["walk_classes"][0] == "A+"


def test_domaines_requires_key(client):
    assert client.get("/api/communes/domaines").status_code == 401


def test_domaines_missing_dataset(client, tmp_path, monkeypatch):
    monkeypatch.setenv("WELLNESS_ML_DIR", str(tmp_path / "absent"))
    assert client.get("/api/communes/domaines", headers=ADMIN_B2G).status_code == 503


def test_domaines_filter_by_codes(client, tmp_path, monkeypatch):
    (tmp_path / "communes_domaines_2024.csv").write_text(CSV, encoding="utf-8")
    monkeypatch.setenv("WELLNESS_ML_DIR", str(tmp_path))
    body = client.get("/api/communes/domaines?codes=35238,99999", headers=ADMIN_B2G).json()
    assert [r[body["columns"].index("code")] for r in body["rows"]] == ["35238"]
