"""Flowy Pre — PDF/DOCX FAQ generator with shared knowledge export."""

from __future__ import annotations

import io
import logging
import os
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from services.document_parser import extract_text_from_upload
from services.faq_generator import assign_faq_ids, generate_faqs_from_text
from services.job_store import JobStore
from services.knowledge_remote import check_against_index, fetch_raw, list_products_from_index, product_exists
from services.metadata_suggester import normalize_slug, suggest_metadata_from_text
from services.product_json import decode_json_upload, resolve_metadata_from_upload, validate_product_json
from services.progress import make_progress
from services.session_store import SessionStore
from services.shared_knowledge_generator import generate_shared_knowledge

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("flowy_pre")

DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DRAFTS_DIR = Path(os.environ.get("DRAFTS_DIR", str(DATA_DIR / "sessions")))
JOBS_DIR = Path(os.environ.get("JOBS_DIR", str(DATA_DIR / "jobs")))

store = SessionStore(DRAFTS_DIR)
jobs = JobStore(JOBS_DIR)

app = FastAPI(title="Flowy Pre FAQ Generator", version="2.0.0")

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


class FaqsUpdateRequest(BaseModel):
    faqs: list[dict[str, Any]]


class JsonUploadRequest(BaseModel):
    filename: str
    file_base64: str


class JsonImportRequest(BaseModel):
    filename: str
    file_base64: str
    mode: Literal["update", "add_new"] = "update"
    partner_id: str | None = None
    partner_name: str | None = None
    product_id: str | None = None
    product_name: str | None = None
    category: str | None = None


class JsonIndexCheckRequest(BaseModel):
    filename: str
    partner_id: str
    product_id: str


def _preview_json_upload(filename: str, file_base64: str) -> dict[str, Any]:
    data = decode_json_upload(filename, file_base64)
    errors = validate_product_json(data)
    if errors:
        raise ValueError("; ".join(errors))

    meta = resolve_metadata_from_upload(data, filename)
    index = fetch_raw("_index.json")
    index_check = check_against_index(
        index,
        filename=filename,
        partner_id=meta["partner_id"],
        product_id=meta["product_id"],
    )

    return {
        "metadata": meta,
        "faq_count": len(data.get("faqs") or []),
        "index_check": index_check,
        "categories": index.get("categories", []),
    }


