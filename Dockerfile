# Imagen ligera de Node: el build tarda segundos (Nixpacks se quedaba descargando paquetes de Nix)
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Dependencias primero para aprovechar la caché entre deploys
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src
COPY public ./public

EXPOSE 3000
CMD ["node", "src/server.js"]
