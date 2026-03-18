# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:22-slim AS frontend-build

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# ── Stage 2: Python runtime ───────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Install uv via pip — avoids ghcr.io pull which is blocked on DO build infra
RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --frozen

COPY backend/ backend/

# Copy the built frontend into the location main.py expects
COPY --from=frontend-build /frontend/dist frontend/dist

EXPOSE 8080

ENV LUMINAR_NODE_COUNT=20
ENV LUMINAR_LOG_LEVEL=INFO
ENV PORT=8080

CMD ["sh", "-c", "uv run uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
