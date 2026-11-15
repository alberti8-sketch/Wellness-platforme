"""Commune report, its Markdown export, the diseases page and the assistant (network calls monkeypatched)."""

from __future__ import annotations

import pytest

from tests.conftest import ADMIN_B2G, CONTRIB_B2G

META = {"submitted_by": "Test User", "organization": "ORS Test"}


def _rows(dept: str):
    """Two years of every disease; the department 44 is above France for diabetes only."""
    import diseases

    out = []
    for top, *_ in diseases.DISEASES.values():
        base = 5.0
        local = base + (1.0 if top == "DIA_CAT_CAT" and dept == "44" else 0.0) - (0.5 if dept != "999" else 0.0)
        out += [{"year": 2015, "top": top, "prev": local - 0.8, "ntop": 1000}, {"year": 2024, "top": top, "prev": local, "ntop": 1200}]
    return out


@pytest.fixture()
def app(client, tmp_path, monkeypatch):
    import diseases
    from pipeline.template import build_workbook
    from scripts.import_wp25 import load_converted

    monkeypatch.setenv("WELLNESS_CACHE_DIR", str(tmp_path / "cache"))
    monkeypatch.setattr(diseases, "fetch_department", lambda dept, region=None: _rows(dept))
    files = {"file": ("data.xlsx", build_workbook(load_converted()), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    ds = client.post("/api/ingest/upload", files=files, data=META, headers=CONTRIB_B2G).json()
    client.post(f"/api/datasets/{ds['id']}/approve", json={}, headers=ADMIN_B2G)
    return client


def test_report_and_markdown(app):
    r = app.get("/api/rapport?ville=44109", headers=ADMIN_B2G)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "Nantes" and body["departement"]["code"] == "44"
    assert body["score"]["of"] == 14 and 1 <= body["score"]["rank"] <= 14
    assert [d["code"] for d in body["dimensions"]] == ["SPORT", "ENV", "HEALTH", "SOCIAL"]
    diab = next(d for d in body["diseases"]["items"] if d["key"] == "diabete")
    assert diab["prev"] == 5.5 and diab["prev_france"] == 5.0 and diab["ratio_france"] == 1.1
    assert diab["people_commune_est"] == round(5.5 / 100 * 320000 / 10) * 10
    assert body["diseases"]["items"][0]["key"] == "diabete"  # most over-represented first
    assert any("Diabète" in w for w in body["findings"]["weaknesses"])
    dets = {d["key"]: d for d in body["determinants"]}
    assert set(dets) >= {"activite", "alimentation", "cadre", "soins", "precarite", "tabac"}
    assert dets["tabac"]["status"] == "nc" and dets["tabac"]["indicators"] == []
    links = {x["key"]: {lk["determinant"] for lk in x["links"]} for x in body["disease_links"]}
    assert {"activite", "alimentation"} <= links["diabete"] and "soins" in links["cancers"]
    comp = body["comparison"]
    assert comp["cities"][0]["code"] == "44109" and comp["cities"][0]["self"] and len(comp["cities"]) == 4
    assert all(not c["self"] for c in comp["cities"][1:])

    import report
    md = report.to_markdown(body)  # context of the assistant
    assert md.startswith("# Rapport santé — Nantes") and "## Maladies chroniques" in md


def test_report_errors(app):
    assert app.get("/api/rapport?ville=75056", headers=ADMIN_B2G).status_code == 404
    assert app.get("/api/rapport?ville=nope", headers=ADMIN_B2G).status_code == 422
    assert app.get("/api/rapport?ville=44109").status_code == 401


def test_maladies(app):
    body = app.get("/api/maladies?ville=35238", headers=ADMIN_B2G).json()
    assert body["name"] == "Rennes" and len(body["items"]) == 10
    assert body["departement"] == {"code": "35", "name": "Ille-et-Vilaine"}
    assert all(d["trend_pts"] == 0.8 for d in body["items"])


def test_assistant_not_configured(app, monkeypatch):
    import assistant

    monkeypatch.setattr(assistant, "_setting", lambda name, default=None: default)
    r = app.post("/api/assistant/chat", json={"ville": "44109", "question": "Que faire ?"}, headers=ADMIN_B2G)
    assert r.status_code == 503 and "OPENROUTER_API_KEY" in r.json()["detail"]
    assert app.get("/api/assistant/status", headers=ADMIN_B2G).json()["configured"] is False
    assert app.get("/api/assistant/conversations", headers=ADMIN_B2G).json() == []  # nothing saved on failure


@pytest.fixture()
def fake_llm(monkeypatch):
    import assistant

    sent = []

    def fake_post(payload, api_key):
        sent.append({"payload": payload, "key": api_key})
        return {"model": "test/model", "choices": [{"message": {"content": f"Réponse {len(sent)}"}}]}

    monkeypatch.setattr(assistant, "_setting", lambda name, default=None: {"OPENROUTER_API_KEY": "sk-test"}.get(name, default))
    monkeypatch.setattr(assistant, "post_openrouter", fake_post)
    return sent


def test_assistant_uses_the_report(app, fake_llm):
    r = app.post("/api/assistant/chat", json={"ville": "44109", "question": "Comment réduire le diabète ?"}, headers=ADMIN_B2G)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["reply"] == "Réponse 1" and body["structured"] is None and body["model"] == "test/model"
    payload = fake_llm[0]["payload"]
    system = payload["messages"][0]
    assert system["role"] == "system" and "# Rapport santé — Nantes" in system["content"]
    assert "Diabète de type 2 × Activité physique régulière" in system["content"]  # evidence base
    assert payload["messages"][1:] == [{"role": "user", "content": "Comment réduire le diabète ?"}] and fake_llm[0]["key"] == "sk-test"
    assert all(m.endswith(":free") for m in payload["models"])  # default: free models only
    assert "@" not in system["content"]  # no account data sent


def test_conversation_history(app, fake_llm):
    first = app.post("/api/assistant/chat", json={"ville": "44109", "question": "Première question"}, headers=ADMIN_B2G).json()
    cid = first["conversation_id"]
    assert first["title"] == "Première question"
    second = app.post("/api/assistant/chat", json={"ville": "35238", "question": "Et ensuite ?", "conversation_id": cid}, headers=ADMIN_B2G).json()
    assert second["conversation_id"] == cid
    # The saved history is sent back to the model, for the conversation's commune (Nantes, not the new ?ville).
    msgs = fake_llm[1]["payload"]["messages"]
    assert [m["content"] for m in msgs[1:]] == ["Première question", "Réponse 1", "Et ensuite ?"]
    assert "# Rapport santé — Nantes" in msgs[0]["content"]

    listing = app.get("/api/assistant/conversations", headers=ADMIN_B2G).json()
    assert [(c["id"], c["messages"], c["ville"], c["ville_nom"]) for c in listing] == [(cid, 4, "44109", "Nantes")]
    detail = app.get(f"/api/assistant/conversations/{cid}", headers=ADMIN_B2G).json()
    assert [m["role"] for m in detail["items"]] == ["user", "assistant", "user", "assistant"]

    # Another user does not see it, and cannot continue or delete it.
    assert app.get("/api/assistant/conversations", headers=CONTRIB_B2G).json() == []
    assert app.get(f"/api/assistant/conversations/{cid}", headers=CONTRIB_B2G).status_code == 404
    other = app.post("/api/assistant/chat", json={"ville": "44109", "question": "x", "conversation_id": cid}, headers=CONTRIB_B2G)
    assert other.status_code == 404
    assert app.delete(f"/api/assistant/conversations/{cid}", headers=CONTRIB_B2G).status_code == 404

    assert app.delete(f"/api/assistant/conversations/{cid}", headers=ADMIN_B2G).status_code == 204
    assert app.get("/api/assistant/conversations", headers=ADMIN_B2G).json() == []


def test_parse_structured_answer():
    import assistant

    raw = """```json
{"synthese": "Agir sur l'alimentation.", "priorites": [{"titre": "Moins de fast-foods", "maladies": ["Diabète"],
 "determinant": "Alimentation et poids", "constat": "28/100", "action": "PLU", "preuve": "RR 0,87",
 "niveau_preuve": "Fort", "comparaison": "", "indicateur": "Score alimentation", "horizon": "moyen terme"}],
 "a_retenir": "Priorité à l'alimentation."}
```"""
    s = assistant.parse_structured(raw)
    assert s["synthese"] == "Agir sur l'alimentation." and len(s["priorites"]) == 1
    p = s["priorites"][0]
    assert p["horizon"] == "moyen" and p["niveau_preuve"] == "fort" and p["maladies"] == ["Diabète"]
    assert assistant.parse_structured("Voici trois idées sans JSON.") is None
    # Invented web addresses are removed from the answer.
    with_url = raw.replace('"preuve": "RR 0,87"', '"preuve": "RR 0,87 (https://docs.google.com/spreadsheets/d/xyz/edit)"')
    assert assistant.parse_structured(with_url)["priorites"][0]["preuve"] == "RR 0,87"
