# Combines every compose file in deploy/compose/ into one local stack.
COMPOSE_FILES := $(patsubst %,-f %,$(sort $(wildcard deploy/compose/*.yml)))
COMPOSE := docker compose $(COMPOSE_FILES)

.PHONY: help up infra down logs ps config

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-10s %s\n", $$1, $$2}'

up: ## Build and start the whole stack
	$(COMPOSE) up -d --build

infra: ## Start only shared infrastructure (Postgres, Redis, Mongo, Kafka, Elasticsearch)
	docker compose -f deploy/compose/infra.yml up -d

down: ## Stop everything
	$(COMPOSE) down

logs: ## Follow logs (make logs s=order-service)
	$(COMPOSE) logs -f $(s)

ps: ## List running containers
	$(COMPOSE) ps

config: ## Print the merged compose config
	$(COMPOSE) config
