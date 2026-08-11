from intern_checker.sources import rendered


def test_browser_launch_uses_bundled_chromium_by_default(monkeypatch):
    monkeypatch.delenv("PLAYWRIGHT_BROWSER_CHANNEL", raising=False)

    assert rendered._browser_launch_options() == {"headless": True}


def test_browser_launch_accepts_installed_browser_channel(monkeypatch):
    monkeypatch.setenv("PLAYWRIGHT_BROWSER_CHANNEL", "chrome")

    assert rendered._browser_launch_options() == {"headless": True, "channel": "chrome"}
