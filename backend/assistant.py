"""Assistant for mayors: proposes solutions grounded in the commune report and the team evidence base.

LLM through OpenRouter (OpenAI-compatible chat completions API). Configuration (environment or backend/.env):
  OPENROUTER_API_KEY   required
  OPENROUTER_MODEL     default DEFAULT_MODEL, a free model (works without credits, rate-limited); with credits,
                       « openrouter/auto » or any model id of openrouter.ai/models
Only aggregated public data about the commune is sent (the report); never the user's e-mail or account.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import diseases

API_URL = "https://openrouter.ai/api/v1/chat/completions"
# Free models change over time: see https://openrouter.ai/models?q=free
DEFAULT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"
# Free fallbacks, tried in order by OpenRouter when the default is rate-limited or unavailable.
FREE_FALLBACKS = ["google/gemma-4-31b-it:free", "nvidia/nemotron-3.5-super-vl:free"]
ENV_FILE = Path(__file__).resolve().parent / ".env"
MAX_TURNS = 12
MAX_CHARS = 4000


class AssistantUnavailable(RuntimeError):
    """No API key configured."""


class AssistantError(RuntimeError):
    """The LLM provider failed."""


def _setting(name: str, default: str | None = None) -> str | None:
    if os.getenv(name):
        return os.getenv(name)
    if ENV_FILE.exists():  # minimal .env support (KEY=VALUE lines), the file is git-ignored
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.strip().partition("=")
            if sep and key.strip() == name and not line.lstrip().startswith("#"):
                return value.strip().strip('"').strip("'")
    return default


def model() -> str:
    return _setting("OPENROUTER_MODEL", DEFAULT_MODEL) or DEFAULT_MODEL


def configured() -> bool:
    return bool(_setting("OPENROUTER_API_KEY"))


def system_prompt(report_md: str, city: str) -> str:
    ev = diseases.evidence()
    links = "\n".join(f"- {x['maladie']} × {x['habitude']} : {x['association']} (preuve {x['niveau'].lower()})" for x in ev.get("liens", []))
    injep = "\n".join(f"- {x}" for x in ev.get("injep", []))
    return f"""Tu es l'assistant santé publique d'une plateforme destinée aux maires et à leurs équipes municipales.
Ta mission : proposer des solutions concrètes, à la portée d'une commune, pour améliorer la santé des habitants de {city}.

Règles :
- Appuie-toi uniquement sur le RAPPORT de la commune et sur la BASE DE PREUVES ci-dessous.
- Chiffres : n'utilise QUE ceux du rapport et de la base de preuves. N'invente aucun chiffre (pas de nombre d'écoles,
  de cantines, de budgets, d'arbres, d'études ou de cohortes externes, pas de données de pollution absentes du rapport).
  Une cible chiffrée est une proposition « à définir avec les services », jamais un fait. Si une information manque,
  dis-le simplement.
- Preuves : ne cite comme justification que les liens de la BASE DE PREUVES, avec leur niveau (fort, moyen, modéré).
- Aucune adresse web, aucun lien ni URL dans la réponse.
- Privilégie les leviers d'une mairie : urbanisme et aménagement, mobilités actives (marche, vélo), équipements et
  associations sportives, restauration scolaire et collective, offre alimentaire et commerces de proximité,
  communication et campagnes de prévention (dépistage, vaccination) avec la CPAM, l'ARS et les acteurs locaux,
  contrat local de santé, attractivité médicale.
- Croise les maladies avec les DÉTERMINANTS de santé du rapport (statut favorable / défavorable) : vise d'abord les
  déterminants défavorables liés aux maladies en hausse ou au-dessus de la France.
- Enrichis le diagnostic avec la COMPARAISON avec les villes semblables du rapport : cite une ville semblable qui fait
  mieux sur le déterminant visé quand c'est le cas.
- Les prévalences des maladies sont celles du département (pas de données par commune).
- Pas de conseil médical individuel. Français simple et CONCIS : 25 mots au plus par champ, une seule preuve par priorité
  (la plus forte), 3 maladies au plus par priorité, un seul chiffre clé dans « constat », une seule ville dans « comparaison ».

FORMAT DE RÉPONSE — réponds UNIQUEMENT avec un objet JSON valide (pas de texte autour, pas de bloc de code) :
{{
  "synthese": "réponse directe à la question en 1 à 2 phrases",
  "priorites": [
    {{
      "titre": "action en 6 mots maximum",
      "maladies": ["noms des maladies du rapport visées"],
      "determinant": "un déterminant du rapport (Activité physique, Alimentation et poids, Cadre de vie, Accès aux soins et dépistage, Précarité, Tabac, Alcool, Sommeil)",
      "constat": "le chiffre du rapport qui justifie l'action",
      "action": "ce que la mairie fait concrètement",
      "preuve": "le lien de la base de preuves",
      "niveau_preuve": "fort | moyen | modéré",
      "comparaison": "ville semblable qui fait mieux, avec son chiffre, ou chaîne vide",
      "indicateur": "indicateur de la plateforme à suivre",
      "horizon": "court | moyen | long"
    }}
  ],
  "a_retenir": "une phrase de conclusion"
}}
Au plus 3 priorités (moins si la question est précise).

