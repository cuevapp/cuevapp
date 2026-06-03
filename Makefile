# Cueva — convenience wrapper around the local Docker stack + data/jobs.
# Mirrors the prod topology (DEPLOY.md): web :3000, api :8080, a private db, + the update job.
#
# Run from the project root. On Windows, run these from Git Bash or WSL (a POSIX shell);
# a native make can be installed with:  winget install ezwinports.make
#
# Typical flow:
#   make up        # build + start (web :3000, api :8080, db private)
#   make seed      # 32 sample films, no cost    (or: make backfill LIMIT=500)
#   make update    # run the Tue/Thu refresh job once
#   make down      # stop          (make reset also wipes the DB volume)

COMPOSE ?= docker compose
LIMIT   ?= 150
K       ?= 10

.DEFAULT_GOAL := help

help: ## list available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN{FS=":.*?## "}{printf "  %-12s %s\n", $$1, $$2}'

up: ## build + start the stack (db, api, web)
	$(COMPOSE) up -d --build

down: ## stop the stack (keeps the DB volume)
	$(COMPOSE) down

reset: ## stop the stack and DELETE the DB volume
	$(COMPOSE) down -v

restart: down up ## recreate the stack

ps: ## show stack status
	$(COMPOSE) ps

logs: ## tail all service logs
	$(COMPOSE) logs -f

build: ## (re)build images without starting
	$(COMPOSE) build

seed: ## load 32 sample films (no API keys / cost)
	$(COMPOSE) run --rm -v "$(CURDIR)/seed_films.py:/app/seed_films.py:ro" api python seed_films.py

backfill: ## real TMDB->Claude backfill — make backfill LIMIT=500 (needs keys in .env)
	$(COMPOSE) run --rm api python -m cueva.cli backfill --mode live --limit $(LIMIT)

update: ## run the scheduled refresh job once — make update LIMIT=300
	$(COMPOSE) run --rm update python -m cueva.cli update --limit $(LIMIT)

posters: ## backfill poster_path for existing films (TMDB only, no cost)
	$(COMPOSE) run --rm -v "$(CURDIR)/backfill_posters.py:/app/backfill_posters.py:ro" api python backfill_posters.py

match: ## recommend from liked ids — make match LIKE=27205,49026
	$(COMPOSE) run --rm api python -m cueva.cli match --like $(LIKE) -k $(K)

analytics: ## offline lift + online calibration/maturity
	$(COMPOSE) run --rm api python -m cueva.cli analytics

psql: ## open psql against the running db
	$(COMPOSE) exec db psql -U cueva -d cueva

shell: ## open a shell in a one-off api container
	$(COMPOSE) run --rm api sh

.PHONY: help up down reset restart ps logs build seed backfill update posters match analytics psql shell
