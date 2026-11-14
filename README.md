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
python -m scripts.seed_demo                             # charge et publie les 14 communes WP25 (démo)
uvicorn main:app --reload --port 8000                   # API : http://localhost:8000/docs

# Frontend (Node 18+)
cd frontend
npm install
cp .env.local.example .env.local                        # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev                                             # http://localhost:3000
```

**Parcours de démo** (compte « B2G · Admin » sélectionné en haut à droite) :
1. `python -m scripts.seed_demo` (dans `backend/`) publie directement les 14 communes WP25 : l'onglet
   **Published territorial analytics** est rempli dès le premier lancement. Parcours manuel équivalent :
   `/collect` (déposer `data/wp25_communes.xlsx`), puis `/processing` (**Approuver et publier**).
2. `/dashboard` : l'onglet **WP25 cities & CNAM counts** affiche les huit villes de référence et les effectifs CNAM.
   L'onglet **Published territorial analytics** affiche la carte des territoires publiés (fond **Plan IGN** en couleur
   par défaut, ou satellite IGN, OpenStreetMap ou sans fond), les curseurs de pondération, le filtre urbain /
   semi-urbain / rural, le classement, le détail, la matrice et les exports CSV/PDF.

**La carte publiée est vide ?** Elle ne s'affiche que si des données sont publiées (la base `wellness.db` n'est pas
versionnée) : lancer `python -m scripts.seed_demo`. En développement, le backend accepte n'importe quel port
`localhost` (désactiver avec `WELLNESS_CORS_DEV=0` en production).

Tests backend : `cd backend && .venv/Scripts/python -m pytest -q`

Linux/macOS : `cd backend && .venv/bin/python -m pytest -q`.
Frontend : `cd frontend && npm run typecheck && npm run build`.

## WP25 et statistiques CNAM par département

Le tableau de bord réunit deux vues complémentaires, sans mélanger leurs échelles :

- **WP25 cities & CNAM counts** : Annecy (74), Rennes (35), Nantes (44), Brest (29),
  Besançon (25), Montreuil (93), Nice (06) et Marseille (13). Les positions sont des
  centres de villes approximatifs, pas des limites administratives. Les scores Sport,
  Environnement, Health Care et Global de la feuille `CITY` restent sur leur échelle
  source **0–100** ; Global n'est pas recalculé. Les codes postaux sont conservés comme
  libellés de source, y compris les zéros initiaux. La carte de référence utilise
  les tuiles OpenStreetMap ; la carte analytique publiée utilise les contours locaux.
- **Published territorial analytics** : les données validées par le pipeline du MVP,
  notées de **1 à 10**, publiées après approbation et pondérées selon le catalogue.

Le fichier fourni `2024_effectif-departemental-par-pathologie-sexe-age_serie-annuelle.xls`
alimente la vue CNAM, avec ses deux feuilles et 63 pathologies/traitements (hors ligne Total).
Les valeurs sont des **effectifs départementaux**, pas des effectifs communaux ni des
prévalences. Elles ne doivent pas être divisées par les populations communales de WP25.
Le choix d'une ville, d'une pathologie et d'une cohorte met à jour carte, graphique et table.
Les 65 ans et plus incluent les deux sexes et recoupent les colonnes Hommes/Femmes.
Les pathologies peuvent également se recouper : aucun total entre cohortes ou maladies
n'est calculé. Les blancs restent absents/non applicables et `<10` reste masqué.

Pour les fichiers suivants, utiliser **French Department Health Workbook** sur `/collect`.
Ce dépôt distinct accepte `.xls` et `.xlsx` au format CNAM Tableau 7 : titre contenant
`en YYYY`, codes départementaux en ligne 2, `Hommes`, `Femmes`, `≥ 65 ans` en ligne 3,
`top` en B4, et pathologies en colonne A à partir de la ligne 5. Les formats non reconnus
sont rejetés. Chaque dépôt est un instantané persistant distinct : les dépôts répétés ne
sont jamais additionnés et une couverture partielle reste manquante.

Les instantanés CNAM sont des références, séparées des indicateurs normalisés et publiés
du pipeline. Le dépôt utilise le compte courant (`X-API-Key`, rôle contributeur ou admin) ;
le tenant vient de la clé API, jamais d'un champ de formulaire. Le périmètre départemental
du tenant est contrôlé. Dans la vue WP25, choisir le fichier/année dans **Workbook / reporting year**
(**Refresh Uploaded Datasets** pour rafraîchir la liste).

API : `POST /api/department-health/upload` (multipart `file`),
`GET /api/department-health`, `GET /api/department-health/{dataset_id}`.
Toutes ces routes exigent `X-API-Key`. La référence fournie reste disponible sans
chargement d'un instantané privé ; les dépôts exigent l'API et sa base de données.

Fichiers principaux : `frontend/components/ReferenceDashboard.tsx`,
`frontend/components/PublishedAnalyticsDashboard.tsx`, `frontend/data/wp25-territories.json`,
`frontend/data/department-health-2024.json`, `backend/app/department_health.py`,
`backend/app/routers/department_health.py`.

Recréer la référence CNAM depuis la racine :
`PYTHONPATH=backend python backend/scripts/build_reference_data.py`.
Les tests backend vérifient les deux feuilles, les huit départements, les valeurs sources,
les blancs et `<10`, la persistance, les rôles et l'isolation des tenants.
Le contrôle WP25 (`python -m unittest discover -s frontend/tests`) est explicitement
ignoré si le classeur WP25 original n'est plus présent dans `context` ; la matrice extraite
est conservée. Les tests sont aussi installables via `backend/requirements-dev.txt`.

Lancement Docker Compose v2 : `docker compose up --build` (ou `./start.sh`).
La configuration utilise `WELLNESS_DATABASE_URL` et
`WELLNESS_CORS_ORIGINS`. `uvicorn app.main:app` reste un alias compatible de `main:app` ;
il ne démarre pas une deuxième API différente. Les anciens modules de démonstration
dans `backend/app` sont conservés mais leurs routes ne sont pas montées.

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
  wp25_communes.xlsx         WP25 converti au format de la plateforme (14 communes) — versionné, utilisé par la démo et les tests
  wellness_template.xlsx     modèle vierge (feuilles « data » et « dictionnaire »)
backend/scripts/import_wp25.py   conversion WP25 → modèle (résolution des codes INSEE, population, QPV)
backend/scripts/seed_demo.py     charge et publie WP25 via le pipeline normal
backend/geo.py                   référentiel communes/départements + contours (cache + geo.api.gouv.fr)
```

