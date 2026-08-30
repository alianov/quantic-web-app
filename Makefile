COMPOSE := docker compose
BASE_URL ?= http://127.0.0.1:5173

.PHONY: up demo tools demo-tools down logs config smoke

.env:
	cp .env.example .env

up: .env
	$(COMPOSE) up --build

# Passing one file skips the automatic development override.
demo: .env
	$(COMPOSE) -f compose.yaml up --build -d

# Adminer is an opt-in profile and binds only to the configured loopback port.
tools: .env
	$(COMPOSE) --profile tools up --build

demo-tools: .env
	$(COMPOSE) -f compose.yaml --profile tools up --build -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f web api postgres

config: .env
	$(COMPOSE) config

smoke:
	curl -fsS "$(BASE_URL)/api/readyz"
