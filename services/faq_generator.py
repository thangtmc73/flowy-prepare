"""Generate FAQ drafts from document text using MiniMax LLM."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Callable

from langchain_openai import ChatOpenAI

from services.document_parser import chunk_text

logger = logging.getLogger("flowy_pre.faq_generator")

KNOWLEDGE_RULES = """
## Knowledge Base Rules (BẮT BUỘC tuân thủ)

### Mỗi FAQ phải có:
- canonical_question: câu hỏi chính rõ ràng, tiếng Việt
- user_questions: 5-10 biến thể (trang trọng, thân mật, lỗi chính tả, cách hỏi ngắn/dài)
- answer: đầy đủ, markdown hợp lệ (* bullet, 1. 2. numbered list, **bold**)
- category: một trong Giới thiệu chung | Quyền lợi | Điều kiện | Quy trình mua | Bồi thường | Chi phí | Loại trừ | So sánh | Khác

### Nguyên tắc tách câu hỏi (QUAN TRỌNG):
- Rã NHỎ tối đa: mỗi FAQ chỉ trả lời MỘT ý cụ thể
- KHÔNG gộp nhiều chủ đề vào một FAQ
- Mỗi con số, hạn mức, điều kiện, bước quy trình → FAQ riêng nếu user có thể hỏi độc lập
- Mỗi quyền lợi con (nội trú, ngoại trú, tai nạn...) → FAQ riêng + FAQ tổng hợp nếu cần
- Mỗi loại trừ / điều kiện loại trừ → FAQ riêng
- Giữ nguyên nội dung trả lời từ tài liệu, không tóm tắt mất chi tiết

### Markdown:
- Dùng * cho bullet, KHÔNG dùng •
- Dùng 1. 2. 3. cho các bước
- Dùng \\n\\n giữa các đoạn
"""

EXTRACTION_PROMPT = """Bạn là chuyên gia xây dựng knowledge base FAQ bảo hiểm cho nền tảng Zalopay.

{rules}

Thông tin sản phẩm:
- Partner: {partner_name} ({partner_id})
- Product: {product_name} ({product_id})

Nhiệm vụ: Đọc đoạn tài liệu dưới đây và trích xuất TẤT CẢ FAQ có thể, càng chi tiết càng tốt.

Trả về JSON array (KHÔNG markdown wrapper):
[
  {{
    "canonical_question": "...",
    "user_questions": ["...", "..."],
    "answer": "...",
    "category": "...",
    "tags": ["tag1", "tag2"]
  }}
]

Đoạn tài liệu (chunk {chunk_index}/{chunk_total}):
---
{chunk_text}
---
"""


def _get_llm() -> ChatOpenAI:
    model = os.environ.get("LLM_MODEL", "minimax/minimax-m2.5")
    return ChatOpenAI(
        model=model,
        base_url=os.environ.get("LLM_BASE_URL"),
        api_key=os.environ.get("LLM_API_KEY"),
        temperature=0.1,
    )


def _parse_json_array(content: str) -> list[dict[str, Any]]:
    json_match = re.search(r"\[[\s\S]*\]", content)
    if not json_match:
        raise ValueError("LLM did not return a valid JSON array.")
    return json.loads(json_match.group(0))


def _dedupe_faqs(faqs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for faq in faqs:
        key = re.sub(r"\s+", " ", faq.get("canonical_question", "").lower().strip())
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(faq)
    return unique


def generate_faqs_from_text(
    text: str,
    *,
    partner_id: str,
    partner_name: str,
    product_id: str,
    product_name: str,
    chunk_size: int | None = None,
    on_progress: Callable[[dict[str, Any]], None] | None = None,
) -> list[dict[str, Any]]:
    from services.progress import chunk_percent, make_progress

    max_chars = chunk_size or int(os.environ.get("EXTRACTION_MAX_CHARS", "12000"))
    chunks = chunk_text(text, max_chars=max_chars)
    llm = _get_llm()
    all_faqs: list[dict[str, Any]] = []
    total = len(chunks)

    if on_progress:
        on_progress(
            make_progress(
                phase="generating_faqs",
                percent=10,
                message=f"Chuẩn bị generate FAQ ({total} đoạn tài liệu)...",
                current_chunk=0,
                total_chunks=total,
                faqs_so_far=0,
            )
        )

    for idx, chunk in enumerate(chunks, start=1):
        if on_progress:
            on_progress(
                make_progress(
                    phase="generating_faqs",
                    percent=chunk_percent(idx - 1, total, start=10, end=90),
                    message=f"Đang generate FAQ đoạn {idx}/{total}...",
                    current_chunk=idx,
                    total_chunks=total,
                    faqs_so_far=len(all_faqs),
                )
            )
        prompt = EXTRACTION_PROMPT.format(
            rules=KNOWLEDGE_RULES,
            partner_id=partner_id,
            partner_name=partner_name,
            product_id=product_id,
            product_name=product_name,
            chunk_index=idx,
            chunk_total=len(chunks),
            chunk_text=chunk,
        )
        logger.info("Generating FAQs chunk %s/%s (%s chars)", idx, len(chunks), len(chunk))
        response = llm.invoke(prompt)
        chunk_faqs = _parse_json_array(response.content)
        all_faqs.extend(chunk_faqs)
        if on_progress:
            on_progress(
                make_progress(
                    phase="generating_faqs",
                    percent=chunk_percent(idx, total, start=10, end=90),
                    message=f"Hoàn tất đoạn {idx}/{total} ({len(all_faqs)} FAQ tạm thời)",
                    current_chunk=idx,
                    total_chunks=total,
                    faqs_so_far=len(all_faqs),
                )
            )

    return _dedupe_faqs(all_faqs)


def assign_faq_ids(
    faqs: list[dict[str, Any]],
    *,
    partner_id: str,
    product_id: str,
    start_index: int = 1,
    source: str = "flowy-pre",
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for i, faq in enumerate(faqs, start=start_index):
        faq_id = f"{partner_id}_{product_id}_{str(i).zfill(3)}"
        result.append(
            {
                "id": faq.get("id") or faq_id,
                "canonical_question": faq.get("canonical_question", ""),
                "user_questions": faq.get("user_questions") or [],
                "answer": faq.get("answer", ""),
                "category": faq.get("category", "Khác"),
                "tags": faq.get("tags") or [partner_id],
                "related_faq_ids": faq.get("related_faq_ids") or [],
                "source": faq.get("source") or source,
                "priority": faq.get("priority", 5),
            }
        )
    return result
