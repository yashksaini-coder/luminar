FROM python:3.12-slim

WORKDIR /app

# Install uv via pip — avoids ghcr.io pull which is blocked on DO build infra
RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
COPY backend/ backend/

RUN uv sync --no-dev --frozen

EXPOSE 8080

ENV LUMINAR_NODE_COUNT=20
ENV LUMINAR_LOG_LEVEL=INFO
ENV PORT=8080

CMD ["sh", "-c", "uv run uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
