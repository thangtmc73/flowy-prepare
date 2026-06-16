"""Build progress payloads for long-running parse / LLM tasks."""

from __future__ import annotations

from typing import Any


def make_progress(
    *,
    phase: str,
    percent: int,
    message: str,
    current_chunk: int | None = None,
    total_chunks: int | None = None,
    faqs_so_far: int | None = None,
) -> dict[str, Any]:
    return {
        "phase": phase,
        "percent": max(0, min(100, percent)),
        "message": message,
        "current_chunk": current_chunk,
        "total_chunks": total_chunks,
        "faqs_so_far": faqs_so_far,
    }


def chunk_percent(current: int, total: int, *, start: int, end: int) -> int:
    if total <= 0:
        return end
    span = end - start
    return start + int(span * current / total)
