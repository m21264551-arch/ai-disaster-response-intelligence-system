SHELL := /bin/bash

BACKEND_HOST ?= 127.0.0.1
BACKEND_PORT ?= 8000
FRONTEND_HOST ?= 127.0.0.1
FRONTEND_PORT ?= 5173
OPEN_BROWSER ?= 1
PYTHON ?= python3

VENV_PYTHON := .venv/bin/python
PIP := .venv/bin/pip
UVICORN := .venv/bin/uvicorn
DASHBOARD_URL := http://$(FRONTEND_HOST):$(FRONTEND_PORT)

.DEFAULT_GOAL := help

.PHONY: help bootstrap install install-optional install-dev demo backend frontend train train-xgboost train-national evaluate-heldout download-bom download-abs-population build-multiseason-corpus download-osm test build audit check

help:
	@echo "AI Disaster-Response Intelligence System"
	@echo ""
	@echo "Commands:"
	@echo "  make demo              Start backend + frontend and open the dashboard"
	@echo "  make install           Reinstall Python and frontend dependencies"
	@echo "  make install-optional  Install XGBoost and OR-Tools extras"
	@echo "  make install-dev       Install local security audit tools"
	@echo "  make backend           Start only the FastAPI backend"
	@echo "  make frontend          Start only the React/Vite frontend"
	@echo "  make train             Rebuild the trained risk model artifact"
	@echo "  make train-xgboost     Rebuild the risk model with optional XGBoost"
	@echo "  make train-national    Train against the multi-state, multi-season corpus"
	@echo "  make evaluate-heldout  Score the frozen model on the held-out event"
	@echo "  make download-bom      Download real BoM station weather observations"
	@echo "  make download-abs-population Aggregate the ABS population grid to H3"
	@echo "  make build-multiseason-corpus Download bounded multi-state DEA hotspot windows"
	@echo "  make download-osm      Download optional OSM exposure overlays"
	@echo "  make test              Run backend tests"
	@echo "  make build             Build the frontend"
	@echo "  make audit             Run dependency and static security audits"
	@echo "  make check             Run tests and frontend build"

bootstrap:
	@if [ ! -x "$(VENV_PYTHON)" ]; then \
		echo "Creating Python virtualenv"; \
		$(PYTHON) -m venv .venv; \
	fi
	@if [ ! -x "$(UVICORN)" ]; then \
		echo "Installing backend dependencies"; \
		$(PIP) install -r backend/requirements.txt; \
	fi
	@if [ ! -d "frontend/node_modules" ]; then \
		echo "Installing frontend dependencies"; \
		npm --prefix frontend install; \
	fi

install:
	$(PYTHON) -m venv .venv
	$(PIP) install -r backend/requirements.txt
	npm --prefix frontend install

install-optional: bootstrap
	$(PIP) install -r backend/requirements-optional.txt

install-dev: bootstrap
	$(PIP) install -r backend/requirements-dev.txt

demo: bootstrap
	@echo "Starting demo at $(DASHBOARD_URL)"
	@PYTHONPATH=backend $(UVICORN) app.main:app --host $(BACKEND_HOST) --port $(BACKEND_PORT) & \
	BACKEND_PID=$$!; \
	npm --prefix frontend run dev -- --host $(FRONTEND_HOST) --port $(FRONTEND_PORT) & \
	FRONTEND_PID=$$!; \
	trap 'kill $$BACKEND_PID $$FRONTEND_PID 2>/dev/null || true' EXIT INT TERM; \
	for attempt in {1..30}; do \
		if $(VENV_PYTHON) -c "import urllib.request; urllib.request.urlopen('http://$(BACKEND_HOST):$(BACKEND_PORT)/health', timeout=1)" >/dev/null 2>&1; then \
			break; \
		fi; \
		sleep 1; \
	done; \
	for attempt in {1..30}; do \
		if $(VENV_PYTHON) -c "import urllib.request; urllib.request.urlopen('$(DASHBOARD_URL)', timeout=1)" >/dev/null 2>&1; then \
			break; \
		fi; \
		sleep 1; \
	done; \
	if [ "$(OPEN_BROWSER)" = "1" ]; then \
		if command -v open >/dev/null 2>&1; then \
			open "$(DASHBOARD_URL)"; \
		elif command -v xdg-open >/dev/null 2>&1; then \
			xdg-open "$(DASHBOARD_URL)" >/dev/null 2>&1 || true; \
		fi; \
	fi; \
	echo "Backend:  http://$(BACKEND_HOST):$(BACKEND_PORT)"; \
	echo "Frontend: $(DASHBOARD_URL)"; \
	echo "Press Ctrl+C to stop both servers."; \
	wait $$BACKEND_PID $$FRONTEND_PID

