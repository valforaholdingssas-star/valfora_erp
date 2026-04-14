.PHONY: help up down build migrate test shell-backend prod-build prod-up

help:
	@echo "Targets: up, down, build, migrate, test, shell-backend, prod-build, prod-up"

up:
	docker compose up --build

down:
	docker compose down

build:
	docker compose build

migrate:
	docker compose run --rm web python manage.py migrate

test:
	cd BACKEND && python3 -m pytest -q

shell-backend:
	docker compose run --rm web python manage.py shell

# Producción (imágenes inmutables): ver docs/DEPLOYMENT.md
prod-build:
	docker compose -f docker-compose.production.yml --env-file .env.production build

prod-up:
	docker compose -f docker-compose.production.yml --env-file .env.production up -d --build
