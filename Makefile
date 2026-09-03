COMPOSE := docker compose
BASE_URL ?= http://127.0.0.1:5173
DEMO_BASE_URL ?= https://127.0.0.1:9443
LOCAL_CA_CERT ?= /tmp/cafe-fausse-caddy-root.crt

.PHONY: up demo tools demo-tools demo-ca demo-smoke demo-tools-smoke down logs config smoke

.env:
	cp .env.example .env

up: .env
	$(COMPOSE) up --build

# Passing one file skips the automatic development override.
demo: .env
	$(COMPOSE) -f compose.yaml up --build -d --wait

# Adminer is opt-in. Development publishes its direct loopback port.
tools: .env
	$(COMPOSE) --profile tools up --build

demo-tools: .env
	$(COMPOSE) -f compose.yaml --profile tools up --build -d --wait

# Copy only the public local CA certificate. Its private key stays in Docker.
demo-ca:
	$(COMPOSE) -f compose.yaml cp web:/data/caddy/pki/authorities/local/root.crt "$(LOCAL_CA_CERT)"

demo-smoke: demo-ca
	curl --cacert "$(LOCAL_CA_CERT)" -fsS "$(DEMO_BASE_URL)/api/readyz"

demo-tools-smoke: demo-smoke
	curl --cacert "$(LOCAL_CA_CERT)" -fsS -o /dev/null "$(DEMO_BASE_URL)/adminer/"

down:
	$(COMPOSE) --profile tools down

logs:
	$(COMPOSE) logs -f web api postgres

config: .env
	$(COMPOSE) config

smoke:
	curl -fsS "$(BASE_URL)/api/readyz"
