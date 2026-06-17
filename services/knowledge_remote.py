"""Fetch remote knowledge files from GitHub raw URLs."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Literal

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
    return find_product_in_index(index, partner_id, product_id) is not None


def find_product_in_index(
    index: dict[str, Any], partner_id: str, product_id: str
) -> dict[str, Any] | None:
    for partner in index.get("partners") or []:
        if partner.get("partner_id") != partner_id:
            continue
        for product in partner.get("products") or []:
            if product.get("product_id") == product_id:
                return {
                    "partner_id": partner_id,
                    "partner_name": partner.get("partner_name", ""),
                    "product_id": product_id,
                    "product_name": product.get("product_name", ""),
                    "category": product.get("category", ""),
                    "file": product.get("file", ""),
                    "priority": product.get("priority"),
                    "keywords": product.get("keywords") or [],
                }
    return None


def check_against_index(
    index: dict[str, Any],
    *,
    filename: str,
    partner_id: str,
    product_id: str,
) -> dict[str, Any]:
    from services.product_json import expected_export_filename, parse_ids_from_filename

    expected_filename = expected_export_filename(partner_id, product_id)
    uploaded_name = Path(filename).name
    filename_matches = uploaded_name == expected_filename

    filename_ids = parse_ids_from_filename(filename)
    filename_ids_match = (
        filename_ids is not None
        and filename_ids[0] == partner_id
        and filename_ids[1] == product_id
    )

    index_entry = find_product_in_index(index, partner_id, product_id)
    exists_in_index = index_entry is not None

    index_file_path = f"partners/{partner_id}/{product_id}.json"
    index_file_matches = (
        index_entry is not None and index_entry.get("file") == index_file_path
    )

    warnings: list[str] = []
    if not filename_matches:
        warnings.append(
            f"Tên file nên là '{expected_filename}' (hiện tại: '{uploaded_name}')."
        )
    if filename_ids and not filename_ids_match:
        warnings.append(
            f"Tên file gợi ý {filename_ids[0]}/{filename_ids[1]} "
            f"khác với metadata JSON {partner_id}/{product_id}."
        )

    recommended_action: Literal["update", "add_new"] = (
        "update" if exists_in_index else "add_new"
    )

    return {
        "exists_in_index": exists_in_index,
        "filename_matches": filename_matches,
        "filename_ids_match": filename_ids_match,
        "expected_filename": expected_filename,
        "uploaded_filename": uploaded_name,
        "index_file_path": index_file_path,
        "index_file_matches": index_file_matches,
        "index_entry": index_entry,
        "recommended_action": recommended_action,
        "warnings": warnings,
    }
