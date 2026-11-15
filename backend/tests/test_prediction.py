"""Decision tree tests on a synthetic dataset with a known structure (no network)."""

from __future__ import annotations

import csv
import json
from pathlib import Path

import pytest

from tests.conftest import ADMIN_B2G

BACKEND = Path(__file__).resolve().parents[1]


@pytest.fixture()
def ml_data(tmp_path, monkeypatch):
    """96 real department codes; diabetes driven by age (+ a fast-food effect), cardio by age only."""
    depts = json.loads((BACKEND / "data" / "departements.json").read_text(encoding="utf-8"))
    rows = []
    for i, (code, name) in enumerate(sorted(depts.items())):
        age = 15 + (i * 7) % 20  # 15–34 %
        ff = 3 + (i * 5) % 9  # 3–11
        rows.append({
            "dept": code, "name": name, "population": 500000,
            "pct_65plus": age, "density_km2": 50 + (i * 37) % 900, "poverty_rate": 10 + (i * 11) % 12,
            "fastfood_per10k": ff, "sport_per10k": 20 + (i * 3) % 15,
            "prev_diabete": round(3 + 0.12 * age + (0.6 if ff > 7 else 0), 3),
            "prev_cardio": round(4 + 0.25 * age, 3),
            "prev_respiratoire": 5.0, "prev_cancers": 4.0,
        })
    with (tmp_path / "departements_2024.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    with (tmp_path / "communes_2024.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["code", "dept", "population", "pct_65plus", "pct_65plus_level", "density_km2", "poverty_rate", "poverty_rate_level", "fastfood_per10k", "sport_per10k"])
        w.writeheader()
        w.writerow({"code": "35238", "dept": "35", "population": 230000, "pct_65plus": 20, "pct_65plus_level": "departement",
                    "density_km2": 4500, "poverty_rate": 12, "poverty_rate_level": "departement", "fastfood_per10k": 6.7, "sport_per10k": 25})
    with (tmp_path / "departements_mobilite_2024.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["dept", "bike_share", "bike_parking_1000", "walk_score", "walk_communes"])
        w.writeheader()
        for i, r in enumerate(rows):  # cycling falls with age; walkability rated for half of the departments
            w.writerow({"dept": r["dept"], "bike_share": 40 - r["pct_65plus"], "bike_parking_1000": 5 + i % 7,
                        "walk_score": 8 + i % 5 if i % 2 else "", "walk_communes": 1 if i % 2 else 0})
    monkeypatch.setenv("WELLNESS_ML_DIR", str(tmp_path))
    return rows


def test_model_learns_the_main_driver(ml_data, client):
    r = client.get("/api/prediction/model?patho=diabete", headers=ADMIN_B2G)
    assert r.status_code == 200, r.text
    m = r.json()
    assert max(m["importances"], key=m["importances"].get) == "pct_65plus"
    assert m["metrics"]["n"] == 96
    assert m["metrics"]["mae_cv"] < m["metrics"]["mae_baseline"]  # beats the naive mean
    nodes = m["nodes"]
    assert nodes[0]["feature"] == "pct_65plus" and not nodes[0]["leaf"]
    leaves = [n for n in nodes if n["leaf"]]
    assert all(n["samples"] >= 8 for n in leaves)
    assert sum(len(n["departements"]) for n in leaves) == 96


def test_prediction_path_and_levels(ml_data, client):
    r = client.get("/api/prediction/territories?territories=35238,35,XXXXX&patho=diabete", headers=ADMIN_B2G).json()
    rennes, dept, bad = r["territories"]["35238"], r["territories"]["35"], r["territories"]["XXXXX"]
    assert rennes["error"] is None and rennes["departement"] == "35"
    assert rennes["feature_levels"]["pct_65plus"] == "departement" and rennes["feature_levels"]["density_km2"] == "commune"
    assert rennes["feature_levels"]["poverty_rate"] == "departement"
    assert rennes["path"] and all(s["condition"] in ("<=", ">") for s in rennes["path"])
    assert dept["feature_levels"]["density_km2"] == "departement"
    assert dept["observed_departement"] is not None and dept["gap"] is not None
    assert bad["error"] == "Code INSEE inconnu"


def test_simulation_is_monotonic_in_age(ml_data, client):
    def sim(age):
        body = {"patho": "diabete", "pct_65plus": age, "density_km2": 300, "poverty_rate": 14, "fastfood_per10k": 5, "sport_per10k": 25}
        return client.post("/api/prediction/simulate", json=body, headers=ADMIN_B2G).json()["prediction"]

    assert sim(16) < sim(33)


def test_errors(ml_data, client):
    assert client.get("/api/prediction/model").status_code == 401
    assert client.get("/api/prediction/model?patho=obesite", headers=ADMIN_B2G).status_code == 400
    bad = {"patho": "diabete", "pct_65plus": 150, "density_km2": 1, "poverty_rate": 10, "fastfood_per10k": 1, "sport_per10k": 1}
    assert client.post("/api/prediction/simulate", json=bad, headers=ADMIN_B2G).status_code == 422


def test_missing_dataset_returns_503(tmp_path, monkeypatch, client):
    monkeypatch.setenv("WELLNESS_ML_DIR", str(tmp_path / "nothing"))
    assert client.get("/api/prediction/model", headers=ADMIN_B2G).status_code == 503


def test_departements_endpoint(ml_data, client):
    r = client.get("/api/prediction/departements", headers=ADMIN_B2G)
    assert r.status_code == 200
    body = r.json()
    assert len(body["departements"]) == 96
    assert body["indicators"]["prev_diabete"]["direction"] == "lower_is_better"
    assert body["indicators"]["sport_per10k"]["direction"] == "higher_is_better"
    d35 = next(d for d in body["departements"] if d["code"] == "35")
    assert set(d35["values"]) >= {"prev_diabete", "poverty_rate", "fastfood_per10k", "framingham_10y", "vet_per10k", "icp"}
    assert "prev_cardio" not in body["indicators"]  # diabetes is the only disease kept
    assert body["indicators"]["icp"]["direction"] == "higher_is_better"
    assert body["indicators"]["framingham_10y"]["direction"] == "lower_is_better"
    assert body["indicators"]["vet_per10k"]["direction"] is None


def test_etudes_endpoint(client, ml_data):
    r = client.get("/api/prediction/etudes?patho=diabete", headers=ADMIN_B2G)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["n"] == 96 and "r2_base" in body
    assert [f["key"] for f in body["factors"]] == ["bike_share", "bike_parking_1000", "walk_score"]
    assert body["factors"][0]["r"] < -0.5  # bike_share mirrors age, which drives the synthetic prevalence
    assert body["factors"][2]["n"] == 48
    for f in body["factors"]:
        assert -1 <= f["r"] <= 1 and -1 <= f["r_partial"] <= 1
        assert isinstance(f["helps_prediction"], bool)


def test_commune_predicts_every_disease_with_data(ml_data, client):
    r = client.get("/api/prediction/commune?ville=35238", headers=ADMIN_B2G)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["departement"] == "35" and body["feature_levels"]["pct_65plus"] == "departement"
    items = {i["patho"]: i for i in body["items"]}
    # Only the diseases present in the training file are predicted; the others are skipped, not errors.
    assert set(items) == {"diabete", "cardio", "respiratoire", "cancers"}
    preds = [i["prediction"] for i in body["items"]]
    assert preds == sorted(preds, reverse=True)
    assert items["cardio"]["reliability"] == "fiable" and items["cardio"]["observed_departement"] is not None
    assert client.get("/api/prediction/commune?ville=35", headers=ADMIN_B2G).status_code == 422
    assert client.get("/api/prediction/commune?ville=35999", headers=ADMIN_B2G).status_code == 400
