# Builds the React frontend and runs the Express server, which serves the
# pages, the API (/api) and Socket.IO on one domain.
FROM node:22-alpine AS build

WORKDIR /app
COPY package*.json ./
# Build tools (Vite) are devDependencies; install them even if the host
# passes NODE_ENV=production at build time.
RUN npm ci --include=dev
COPY . .

# Optional: point the frontend at a different API. Empty means same-domain /api.
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM node:22-alpine AS production

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5050
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node . .
COPY --chown=node:node --from=build /app/dist ./dist

USER node
EXPOSE 5050

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/ready || exit 1

CMD ["node", "server.js"]
