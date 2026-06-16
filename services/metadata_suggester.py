"""Suggest partner/product metadata from document text using LLM."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from langchain_openai import ChatOpenAI

logger = logging.getLogger("flowy_pre.metadata")

VALID_CATEGORIES = frozenset({"health", "car", "travel", "financial", "cyber"})

METADATA_PROMPT = """Bạn là chuyên gia phân loại tài liệu FAQ bảo hiểm trên nền tảng Zalopay.

Đọc tài liệu và đề xuất metadata để import vào knowledge base.

Quy tắc:
- partner_id, product_id: snake_case, chữ thường, không dấu (vd: msig, health_247, baoviet, flight_delay_cancel)
- partner_name, product_name: tên hiển thị tiếng Việt đầy đủ, chính xác theo tài liệu
- category: CHỈ một trong: health | car | travel | financial | cyber
  * health — bảo hiểm sức khỏe, nội trú, ngoại trú
  * travel — du lịch, trễ/hủy chuyến bay
  * financial — tài chính, credit topup, vay
  * cyber — an ninh mạng, mất tiền ví điện tử
  * car — xe cơ giới, ô tô, xe máy
- Nếu tài liệu khớp partner/product đã có trong catalog, ưu tiên dùng đúng id đã có
- Dựa vào tên file nếu hữu ích: {filename}

Catalog hiện có trong knowledge base:
{existing_catalog}

Trả về JSON object (KHÔNG markdown):
{{
  "partner_id": "...",
  "partner_name": "...",
  "product_id": "...",
  "product_name": "...",
  "category": "...",
  "confidence": "high|medium|low",
  "reasoning": "1-2 câu giải thích ngắn"
}}

Tài liệu (trích đoạn):
---
{text_sample}
---
"""


def normalize_slug(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[\s\-]+", "_", value)
    value = re.sub(r"[^a-z0-9_]", "", value)
    value = re.sub(r"_+", "_", value).strip("_")
    return value


def _get_llm() -> ChatOpenAI:
    return ChatOpenAI(
        model=os.environ.get("LLM_MODEL", "minimax/minimax-m2.5"),
        base_url=os.environ.get("LLM_BASE_URL"),
        api_key=os.environ.get("LLM_API_KEY"),
        temperature=0,
    )


def _parse_json_object(content: str) -> dict[str, Any]:
    obj_match = re.search(r"\{[\s\S]*\}", content)
    if not obj_match:
        raise ValueError("LLM did not return valid JSON metadata.")
    return json.loads(obj_match.group(0))


def _format_catalog(existing_products: list[dict[str, Any]]) -> str:
    if not existing_products:
        return "(Chưa có — tạo partner/product mới phù hợp nội dung tài liệu)"
    lines = []
    for item in existing_products:
        lines.append(
            f"- {item.get('partner_id')}/{item.get('product_id')}: "
            f"{item.get('partner_name')} — {item.get('product_name')} "
            f"[category: {item.get('category', '?')}]"
        )
    return "\n".join(lines)


def _normalize_metadata(raw: dict[str, Any]) -> dict[str, Any]:
    category = str(raw.get("category", "health")).strip().lower()
    if category not in VALID_CATEGORIES:
        category = "health"

    return {
        "partner_id": normalize_slug(str(raw.get("partner_id", "unknown_partner"))),
        "partner_name": str(raw.get("partner_name", "")).strip() or "Đối tác chưa xác định",
        "product_id": normalize_slug(str(raw.get("product_id", "unknown_product"))),
        "product_name": str(raw.get("product_name", "")).strip() or "Sản phẩm chưa xác định",
        "category": category,
        "confidence": str(raw.get("confidence", "medium")).strip().lower(),
        "reasoning": str(raw.get("reasoning", "")).strip(),
    }


def suggest_metadata_from_text(
    text: str,
    *,
    filename: str = "",
    existing_products: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    max_chars = int(os.environ.get("METADATA_MAX_CHARS", "10000"))
    sample = text[:max_chars]

    prompt = METADATA_PROMPT.format(
        filename=filename or "(không có)",
        existing_catalog=_format_catalog(existing_products or []),
        text_sample=sample,
    )

    logger.info("Suggesting metadata from %s chars (file=%s)", len(sample), filename)
    response = _get_llm().invoke(prompt)
    metadata = _normalize_metadata(_parse_json_object(response.content))
    return metadata
