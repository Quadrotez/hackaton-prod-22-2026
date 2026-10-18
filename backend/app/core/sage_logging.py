"""Asynchronous appender for Sage's multiline log ingestion endpoint."""

from __future__ import annotations

import logging
import queue
import threading
import urllib.error
import urllib.request


class SageMultilineHandler(logging.Handler):
    """Send formatted log records to Sage without blocking application requests.

    The handler is deliberately best-effort: Sage being unavailable must not break the API.
    Records are queued in memory and dropped when the queue is full.
    """

    def __init__(
        self,
        url: str,
        token: str | None = None,
        timeout: float = 5.0,
        queue_size: int = 1000,
        auth_scheme: str = "Bearer",
    ) -> None:
        super().__init__()
        self.url = url
        self.token = token
        self.timeout = timeout
        self.auth_scheme = auth_scheme
        self._records: queue.Queue[str | None] = queue.Queue(maxsize=queue_size)
        self._worker = threading.Thread(
            target=self._send_loop,
            name="sage-log-appender",
            daemon=True,
        )
        self._worker.start()

    def emit(self, record: logging.LogRecord) -> None:
        try:
            # Sage's /multiline endpoint accepts newline-delimited log entries.
            payload = self.format(record) + "\n"
            self._records.put_nowait(payload)
        except (queue.Full, Exception):
            # Logging must never take down the request that produced the record.
            return

    def close(self) -> None:
        try:
            self._records.put_nowait(None)
        except queue.Full:
            pass
        super().close()

    def _send_loop(self) -> None:
        while True:
            payload = self._records.get()
            try:
                if payload is None:
                    return
                self._post(payload)
            finally:
                self._records.task_done()

    def _post(self, payload: str) -> None:
        headers = {
            "Content-Type": "application/x-ndjson",
            "User-Agent": "petcare-backend/1.0",
        }
        if self.token:
            headers["Authorization"] = f"{self.auth_scheme} {self.token}"
        request = urllib.request.Request(
            self.url,
            data=payload.encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout):
                pass
        except (OSError, urllib.error.URLError):
            # The stdout appender remains the source of truth if Sage is unavailable.
            return


def build_sage_handler(
    url: str | None,
    token: str | None,
    timeout: float,
    formatter: logging.Formatter,
    auth_scheme: str = "Bearer",
) -> SageMultilineHandler | None:
    if not url:
        return None
    handler = SageMultilineHandler(url, token, timeout, auth_scheme=auth_scheme)
    handler.setFormatter(formatter)
    return handler
