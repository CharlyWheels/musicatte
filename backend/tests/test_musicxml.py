from app.services.musicxml_service import DEFAULT_MUSICXML


def test_default_musicxml_is_valid():
    assert "<score-partwise" in DEFAULT_MUSICXML
    assert "<work-title>Nueva partitura</work-title>" in DEFAULT_MUSICXML
    assert "<measure" in DEFAULT_MUSICXML
