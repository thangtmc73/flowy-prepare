"""Compare and merge FAQ knowledge entries."""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Any, Literal


MatchStatus = Literal["new", "updated", "unchanged", "removed"]


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower().strip())


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, _normalize(a), _normalize(b)).ratio()


def compare_faq_lists(
    existing: list[dict[str, Any]],
    incoming: list[dict[str, Any]],
    *,
    threshold: float = 0.72,
) -> list[dict[str, Any]]:
    """Compare incoming FAQs against existing ones.

    Returns list of diff items with status: new | updated | unchanged.
    Existing FAQs not matched are reported as removed (for replace preview).
    """
    used_existing: set[int] = set()
    diffs: list[dict[str, Any]] = []

    for inc in incoming:
        best_idx = -1
        best_score = 0.0
        inc_q = inc.get("canonical_question", "")

        for idx, ex in enumerate(existing):
            if idx in used_existing:
                continue
            score = similarity(inc_q, ex.get("canonical_question", ""))
            if score > best_score:
                best_score = score
                best_idx = idx

        if best_idx >= 0 and best_score >= threshold:
            used_existing.add(best_idx)
            ex = existing[best_idx]
            answer_changed = _normalize(ex.get("answer", "")) != _normalize(
                inc.get("answer", "")
            )
            status: MatchStatus = "updated" if answer_changed else "unchanged"
            diffs.append(
                {
                    "status": status,
                    "similarity": round(best_score, 3),
                    "existing": ex,
                    "incoming": inc,
                    "matched_id": ex.get("id"),
                }
            )
        else:
            diffs.append(
                {
                    "status": "new",
                    "similarity": 0.0,
                    "existing": None,
                    "incoming": inc,
                    "matched_id": None,
                }
            )

    for idx, ex in enumerate(existing):
        if idx not in used_existing:
            diffs.append(
                {
                    "status": "removed",
                    "similarity": 0.0,
                    "existing": ex,
                    "incoming": None,
                    "matched_id": ex.get("id"),
                }
            )

    return diffs


def merge_faqs(
    existing: list[dict[str, Any]],
    incoming: list[dict[str, Any]],
    *,
    mode: Literal["append", "merge", "replace"] = "merge",
    threshold: float = 0.72,
) -> list[dict[str, Any]]:
    """Merge incoming FAQs into existing knowledge."""
    if mode == "replace":
        return list(incoming)

    if mode == "append":
        existing_questions = {_normalize(f.get("canonical_question", "")) for f in existing}
        merged = list(existing)
        for inc in incoming:
            if _normalize(inc.get("canonical_question", "")) not in existing_questions:
                merged.append(inc)
        return merged

    # merge mode: update matched, append new, keep unmatched existing
    diffs = compare_faq_lists(existing, incoming, threshold=threshold)
    by_id = {f.get("id"): f for f in existing if f.get("id")}

    for item in diffs:
        status = item["status"]
        if status == "new" and item["incoming"]:
            by_id[item["incoming"].get("id") or f"new_{len(by_id)}"] = item["incoming"]
        elif status == "updated" and item["incoming"] and item["matched_id"]:
            updated = dict(item["existing"])
            updated.update(item["incoming"])
            updated["id"] = item["matched_id"]
            by_id[item["matched_id"]] = updated

    # Preserve order: existing order first, then new entries
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for ex in existing:
        fid = ex.get("id")
        if fid and fid in by_id and fid not in seen:
            result.append(by_id[fid])
            seen.add(fid)
    for faq in by_id.values():
        fid = faq.get("id")
        if fid and fid not in seen:
            result.append(faq)
            seen.add(fid)
    return result
