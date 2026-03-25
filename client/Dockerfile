FROM node:20-alpine AS builder
WORKDIR /app

ARG VITE_SERVER_URL=http://localhost:3001
ENV VITE_SERVER_URL=$VITE_SERVER_URL

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .
RUN npm run build

# ── Production: Node + Express serve static files ──────────────────────────────
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "server.js"]
