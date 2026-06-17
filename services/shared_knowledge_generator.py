"""Generate updated shared knowledge files from product FAQs."""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime
from typing import Any, Callable

from langchain_openai import ChatOpenAI

from services.knowledge_remote import REMOTE_FILES, fetch_all_remote
from services.product_json import dumps_formatted_json

logger = logging.getLogger("flowy_pre.shared_knowledge")

SHARED_FILE_SPECS = [
    {
        "key": "_index.json",
        "display_path": REMOTE_FILES["_index.json"],
        "zip_path": "knowledge/_index.json",
    },
    {
        "key": "comparisons.json",
        "display_path": REMOTE_FILES["cross_product/comparisons.json"],
        "zip_path": "knowledge/cross_product/comparisons.json",
    },
    {
        "key": "general_faqs.json",
        "display_path": REMOTE_FILES["cross_product/general_faqs.json"],
        "zip_path": "knowledge/cross_product/general_faqs.json",
    },
]

INDEX_PROMPT = """Bạn là chuyên gia quản lý knowledge base bảo hiểm Zalopay.

Nhiệm vụ: Cập nhật file `_index.json` dựa trên sản phẩm FAQ mới/chỉnh sửa.

Quy tắc:
- Giữ nguyên cấu trúc version 2.0: version, last_updated, partners[], categories[]
- Cập nhật last_updated thành ngày hôm nay: {today}
- Nếu partner đã tồn tại: cập nhật/thêm product trong partner đó
- Nếu partner mới: thêm partner mới với active: true
- Mỗi product cần: product_id, product_name, category, file (partners/{{partner_id}}/{{product_id}}.json), priority (1-10), keywords (5-8 từ khóa tiếng Việt/Anh)
- Giữ nguyên các partner/product KHÔNG liên quan
- categories[] giữ nguyên trừ khi category mới chưa có

Sản phẩm đang import:
- partner_id: {partner_id}
- partner_name: {partner_name}
- product_id: {product_id}
- product_name: {product_name}
- category: {category}

`_index.json` hiện tại:
```json
{current_index}
```

Tóm tắt FAQ sản phẩm (để gợi ý keywords):
{faq_summary}

Trả về JSON object `_index.json` hoàn chỉnh (KHÔNG markdown wrapper).
"""

COMPARISONS_PROMPT = """Bạn là chuyên gia FAQ bảo hiểm Zalopay.

Nhiệm vụ: Cập nhật `comparisons.json` để phản ánh sản phẩm FAQ mới/chỉnh sửa.

Quy tắc:
- Giữ cấu trúc: {{ "faqs": [...] }}
- Mỗi FAQ: id, canonical_question, user_questions (5-10 variants), answer (markdown), category ("So sánh sản phẩm"), tags, priority, source ("cross_product"), scope ("all_partners")
- Cập nhật các FAQ so sánh tổng hợp (danh sách gói, chi phí, so sánh loại BH) để bao gồm/chính xác thông tin sản phẩm mới
- Giữ FAQ không liên quan, chỉ sửa phần cần thiết
- Dùng * cho bullet, **bold**, emoji 🔹 💡 khi phù hợp

Sản phẩm:
- {partner_name} — {product_name} ({partner_id}/{product_id}), category: {category}

FAQ sản phẩm (nguồn chính xác):
```json
{product_faqs}
```

`comparisons.json` hiện tại:
```json
{current_comparisons}
```

Trả về JSON object hoàn chỉnh (KHÔNG markdown wrapper).
"""

GENERAL_FAQS_PROMPT = """Bạn là chuyên gia FAQ bảo hiểm Zalopay.

Nhiệm vụ: Cập nhật `general_faqs.json` để phản ánh sản phẩm FAQ mới/chỉnh sửa.

Quy tắc:
- Giữ cấu trúc: {{ "faqs": [...] }}
- Mỗi FAQ: id, canonical_question, user_questions (5-10 variants), answer (markdown), category, tags, priority, source ("cross_product_generated"), scope ("all_partners")
- Cập nhật FAQ liệt kê gói, chi phí tổng hợp, thông tin chung trên Zalopay
- FAQ chi phí tổng hợp: cập nhật mức phí sản phẩm nếu có trong FAQ sản phẩm; nếu không có giá cụ thể thì giữ mô tả chung
- Giữ FAQ không liên quan, chỉ sửa phần cần thiết

Sản phẩm:
- {partner_name} — {product_name} ({partner_id}/{product_id}), category: {category}

FAQ sản phẩm (nguồn chính xác):
```json
{product_faqs}
```

`general_faqs.json` hiện tại:
```json
{current_general_faqs}
```

Trả về JSON object hoàn chỉnh (KHÔNG markdown wrapper).
"""


