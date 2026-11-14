"""Context-data endpoints: network functions are monkeypatched (no live calls)."""

from __future__ import annotations

import pytest

from tests.conftest import ADMIN_B2G

SERIES = [{"year": 2015, "prev": 3.335, "ntop": 32890, "npop": 986060},
          {"year": 2024, "prev": 4.204, "ntop": 46610, "npop": 1108760}]
OVERPASS = [
    {"type": "node", "id": 1, "lat": 48.11, "lon": -1.68, "tags": {"amenity": "fast_food", "name": "Snack A"}},
    {"type": "way", "id": 2, "center": {"lat": 48.12, "lon": -1.67}, "tags": {"amenity": "food_court"}},
    {"type": "count", "id": 0, "tags": {"total": "640"}},
    {"type": "count", "id": 0, "tags": {"total": "210"}},
]


@pytest.fixture()
def ext(client, tmp_path, monkeypatch):
    import external_data

    monkeypatch.setenv("WELLNESS_CACHE_DIR", str(tmp_path / "cache"))
    calls = {"ameli": [], "overpass": [], "pop": []}

    def ameli(dept, top):
        calls["ameli"].append((dept, top))
        return SERIES

    def overpass(code):
        calls["overpass"].append(code)
        return OVERPASS

    def population(code):
        calls["pop"].append(code)
        return "Rennes", 230890

    monkeypatch.setattr(external_data, "fetch_ameli_series", ameli)
    monkeypatch.setattr(external_data, "fetch_overpass", overpass)
    monkeypatch.setattr(external_data, "fetch_population", population)
    return external_data, calls


def test_auth_required(client):
    assert client.get("/api/trends/pathologies?territories=35238").status_code == 401
    assert client.get("/api/food-environment?territories=35238").status_code == 401


def test_trends_shape_department_mapping_and_cache(client, ext):
    _, calls = ext
    r = client.get("/api/trends/pathologies?territories=35238,44,2A004,99999&patho=diabete", headers=ADMIN_B2G)
    assert r.status_code == 200
    body = r.json()
    assert body["obesity_available"] is False and "obésité" in body["note"]
    assert body["series"]["35238"]["departement"] == "35"
    assert body["series"]["35238"]["points"][-1] == {"year": 2024, "prev": 4.204, "ntop": 46610, "npop": 1108760}
    assert body["series"]["44"]["departement"] == "44"
    assert body["series"]["2A004"]["departement"] == "2A"
    assert body["series"]["99999"]["error"] and body["series"]["99999"]["points"] == []
    assert ("99", "DIA_CAT_CAT") not in calls["ameli"]  # invalid code never reaches the network
    n = len(calls["ameli"])
    client.get("/api/trends/pathologies?territories=35238&patho=diabete", headers=ADMIN_B2G)
    assert len(calls["ameli"]) == n  # served from cache


def test_trends_unknown_patho_and_obesity(client, ext):
    assert client.get("/api/trends/pathologies?territories=35238&patho=obesite", headers=ADMIN_B2G).status_code == 400


def test_trends_network_failure(client, ext, monkeypatch):
    external_data, _ = ext

    def boom(dept, top):
        raise OSError("down")

    monkeypatch.setattr(external_data, "fetch_ameli_series", boom)
    body = client.get("/api/trends/pathologies?territories=29019&patho=cardio", headers=ADMIN_B2G).json()
    assert body["series"]["29019"]["points"] == [] and "indisponible" in body["series"]["29019"]["error"]


def test_food_environment_counts_density_points_and_cache(client, ext):
    _, calls = ext
    body = client.get("/api/food-environment?territories=35238&include_points=true", headers=ADMIN_B2G).json()
    t = body["territories"]["35238"]
    assert t["counts"] == {"fast_food": 2, "restaurant": 640, "cafe": 210}
    assert t["population"] == 230890 and t["fast_food_per_10k"] == round(2 * 10_000 / 230890, 2)
    assert {p["kind"] for p in t["points"]} == {"fast_food", "food_court"} and t["error"] is None
    assert "ODbL" in body["source"]
    light = client.get("/api/food-environment?territories=35238", headers=ADMIN_B2G).json()
    assert light["territories"]["35238"]["points"] == [] and calls["overpass"] == ["35238"]  # cached


def test_food_environment_rejects_non_communes(client, ext):
    _, calls = ext
    body = client.get("/api/food-environment?territories=35,ABCDE", headers=ADMIN_B2G).json()
    assert body["territories"]["35"]["error"] and body["territories"]["ABCDE"]["error"]
    assert calls["overpass"] == []


def test_food_environment_network_failure(client, ext, monkeypatch):
    external_data, _ = ext

    def boom(code):
        raise OSError("down")

    monkeypatch.setattr(external_data, "fetch_overpass", boom)
    t = client.get("/api/food-environment?territories=44109", headers=ADMIN_B2G).json()["territories"]["44109"]
    assert t["counts"] is None and "indisponible" in t["error"]


def test_food_cache_retries_missing_population(client, ext, monkeypatch):
    external_data, calls = ext

    def no_pop(code):
        raise OSError("geo.api down")

    monkeypatch.setattr(external_data, "fetch_population", no_pop)
    t = client.get("/api/food-environment?territories=35238", headers=ADMIN_B2G).json()["territories"]["35238"]
    assert t["counts"]["fast_food"] == 2 and t["population"] is None and t["fast_food_per_10k"] is None
    monkeypatch.setattr(external_data, "fetch_population", lambda code: ("Rennes", 230890))
    t = client.get("/api/food-environment?territories=35238", headers=ADMIN_B2G).json()["territories"]["35238"]
    assert t["population"] == 230890 and t["fast_food_per_10k"] is not None
    assert calls["overpass"] == ["35238"]  # OSM counts reused from cache