backend: bootstrap
	PYTHONPATH=backend $(UVICORN) app.main:app --reload --host $(BACKEND_HOST) --port $(BACKEND_PORT)

frontend: bootstrap
	npm --prefix frontend run dev -- --host $(FRONTEND_HOST) --port $(FRONTEND_PORT)

train: bootstrap
	PYTHONPATH=backend $(VENV_PYTHON) backend/scripts/train_bushfire_model.py \
		--input backend/app/data/historical_hotspots_sample.csv \
		--output-dir backend/app/ml/artifacts \
		--dataset-out backend/app/ml/artifacts/training_dataset.csv

train-xgboost: bootstrap
	PYTHONPATH=backend $(VENV_PYTHON) backend/scripts/train_bushfire_model.py \
		--input backend/app/data/historical_hotspots_sample.csv \
		--output-dir backend/app/ml/artifacts \
		--dataset-out backend/app/ml/artifacts/training_dataset.csv \
		--model-family xgboost

train-national: bootstrap
	PYTHONPATH=backend $(VENV_PYTHON) backend/scripts/train_bushfire_model.py \
		--input backend/app/data/multiseason_national_hotspots_sample.csv \
		--output-dir backend/app/ml/artifacts \
		--dataset-out backend/app/ml/artifacts/training_dataset.csv \
		--model-run-id national-multiseason-bushfire-v1 \
		--dataset-name "DEA hotspots, bounded multi-state/multi-season national sample" \
		--lookback-hours 36 \
		--step-hours 12 \
		--candidate-ring 3

evaluate-heldout: bootstrap
	PYTHONPATH=backend $(VENV_PYTHON) backend/scripts/evaluate_heldout_model.py \
		--input backend/app/data/heldout_hotspots_sample.csv \
		--lookback-hours 36 \
		--step-hours 12 \
		--candidate-ring 3

download-bom: bootstrap
	PYTHONPATH=backend $(VENV_PYTHON) backend/scripts/download_bom_weather.py \
		--start-month 2019-11 \
		--end-month 2020-01 \
		--out backend/app/data/bom_weather_observations_sample.csv

download-abs-population: bootstrap
	PYTHONPATH=backend $(VENV_PYTHON) backend/scripts/download_abs_population_grid.py \
		--out backend/app/data/abs_population_h3_sample.csv \
		--resolution 5

build-multiseason-corpus: bootstrap
	PYTHONPATH=backend $(VENV_PYTHON) backend/scripts/build_multiseason_corpus.py \
		--out backend/app/data/multiseason_national_hotspots_sample.csv \
		--manifest-out backend/app/data/multiseason_national_manifest.json \
		--max-records-per-window 5000 \
		--sample-per-window 3000 \
		--page-size 2500 \
		--chunk-hours 6

download-osm: bootstrap
	PYTHONPATH=backend $(VENV_PYTHON) backend/scripts/download_osm_infrastructure.py \
		--bbox 148.7,-37.4,153.8,-31.1 \
		--out backend/app/data/osm_infrastructure_sample.csv

test: bootstrap
	PYTHONPATH=.:backend $(VENV_PYTHON) -m pytest backend/tests -q

build: bootstrap
	npm --prefix frontend run build

audit: install-dev
	$(PIP) check
	$(VENV_PYTHON) -m pip_audit -r backend/requirements.txt -r backend/requirements-optional.txt -r backend/requirements-dev.txt
	$(VENV_PYTHON) -m bandit -q -r backend/app backend/scripts -x backend/tests
	npm --prefix frontend audit --omit=dev

check: test build

replay: bootstrap
	PYTHONPATH=backend $(VENV_PYTHON) -m app.replay.pipeline
