.PHONY: help install backend frontend dev test lint typecheck build check clean docker fmt

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

# ── Setup ──────────────────────────────────────────────

install: ## Install all dependencies (backend + frontend)
	uv sync --all-extras
	cd frontend && npm install

# ── Development ────────────────────────────────────────

backend: ## Start backend API server (:8000)
	uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

frontend: ## Start frontend dev server (:5173)
	cd frontend && npm run dev

dev: ## Start backend + frontend together
	@echo "\033[36m[luminar]\033[0m Starting backend on :8000..."
	@uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload &
	@sleep 2
	@echo "\033[36m[luminar]\033[0m Starting frontend on :5173..."
	@cd frontend && npm run dev

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
	cd frontend && npx tsc --noEmit

build: ## Build frontend for production
	cd frontend && npm run build

check: lint test typecheck build ## Run all checks (lint + test + types + build)

# ── Docker ─────────────────────────────────────────────

docker: ## Run with Docker Compose
	docker compose up --build

# ── Cleanup ────────────────────────────────────────────

clean: ## Remove build artifacts and caches
	rm -rf frontend/dist frontend/node_modules/.vite
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