def _normalize_upload_metadata(body: UploadRequest) -> dict[str, str]:
    return {
        "partner_id": normalize_slug(body.partner_id),
        "partner_name": body.partner_name.strip(),
        "product_id": normalize_slug(body.product_id),
        "product_name": body.product_name.strip(),
        "category": body.category.strip().lower(),
    }


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

        jobs.update_progress(
            job_id,
            make_progress(
                phase="fetching_catalog",
                percent=35,
                message="Đang tải catalog từ GitHub...",
            ),
        )
        index = fetch_raw("_index.json")
        existing_products = list_products_from_index(index)

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
        is_existing = product_exists(
            index, metadata["partner_id"], metadata["product_id"]
        )
        jobs.complete(
            job_id,
            {
                "source_text_length": len(source_text),
                "metadata": metadata,
                "is_existing_product": is_existing,
                "categories": index.get("categories", []),
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


def _run_shared_knowledge(session_id: str) -> None:
    session = store.get_session(session_id)
    if not session:
        return

    def on_progress(progress: dict[str, Any]) -> None:
        store.update_session_progress(session_id, progress)

    try:
        session["status"] = "generating_shared"
        session.pop("shared_knowledge_error", None)
        store.save_session(session)

        shared = generate_shared_knowledge(session, on_progress=on_progress)
        session = store.get_session(session_id) or session
        session["shared_knowledge"] = shared
        session["status"] = "done"
        session["progress"] = make_progress(
            phase="done",
            percent=100,
            message="Hoàn tất generate shared knowledge",
        )
        store.save_session(session)
        logger.info("Shared knowledge generated for session %s", session_id)
    except Exception as exc:
        logger.exception("Shared knowledge generation failed for session %s", session_id)
        session = store.get_session(session_id)
        if session:
            session["status"] = "review"
            session["shared_knowledge_error"] = str(exc)
            session["progress"] = make_progress(
                phase="error",
                percent=0,
                message=str(exc),
            )
            store.save_session(session)


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "healthy", "service": "flowy-pre"}


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
    ext = Path(body.filename).suffix.lower()
    if ext not in {".pdf", ".docx"}:
        raise HTTPException(status_code=400, detail="Only .pdf and .docx are supported.")

    job = jobs.create("analyze")
    background_tasks.add_task(_run_analyze_job, job["job_id"], body.filename, body.file_base64)
    return {"job_id": job["job_id"], "status": "running"}


@app.post("/api/json/check-index")
def check_json_index(body: JsonIndexCheckRequest) -> dict[str, Any]:
    try:
        index = fetch_raw("_index.json")
        partner_id = normalize_slug(body.partner_id)
        product_id = normalize_slug(body.product_id)
        index_check = check_against_index(
            index,
            filename=body.filename,
            partner_id=partner_id,
            product_id=product_id,
        )
        return {"index_check": index_check}
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/json/preview")
def preview_json_upload(body: JsonUploadRequest) -> dict[str, Any]:
    try:
        preview = _preview_json_upload(body.filename, body.file_base64)
        return {"status": "ok", "preview": preview}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/json/import")
def import_json_upload(body: JsonImportRequest) -> dict[str, Any]:
    try:
        data = decode_json_upload(body.filename, body.file_base64)
        errors = validate_product_json(data)
        if errors:
            raise ValueError("; ".join(errors))

        meta = resolve_metadata_from_upload(data, body.filename)
        if body.partner_id:
            meta["partner_id"] = normalize_slug(body.partner_id)
        if body.partner_name:
            meta["partner_name"] = body.partner_name.strip()
        if body.product_id:
            meta["product_id"] = normalize_slug(body.product_id)
        if body.product_name:
            meta["product_name"] = body.product_name.strip()
        if body.category:
            meta["category"] = body.category.strip().lower()

        index = fetch_raw("_index.json")
        index_check = check_against_index(
            index,
            filename=body.filename,
            partner_id=meta["partner_id"],
            product_id=meta["product_id"],
        )

        exists = index_check["exists_in_index"]
        if body.mode == "update" and not exists:
            raise ValueError(
                "Product chưa có trong /knowledge/_index.json. "
                "Chọn 'Thêm mới' để import."
            )
        if body.mode == "add_new" and exists:
            raise ValueError(
                f"Product {meta['partner_id']}/{meta['product_id']} đã có trong "
                "/knowledge/_index.json. Đổi Partner ID / Product ID hoặc chọn 'Cập nhật'."
            )

        faqs = assign_faq_ids(
            data.get("faqs") or [],
            partner_id=meta["partner_id"],
            product_id=meta["product_id"],
            source=body.filename,
        )

        session_id = uuid.uuid4().hex[:12]
        store.create_json_session(
            session_id=session_id,
            filename=body.filename,
            partner_id=meta["partner_id"],
            partner_name=meta["partner_name"],
            product_id=meta["product_id"],
            product_name=meta["product_name"],
            category=meta["category"],
            faqs=faqs,
            index_check=index_check,
            import_mode=body.mode,
        )

        return {
            "session_id": session_id,
            "status": "review",
            "import_mode": body.mode,
            "index_check": index_check,
            "faq_count": len(faqs),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


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
    session.pop("shared_knowledge", None)
    session.pop("shared_knowledge_error", None)
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


@app.get("/api/sessions/{session_id}/export")
def export_product_json(session_id: str) -> JSONResponse:
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.get("faqs"):
        raise HTTPException(status_code=400, detail="No FAQs to export.")

    product_json = store.build_product_json(session)
    filename = f"{session['partner_id']}_{session['product_id']}.json"
    return JSONResponse(
        content=product_json,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/sessions/{session_id}/done")
def finish_session(session_id: str, background_tasks: BackgroundTasks) -> dict[str, Any]:
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.get("faqs"):
        raise HTTPException(status_code=400, detail="No FAQs to process.")

    background_tasks.add_task(_run_shared_knowledge, session_id)
    return {
        "session_id": session_id,
        "status": "generating_shared",
        "message": "Generating shared knowledge files from GitHub baseline.",
    }


@app.get("/api/sessions/{session_id}/shared-knowledge/zip")
def download_shared_knowledge_zip(session_id: str) -> Response:
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    shared = session.get("shared_knowledge")
    if not shared or not shared.get("files"):
        raise HTTPException(status_code=400, detail="Shared knowledge not generated yet.")

    stamp = datetime.now().strftime("%d%m%Y_%H%M")
    zip_filename = f"knowledge_shared_{stamp}.zip"

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for file_entry in shared["files"]:
            zf.writestr(
                file_entry["zip_path"],
                file_entry["json_text"],
            )
    buffer.seek(0)

    return Response(
        content=buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_filename}"'},
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("AGENT_PORT", "8081"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
