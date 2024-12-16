"""Vercel FastAPI entrypoint; local development also uses api.index:app."""
from api.index import app

__all__ = ["app"]
