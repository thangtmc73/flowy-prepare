"""Read/write knowledge base, draft sessions, and version history."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from services.faq_generator import assign_faq_ids
from services.knowledge_diff import compare_faq_lists, merge_faqs


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class KnowledgeStore:
    def __init__(
        self,
        knowledge_dir: Path,
        drafts_dir: Path,
        history_dir: Path,
    ) -> None:
        self.knowledge_dir = knowledge_dir
        self.drafts_dir = drafts_dir
        self.history_dir = history_dir
        self.drafts_dir.mkdir(parents=True, exist_ok=True)
        self.history_dir.mkdir(parents=True, exist_ok=True)

    def _session_path(self, session_id: str) -> Path:
        return self.drafts_dir / f"{session_id}.json"

    def _product_path(self, partner_id: str, product_id: str) -> Path:
        return self.knowledge_dir / "partners" / partner_id / f"{product_id}.json"

    def _index_path(self) -> Path:
        return self.knowledge_dir / "_index.json"

    def load_index(self) -> dict[str, Any]:
        path = self._index_path()
        if not path.exists():
            return {
                "version": "2.0",
                "last_updated": datetime.now().strftime("%Y-%m-%d"),
                "partners": [],
                "categories": [
                    {"id": "health", "name": "Bảo hiểm sức khỏe"},
                    {"id": "car", "name": "Bảo hiểm xe cơ giới"},
                    {"id": "travel", "name": "Bảo hiểm du lịch"},
                    {"id": "financial", "name": "Bảo hiểm tài chính"},
                    {"id": "cyber", "name": "Bảo hiểm an ninh mạng"},
                ],
            }
        return json.loads(path.read_text(encoding="utf-8"))

    def save_index(self, index: dict[str, Any]) -> None:
        index["last_updated"] = datetime.now().strftime("%Y-%m-%d")
        path = self._index_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")

    def list_products(self) -> list[dict[str, Any]]:
        index = self.load_index()
        items: list[dict[str, Any]] = []
        for partner in index.get("partners", []):
            if not partner.get("active", True):
                continue
            for product in partner.get("products", []):
                product_path = self.knowledge_dir / product.get("file", "")
                faq_count = 0
                if product_path.exists():
                    data = json.loads(product_path.read_text(encoding="utf-8"))
                    faq_count = len(data.get("faqs", []))
                items.append(
                    {
                        "partner_id": partner.get("partner_id"),
                        "partner_name": partner.get("partner_name"),
                        "product_id": product.get("product_id"),
                        "product_name": product.get("product_name"),
                        "category": product.get("category"),
                        "file": product.get("file"),
                        "faq_count": faq_count,
                    }
                )
        return items

    def load_product(self, partner_id: str, product_id: str) -> dict[str, Any] | None:
        path = self._product_path(partner_id, product_id)
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def _source_text_path(self, session_id: str) -> Path:
        return self.drafts_dir / f"{session_id}_source.txt"

    def save_source_text(self, session_id: str, source_text: str) -> None:
        self._source_text_path(session_id).write_text(source_text, encoding="utf-8")

    def load_source_text(self, session_id: str) -> str | None:
        path = self._source_text_path(session_id)
        if not path.exists():
            return None
        return path.read_text(encoding="utf-8")

    def create_session(
        self,
        *,
        session_id: str,
        filename: str,
        partner_id: str,
        partner_name: str,
        product_id: str,
        product_name: str,
        category: str,
        source_text: str,
    ) -> dict[str, Any]:
        self.save_source_text(session_id, source_text)
        session = {
            "session_id": session_id,
            "status": "uploaded",
            "created_at": _utc_now(),
            "updated_at": _utc_now(),
            "filename": filename,
            "partner_id": partner_id,
            "partner_name": partner_name,
            "product_id": product_id,
            "product_name": product_name,
            "category": category,
            "source_text_length": len(source_text),
            "faqs": [],
            "submit_mode": "merge",
            "existing_product": self.load_product(partner_id, product_id),
        }
        self.save_session(session)
        return session

    def save_session(self, session: dict[str, Any]) -> None:
        session["updated_at"] = _utc_now()
        path = self._session_path(session["session_id"])
        path.write_text(json.dumps(session, ensure_ascii=False, indent=2), encoding="utf-8")

    def update_session_progress(self, session_id: str, progress: dict[str, Any]) -> None:
        session = self.get_session(session_id)
        if not session:
            return
        session["progress"] = progress
        self.save_session(session)

    def _upload_payload_path(self, session_id: str) -> Path:
        return self.drafts_dir / f"{session_id}_upload.json"

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
            "submit_mode": "merge",
            "existing_product": self.load_product(partner_id, product_id),
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

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        path = self._session_path(session_id)
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

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
        session["status"] = "review"
        self.save_session(session)
        return session

    def compare_session(self, session_id: str) -> dict[str, Any]:
        session = self.get_session(session_id)
        if not session:
            raise FileNotFoundError(f"Session not found: {session_id}")
        existing = (session.get("existing_product") or {}).get("faqs") or []
        incoming = session.get("faqs") or []
        diffs = compare_faq_lists(existing, incoming)
        summary = {
            "new": sum(1 for d in diffs if d["status"] == "new"),
            "updated": sum(1 for d in diffs if d["status"] == "updated"),
            "unchanged": sum(1 for d in diffs if d["status"] == "unchanged"),
            "removed": sum(1 for d in diffs if d["status"] == "removed"),
        }
        return {"summary": summary, "diffs": diffs}

    def submit_session(
        self,
        session_id: str,
        *,
        mode: Literal["append", "merge", "replace"] = "merge",
    ) -> dict[str, Any]:
        session = self.get_session(session_id)
        if not session:
            raise FileNotFoundError(f"Session not found: {session_id}")

        partner_id = session["partner_id"]
        product_id = session["product_id"]
        incoming_faqs = session.get("faqs") or []
        if not incoming_faqs:
            raise ValueError("No FAQs to submit.")

        existing_product = self.load_product(partner_id, product_id)
        existing_faqs = (existing_product or {}).get("faqs") or []

        merged = merge_faqs(existing_faqs, incoming_faqs, mode=mode)
        merged = assign_faq_ids(
            merged,
            partner_id=partner_id,
            product_id=product_id,
            start_index=1,
            source=session.get("filename", "flowy-pre"),
        )

        product_json = {
            "product_id": product_id,
            "partner_id": partner_id,
            "product_name": session["product_name"],
            "partner_name": session["partner_name"],
            "version": str(
                float((existing_product or {}).get("version", "1.0")) + 0.1
            )[:3]
            if existing_product
            else "1.0",
            "last_updated": datetime.now().strftime("%Y-%m-%d"),
            "faqs": merged,
        }

        if existing_product:
            self._archive_version(partner_id, product_id, existing_product)

        product_path = self._product_path(partner_id, product_id)
        product_path.parent.mkdir(parents=True, exist_ok=True)
        product_path.write_text(
            json.dumps(product_json, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        self._update_index_entry(
            partner_id=partner_id,
            partner_name=session["partner_name"],
            product_id=product_id,
            product_name=session["product_name"],
            category=session.get("category", "health"),
        )

        session["status"] = "submitted"
        session["submitted_at"] = _utc_now()
        session["submit_mode"] = mode
        session["result_faq_count"] = len(merged)
        self.save_session(session)

        return {
            "product_path": str(product_path),
            "faq_count": len(merged),
            "mode": mode,
            "version": product_json["version"],
        }

    def _archive_version(
        self, partner_id: str, product_id: str, product_data: dict[str, Any]
    ) -> None:
        archive_dir = self.history_dir / partner_id / product_id
        archive_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        dest = archive_dir / f"v_{stamp}.json"
        dest.write_text(json.dumps(product_data, ensure_ascii=False, indent=2), encoding="utf-8")

    def list_history(self, partner_id: str, product_id: str) -> list[dict[str, Any]]:
        archive_dir = self.history_dir / partner_id / product_id
        if not archive_dir.exists():
            return []
        items: list[dict[str, Any]] = []
        for path in sorted(archive_dir.glob("v_*.json"), reverse=True):
            data = json.loads(path.read_text(encoding="utf-8"))
            items.append(
                {
                    "filename": path.name,
                    "last_updated": data.get("last_updated"),
                    "version": data.get("version"),
                    "faq_count": len(data.get("faqs", [])),
                }
            )
        return items

    def restore_history(
        self, partner_id: str, product_id: str, history_filename: str
    ) -> dict[str, Any]:
        archive_path = self.history_dir / partner_id / product_id / history_filename
        if not archive_path.exists():
            raise FileNotFoundError(f"History file not found: {history_filename}")

        current = self.load_product(partner_id, product_id)
        if current:
            self._archive_version(partner_id, product_id, current)

        data = json.loads(archive_path.read_text(encoding="utf-8"))
        product_path = self._product_path(partner_id, product_id)
        product_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"restored_from": history_filename, "faq_count": len(data.get("faqs", []))}

    def update_product_faqs(
        self, partner_id: str, product_id: str, faqs: list[dict[str, Any]]
    ) -> dict[str, Any]:
        product = self.load_product(partner_id, product_id)
        if not product:
            raise FileNotFoundError(f"Product not found: {partner_id}/{product_id}")

        self._archive_version(partner_id, product_id, product)
        faqs = assign_faq_ids(
            faqs,
            partner_id=partner_id,
            product_id=product_id,
            start_index=1,
            source="manual-edit",
        )
        product["faqs"] = faqs
        product["last_updated"] = datetime.now().strftime("%Y-%m-%d")
        path = self._product_path(partner_id, product_id)
        path.write_text(json.dumps(product, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"faq_count": len(faqs), "last_updated": product["last_updated"]}

    def _update_index_entry(
        self,
        *,
        partner_id: str,
        partner_name: str,
        product_id: str,
        product_name: str,
        category: str,
    ) -> None:
        index = self.load_index()
        partner = next((p for p in index["partners"] if p["partner_id"] == partner_id), None)
        if not partner:
            partner = {
                "partner_id": partner_id,
                "partner_name": partner_name,
                "active": True,
                "products": [],
            }
            index["partners"].append(partner)

        product_entry = next(
            (p for p in partner["products"] if p["product_id"] == product_id), None
        )
        file_rel = f"partners/{partner_id}/{product_id}.json"
        if not product_entry:
            partner["products"].append(
                {
                    "product_id": product_id,
                    "product_name": product_name,
                    "category": category,
                    "file": file_rel,
                    "priority": 8,
                    "keywords": [partner_id, category],
                }
            )
        else:
            product_entry["product_name"] = product_name
            product_entry["category"] = category

        self.save_index(index)

    def delete_product(self, partner_id: str, product_id: str) -> dict[str, Any]:
        product = self.load_product(partner_id, product_id)
        if not product:
            raise FileNotFoundError(f"Product not found: {partner_id}/{product_id}")

        self._archive_version(partner_id, product_id, product)

        product_path = self._product_path(partner_id, product_id)
        if product_path.exists():
            product_path.unlink()

        partner_dir = product_path.parent
        if partner_dir.exists() and not any(partner_dir.iterdir()):
            partner_dir.rmdir()

        index = self.load_index()
        partner = next((p for p in index["partners"] if p["partner_id"] == partner_id), None)
        if partner:
            partner["products"] = [
                p for p in partner["products"] if p["product_id"] != product_id
            ]
            if not partner["products"]:
                index["partners"] = [
                    p for p in index["partners"] if p["partner_id"] != partner_id
                ]
        self.save_index(index)

        return {
            "deleted": True,
            "partner_id": partner_id,
            "product_id": product_id,
            "product_name": product.get("product_name"),
        }
