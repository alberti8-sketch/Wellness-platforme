# Interface Wellness Platform (Next.js) — pour docker-compose ou un hébergeur Docker.
# Sur Vercel, ce fichier n'est pas utilisé.
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
# Adresse publique de l'API, figée au moment de la construction (variable NEXT_PUBLIC_*).
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
