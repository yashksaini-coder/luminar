.PHONY: help install backend dev test lint typecheck build check clean docker fmt otel-up otel-down otel-smoke web web-build web-test web-check web-video web-stats

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

# ── Setup ──────────────────────────────────────────────

install: ## Install all dependencies (backend + web)
	uv sync --all-extras
	cd web && npm ci

# ── Development ────────────────────────────────────────

backend: ## Start backend API server (:8000)
	uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

dev: ## Start backend + web together
	@echo "\033[36m[luminar]\033[0m Starting backend on :8000..."
	@uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload &
	@sleep 2
	@echo "\033[36m[luminar]\033[0m Starting web on :3000..."
	@cd web && npm run dev

# ── Quality ────────────────────────────────────────────

test: ## Run backend tests (pytest)
	uv run pytest tests/ -v

lint: ## Lint Python code (ruff check)
	uv run ruff check backend/ tests/
	uv run ruff format --check backend/ tests/

fmt: ## Auto-format Python code (ruff)
	uv run ruff format backend/ tests/
	uv run ruff check --fix backend/ tests/

typecheck: ## TypeScript type check (tsc)
	cd web && npx tsc --noEmit

build: ## Build the web app (static export → web/out)
	cd web && npm run build

check: lint test web-check build ## Run all checks (ruff + pytest + tsc/eslint/vitest + next build)

# ── Web (Next.js overhaul) ─────────────────────────────

web: ## Start the Next.js web dev server (:3000)
	cd web && npm run dev

web-build: ## Build the web static export (web/out)
	cd web && npm run build

web-test: ## Run web unit tests (vitest)
	cd web && npx vitest run

web-check: ## Web checks (tsc + lint + vitest)
	cd web && npx tsc --noEmit && npm run lint && npx vitest run

web-video: ## Render the launch video cuts (web/video-out, public/video)
	cd web && npm run video

web-stats: ## Regenerate web/lib reel-stats.json + plate-frames.json from the sybil-eclipse reel
	cd web && npm run reel-stats

# ── Docker ─────────────────────────────────────────────

docker: ## Run with Docker Compose
	docker compose up --build

# ── Observability (laptop only) ────────────────────────

otel-up: ## Start Jaeger + Prometheus + Grafana (deploy/otel); run backend with OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
	docker compose -f deploy/otel/docker-compose.yml up -d

otel-down: ## Stop the observability stack
	docker compose -f deploy/otel/docker-compose.yml down

otel-smoke: ## Round-trip one message trace Luminar → OTLP/JSON → Jaeger
	uv run python scripts/otel_smoke.py

# ── Cleanup ────────────────────────────────────────────

clean: ## Remove build artifacts and caches
	rm -rf web/out web/.next
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
