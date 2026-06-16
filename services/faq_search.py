"""FAQ fuzzy search with tag score boosting."""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Any

FAQ_SEARCH_THRESHOLD = 0.35
FAQ_TAG_MATCH_BOOST = 0.2


def similarity_score(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def tag_match_score(query: str, tags: list[str]) -> float:
    """Return 0–1 how well query matches any FAQ tag."""
    q = query.lower().strip()
    if not q or not tags:
        return 0.0

    q_tokens = set(re.findall(r"[\w]+", q, flags=re.UNICODE))
    best = 0.0
    for tag in tags:
        tl = (tag or "").lower().strip()
        if not tl:
            continue
        if tl in q:
            best = max(best, 1.0)
        elif tl in q_tokens:
            best = max(best, 0.95)
        else:
            best = max(best, similarity_score(q, tl))
    return best


def faq_match_score(
    query: str,
    faq: dict[str, Any],
    *,
    tag_boost: float = FAQ_TAG_MATCH_BOOST,
) -> tuple[float, list[str]]:
    """Combined text + tag score; returns (score, matched tag names)."""
    q = query.lower().strip()
    text_score = 0.0
    canonical = faq.get("canonical_question", "")
    if canonical:
        text_score = max(text_score, similarity_score(q, canonical))
    for uq in faq.get("user_questions") or []:
        text_score = max(text_score, similarity_score(q, uq))

    tags = faq.get("tags") or []
    matched: list[str] = []
    q_tokens = set(re.findall(r"[\w]+", q, flags=re.UNICODE))
    for tag in tags:
        tl = (tag or "").lower().strip()
        if not tl:
            continue
        if tl in q or tl in q_tokens or similarity_score(q, tl) >= 0.72:
            matched.append(tag)

    tag_score = tag_match_score(q, tags)
    combined = min(1.0, text_score + tag_boost * tag_score)
    return combined, matched
