# Combines every compose file in deploy/compose/ into one local stack.
COMPOSE_FILES := $(patsubst %,-f %,$(sort $(wildcard deploy/compose/*.yml)))
COMPOSE := docker compose $(COMPOSE_FILES)

.PHONY: help up infra down logs ps config e2e-up e2e e2e-logs

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

# The stack with e2e/compose.yml on top: a fake SMS service and an admin number.
E2E := $(COMPOSE) -f e2e/compose.yml

e2e-up: ## Build and start the stack for the end-to-end tests
	$(E2E) up -d --build --wait

e2e: e2e-up ## Run the end-to-end tests (make e2e args="--headed" to watch)
	cd e2e && npx playwright test $(args)

e2e-logs: ## Print every service's logs from the e2e stack
	$(E2E) logs --no-color
