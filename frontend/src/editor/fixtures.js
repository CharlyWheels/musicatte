/** MEI documents used by tests and as the editor's starting point. */

const HEADER = `<meiHead>
    <fileDesc>
      <titleStmt>
        <title>__TITLE__</title>
        <respStmt><composer></composer></respStmt>
      </titleStmt>
      <pubStmt/>
    </fileDesc>
    <encodingDesc><appInfo><application><name>Musicatte</name></application></appInfo></encodingDesc>
  </meiHead>`

function measure(number, staves) {
  return `<measure xml:id="m${number}" n="${number}">${staves}</measure>`
}

function staff(number, content, layer = 1) {
  return `<staff xml:id="s${number}-${layer}-${Math.random()
    .toString(36)
    .slice(2, 7)}" n="${number}"><layer n="${layer}">${content}</layer></staff>`
}

function note(id, pname, octave, dur = '4') {
  return `<note xml:id="${id}" pname="${pname}" oct="${octave}" dur="${dur}"/>`
}

/** A single treble staff, two measures, one note per beat. */
export function singleStaffMei(title = 'Nueva partitura') {
  const first = staff(1, [
    note('n1', 'c', 4),
    note('n2', 'd', 4),
    note('n3', 'e', 4),
    note('n4', 'f', 4),
  ].join(''))
  const second = staff(1, [
    note('n5', 'g', 4),
    note('n6', 'a', 4),
    note('n7', 'b', 4),
    note('n8', 'c', 5),
  ].join(''))

  return `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="4.0.1">
  ${HEADER.replace('__TITLE__', title)}
  <music><body><mdiv><score>
    <scoreDef>
      <staffGrp>
        <staffDef xml:id="sd1" n="1" lines="5">
          <clef shape="G" line="2"/>
          <keySig sig="0"/>
          <meterSig count="4" unit="4"/>
        </staffDef>
      </staffGrp>
    </scoreDef>
    <section>
      ${measure(1, first)}
      ${measure(2, second)}
    </section>
  </score></mdiv></body></music>
</mei>`
}

/** A piano grand staff: the case the old editor could not handle at all. */
export function grandStaffMei(title = 'Piano') {
  const build = (number, top, bottom) =>
    measure(number, staff(1, top) + staff(2, bottom))

  return `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="4.0.1">
  ${HEADER.replace('__TITLE__', title)}
  <music><body><mdiv><score>
    <scoreDef>
      <staffGrp symbol="brace" bar.thru="true">
        <staffDef xml:id="sd1" n="1" lines="5">
          <clef shape="G" line="2"/>
          <keySig sig="0"/>
          <meterSig count="4" unit="4"/>
        </staffDef>
        <staffDef xml:id="sd2" n="2" lines="5">
          <clef shape="F" line="4"/>
          <keySig sig="0"/>
          <meterSig count="4" unit="4"/>
        </staffDef>
      </staffGrp>
    </scoreDef>
    <section>
      ${build(
        1,
        note('t1', 'c', 5, '2') + note('t2', 'e', 5, '2'),
        note('b1', 'c', 3, '1'),
      )}
      ${build(
        2,
        note('t3', 'd', 5, '2') + note('t4', 'f', 5, '2'),
        note('b2', 'g', 2, '1'),
      )}
    </section>
  </score></mdiv></body></music>
</mei>`
}

/**
 * A blank score: one treble staff, four empty measures.
 *
 * An empty document is the honest starting point, and it only became usable
 * once a whole-measure rest stopped counting as a full bar -- before that a
 * blank measure could never be given any notes.
 */
export function blankScoreMei(measureCount = 4, title = 'Nueva partitura') {
  const bars = Array.from({ length: measureCount }, (_, index) =>
    measure(index + 1, staff(1, `<mRest xml:id="r${index + 1}"/>`)),
  ).join('\n      ')

  return `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="4.0.1">
  ${HEADER.replace('__TITLE__', title)}
  <music><body><mdiv><score>
    <scoreDef>
      <staffGrp>
        <staffDef xml:id="sd1" n="1" lines="5">
          <clef shape="G" line="2"/>
          <keySig sig="0"/>
          <meterSig count="4" unit="4"/>
        </staffDef>
      </staffGrp>
    </scoreDef>
    <section>
      ${bars}
    </section>
  </score></mdiv></body></music>
</mei>`
}

export const DEFAULT_MEI = blankScoreMei()

/**
 * MusicXML for a blank score.
 *
 * Kept because Verovio reads MusicXML and converts it to MEI on load, so a
 * new score can start from whichever is more convenient. MEI is the internal
 * format from then on.
 */
export const DEFAULT_MUSICXML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Nueva partitura</work-title></work>
  <identification><encoding><software>Musicatte</software></encoding></identification>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`