### Fichiers bruts du Drive (non versionnés)

Les fichiers d'origine (WP25, classeur CNAM, documents de pondération, prototype 2…) restent sur le Drive
« HACKATHON 13/11/26 » et **ne sont plus dans le dépôt** : seules leurs versions converties le sont
(`data/wp25_communes.xlsx`, `frontend/data/*.json`). Pour régénérer ces fichiers ou lancer les tests sur
données brutes (ignorés automatiquement sinon), télécharger localement :

| Fichier du Drive | Emplacement local (ignoré par Git) | Usage |
|---|---|---|
| `DATA SCORING/WP25 .xlsx` | `data/sources/WP25.xlsx` | `python -m scripts.import_wp25 data/sources/WP25.xlsx` |
| Baromètre des villes marchables 2023 (liste détaillée des communes) | `data/sources/barometre_villes_marchables_2023.xlsx` | `python -m scripts.build_commune_domains` |
| `VT_2024_cyclabilite_stationnement_commune.csv` (Vélo & Territoires) | `data/sources/` | idem |
| `DATA & PONDERATION/2024_effectif-departemental-….xls` | `context/` | `scripts/build_reference_data.py` + tests CNAM réels |

## Interface

Landing publique (`/`) : un titre, une phrase, un bouton « Se connecter » (connexion de démo en un clic).
Une fois connecté, la barre latérale ne propose que **4 entrées**, dans l'ordre de découverte (lien « Continuer » en bas de chaque page) :

