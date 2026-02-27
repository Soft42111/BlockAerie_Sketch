# ── Stage 1: Build ────────────────────────────────────────────────
FROM node:20-slim AS build

WORKDIR /app

# Install ffmpeg for 360 video assembly
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# ── Stage 2: Runtime ──────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# ffmpeg for video assembly
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /app /app

# Create data directory for SQLite databases
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "src/index.js"]
