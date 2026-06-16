"""Flowy Pre — PDF/DOCX knowledge ingestion agent with review workflow."""

from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from services.document_parser import extract_text_from_upload
from services.faq_generator import assign_faq_ids, generate_faqs_from_text
from services.job_store import JobStore
from services.knowledge_store import KnowledgeStore
from services.metadata_suggester import normalize_slug, suggest_metadata_from_text
from services.progress import make_progress

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("flowy_pre")

KNOWLEDGE_DIR = Path(os.environ.get("KNOWLEDGE_DIR", "knowledge"))
DRAFTS_DIR = Path(os.environ.get("DRAFTS_DIR", "data/sessions"))
HISTORY_DIR = Path(os.environ.get("HISTORY_DIR", "data/history"))
JOBS_DIR = Path(os.environ.get("JOBS_DIR", "data/jobs"))

store = KnowledgeStore(KNOWLEDGE_DIR, DRAFTS_DIR, HISTORY_DIR)
jobs = JobStore(JOBS_DIR)

app = FastAPI(title="Flowy Pre Knowledge Agent", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    filename: str
    file_base64: str


class UploadRequest(BaseModel):
    filename: str
    file_base64: str
    partner_id: str
    partner_name: str
    product_id: str
    product_name: str
    category: str = "health"


def _parse_upload_file(filename: str, file_base64: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in {".pdf", ".docx"}:
        raise HTTPException(status_code=400, detail="Only .pdf and .docx are supported.")
    try:
        return extract_text_from_upload(file_base64, filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _normalize_upload_metadata(body: UploadRequest) -> dict[str, str]:
    return {
        "partner_id": normalize_slug(body.partner_id),
        "partner_name": body.partner_name.strip(),
        "product_id": normalize_slug(body.product_id),
        "product_name": body.product_name.strip(),
        "category": body.category.strip().lower(),
    }


class FaqsUpdateRequest(BaseModel):
    faqs: list[dict[str, Any]]


class SubmitRequest(BaseModel):
    mode: Literal["append", "merge", "replace"] = "merge"


class ProductFaqsUpdateRequest(BaseModel):
    faqs: list[dict[str, Any]]


def _run_generation(session_id: str, source_text: str) -> None:
    session = store.get_session(session_id)
    if not session:
        return

    def on_progress(progress: dict[str, Any]) -> None:
        store.update_session_progress(session_id, progress)

    try:
        session["status"] = "generating"
        store.save_session(session)

        raw_faqs = generate_faqs_from_text(
            source_text,
            partner_id=session["partner_id"],
            partner_name=session["partner_name"],
            product_id=session["product_id"],
            product_name=session["product_name"],
            on_progress=on_progress,
        )
        on_progress(
            make_progress(
                phase="finalizing",
                percent=95,
                message="Đang gán ID và lưu draft...",
                faqs_so_far=len(raw_faqs),
            )
        )
        faqs = assign_faq_ids(
            raw_faqs,
            partner_id=session["partner_id"],
            product_id=session["product_id"],
            source=session.get("filename", "flowy-pre"),
        )
        session = store.get_session(session_id) or session
        session["faqs"] = faqs
        session["status"] = "review"
        session["progress"] = make_progress(
            phase="done",
            percent=100,
            message=f"Hoàn tất {len(faqs)} FAQ",
            faqs_so_far=len(faqs),
        )
        store.save_session(session)
        logger.info("Generated %s FAQs for session %s", len(faqs), session_id)
    except Exception as exc:
        logger.exception("Generation failed for session %s", session_id)
        session = store.get_session(session_id)
        if session:
            session["status"] = "error"
            session["error"] = str(exc)
            session["progress"] = make_progress(
                phase="error",
                percent=0,
                message=str(exc),
            )
            store.save_session(session)


def _run_analyze_job(job_id: str, filename: str, file_base64: str) -> None:
    try:
        jobs.update_progress(
            job_id,
            make_progress(
                phase="parsing",
                percent=15,
                message="Đang đọc file PDF/DOCX...",
            ),
        )
        source_text = extract_text_from_upload(file_base64, filename)
        existing_products = store.list_products()

        jobs.update_progress(
            job_id,
            make_progress(
                phase="suggesting_metadata",
                percent=55,
                message="MiniMax đang gợi ý Partner / Product / Category...",
            ),
        )
        metadata = suggest_metadata_from_text(
            source_text,
            filename=filename,
            existing_products=existing_products,
        )
        existing_product = store.load_product(metadata["partner_id"], metadata["product_id"])
        jobs.complete(
            job_id,
            {
                "source_text_length": len(source_text),
                "metadata": metadata,
                "existing_product": existing_product,
                "categories": store.load_index().get("categories", []),
            },
        )
    except Exception as exc:
        logger.exception("Analyze job %s failed", job_id)
        jobs.fail(job_id, str(exc))


def _run_upload_pipeline(session_id: str) -> None:
    payload = store.load_upload_payload(session_id)
    if not payload:
        session = store.get_session(session_id)
        if session:
            session["status"] = "error"
            session["error"] = "Upload payload not found"
            store.save_session(session)
        return

    try:
        store.update_session_progress(
            session_id,
            make_progress(phase="parsing", percent=5, message="Đang đọc file PDF/DOCX..."),
        )
        source_text = extract_text_from_upload(payload["file_base64"], payload["filename"])
        store.save_source_text(session_id, source_text)

        session = store.get_session(session_id)
        if not session:
            return
        session["source_text_length"] = len(source_text)
        session["status"] = "generating"
        store.save_session(session)
        store.delete_upload_payload(session_id)

        _run_generation(session_id, source_text)
    except Exception as exc:
        logger.exception("Upload pipeline failed for session %s", session_id)
        session = store.get_session(session_id)
        if session:
            session["status"] = "error"
            session["error"] = str(exc)
            session["progress"] = make_progress(
                phase="error",
                percent=0,
                message=str(exc),
            )
            store.save_session(session)
        store.delete_upload_payload(session_id)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "healthy", "service": "flowy-pre"}


@app.get("/api/products")
def list_products() -> dict[str, Any]:
    return {"products": store.list_products()}


@app.get("/api/products/{partner_id}/{product_id}")
def get_product(partner_id: str, product_id: str) -> dict[str, Any]:
    product = store.load_product(partner_id, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@app.put("/api/products/{partner_id}/{product_id}/faqs")
def update_product_faqs(
    partner_id: str, product_id: str, body: ProductFaqsUpdateRequest
) -> dict[str, Any]:
    try:
        result = store.update_product_faqs(partner_id, product_id, body.faqs)
        return {"status": "ok", **result}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.delete("/api/products/{partner_id}/{product_id}")
def delete_product(partner_id: str, product_id: str) -> dict[str, Any]:
    try:
        result = store.delete_product(partner_id, product_id)
        return {"status": "deleted", **result}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/products/{partner_id}/{product_id}/history")
def list_product_history(partner_id: str, product_id: str) -> dict[str, Any]:
    return {"history": store.list_history(partner_id, product_id)}


@app.post("/api/products/{partner_id}/{product_id}/history/{filename}/restore")
def restore_product_history(
    partner_id: str, product_id: str, filename: str
) -> dict[str, Any]:
    try:
        result = store.restore_history(partner_id, product_id, filename)
        return {"status": "ok", **result}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/sessions")
def list_sessions(status: str | None = None) -> dict[str, Any]:
    return {"sessions": store.list_sessions(status=status)}


@app.get("/api/sessions/{session_id}")
def get_session(session_id: str) -> dict[str, Any]:
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.post("/api/analyze")
def analyze_document(body: AnalyzeRequest, background_tasks: BackgroundTasks) -> dict[str, Any]:
    """Parse file and suggest partner/product metadata via LLM (async job)."""
    ext = Path(body.filename).suffix.lower()
    if ext not in {".pdf", ".docx"}:
        raise HTTPException(status_code=400, detail="Only .pdf and .docx are supported.")

    job = jobs.create("analyze")
    background_tasks.add_task(_run_analyze_job, job["job_id"], body.filename, body.file_base64)
    return {"job_id": job["job_id"], "status": "running"}


@app.post("/api/upload")
def upload_document(body: UploadRequest, background_tasks: BackgroundTasks) -> dict[str, Any]:
    meta = _normalize_upload_metadata(body)
    ext = Path(body.filename).suffix.lower()
    if ext not in {".pdf", ".docx"}:
        raise HTTPException(status_code=400, detail="Only .pdf and .docx are supported.")

    session_id = uuid.uuid4().hex[:12]
    store.create_pending_session(
        session_id=session_id,
        filename=body.filename,
        partner_id=meta["partner_id"],
        partner_name=meta["partner_name"],
        product_id=meta["product_id"],
        product_name=meta["product_name"],
        category=meta["category"],
    )
    store.save_upload_payload(session_id, body.filename, body.file_base64)
    background_tasks.add_task(_run_upload_pipeline, session_id)

    return {
        "session_id": session_id,
        "status": "processing",
        "message": "Upload accepted. Parsing and FAQ generation started.",
    }


@app.post("/api/sessions/{session_id}/regenerate")
def regenerate_session(session_id: str, background_tasks: BackgroundTasks) -> dict[str, Any]:
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    source_text = store.load_source_text(session_id)
    if not source_text:
        raise HTTPException(status_code=400, detail="Source text not found for this session.")

    session["status"] = "generating"
    session["faqs"] = []
    session.pop("error", None)
    session["progress"] = make_progress(
        phase="queued",
        percent=0,
        message="Đang xếp hàng generate lại...",
    )
    store.save_session(session)
    background_tasks.add_task(_run_generation, session_id, source_text)
    return {"session_id": session_id, "status": "generating"}


@app.put("/api/sessions/{session_id}/faqs")
def update_session_faqs(session_id: str, body: FaqsUpdateRequest) -> dict[str, Any]:
    try:
        session = store.set_session_faqs(session_id, body.faqs)
        return {"status": "ok", "session": session}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/sessions/{session_id}/compare")
def compare_session(session_id: str) -> dict[str, Any]:
    try:
        return store.compare_session(session_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/sessions/{session_id}/submit")
def submit_session(session_id: str, body: SubmitRequest) -> dict[str, Any]:
    try:
        result = store.submit_session(session_id, mode=body.mode)
        return {"status": "submitted", **result}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# AgentBase-compatible search endpoint for other agents (Direction 2)
class SearchRequest(BaseModel):
    query: str
    partner_id: str | None = None
    product_id: str | None = None
    top_k: int = Field(default=3, ge=1, le=10)


@app.post("/api/knowledge/search")
def search_knowledge(body: SearchRequest) -> dict[str, Any]:
    from difflib import SequenceMatcher

    query = body.query.strip().lower()
    if not query:
        raise HTTPException(status_code=400, detail="Query is required.")

    products = store.list_products()
    results: list[dict[str, Any]] = []

    for item in products:
        if body.partner_id and item["partner_id"] != body.partner_id:
            continue
        if body.product_id and item["product_id"] != body.product_id:
            continue
        product = store.load_product(item["partner_id"], item["product_id"])
        if not product:
            continue
        for faq in product.get("faqs", []):
            canonical = faq.get("canonical_question", "")
            score = SequenceMatcher(None, query, canonical.lower()).ratio()
            for uq in faq.get("user_questions", []):
                score = max(score, SequenceMatcher(None, query, uq.lower()).ratio())
            if score >= 0.35:
                results.append(
                    {
                        "score": round(score, 3),
                        "partner_id": item["partner_id"],
                        "product_id": item["product_id"],
                        "faq_id": faq.get("id"),
                        "canonical_question": canonical,
                        "answer": faq.get("answer"),
                        "category": faq.get("category"),
                    }
                )

    results.sort(key=lambda x: x["score"], reverse=True)
    return {"query": body.query, "results": results[: body.top_k]}


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("AGENT_PORT", "8081"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
