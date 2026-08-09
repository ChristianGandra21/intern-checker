from __future__ import annotations

import asyncio
import email
import imaplib
import logging
import re
from email.header import decode_header, make_header
from urllib.parse import urlsplit

from bs4 import BeautifulSoup

from ..models import JobCandidate

log = logging.getLogger(__name__)


def _read_alerts(config: dict) -> list[JobCandidate]:
    client = imaplib.IMAP4_SSL(config.get("host", "imap.gmail.com"), int(config.get("port", 993)))
    client.login(config["user"], config["password"])
    client.select(config.get("folder", "INBOX"))
    _, ids = client.search(None, config.get("search", '(FROM "googlealerts-noreply@google.com" UNSEEN)'))
    jobs: list[JobCandidate] = []
    for message_id in ids[0].split()[-20:]:
        _, payload = client.fetch(message_id, "(RFC822)")
        message = email.message_from_bytes(payload[0][1])
        subject = str(make_header(decode_header(message.get("Subject", "Google Alert"))))
        html = ""
        for part in message.walk():
            if part.get_content_type() == "text/html":
                html += part.get_payload(decode=True).decode(
                    part.get_content_charset() or "utf-8", errors="replace"
                )
        soup = BeautifulSoup(html, "html.parser")
        for anchor in soup.select("a[href]"):
            title = anchor.get_text(" ", strip=True)
            href = anchor.get("href", "")
            if len(title) < 8 or urlsplit(href).scheme not in {"http", "https"}:
                continue
            context = anchor.parent.get_text(" ", strip=True) if anchor.parent else subject
            if not re.search(r"est[aá]gio|intern", f"{title} {context}", re.IGNORECASE):
                continue
            jobs.append(
                JobCandidate(title=title, description=context, source="Google Alerts", source_url=href)
            )
    client.logout()
    return jobs


async def collect_google_alerts(config: dict | None) -> list[JobCandidate]:
    if not config or not config.get("user") or not config.get("password"):
        return []
    try:
        return await asyncio.to_thread(_read_alerts, config)
    except Exception as exc:  # noqa: BLE001 - remote IMAP errors must not stop other sources
        log.warning("Google Alerts IMAP failed: %s", exc)
        return []
