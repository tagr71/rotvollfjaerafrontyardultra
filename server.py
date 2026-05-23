"""Entry point: start the FastAPI backend via uvicorn.

Run with:
    uv run python .\\server.py
"""
from __future__ import annotations

import os

import uvicorn


def main() -> None:
    # Local launcher = development. Enable the dev CORS origin
    # (http://localhost:5173) for the Vite dev server unless the
    # caller has already pinned DEV explicitly.
    os.environ.setdefault("DEV", "1")
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        app_dir="backend",
    )


if __name__ == "__main__":
    main()
