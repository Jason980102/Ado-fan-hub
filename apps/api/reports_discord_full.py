"""Private Discord notifications for new Ado Fan Hub reports."""

import json
import logging
import os
import re
import urllib.error
import urllib.request

log = logging.getLogger("ado.reports.discord")

FIELDS = (
    ("Type", "kind"),
    ("Category", "category"),
    ("Title", "title"),
    ("Description", "description"),
    ("Target", "target"),
    ("Steps to reproduce", "steps"),
    ("Expected result", "expected"),
    ("Environment", "environment"),
)


def sanitize(value):
    text = str(value or "")
    text = text.replace("@", "@\u200b")
    text = re.sub(
        r"(?i)\bBearer\s+[A-Za-z0-9._~+/\-]+=*",
        "Bearer [REDACTED]",
        text,
    )
    text = re.sub(
        r"(?i)\b(password|secret|api[_-]?key|token)\s*[:=]\s*\S+",
        r"\1=[REDACTED]",
        text,
    )
    return text


def send_new_report(case_id, report):
    webhook = os.environ.get("DISCORD_REPORTS_WEBHOOK_URL", "")

    if not webhook.startswith("https://discord.com/api/webhooks/"):
        return

    sections = [
        "**NEW ADO FAN HUB REPORT**",
        f"**Case ID:** {sanitize(case_id)}",
        "**Status:** received",
    ]

    for label, key in FIELDS:
        value = getattr(report, key, None)
        if value:
            sections.append(f"**{label}:**\n{sanitize(value)}")

    content = "\n\n".join(sections)

    # Keep each Discord message safely below 2,000 characters.
    chunks = []
    while content:
        chunks.append(content[:1700])
        content = content[1700:]

    for index, chunk in enumerate(chunks, 1):
        body = {
            "username": "Ado Fan Hub Reports",
            "content": (
                f"**Report {sanitize(case_id)} "
                f"({index}/{len(chunks)})**\n{chunk}"
            ),
            "allowed_mentions": {"parse": []},
        }

        data = json.dumps(body).encode("utf-8")
        request = urllib.request.Request(
            webhook,
            data=data,
            headers={"Content-Type": "application/json", "User-Agent": "AdoFanHubReports/1.0"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=3):
                pass
        except urllib.error.HTTPError as error:
            log.warning(
                "Discord delivery HTTP failure: case=%s part=%s status=%s",
                case_id, index, error.code,
            )
            return
        except (urllib.error.URLError, OSError, ValueError) as error:
            log.warning(
                "Discord delivery network failure: case=%s part=%s type=%s",
                case_id, index, type(error).__name__,
            )
            return