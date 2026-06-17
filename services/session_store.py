"""Draft session storage for FAQ generation workflow."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class SessionStore:
    def __init__(self, drafts_dir: Path) -> None:
        self.drafts_dir = drafts_dir
        self.drafts_dir.mkdir(parents=True, exist_ok=True)

    def _session_path(self, session_id: str) -> Path:
        return self.drafts_dir / f"{session_id}.json"

    def _upload_payload_path(self, session_id: str) -> Path:
        return self.drafts_dir / f"{session_id}_upload.json"

    def _source_text_path(self, session_id: str) -> Path:
        return self.drafts_dir / f"{session_id}_source.txt"

    def save_session(self, session: dict[str, Any]) -> None:
        session["updated_at"] = _utc_now()
        self._session_path(session["session_id"]).write_text(
            json.dumps(session, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        path = self._session_path(session_id)
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def create_pending_session(
        self,
        *,
        session_id: str,
        filename: str,
        partner_id: str,
        partner_name: str,
        product_id: str,
        product_name: str,
        category: str,
    ) -> dict[str, Any]:
        session = {
            "session_id": session_id,
            "status": "processing",
            "created_at": _utc_now(),
            "updated_at": _utc_now(),
            "filename": filename,
            "partner_id": partner_id,
            "partner_name": partner_name,
            "product_id": product_id,
            "product_name": product_name,
            "category": category,
            "source_text_length": 0,
            "faqs": [],
            "progress": {
                "phase": "queued",
                "percent": 0,
                "message": "Đang xếp hàng xử lý...",
                "current_chunk": None,
                "total_chunks": None,
                "faqs_so_far": None,
            },
        }
        self.save_session(session)
        return session

    def update_session_progress(self, session_id: str, progress: dict[str, Any]) -> None:
        session = self.get_session(session_id)
        if not session:
            return
        session["progress"] = progress
        self.save_session(session)

    def save_upload_payload(self, session_id: str, filename: str, file_base64: str) -> None:
        payload = {"filename": filename, "file_base64": file_base64}
        self._upload_payload_path(session_id).write_text(
            json.dumps(payload), encoding="utf-8"
        )

    def load_upload_payload(self, session_id: str) -> dict[str, str] | None:
        path = self._upload_payload_path(session_id)
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def delete_upload_payload(self, session_id: str) -> None:
        path = self._upload_payload_path(session_id)
        if path.exists():
            path.unlink()

    def save_source_text(self, session_id: str, text: str) -> None:
        self._source_text_path(session_id).write_text(text, encoding="utf-8")

    def load_source_text(self, session_id: str) -> str | None:
        path = self._source_text_path(session_id)
        if not path.exists():
            return None
        return path.read_text(encoding="utf-8")

    def list_sessions(self, status: str | None = None) -> list[dict[str, Any]]:
        sessions: list[dict[str, Any]] = []
        for path in sorted(self.drafts_dir.glob("*.json"), reverse=True):
            if path.name.endswith("_upload.json"):
                continue
            data = json.loads(path.read_text(encoding="utf-8"))
            if not data.get("session_id"):
                continue
            if status and data.get("status") != status:
                continue
            sessions.append(
                {
                    "session_id": data.get("session_id"),
                    "status": data.get("status"),
                    "filename": data.get("filename"),
                    "partner_id": data.get("partner_id"),
                    "product_id": data.get("product_id"),
                    "product_name": data.get("product_name"),
                    "faq_count": len(data.get("faqs") or []),
                    "updated_at": data.get("updated_at"),
                }
            )
        return sessions

    def set_session_faqs(self, session_id: str, faqs: list[dict[str, Any]]) -> dict[str, Any]:
        session = self.get_session(session_id)
        if not session:
            raise FileNotFoundError(f"Session not found: {session_id}")
        session["faqs"] = faqs
        if session.get("status") not in ("generating_shared", "done"):
            session["status"] = "review"
        self.save_session(session)
        return session

    def create_json_session(
        self,
        *,
        session_id: str,
        filename: str,
        partner_id: str,
        partner_name: str,
        product_id: str,
        product_name: str,
        category: str,
        faqs: list[dict[str, Any]],
        index_check: dict[str, Any],
        import_mode: str,
    ) -> dict[str, Any]:
        session = {
            "session_id": session_id,
            "status": "review",
            "source_type": "json_import",
            "import_mode": import_mode,
            "index_check": index_check,
            "created_at": _utc_now(),
            "updated_at": _utc_now(),
            "filename": filename,
            "partner_id": partner_id,
            "partner_name": partner_name,
            "product_id": product_id,
            "product_name": product_name,
            "category": category,
            "source_text_length": 0,
            "faqs": faqs,
            "progress": {
                "phase": "done",
                "percent": 100,
                "message": f"Import {len(faqs)} FAQ từ JSON",
                "current_chunk": None,
                "total_chunks": None,
                "faqs_so_far": len(faqs),
            },
        }
        self.save_session(session)
        return session

    def build_product_json(self, session: dict[str, Any]) -> dict[str, Any]:
        return {
            "product_id": session["product_id"],
            "partner_id": session["partner_id"],
            "product_name": session["product_name"],
            "partner_name": session["partner_name"],
            "version": "1.0",
            "last_updated": datetime.now().strftime("%Y-%m-%d"),
            "faqs": session.get("faqs") or [],
        }
