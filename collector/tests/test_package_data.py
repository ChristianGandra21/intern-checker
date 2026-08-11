import json
from importlib.resources import files
from pathlib import Path


def test_packaged_rules_match_shared_frontend_config() -> None:
    repository_root = Path(__file__).resolve().parents[2]

    for filename in ("dedup-rules.json", "area-taxonomy.json"):
        packaged = json.loads(
            files("intern_checker").joinpath(f"data/{filename}").read_text(encoding="utf-8")
        )
        shared = json.loads((repository_root / "config" / filename).read_text(encoding="utf-8"))

        assert packaged == shared