def _get_llm() -> ChatOpenAI:
    return ChatOpenAI(
        model=os.environ.get("LLM_MODEL", "minimax/minimax-m2.5"),
        base_url=os.environ.get("LLM_BASE_URL"),
        api_key=os.environ.get("LLM_API_KEY"),
        temperature=0.1,
    )


def _parse_json_object(content: str) -> dict[str, Any]:
    obj_match = re.search(r"\{[\s\S]*\}", content)
    if not obj_match:
        raise ValueError("LLM did not return valid JSON.")
    return json.loads(obj_match.group(0))


def _faq_summary(faqs: list[dict[str, Any]], limit: int = 20) -> str:
    lines: list[str] = []
    for faq in faqs[:limit]:
        lines.append(
            f"- [{faq.get('category', '?')}] {faq.get('canonical_question', '')}"
        )
    if len(faqs) > limit:
        lines.append(f"... và {len(faqs) - limit} FAQ khác")
    return "\n".join(lines) or "(Không có FAQ)"


def _generate_index(
    llm: ChatOpenAI,
    *,
    current: dict[str, Any],
    session: dict[str, Any],
    faqs: list[dict[str, Any]],
) -> dict[str, Any]:
    prompt = INDEX_PROMPT.format(
        today=datetime.now().strftime("%Y-%m-%d"),
        partner_id=session["partner_id"],
        partner_name=session["partner_name"],
        product_id=session["product_id"],
        product_name=session["product_name"],
        category=session.get("category", "health"),
        current_index=json.dumps(current, ensure_ascii=False, indent=2),
        faq_summary=_faq_summary(faqs),
    )
    response = llm.invoke(prompt)
    return _parse_json_object(response.content)


def _generate_comparisons(
    llm: ChatOpenAI,
    *,
    current: dict[str, Any],
    session: dict[str, Any],
    faqs: list[dict[str, Any]],
) -> dict[str, Any]:
    prompt = COMPARISONS_PROMPT.format(
        partner_id=session["partner_id"],
        partner_name=session["partner_name"],
        product_id=session["product_id"],
        product_name=session["product_name"],
        category=session.get("category", "health"),
        product_faqs=json.dumps(faqs, ensure_ascii=False, indent=2),
        current_comparisons=json.dumps(current, ensure_ascii=False, indent=2),
    )
    response = llm.invoke(prompt)
    return _parse_json_object(response.content)


def _generate_general_faqs(
    llm: ChatOpenAI,
    *,
    current: dict[str, Any],
    session: dict[str, Any],
    faqs: list[dict[str, Any]],
) -> dict[str, Any]:
    prompt = GENERAL_FAQS_PROMPT.format(
        partner_id=session["partner_id"],
        partner_name=session["partner_name"],
        product_id=session["product_id"],
        product_name=session["product_name"],
        category=session.get("category", "health"),
        product_faqs=json.dumps(faqs, ensure_ascii=False, indent=2),
        current_general_faqs=json.dumps(current, ensure_ascii=False, indent=2),
    )
    response = llm.invoke(prompt)
    return _parse_json_object(response.content)


def generate_shared_knowledge(
    session: dict[str, Any],
    *,
    on_progress: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    from services.progress import make_progress

    faqs = session.get("faqs") or []
    if not faqs:
        raise ValueError("No FAQs to generate shared knowledge from.")

    if on_progress:
        on_progress(
            make_progress(
                phase="fetching_remote",
                percent=5,
                message="Đang tải knowledge mới nhất từ GitHub...",
            )
        )

    remote = fetch_all_remote()
    llm = _get_llm()
    results: dict[str, Any] = {}

    steps = [
        ("_index.json", "_generate_index", remote["_index.json"], 35),
        ("comparisons.json", "_generate_comparisons", remote["comparisons.json"], 65),
        ("general_faqs.json", "_generate_general_faqs", remote["general_faqs.json"], 95),
    ]

    generators = {
        "_generate_index": _generate_index,
        "_generate_comparisons": _generate_comparisons,
        "_generate_general_faqs": _generate_general_faqs,
    }

    for key, fn_name, current, percent in steps:
        if on_progress:
            on_progress(
                make_progress(
                    phase="generating_shared",
                    percent=percent - 25,
                    message=f"MiniMax đang cập nhật {key}...",
                )
            )
        fn = generators[fn_name]
        results[key] = fn(llm, current=current, session=session, faqs=faqs)
        logger.info("Generated updated %s", key)

    files = []
    for spec in SHARED_FILE_SPECS:
        content = results[spec["key"]]
        files.append(
            {
                "key": spec["key"],
                "display_path": spec["display_path"],
                "zip_path": spec["zip_path"],
                "content": content,
                "json_text": dumps_formatted_json(content),
            }
        )

    if on_progress:
        on_progress(
            make_progress(
                phase="done",
                percent=100,
                message="Hoàn tất generate shared knowledge",
            )
        )

    return {
        "generated_at": datetime.now().isoformat(),
        "files": files,
    }
