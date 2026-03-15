def score_to_musicxml(score_data: dict) -> str:
    """
    Minimal JSON -> MusicXML exporter placeholder.
    Keeps contract explicit while MVP uses JSON as source of truth.
    """
    title = score_data.get("title", "Untitled")
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>{title}</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Musicatte</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><rest/><duration>1</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>"""
