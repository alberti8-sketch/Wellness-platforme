# Wellness-platforme

La première biobanque de données comportementales, alimentée par des données numériques objectives, sécurisées et
exploitables. Elle permettra d'identifier précocement les facteurs de risque, d'améliorer la prévention et de mieux
piloter les politiques de santé.

## MVP

Plateforme B2B/B2G d'analyse de santé populationnelle : collecte d'indicateurs agrégés par territoire,
pipeline de scoring **déterministe**, carte des territoires notés de **1 à 10** (Bad / Middle / Best)
avec **pondération** ajustable.

> Première brique de la future biobanque de données comportementales. Le MVP ne traite **que des données
> agrégées par territoire** (aucune donnée individuelle) : pas besoin d'hébergement HDS à ce stade.

## Démarrage

```bash
# Backend (Python 3.11+)
cd backend
python -m venv .venv && .venv/Scripts/activate        # Windows  (Linux/macOS : source .venv/bin/activate)
pip install -r requirements.txt
python -m scripts.generate_samples                      # régénère data/*.xlsx (optionnel)
uvicorn main:app --reload --port 8000                   # API : http://localhost:8000/docs

# Frontend (Node 18+)
cd frontend
npm install
cp .env.local.example .env.local                        # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev                                             # http://localhost:3000
```

**Parcours de démo** (compte « B2G · Admin » sélectionné en haut à droite) :
1. `/collect` : déposer `data/sample_5_territoires.xlsx`, cocher l'attestation, puis soumettre.
2. `/processing` : suivre le pipeline, inspecter et corriger des cellules, puis **Approuver et publier**.
3. `/dashboard` : carte des 5 territoires, curseurs de pondération, classement, détail et matrice, export CSV ou PDF.

Tests backend : `cd backend && .venv/Scripts/python -m pytest -q`

## Arborescence

```
backend/
  main.py                    FastAPI (CORS, routers, /api/me)
  config.py                  tenants, clés API de démo, paramètres
  security.py                auth X-API-Key + contrôle de rôle
  models.py / db.py          SQLAlchemy (SQLite par défaut, WELLNESS_DATABASE_URL pour Postgres)
  schemas.py                 contrats Pydantic de l'API
  routers/ingest.py          modèle Excel, prévisualisation, upload Excel / saisie manuelle
  routers/datasets.py        hub de traitement : détail, correction admin, approbation/rejet
  routers/analytics.py       vue d'ensemble pondérée, catalogue, export CSV
  pipeline/catalog.py        ★ catalogue d'indicateurs : sens, plages de référence, poids
  pipeline/scoring.py        normalisation 1–10, classes, agrégation, indice composite
  pipeline/validation.py     parsing Excel + schéma Pydantic strict + périmètre du tenant
  pipeline/orchestrator.py   ★ machine à états déterministe
  pipeline/template.py       génération du modèle Excel
  scripts/generate_samples.py
  tests/
frontend/
  app/collect/page.tsx       portail de collecte (B2B/B2G, drag & drop, saisie manuelle, contrôle)
  app/processing/page.tsx    suivi du pipeline, table d'inspection, corrections, validation
  app/dashboard/page.tsx     carte Leaflet, KPI, pondération, classement, détail, matrice, exports
  components/territory-map.tsx
  public/geo/departements.geojson   contours des 96 départements métropolitains
data/
  wellness_template.xlsx     modèle vierge (feuilles « data » et « dictionnaire »)
  sample_5_territoires.xlsx  jeu fictif : Paris, Rhône, Nord, Bouches-du-Rhône, Creuse
```

## Méthode de scoring

| Étape | Règle |
|---|---|
| Normalisation | `score = 1 + 9 × (x − ref_min) / (ref_max − ref_min)`, inversé si « plus bas = mieux », borné à [1, 10] |
| Référence | plages **fixes** par indicateur (seuils OMS, références nationales), pas un min-max sur le lot : avec 5 territoires, un min-max donnerait toujours un 1 et un 10 |
| Classes | **Bad** < 4 ≤ **Middle** < 7 ≤ **Best** |
| Dimension | moyenne pondérée des indicateurs disponibles ; publiée seulement si ≥ 50 % des indicateurs sont présents |
| Indice global | `Σ(poids × score dimension) / Σ poids` ; dimensions manquantes exclues, poids renormalisés, couverture affichée |
| Poids par défaut | Activité physique 30 · Mobilité 25 · Environnement 25 · Nutrition 20 · Maladies chroniques 0 |

Les **maladies chroniques** sont un indicateur de *résultat* : elles sont affichées mais exclues de l'indice
par défaut. Elles serviront à calibrer les poids (quels comportements expliquent le mieux la prévalence).

⚠️ Les plages de référence de `pipeline/catalog.py` et les valeurs de `sample_5_territoires.xlsx` sont des
**valeurs provisoires ou fictives** : elles doivent être validées par un expert en santé publique.

## Pipeline (machine à états)

```
RECEIVED → VALIDATED → CLEANED → NORMALIZED → AGGREGATED → PENDING_APPROVAL → PUBLISHED
    └─────────┴──────────┴───────────┴────────────┴──→ FAILED   └──→ REJECTED
                                     PENDING_APPROVAL ─(correction admin)→ RECEIVED (relance complète)
```

- Des fonctions pures sont exécutées dans un ordre fixe : aucun agent autonome, aucun appel LLM, aucun aléa.
- Chaque transition est vérifiée contre une table explicite et inscrite dans un journal d'audit (`dataset_events`).
- **Isolation des tenants** : le `tenant_id` vient toujours de la clé API, jamais du fichier. Toutes les requêtes
  filtrent dessus, et une ressource d'un autre tenant renvoie une 404. Avant chaque écriture, un garde-fou vérifie
  que tous les enregistrements portent le bon tenant et restent dans son périmètre géographique (ex. le tenant B2B
  de démo est limité à 75, 69 et 13).

## Comptes de démo

| Clé `X-API-Key` | Tenant | Rôle |
|---|---|---|
| `demo-b2g-admin` | Observatoire régional de santé (B2G, toute la France) | admin |
| `demo-b2g-contrib` | idem | contributeur (dépôt sans approbation) |
| `demo-b2b-admin` | Entreprise QVT (B2B, départements 75/69/13) | admin |

Pour des clés réelles, utiliser `WELLNESS_PRINCIPALS_FILE` (voir `config.py`).

## Hors périmètre du MVP (étapes suivantes)

- Authentification SSO/OIDC à la place des clés API ; gestion des utilisateurs.
- Postgres + migrations (Alembic) ; communes et IRIS (contours IGN) en plus des départements.
- Connecteurs open data (Data pathologies, Geod'air, INSEE) à la place de l'upload manuel.
- Calibration des poids sur la prévalence des maladies ; export PDF serveur.
- Phase biobanque : données individuelles (objets connectés) → consentement, pseudonymisation, hébergement **HDS**,
  AIPD/CNIL, seuil de secret statistique (aucun agrégat < 11 individus).
