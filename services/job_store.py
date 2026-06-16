"""Async job store for analyze and other background tasks."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class JobStore:
    def __init__(self, jobs_dir: Path) -> None:
        self.jobs_dir = jobs_dir
        self.jobs_dir.mkdir(parents=True, exist_ok=True)

    def _path(self, job_id: str) -> Path:
        return self.jobs_dir / f"{job_id}.json"

    def create(self, job_type: str) -> dict[str, Any]:
        job_id = uuid.uuid4().hex[:12]
        job = {
            "job_id": job_id,
            "type": job_type,
            "status": "running",
            "progress": {
                "phase": "queued",
                "percent": 0,
                "message": "Đang khởi tạo...",
                "current_chunk": None,
                "total_chunks": None,
                "faqs_so_far": None,
            },
            "result": None,
            "error": None,
            "created_at": _utc_now(),
            "updated_at": _utc_now(),
        }
        self.save(job)
        return job

    def save(self, job: dict[str, Any]) -> None:
        job["updated_at"] = _utc_now()
        self._path(job["job_id"]).write_text(
            json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    def get(self, job_id: str) -> dict[str, Any] | None:
        path = self._path(job_id)
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def update_progress(self, job_id: str, progress: dict[str, Any]) -> None:
        job = self.get(job_id)
        if not job:
            return
        job["progress"] = progress
        self.save(job)

    def complete(self, job_id: str, result: dict[str, Any]) -> None:
        job = self.get(job_id)
        if not job:
            return
        job["status"] = "done"
        job["result"] = result
        job["progress"] = {
            **(job.get("progress") or {}),
            "phase": "done",
            "percent": 100,
            "message": "Hoàn tất",
        }
        self.save(job)

    def fail(self, job_id: str, error: str) -> None:
        job = self.get(job_id)
        if not job:
            return
        job["status"] = "error"
        job["error"] = error
        job["progress"] = {
            **(job.get("progress") or {}),
            "phase": "error",
            "message": error,
        }
        self.save(job)
