# Convenience wrappers around the pieces of Docker that actually exist today.
#
# `make up`/`down`/`logs`/`ps` bring up Postgres + Redis — the local
# dev-dependency stack in docker-compose.yml, meant to run *alongside*
# `pnpm start:dev` (backend) and `pnpm dev` (frontend), not to replace them.
# There is no single-command containerized "everything" stack yet: the
# production stack at ops/compose.yml assumes a shared external network,
# externally-hosted Postgres/Redis, and the backend and frontend repos
# checked out as sibling directories — see ops/README.md.
#
# `make build` builds this API's own image, plus the frontend's one
# parameterized image once per app (base-site, admin, partner-app,
# institution-portal), assuming the frontend repo is a sibling directory
# (../rakuxon-FE) — override FRONTEND_DIR if yours lives elsewhere.

COMPOSE := docker compose -f docker-compose.yml
FRONTEND_DIR ?= ../rakuxon-FE
FRONTEND_APPS := base-site admin partner-app institution-portal

.PHONY: up down logs ps build build-api build-frontend

up: ## Start Postgres + Redis for local development.
	$(COMPOSE) up -d

down: ## Stop Postgres + Redis.
	$(COMPOSE) down

logs: ## Follow Postgres + Redis logs.
	$(COMPOSE) logs -f

ps: ## Show the status of Postgres + Redis.
	$(COMPOSE) ps

build: build-api build-frontend ## Build every image: the API and all 4 frontend apps.

build-api: ## Build the backend API image.
	docker build -t rakuxon-api .

build-frontend: ## Build one image per frontend app.
	@for app in $(FRONTEND_APPS); do \
		echo "==> building $$app"; \
		docker build -f $(FRONTEND_DIR)/Dockerfile --build-arg APP_NAME=$$app -t rakuxon-$$app $(FRONTEND_DIR) || exit 1; \
	done
