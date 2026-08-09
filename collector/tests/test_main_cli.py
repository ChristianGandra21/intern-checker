import pytest

from intern_checker import main


@pytest.mark.parametrize(("arguments", "expected"), [([], True), (["--no-notify"], False)])
def test_cli_notification_switch(monkeypatch, arguments, expected):
    captured = {}

    async def fake_run(config, output, min_score, dry_run, notifications):
        captured["notifications"] = notifications
        return 0

    monkeypatch.setattr(main, "run", fake_run)
    with pytest.raises(SystemExit) as result:
        main._run_parser(arguments)

    assert result.value.code == 0
    assert captured["notifications"] is expected
