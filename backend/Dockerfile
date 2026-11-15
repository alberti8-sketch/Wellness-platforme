# API Wellness Platform (FastAPI)
#
# Le contexte de construction est la RACINE du dépôt, car l'API lit aussi ../data
# (data/ml, data/evidence, data/wp25_communes.xlsx).
#   docker build -f backend/Dockerfile -t wellness-api .
#   docker run -p 8000:8000 wellness-api
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Même arborescence que le dépôt : /srv/backend (code) et /srv/data (données versionnées).
WORKDIR /srv/backend

# Dépendances d'abord, pour profiter du cache Docker. Toutes ont des wheels Python 3.12 :
# pas besoin de gcc.
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/ ./
COPY data/ /srv/data/

# Utilisateur non root ; dossiers de cache écrits à l'exécution (geo.api.gouv.fr, data.ameli.fr…).
RUN useradd --create-home --uid 10001 app \
    && mkdir -p data/cache data/geo_cache \
    && chmod +x docker-entrypoint.sh \
    && chown -R app:app /srv/backend/data
USER app

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/api/health' % os.getenv('PORT','8000'), timeout=4)"

# Render, Railway, Fly.io… fournissent le port dans $PORT.
CMD ["./docker-entrypoint.sh"]
