"""Parse PDF and DOCX uploads into plain text."""

from __future__ import annotations

import base64
from io import BytesIO
from pathlib import Path
from typing import Any


def extract_text_from_bytes(data: bytes, filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return _extract_pdf(data)
    if ext == ".docx":
        return _extract_docx(data)
    raise ValueError(f"Unsupported file format: {ext}. Use .pdf or .docx")


def extract_text_from_upload(file_b64: str, filename: str) -> str:
    try:
        raw = base64.b64decode(file_b64)
    except (ValueError, TypeError) as exc:
        raise ValueError("File encoding is invalid.") from exc
    return extract_text_from_bytes(raw, filename)


def _extract_pdf(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(BytesIO(data))
    parts: list[str] = []
    for page in reader.pages:
        page_text = page.extract_text() or ""
        if page_text.strip():
            parts.append(page_text.strip())
    text = "\n\n".join(parts).strip()
    if not text:
        raise ValueError(
            "Could not extract text from PDF (possibly scanned/image-only)."
        )
    return text


def _extract_docx(data: bytes) -> str:
    from docx import Document

    doc = Document(BytesIO(data))
    parts = [para.text.strip() for para in doc.paragraphs if para.text.strip()]
    text = "\n\n".join(parts).strip()
    if not text:
        raise ValueError("DOCX file appears empty.")
    return text


def chunk_text(text: str, max_chars: int = 12000, overlap: int = 500) -> list[str]:
    """Split long documents into overlapping chunks for LLM processing."""
    if len(text) <= max_chars:
        return [text]

    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        chunk = text[start:end]
        chunks.append(chunk)
        if end >= len(text):
            break
        start = end - overlap
    return chunks
