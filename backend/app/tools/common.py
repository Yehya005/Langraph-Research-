"""Shared HTTP helpers and credentials for the tools."""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Optional

import requests

TIMEOUT = 20
HEADERS = {"User-Agent": "research-assistant-coe749/1.0"}


def kaggle_auth() -> Optional[dict]:
    """requests kwargs for Kaggle auth, or None if not configured.

    Supports the new API tokens (KAGGLE_API_TOKEN=KGAT_..., or ~/.kaggle/access_token) sent as
    a Bearer header, and legacy username/key pairs (env vars or ~/.kaggle/kaggle.json)."""
    token = os.getenv("KAGGLE_API_TOKEN")
    token_file = Path.home() / ".kaggle" / "access_token"
    if not token and token_file.exists():
        token = token_file.read_text().strip()
    if token:
        return {"headers": {**HEADERS, "Authorization": f"Bearer {token}"}}

    user, key = os.getenv("KAGGLE_USERNAME"), os.getenv("KAGGLE_KEY")
    legacy = Path.home() / ".kaggle" / "kaggle.json"
    if not (user and key) and legacy.exists():
        data = json.loads(legacy.read_text())
        user, key = data.get("username"), data.get("key")
    return {"auth": (user, key)} if user and key else None


def s2_headers() -> dict:
    key = os.getenv("S2_API_KEY")
    return {**HEADERS, **({"x-api-key": key} if key else {})}


def get_json(url: str, retries: int = 3, **kwargs):
    """GET JSON, backing off on 429 rate limits (Semantic Scholar without a key)."""
    kwargs.setdefault("timeout", TIMEOUT)
    kwargs.setdefault("headers", HEADERS)
    for attempt in range(retries + 1):
        resp = requests.get(url, **kwargs)
        if resp.status_code != 429 or attempt == retries:
            break
        time.sleep(float(resp.headers.get("Retry-After", 2 * (attempt + 1))))
    resp.raise_for_status()
    return resp.json()


def short(text: Optional[str], n: int = 400) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= n else text[:n] + "..."
