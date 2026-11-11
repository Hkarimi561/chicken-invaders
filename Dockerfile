# syntax=docker/dockerfile:1
# The multiplayer game server only (WebSockets need a long-running process, so it is not part of the Vercel
# deployment). The website itself is a Next.js app: deploy it on Vercel.
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3001
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY tsconfig.json ./
COPY game-server ./game-server
COPY lib ./lib
COPY shared ./shared
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1
CMD ["npx", "tsx", "game-server/index.ts"]
