from __future__ import annotations

import asyncio
import os
import smtplib
from email.message import EmailMessage
from html import escape
from pathlib import Path

import aiohttp

from .models import JobCandidate


def _email(jobs: list[JobCandidate], attachments: tuple[Path, Path]) -> None:
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD")
    recipient = os.getenv("EMAIL_TO")
    if not user or not password or not recipient:
        return
    top = jobs[:10]
    items = "".join(
        f'<li><a href="{escape(str(job.source_url))}"><strong>{escape(job.title)}</strong></a> — {escape(job.company)} · score {job.score}</li>'
        for job in top
    )
    message = EmailMessage()
    message["Subject"] = f"Radar de Estágios — {len(jobs)} vagas compatíveis"
    message["From"] = user
    message["To"] = recipient
    message.set_content("Seu resumo diário de vagas está disponível nos anexos.")
    message.add_alternative(
        f"<h1>Radar de Estágios</h1><p>{len(jobs)} vagas compatíveis no ciclo de hoje.</p><ol>{items}</ol>",
        subtype="html",
    )
    for path in attachments:
        subtype = "csv" if path.suffix == ".csv" else "vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        message.add_attachment(path.read_bytes(), maintype="application", subtype=subtype, filename=path.name)
    with smtplib.SMTP(os.getenv("SMTP_HOST", "smtp.gmail.com"), int(os.getenv("SMTP_PORT", "587"))) as smtp:
        smtp.starttls()
        smtp.login(user, password)
        smtp.send_message(message)


async def send_email(jobs: list[JobCandidate], attachments: tuple[Path, Path]) -> bool:
    if not all(os.getenv(name) for name in ("SMTP_USER", "SMTP_PASSWORD", "EMAIL_TO")):
        return False
    await asyncio.to_thread(_email, jobs, attachments)
    return True


async def send_telegram(jobs: list[JobCandidate]) -> bool:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        return False
    lines = [f"Radar de Estágios: {len(jobs)} vagas compatíveis"]
    lines.extend(f"• {job.score} · {job.title} — {job.company}\n{job.source_url}" for job in jobs[:5])
    async with (
        aiohttp.ClientSession() as session,
        session.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": "\n\n".join(lines), "disable_web_page_preview": True},
        ) as response,
    ):
        response.raise_for_status()
    return True