RAPPORT DE LA COMMUNE
{report_md}

BASE DE PREUVES — liens maladies et habitudes de vie ({ev.get('sources', {}).get('liens', 'classeur d’équipe')})
{links}

PRATIQUE SPORTIVE ({ev.get('sources', {}).get('injep', 'INJEP')})
{injep}
"""


def _clean(messages: list[dict[str, str]]) -> list[dict[str, str]]:
    out = [{"role": m["role"], "content": m["content"][:MAX_CHARS]} for m in messages if m.get("role") in ("user", "assistant") and m.get("content")]
    return out[-MAX_TURNS:]


def post_openrouter(payload: dict[str, Any], api_key: str) -> dict[str, Any]:
    """Network call (monkeypatched in tests)."""
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "X-Title": "Wellness - sante des communes"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as r:  # noqa: S310 - fixed https host
            return json.load(r)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:300]
        if exc.code == 429:
            raise AssistantError("Le modèle est momentanément saturé (limite des modèles gratuits) : réessayez dans quelques secondes.") from exc
        if exc.code == 402:
            raise AssistantError("Crédits OpenRouter insuffisants pour ce modèle : choisissez un modèle gratuit (OPENROUTER_MODEL=…:free) ou ajoutez des crédits.") from exc
        raise AssistantError(f"OpenRouter a répondu {exc.code} : {detail}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise AssistantError(f"OpenRouter injoignable : {exc}") from exc


def answer(report_md: str, city: str, messages: list[dict[str, str]]) -> dict[str, Any]:
    key = _setting("OPENROUTER_API_KEY")
    if not key:
        raise AssistantUnavailable("Assistant non configuré : ajoutez OPENROUTER_API_KEY dans backend/.env puis redémarrez l'API.")
    convo = _clean(messages)
    if not convo or convo[-1]["role"] != "user":
        raise ValueError("Le dernier message doit venir de l'utilisateur.")
    payload = {
        "model": model(),
        # Default free model: let OpenRouter fall back to other free models (no credits needed).
        **({"models": [model(), *FREE_FALLBACKS]} if model() == DEFAULT_MODEL else {}),
        "messages": [{"role": "system", "content": system_prompt(report_md, city)}, *convo],
        "temperature": 0.3,
        "max_tokens": 4000,
        # No hidden reasoning: free reasoning models otherwise spend the whole budget thinking and return nothing.
        "reasoning": {"enabled": False},
    }
    data = post_openrouter(payload, key)
    try:
        text = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise AssistantError(f"Réponse inattendue d'OpenRouter : {str(data)[:300]}") from exc
    if not text or not text.strip():
        raise AssistantError("Le modèle n'a pas renvoyé de texte : reformulez ou réessayez.")
    return {"reply": text, "structured": parse_structured(text), "model": data.get("model", payload["model"])}


HORIZONS = {"court", "moyen", "long"}
LEVELS = {"fort", "moyen", "modéré"}


def parse_structured(text: str) -> dict[str, Any] | None:
    """The JSON answer (tolerates a code fence or text around it); None when the model ignored the format."""
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        obj = json.loads(text[start:end + 1])
    except ValueError:
        return None
    if not isinstance(obj, dict) or not isinstance(obj.get("priorites", []), list):
        return None

    def txt(v: Any) -> str:
        # Web addresses are dropped: the model invents them (none is in the data it receives).
        return re.sub(r"\s*\(?https?://\S+\)?", "", v).strip(" ;,") if isinstance(v, str) else ""

    prios = []
    for item in obj.get("priorites", [])[:5]:
        if not isinstance(item, dict) or not txt(item.get("titre")):
            continue
        horizon = txt(item.get("horizon")).lower().split()[0] if txt(item.get("horizon")) else ""
        level = txt(item.get("niveau_preuve")).lower()
        prios.append({
            "titre": txt(item.get("titre")),
            "maladies": [m for m in item.get("maladies", []) if isinstance(m, str)][:6] if isinstance(item.get("maladies"), list) else [],
            "determinant": txt(item.get("determinant")),
            "constat": txt(item.get("constat")),
            "action": txt(item.get("action")),
            "preuve": txt(item.get("preuve")),
            "niveau_preuve": level if level in LEVELS else "",
            "comparaison": txt(item.get("comparaison")),
            "indicateur": txt(item.get("indicateur")),
            "horizon": horizon if horizon in HORIZONS else "",
        })
    return {"synthese": txt(obj.get("synthese")), "priorites": prios, "a_retenir": txt(obj.get("a_retenir"))}
