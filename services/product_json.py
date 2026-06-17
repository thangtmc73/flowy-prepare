"""Parse and validate product FAQ JSON uploads."""

from __future__ import annotations

import base64
import json
import re
from pathlib import Path
from typing import Any, Literal

from services.metadata_suggester import normalize_slug

REQUIRED_PRODUCT_FIELDS = ("partner_id", "product_id", "partner_name", "product_name")

FAQ_EXPORT_FIELDS = (
    "id",
    "canonical_question",
    "user_questions",
    "answer",
    "category",
    "tags",
    "related_faq_ids",
    "source",
    "priority",
    "scope",
)

PRODUCT_EXPORT_FIELDS = (
    "product_id",
    "partner_id",
    "product_name",
    "partner_name",
    "version",
    "last_updated",
    "faqs",
)


def _pick_fields(data: dict[str, Any], fields: tuple[str, ...]) -> dict[str, Any]:
    ordered: dict[str, Any] = {}
    for key in fields:
        if key in data:
            ordered[key] = data[key]
    for key, value in data.items():
        if key not in ordered:
            ordered[key] = value
    return ordered


def format_product_payload(data: dict[str, Any]) -> dict[str, Any]:
    """Normalize field order to match knowledge base template."""
    faqs = [
        _pick_fields(faq, FAQ_EXPORT_FIELDS)
        for faq in data.get("faqs") or []
        if isinstance(faq, dict)
    ]
    return _pick_fields({**data, "faqs": faqs}, PRODUCT_EXPORT_FIELDS)


def dumps_formatted_json(data: Any) -> str:
    """Pretty-print JSON for download (2-space indent, UTF-8, trailing newline)."""
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def format_product_json_text(data: dict[str, Any]) -> str:
    return dumps_formatted_json(format_product_payload(data))


def decode_json_upload(filename: str, file_base64: str) -> dict[str, Any]:
    ext = Path(filename).suffix.lower()
    if ext != ".json":
        raise ValueError("Only .json files are supported.")
    try:
        raw = base64.b64decode(file_base64)
        data = json.loads(raw.decode("utf-8"))
    except (ValueError, json.JSONDecodeError) as exc:
        raise ValueError(f"Invalid JSON file: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("JSON root must be an object.")
    return data


def validate_product_json(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    faqs = data.get("faqs")
    if not isinstance(faqs, list):
        errors.append("Missing or invalid 'faqs' array.")
        return errors
    if not faqs:
        errors.append("'faqs' array is empty.")

    for field in REQUIRED_PRODUCT_FIELDS:
        if not str(data.get(field, "")).strip():
            errors.append(f"Missing required field: {field}")

    for i, faq in enumerate(faqs):
        if not isinstance(faq, dict):
            errors.append(f"FAQ #{i + 1} is not an object.")
            continue
        if not str(faq.get("canonical_question", "")).strip():
            errors.append(f"FAQ #{i + 1}: missing canonical_question.")
        if not str(faq.get("answer", "")).strip():
            errors.append(f"FAQ #{i + 1}: missing answer.")

    return errors


def extract_metadata(data: dict[str, Any]) -> dict[str, str]:
    category = str(data.get("category", "health")).strip().lower()
    if not category:
        category = "health"
    return {
        "partner_id": normalize_slug(str(data.get("partner_id", ""))),
        "partner_name": str(data.get("partner_name", "")).strip(),
        "product_id": normalize_slug(str(data.get("product_id", ""))),
        "product_name": str(data.get("product_name", "")).strip(),
        "category": category,
    }


def expected_export_filename(partner_id: str, product_id: str) -> str:
    return f"{partner_id}_{product_id}.json"


def parse_ids_from_filename(filename: str) -> tuple[str, str] | None:
    """Parse partner_id and product_id from {partner_id}_{product_id}.json."""
    stem = Path(filename).stem
    if "_" not in stem:
        return None
    partner_id, product_id = stem.split("_", 1)
    partner_id = normalize_slug(partner_id)
    product_id = normalize_slug(product_id)
    if not partner_id or not product_id:
        return None
    return partner_id, product_id


def resolve_metadata_from_upload(
    data: dict[str, Any],
    filename: str,
) -> dict[str, str]:
    meta = extract_metadata(data)
    if all(meta.values()):
        return meta

    from_filename = parse_ids_from_filename(filename)
    if from_filename:
        partner_id, product_id = from_filename
        if not meta["partner_id"]:
            meta["partner_id"] = partner_id
        if not meta["product_id"]:
            meta["product_id"] = product_id

    if not meta["partner_name"]:
        meta["partner_name"] = meta["partner_id"].replace("_", " ").title()
    if not meta["product_name"]:
        meta["product_name"] = meta["product_id"].replace("_", " ").title()

    return meta
