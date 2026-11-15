#!/bin/sh
# Démarrage du conteneur de l'API.
set -e

# Charge le jeu de démonstration WP25 au premier démarrage (sans effet s'il est déjà publié).
if [ "${WELLNESS_SEED_DEMO:-1}" = "1" ]; then
    python -m scripts.seed_demo || echo "Chargement des données de démonstration ignoré (voir le message ci-dessus)."
fi

exec uvicorn main:app \
    --host 0.0.0.0 \
    --port "${PORT:-8000}" \
    --proxy-headers \
    --forwarded-allow-ips "*" \
    ${UVICORN_EXTRA_ARGS:-}
