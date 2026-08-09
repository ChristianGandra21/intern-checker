from __future__ import annotations

import os
import re
from pathlib import Path

ENV_LINE = re.compile(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$")


def _parse_env_line(line: str) -> tuple[str, str] | None:
    line = line.strip()
    if not line or line.startswith("#"):
        return None
    match = ENV_LINE.match(line)
    if not match:
        return None
    key, value = match.groups()
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        value = value[1:-1]
    elif value.startswith(("'", '"')):
        quote = value[0]
        end = value.find(quote, 1)
        if end != -1:
            value = value[1:end]
    else:
        value = value.split(" #", 1)[0].strip()
    return key, value


def load_env_files(paths: tuple[str, ...] = (".env.local", ".env")) -> None:
    for path_name in paths:
        path = Path(path_name)
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            parsed = _parse_env_line(line)
            if parsed is None:
                continue
            key, value = parsed
            os.environ.setdefault(key, value)
