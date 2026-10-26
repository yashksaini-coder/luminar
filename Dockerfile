# ── Stage 1: Build web (Next static export) ────────────────────────────────
FROM node:22-slim AS frontend-build
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
ARG NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build


# ── Stage 2: Python runtime ───────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Install uv via pip — avoids ghcr.io pull which is blocked on DO build infra
RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --frozen

COPY backend/ backend/

# web/out → the path backend/main.py:1043 mounts; the backend is not edited
COPY --from=frontend-build /web/out frontend/dist

EXPOSE 8080

ENV LUMINAR_NODE_COUNT=20
ENV LUMINAR_LOG_LEVEL=INFO
ENV PORT=8080

CMD ["sh", "-c", "uv run uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