| Entrée | Page | Contenu |
|---|---|---|
| Vue d'ensemble | `/dashboard` | Indice moyen, villes Best / Middle / Bad, scores par dimension, extrêmes, évolution du diabète |
| Carte de France | `/carte` | **Carte plein écran par domaine** (style baromètre vélo FUB) : 5 401 communes de métropole (≥ 2 000 hab.) en cercles colorés par classe (vert = favorable), panneau flottant Marche / Vélo / Alimentation / Sport / Santé / Contexte, chiffre clé, légende ; recherche d'une commune (« Nos villes » en raccourci), zoom et fiche avec les pastilles de tous les domaines. Les indicateurs départementaux (diabète, prévention, Framingham, pauvreté, vétérinaires) s'affichent en choroplèthe des départements |
| Comparer | `/classement` | Un seul sélecteur « Villes à comparer » (2 à 4 villes), radar et tableau d'écarts, puis le classement complet |
| Prédire | `/prediction` | Arbre de décision, chemin d'une ville, simulateur « Et si… ? » |

Hors du menu, accessibles par des liens : `/ponderation` (« Comment l'indice est calculé »), `/collect` et `/processing`
(« Gérer les données », comptes autorisés), `/sante` (vue CNAM de l'équipe).

Un clic sur un territoire, où qu'il soit, ouvre sa **fiche latérale** : note, dimensions, contexte, évolution des maladies,
environnement alimentaire, indicateurs. Liens partageables : `?territoire=35238`, `?comparer=35238,44109`.
Carte : `python -m scripts.build_france_mask` (dev, shapely) régénère le masque `frontend/public/geo/france-*.geojson`.

## Carte par domaine — données communales

`python -m scripts.build_commune_domains` (~2 min, appels mis en cache dans `backend/data/cache/commune_domains/`) produit
`data/ml/communes_domaines_2024.csv`, servi par `GET /api/communes/domaines` (format colonnes / lignes, gzip ~220 Ko).

| Domaine | Indicateur (commune) | Source |
|---|---|---|
| Marche | Classe A+ → G et indice /20, sécurité, confort, effort de la ville, services | Baromètre des villes marchables 2023 (235 communes appariées par nom + département) |
| Vélo | Part de la voirie avec aménagement cyclable (km aménagés / km de voirie), stationnement pour 1 000 hab. | Vélo & Territoires 2024 |
| Alimentation | Fast-foods et snacks (NAF 56.10C), restaurants traditionnels (56.10A) pour 10 000 hab. | SIRENE, établissements actifs (agrégat opendatasoft) |
| Sport | Équipements sportifs pour 10 000 hab. ; taux de pratique INJEP 2023 de la taille d'agglomération (contexte national) | Recensement des équipements sportifs ; Baromètre national des pratiques sportives 2023, p. 33 |
| Santé | Cabinets de médecine générale (86.21Z) pour 10 000 hab. | SIRENE |

Classes : quintiles des communes affichées, arrondis ; la classe verte est la plus favorable à la santé (bleu quand
l'indicateur n'a pas de sens favorable : restaurants, densité). Le baromètre INJEP est une enquête nationale
(~4 000 personnes) : il ne mesure pas la pratique d'une commune, il donne le taux moyen des agglomérations de même taille.

## Prédiction du diabète (arbre de décision) — `/prediction`

Le **diabète est la seule maladie retenue, à titre d'exemple** (les autres pathologies ont été retirées de l'interface).
Un arbre de régression prédit sa prévalence à partir du profil d'un territoire. **Entraînement sur les 96 départements de
métropole** (14 villes seraient bien trop peu), puis application aux communes.

| Variable | Source | Échelle pour une commune |
|---|---|---|
| Part des 65 ans et plus | Assurance Maladie (population couverte par âge) | département |
| Taux de pauvreté 2021 | INSEE (fichier `INSEE RPC_PAUVRETÉ.xlsx` du Drive) | département |
| Densité | geo.api.gouv.fr | commune |
| Restauration rapide / 10 000 hab. | SIRENE, NAF 56.10C, entreprises actives | commune |
| Équipements sportifs / 10 000 hab. | Recensement des équipements sportifs (ministère des Sports) | commune |

Cible : prévalence 2024 (data.ameli.fr). Arbre de 3 niveaux, ≥ 8 départements par feuille, validation croisée à 5 plis :
**R² = 0,47**, erreur −25 % par rapport à la moyenne nationale ; variables dominantes : pauvreté (71 %), restauration rapide (29 %).

Variables testées et **non retenues** car elles n'améliorent pas (ou dégradent) la prédiction en validation croisée :
densité de vétérinaires (R² inchangé), indicateurs de prévention / ICP (R² 0,47 → 0,37).

La page montre l'arbre (chemin de la ville surligné), l'explication de chaque prédiction, un simulateur « Et si… ? »
et les prédictions des 14 villes. **Associations entre territoires, pas des causes** ; la prévalence observée est départementale.

Données : `data/ml/departements_2024.csv` et `data/ml/communes_2024.csv` (versionnés). Pour les régénérer :
`python -m scripts.build_ml_dataset --year 2024` (fichier INSEE dans `data/sources/`, ~3 min, API mises en cache).
Note : la couche « Fast-food » de la carte utilise OpenStreetMap (points géolocalisés) ; le modèle utilise SIRENE
(entreprises déclarées, source homogène) — les deux comptes ne sont pas comparables.

## Risque cardiovasculaire Framingham (estimation par département) et données vétérinaires

**Framingham** (`backend/framingham.py`) : modèle « non-laboratoire » de D'Agostino et al., *Circulation* 2008
(âge, sexe, IMC, tension traitée ou non, tabac, diabète ; pas de cholestérol). Ce score est individuel ; pour un
territoire, on calcule le **risque moyen à 10 ans des 40–74 ans** : moyenne pondérée par sexe et tranche d'âge de 5 ans,
en mélangeant les états diabétique / traité / fumeur avec leurs probabilités.

| Entrée | Source | Varie par département ? |
|---|---|---|
| Population par âge et sexe, prévalence du diabète, traitements antihypertenseurs | Assurance Maladie (data.ameli.fr) | oui |
| Tension artérielle, IMC, tabagisme | valeurs nationales approximatives (Esteban, Baromètre SpF) | non (à remplacer par des données régionales) |

Validation : sur les 96 départements, l'estimation est corrélée à **r = 0,90** avec la prévalence observée des maladies
cardioneurovasculaires. Résultat : de 14,3 % à 18,2 % (Creuse, la plus âgée). Affiché sur la carte comme **estimation indicative** ;
il n'est pas utilisé comme variable de l'arbre (il dépend du diabète, ce serait circulaire).

**Vétérinaires** : cabinets vétérinaires actifs (SIRENE, NAF 75.00Z) pour 10 000 hab., par département et par commune —
indicateur « One Health » de présence animale, affiché sur la carte. Testé comme variable de l'arbre : il n'améliore aucune
prédiction (R² identique en validation croisée), il n'y est donc pas inclus.

## Enrichissement « prévention » (classeur prototype 2)

Source : `Maladies_chroniques_habitudes_de_vie_prototype2.xlsx` (Drive DATA SCORING), feuille « Comportements préventifs »
— données Santé publique France (Odissé) par département : dépistage des cancers du sein, colorectal et du col de l'utérus
(2024-2025), vaccination grippe 65 ans +, HPV, ROR (2025), sous-indices dépistage et vaccination (rangs percentiles) et
**indice de comportement préventif (ICP, 0-100)** avec sa typologie. Fichier brut à placer dans `data/sources/`, colonnes
intégrées par `scripts/build_ml_dataset.py` dans `data/ml/departements_2024.csv`.

Utilisation : carte de France (domaine « Santé », Prévention), fiche d'une ville (section Prévention, valeur de son département),
comparaison (ICP, dépistage, vaccination). Les 14 villes reçoivent aussi la **prévalence du diabète de leur département**
(enrichissement de la dimension résultat, poids 0). Les feuilles MRMI/ERMI et « Croisement territorial » du classeur
reposent sur des valeurs fictives de démonstration : elles ne sont pas utilisées.

## Données externes (mises en cache dans `backend/data/cache/`, non versionné)

| Endpoint | Source | Contenu |
|---|---|---|
| `GET /api/trends/pathologies?territories=…&patho=diabete\|cardio\|respiratoire\|cancers\|risque_vasculaire` | Assurance Maladie, data.ameli.fr (`effectifs`) | Prévalence annuelle 2015 → 2024 **du département** |
| `GET /api/food-environment?territories=…&include_points=true` | OpenStreetMap (Overpass, ODbL) | Fast-foods/snacks, restaurants, cafés par commune ; densité pour 10 000 hab. ; points pour la carte |

Limites : **l'obésité n'a pas de série annuelle publique** (non suivie par l'Assurance Maladie) ; le diabète et la densité de
fast-foods servent d'indicateurs indirects. Les ratios des petites communes (< 5 000 hab.) sont instables et signalés.
Le recensement OSM est collaboratif (exhaustivité variable). Premier appel Overpass : ~30 s par grande ville.

## Méthode de scoring

| Étape | Règle |
|---|---|
| Normalisation | `score = 1 + 9 × (x − ref_min) / (ref_max − ref_min)`, inversé si « plus bas = mieux », borné à [1, 10] |
| Référence | plages **fixes** par indicateur (seuils OMS, références nationales), pas un min-max sur le lot : avec 5 territoires, un min-max donnerait toujours un 1 et un 10 |
| Classes | **Bad** < 4 ≤ **Middle** < 7 ≤ **Best** |
| Dimension | moyenne pondérée des indicateurs disponibles ; publiée seulement si ≥ 50 % des indicateurs sont présents |
| Indice global | `Σ(poids × score dimension) / Σ poids` ; dimensions manquantes exclues, poids renormalisés, couverture affichée |
| Poids par défaut | **PONDERATION 3** : Sport 30 · Environnement 25 · Offre de soins 30 · Social 15 · Maladies chroniques 0 |
| Territoires | communes (code INSEE à 5 caractères) ou départements ; typologie urbain / semi-urbain / rural pour comparer des territoires de même type |

Les **maladies chroniques** sont un indicateur de *résultat* : elles sont affichées mais exclues de l'indice
par défaut. Elles serviront à calibrer les poids (quels comportements expliquent le mieux la prévalence).

### Sources des pondérations

Chaque poids indique sa base (`backend/pipeline/evidence.py`, visible dans le tableau de bord, carte « Sources des
pondérations »). Elle provient du classeur `Maladies_chroniques_habitudes_de_vie_prototype2-2.xlsx`, feuilles
« Liens maladies-habitudes » et « Sources ».

| Dimension | Base du poids | Contenu |
|---|---|---|
| Sport (30 %) | **Fondé sur des preuves** | 8 associations chiffrées (MCV RR 0,70-0,75 ; diabète T2 −14-28 % ; HTA ; cancer colorectal ; sédentarité RR 1,04/h…) |
| Environnement (25 %) | Poids d'expert | aucune association chiffrée dans le classeur (seulement l'indice ATMO comme source de données) |
| Offre de soins (30 %) | Poids d'expert | aucune association chiffrée (MRMI/ERMI servent à prioriser les publics) |
| Social (15 %) | Poids d'expert | aucune association chiffrée (FDep proposé en extension) |
| Maladies chroniques (0 %) | Indicateur de résultat | prévalences de référence : Baromètre SpF 2024, BEH HTA, Esteban |

L'indice additif lui-même s'appuie sur le cumul d'habitudes saines : −66 % de mortalité toutes causes (Springer 2022).
Les poids d'expert restent à justifier par une méta-analyse avant usage réel.

### Données WP25 (réelles, fournies par l'équipe)

| Colonne WP25 | Champ plateforme |
|---|---|
| SPORT / ENVIRONMENT / HEALTH CARE (/100) | `sport_score`, `env_score`, `health_care_score` → normalisés en 1–10 (réf. 0–100) |
| ZIP code Poverty quarter / population | `social_qpv_pct` = population en QPV / population (dimension Social) |
| Global score | `source_global_score` : **affiché pour comparaison, non utilisé**. Il ne découle pas des 3 scores (écart moyen ≈ 9 pts) |
| Population, densité, onglet (CITY / middle CiTY / COUNTRY SIDE) | contexte : `population`, `density_km2`, `territory_type` |

Points à vérifier dans la source : Saint-Victoret a exactement les mêmes scores que Mont-Dore (copier-coller ?) ;
pas de donnée QPV pour les villes moyennes et rurales (Social non calculé, poids renormalisés) ; QPV d'Annecy à 19 %
(25 k hab.) à confirmer ; période supposée 2025.

⚠️ La plage de référence QPV (0–30 %) et celles des maladies chroniques sont provisoires et doivent être validées
par un expert en santé publique.

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
