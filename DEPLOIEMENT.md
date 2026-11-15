# Mise en ligne : Render (API + base) et Vercel (interface)

```
Navigateur ──► Vercel : interface Next.js        https://wellness-platform.vercel.app
                 │  NEXT_PUBLIC_API_URL
                 ▼
               Render : API FastAPI (Docker)       https://wellness-api.onrender.com
                 │  WELLNESS_DATABASE_URL (réseau interne Render)
                 ▼
               Render : Postgres
```

Coût indicatif : API 7 $/mois (`0.5c-512mb`) + base 6 $/mois (`0.1c-256mb`) chez Render, interface chez Vercel : l'offre Hobby est gratuite mais réservée à un usage non commercial ; l'offre Pro (20 $/mois par membre) est nécessaire pour un usage commercial.
L'API consomme environ 240 Mo de mémoire.

> **Données de santé.** Cette architecture convient à la démonstration, qui utilise uniquement des données publiques agrégées par commune.
> Render et Vercel ne sont pas certifiés HDS : aucune donnée de santé individuelle ne doit y être stockée.

## 1. API et base de données sur Render (environ 10 minutes)

1. Créer un compte sur [render.com](https://render.com) et le relier à GitHub.
2. **New > Blueprint**, choisir le dépôt `Wellness-platforme` : Render lit `render.yaml` et propose de créer `wellness-api` et `wellness-db`.
3. Renseigner les valeurs demandées :
   | Variable | Valeur |
   |---|---|
   | `WELLNESS_CORS_ORIGINS` | l'adresse Vercel, par exemple `https://wellness-platform.vercel.app` (vous pourrez la corriger après l'étape 2) |
   | `OPENROUTER_API_KEY` | clé [OpenRouter](https://openrouter.ai/keys) pour l'assistant « Solutions » (penser à fixer un plafond de dépense) |
   | `OPENROUTER_MODEL` | laisser vide pour garder le modèle par défaut |
4. **Apply**. Au premier démarrage, l'API crée les tables et charge le jeu de démonstration WP25 (`WELLNESS_SEED_DEMO=1`). Elle ne le recharge pas aux démarrages suivants.
5. Vérifier : `https://wellness-api.onrender.com/api/health` doit répondre `{"status":"ok"}`, et la documentation est disponible sur `/docs`.

## 2. Interface sur Vercel (environ 5 minutes)

1. Créer un compte sur [vercel.com](https://vercel.com) avec GitHub, puis **Add New > Project** et importer le dépôt.
2. **Root Directory : `frontend`**. Vercel détecte Next.js ; `frontend/vercel.json` fixe le reste : région Paris (`cdg1`), `npm ci` et quelques en-têtes de sécurité.
3. **Environment Variables** :
   | Variable | Valeur |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | l'adresse Render, par exemple `https://wellness-api.onrender.com` (sans `/` à la fin) |
   | `NEXT_PUBLIC_ONBOARDING_VIDEO_URL` | facultatif : adresse publique de la vidéo de prise en main (voir plus bas) |
4. **Deploy**. Reporter ensuite l'adresse finale de Vercel dans `WELLNESS_CORS_ORIGINS` sur Render, puis cliquer sur **Manual Deploy > Restart**.

> Les variables `NEXT_PUBLIC_*` sont intégrées au moment de la construction : après les avoir modifiées, il faut relancer un déploiement Vercel (**Redeploy**).

## 3. Mises à jour

Chaque push sur `main` redéploie automatiquement :
- l'API, si `backend/`, `data/` ou `render.yaml` ont changé ;
- l'interface, à chaque push.

Chaque Pull Request obtient aussi une adresse de prévisualisation sur Vercel.

## 4. Nom de domaine (facultatif)

- Interface : Vercel > Settings > Domains, ajouter par exemple `wellness-platform.fr` et suivre les instructions DNS.
- API : Render > wellness-api > Settings > Custom Domains, ajouter par exemple `api.wellness-platform.fr`.
- Mettre ensuite à jour `NEXT_PUBLIC_API_URL` (Vercel) et `WELLNESS_CORS_ORIGINS` (Render).

## Vidéo de prise en main

Le fichier `frontend/public/videos/onboarding.mp4` (118 Mo) n'est pas versionné, car il dépasse la limite de GitHub. Vercel ne l'a donc pas, et la vidéo serait introuvable sur le site.
Deux solutions :
- la déposer sur un service vidéo ou de stockage (Vercel Blob, Cloudflare R2, Vimeo…) et indiquer son adresse dans `NEXT_PUBLIC_ONBOARDING_VIDEO_URL` ;
- ou la compresser sous 100 Mo et la versionner.

## Avant une ouverture au public

- **Clés de démonstration.** Les clés `demo-b2g-admin`, `demo-b2g-contrib` et `demo-b2b-admin` sont écrites dans le code (`backend/config.py`) et proposées par l'interface.
  - En ligne, n'importe qui peut s'en servir pour déposer ou valider des données.
  - Pour une vraie ouverture, définir `WELLNESS_PRINCIPALS_FILE` (fichier JSON de clés privées, monté comme *Secret File* sur Render) et retirer le sélecteur de démo de l'interface.
- **Comptes des maires** : les sessions durent 30 jours (`WELLNESS_SESSION_DAYS`).
- **Sauvegardes** : les offres payantes de Render Postgres incluent des sauvegardes quotidiennes ; vérifier leur durée de conservation dans le tableau de bord.

## Variables de l'API

| Variable | Rôle | Valeur par défaut |
|---|---|---|
| `WELLNESS_DATABASE_URL` | connexion à la base (`postgresql://` ou `postgres://`) | SQLite local |
| `WELLNESS_CORS_ORIGINS` | adresses de l'interface autorisées, séparées par des virgules | `http://localhost:3000` |
| `WELLNESS_CORS_DEV` | `1` autorise aussi `localhost` (développement), `0` en production | `1` |
| `WELLNESS_SEED_DEMO` | `1` charge le jeu WP25 au démarrage s'il est absent | `1` |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | assistant « Solutions » | aucune |
| `WELLNESS_PRINCIPALS_FILE` | clés API privées (remplace les clés de démo) | clés de démo |
| `WELLNESS_SESSION_DAYS` | durée des sessions des maires | `30` |
| `PORT` | port d'écoute, fourni par l'hébergeur | `8000` |

## Lancement local avec Docker

```bash
./start.sh            # crée .env avec un mot de passe aléatoire, puis docker compose up --build
```

L'image de l'API se construit depuis la **racine** du dépôt, car elle a besoin de `data/` :

```bash
docker build -f backend/Dockerfile -t wellness-api .
docker run -p 8000:8000 wellness-api   # SQLite intégré, démo chargée
```
