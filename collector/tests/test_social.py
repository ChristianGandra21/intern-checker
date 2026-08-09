from datetime import UTC, datetime

from intern_checker.sources.social import _bsky_url, _parse_date


def test_bsky_url_from_at_uri():
    url = _bsky_url("at://did:plc:abc123/app.bsky.feed.post/3lxyz", "user.bsky.social")

    assert url == "https://bsky.app/profile/user.bsky.social/post/3lxyz"


def test_parse_unix_timestamp():
    parsed = _parse_date(1_800_000_000)

    assert parsed == datetime.fromtimestamp(1_800_000_000, UTC)
