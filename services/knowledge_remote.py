"""Fetch remote knowledge files from GitHub raw URLs."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

DEFAULT_BASE = (
    "https://raw.githubusercontent.com/thangtmc73/flowy/refs/heads/master/knowledge"
)

REMOTE_FILES: dict[str, str] = {
    "_index.json": "/knowledge/_index.json",
    "cross_product/comparisons.json": "knowledge/cross_product/comparisons.json",
    "cross_product/general_faqs.json": "/knowledge/cross_product/general_faqs.json",
}


def _base_url() -> str:
    return os.environ.get("KNOWLEDGE_RAW_BASE_URL", DEFAULT_BASE).rstrip("/")


def fetch_raw(relative_path: str) -> dict[str, Any]:
    url = f"{_base_url()}/{relative_path.lstrip('/')}"
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Failed to fetch {url}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON from {url}: {exc}") from exc


def fetch_all_remote() -> dict[str, dict[str, Any]]:
    return {
        "_index.json": fetch_raw("_index.json"),
        "comparisons.json": fetch_raw("cross_product/comparisons.json"),
        "general_faqs.json": fetch_raw("cross_product/general_faqs.json"),
    }


def list_products_from_index(index: dict[str, Any]) -> list[dict[str, Any]]:
    products: list[dict[str, Any]] = []
    for partner in index.get("partners") or []:
        if not partner.get("active", True):
            continue
        partner_id = partner.get("partner_id", "")
        partner_name = partner.get("partner_name", "")
        for product in partner.get("products") or []:
            products.append(
                {
                    "partner_id": partner_id,
                    "partner_name": partner_name,
                    "product_id": product.get("product_id", ""),
                    "product_name": product.get("product_name", ""),
                    "category": product.get("category", ""),
                }
            )
    return products


def product_exists(index: dict[str, Any], partner_id: str, product_id: str) -> bool:
    for item in list_products_from_index(index):
        if item["partner_id"] == partner_id and item["product_id"] == product_id:
            return True
    return False
