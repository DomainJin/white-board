# Root Dockerfile for Railway - Backend deployment
FROM node:20-alpine AS base
WORKDIR /app

# Copy only necessary files
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev

# Copy source
COPY server/src ./src

ENV PORT=3001
EXPOSE 3001
CMD ["node", "src/index.js"]
