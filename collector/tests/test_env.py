import os
from pathlib import Path

from intern_checker.env import load_env_files


def test_load_env_files_handles_quoted_values_with_comments(tmp_path: Path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text('INGEST_API_KEY="secret-value" # local key\n', encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("INGEST_API_KEY", raising=False)

    load_env_files((".env",))

    assert os.getenv("INGEST_API_KEY") == "secret-value"


def test_load_env_files_preserves_existing_environment(tmp_path: Path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text("INGEST_API_KEY=file-value\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("INGEST_API_KEY", "shell-value")

    load_env_files((".env",))

    assert os.getenv("INGEST_API_KEY") == "shell-value"
