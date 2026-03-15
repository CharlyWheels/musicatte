from app.services.musicxml_service import score_to_musicxml


def test_score_to_musicxml_contains_title():
    xml = score_to_musicxml({"title": "Prelude"})
    assert "<work-title>Prelude</work-title>" in xml
