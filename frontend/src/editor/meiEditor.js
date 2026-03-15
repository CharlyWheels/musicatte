/**
 * MEI-based editor for Verovio.
 * Edits the MEI string directly and reloads into the toolkit.
 */

const STEPS = ['c', 'd', 'e', 'f', 'g', 'a', 'b']

const DUR_REVERSE = { '1': 'whole', '2': 'half', '4': 'quarter', '8': 'eighth', '16': '16th', '32': '32nd' }

export const DURATION_LABELS = [
  { dur: '1', label: 'Redonda', icon: '\ud834\udd5d' },
  { dur: '2', label: 'Blanca', icon: '\ud834\udd5e' },
  { dur: '4', label: 'Negra', icon: '\u2669' },
  { dur: '8', label: 'Corchea', icon: '\u266a' },
  { dur: '16', label: 'Semicorchea', icon: '\ud834\udd61' },
]

export const ACCIDENTAL_LABELS = [
  { value: 's', label: 'Sostenido', icon: '\u266f' },
  { value: 'f', label: 'Bemol', icon: '\u266d' },
  { value: 'n', label: 'Natural', icon: '\u266e' },
  { value: '', label: 'Quitar', icon: '\u2205' },
]

export const CLEF_OPTIONS = [
  { shape: 'G', line: '2', label: 'Sol (Treble)' },
  { shape: 'F', line: '4', label: 'Fa (Bass)' },
  { shape: 'C', line: '3', label: 'Do (Alto)' },
  { shape: 'C', line: '4', label: 'Do (Tenor)' },
]

export const KEY_SIG_OPTIONS = [
  { sig: '0', label: 'Do Mayor / La menor (0)' },
  { sig: '1s', label: 'Sol Mayor (1\u266f)' },
  { sig: '2s', label: 'Re Mayor (2\u266f)' },
  { sig: '3s', label: 'La Mayor (3\u266f)' },
  { sig: '4s', label: 'Mi Mayor (4\u266f)' },
  { sig: '5s', label: 'Si Mayor (5\u266f)' },
  { sig: '1f', label: 'Fa Mayor (1\u266d)' },
  { sig: '2f', label: 'Si\u266d Mayor (2\u266d)' },
  { sig: '3f', label: 'Mi\u266d Mayor (3\u266d)' },
  { sig: '4f', label: 'La\u266d Mayor (4\u266d)' },
]

export const TIME_SIG_OPTIONS = [
  { count: '4', unit: '4', label: '4/4' },
  { count: '3', unit: '4', label: '3/4' },
  { count: '2', unit: '4', label: '2/4' },
  { count: '6', unit: '8', label: '6/8' },
  { count: '2', unit: '2', label: '2/2' },
  { count: '3', unit: '8', label: '3/8' },
  { count: '5', unit: '4', label: '5/4' },
  { count: '12', unit: '8', label: '12/8' },
]

// ──────── Helpers ────────

function newId() {
  return 'n' + Math.random().toString(36).slice(2, 10)
}

/**
 * Replace an attribute value on the element containing the given xml:id.
 */
function replAttr(mei, xmlId, attr, val) {
  const re = new RegExp(`(<[^>]*xml:id="${xmlId}"[^>]*?)${attr}="[^"]*"`, 's')
  if (re.test(mei)) return mei.replace(re, `$1${attr}="${val}"`)
  return mei
}

/**
 * Add an attribute to the element containing the given xml:id (if not present).
 */
function addAttr(mei, xmlId, attr, val) {
  if (new RegExp(`xml:id="${xmlId}"[^>]*${attr}=`).test(mei)) {
    return replAttr(mei, xmlId, attr, val)
  }
  return mei.replace(`xml:id="${xmlId}"`, `xml:id="${xmlId}" ${attr}="${val}"`)
}

/**
 * Remove an attribute from the element containing the given xml:id.
 */
function rmAttr(mei, xmlId, attr) {
  return mei.replace(
    new RegExp(`(xml:id="${xmlId}"[^>]*?)\\s*${attr}="[^"]*"`, 's'),
    '$1'
  )
}

// ──────── Score properties (read) ────────

export function getScoreProperties(toolkit) {
  const mei = toolkit.getMEI()

  const clefShape = mei.match(/<clef[^>]*shape="([^"]*)"/)?.[1] || 'G'
  const clefLine = mei.match(/<clef[^>]*line="([^"]*)"/)?.[1] || '2'
  const keySig = mei.match(/<keySig[^>]*sig="([^"]*)"/)?.[1] || '0'
  const meterCount = mei.match(/<meterSig[^>]*count="([^"]*)"/)?.[1] || '4'
  const meterUnit = mei.match(/<meterSig[^>]*unit="([^"]*)"/)?.[1] || '4'

  return { clefShape, clefLine, keySig, meterCount, meterUnit }
}

// ──────── Score properties (write) ────────

export function changeClef(toolkit, shape, line) {
  let mei = toolkit.getMEI()
  mei = mei.replace(/<clef([^>]*)shape="[^"]*"/, `<clef$1shape="${shape}"`)
  mei = mei.replace(/<clef([^>]*)line="[^"]*"/, `<clef$1line="${line}"`)
  toolkit.loadData(mei)
  return mei
}

export function changeKeySig(toolkit, sig) {
  let mei = toolkit.getMEI()
  mei = mei.replace(/<keySig([^>]*)sig="[^"]*"/, `<keySig$1sig="${sig}"`)
  toolkit.loadData(mei)
  return mei
}

export function changeTimeSig(toolkit, count, unit) {
  let mei = toolkit.getMEI()
  mei = mei.replace(/<meterSig([^>]*)count="[^"]*"/, `<meterSig$1count="${count}"`)
  mei = mei.replace(/<meterSig([^>]*)unit="[^"]*"/, `<meterSig$1unit="${unit}"`)
  toolkit.loadData(mei)
  return mei
}

// ──────── Note info ────────

export function getNoteInfo(toolkit, noteId) {
  if (!noteId) return null
  try {
    const attr = toolkit.getElementAttr(noteId)
    if (!attr.pname && !attr.dur) return null
    const isRest = !attr.pname
    return {
      pname: attr.pname?.toUpperCase() || null,
      oct: attr.oct || null,
      dur: attr.dur || '4',
      durLabel: DUR_REVERSE[attr.dur] || attr.dur,
      accid: attr.accid || null,
      dots: attr.dots || null,
      isRest,
    }
  } catch {
    return null
  }
}

// ──────── Pitch ────────

export function changePitch(toolkit, noteId, steps) {
  const attr = toolkit.getElementAttr(noteId)
  if (!attr.pname || !attr.oct) return null

  let idx = STEPS.indexOf(attr.pname)
  let oct = parseInt(attr.oct)
  if (idx < 0) return null

  idx += steps
  while (idx >= STEPS.length) { idx -= STEPS.length; oct++ }
  while (idx < 0) { idx += STEPS.length; oct-- }
  oct = Math.max(1, Math.min(8, oct))

  const newP = STEPS[idx]
  const newO = String(oct)
  if (newP === attr.pname && newO === attr.oct) return null

  let mei = toolkit.getMEI()
  mei = replAttr(mei, noteId, 'pname', newP)
  mei = replAttr(mei, noteId, 'oct', newO)
  toolkit.loadData(mei)
  return mei
}

// ──────── Duration ────────

export function changeDuration(toolkit, noteId, newDur) {
  const attr = toolkit.getElementAttr(noteId)
  if (attr.dur === newDur) return null

  let mei = toolkit.getMEI()
  mei = replAttr(mei, noteId, 'dur', newDur)

  // Auto-beam: if changing to 8th or shorter, check neighbors
  mei = cleanupBeams(mei)

  toolkit.loadData(mei)
  return mei
}

// ──────── Accidentals ────────

export function changeAccidental(toolkit, noteId, accid) {
  let mei = toolkit.getMEI()

  // Verovio puts accid as child element. We need to set accid attribute on the note itself
  // and also handle the child <accid> element
  if (accid) {
    mei = addAttr(mei, noteId, 'accid', accid)
  } else {
    mei = rmAttr(mei, noteId, 'accid')
    mei = rmAttr(mei, noteId, 'accid.ges')
  }

  toolkit.loadData(mei)
  return mei
}

// ──────── Dots ────────

export function toggleDot(toolkit, noteId) {
  const attr = toolkit.getElementAttr(noteId)
  let mei = toolkit.getMEI()

  if (attr.dots === '1') {
    mei = rmAttr(mei, noteId, 'dots')
  } else {
    mei = addAttr(mei, noteId, 'dots', '1')
  }

  toolkit.loadData(mei)
  return mei
}

// ──────── Tie ────────

export function toggleTie(toolkit, noteId) {
  const attr = toolkit.getElementAttr(noteId)
  let mei = toolkit.getMEI()

  if (attr.tie) {
    mei = rmAttr(mei, noteId, 'tie')
  } else {
    mei = addAttr(mei, noteId, 'tie', 'i')
  }

  toolkit.loadData(mei)
  return mei
}

// ──────── Rest ────────

export function toggleRest(toolkit, noteId) {
  let mei = toolkit.getMEI()
  const attr = toolkit.getElementAttr(noteId)
  const dur = attr.dur || '4'

  const parser = new DOMParser()
  const doc = parser.parseFromString(mei, 'application/xml')

  const el = doc.querySelector(`[*|id="${noteId}"]`)
  if (!el) return null

  const parent = el.parentNode
  const ns = el.namespaceURI || 'http://www.music-encoding.org/ns/mei'

  if (attr.pname) {
    // Note → Rest
    const rest = doc.createElementNS(ns, 'rest')
    rest.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:id', noteId)
    rest.setAttribute('dur', dur)
    parent.replaceChild(rest, el)
  } else {
    // Rest → Note
    const note = doc.createElementNS(ns, 'note')
    note.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:id', noteId)
    note.setAttribute('dur', dur)
    note.setAttribute('oct', '4')
    note.setAttribute('pname', 'c')
    parent.replaceChild(note, el)
  }

  const serializer = new XMLSerializer()
  mei = serializer.serializeToString(doc)

  toolkit.loadData(mei)
  return mei
}

// ──────── Chord (add note to same beat) ────────

export function addNoteToChord(toolkit, noteId) {
  let mei = toolkit.getMEI()
  const attr = toolkit.getElementAttr(noteId)
  if (!attr.pname) return null

  const id = newId()
  // New note a third above
  let idx = STEPS.indexOf(attr.pname)
  let oct = parseInt(attr.oct || '4')
  idx += 2 // third above
  if (idx >= STEPS.length) { idx -= STEPS.length; oct++ }

  const parser = new DOMParser()
  const doc = parser.parseFromString(mei, 'application/xml')

  const el = doc.querySelector(`[*|id="${noteId}"]`)
  if (!el) return null

  // Create new note element
  const ns = el.namespaceURI || 'http://www.music-encoding.org/ns/mei'
  const newNote = doc.createElementNS(ns, 'note')
  newNote.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:id', id)
  newNote.setAttribute('oct', String(oct))
  newNote.setAttribute('pname', STEPS[idx])

  const parent = el.parentNode
  if (parent && parent.tagName === 'chord') {
    // Already in a chord — just add
    parent.appendChild(newNote)
  } else {
    // Standalone note — wrap in chord
    const dur = el.getAttribute('dur') || '4'
    const durPpq = el.getAttribute('dur.ppq')

    const chord = doc.createElementNS(ns, 'chord')
    chord.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:id', newId())
    chord.setAttribute('dur', dur)
    if (durPpq) chord.setAttribute('dur.ppq', durPpq)

    // Remove dur from the original note (it's now on the chord)
    el.removeAttribute('dur')
    el.removeAttribute('dur.ppq')

    // Replace note with chord containing note + new note
    parent.replaceChild(chord, el)
    chord.appendChild(el)
    chord.appendChild(newNote)
  }

  const serializer = new XMLSerializer()
  mei = serializer.serializeToString(doc)

  toolkit.loadData(mei)
  return { mei, newId: id }
}

// ──────── Insert / Delete ────────

export function insertNoteAfter(toolkit, afterNoteId) {
  let mei = toolkit.getMEI()
  const attr = toolkit.getElementAttr(afterNoteId)
  const dur = attr.dur || '4'
  const id = newId()

  const parser = new DOMParser()
  const doc = parser.parseFromString(mei, 'application/xml')

  const el = doc.querySelector(`[*|id="${afterNoteId}"]`)
  if (!el) return null

  // Determine the container to insert into (layer, beam, or chord's parent)
  let insertParent = el.parentNode
  let insertAfter = el

  // If note is inside a chord, insert after the chord (not inside it)
  if (insertParent && insertParent.tagName === 'chord') {
    insertAfter = insertParent
    insertParent = insertParent.parentNode
  }

  const ns = el.namespaceURI || 'http://www.music-encoding.org/ns/mei'
  const newNote = doc.createElementNS(ns, 'note')
  newNote.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:id', id)
  newNote.setAttribute('dur', dur)
  newNote.setAttribute('oct', '4')
  newNote.setAttribute('pname', 'c')

  // Insert after the target element
  if (insertAfter.nextSibling) {
    insertParent.insertBefore(newNote, insertAfter.nextSibling)
  } else {
    insertParent.appendChild(newNote)
  }

  const serializer = new XMLSerializer()
  mei = serializer.serializeToString(doc)

  mei = cleanupBeams(mei)
  toolkit.loadData(mei)
  return { mei, newId: id }
}

export function deleteNote(toolkit, noteId) {
  let mei = toolkit.getMEI()

  // Use DOMParser for safe XML manipulation
  const parser = new DOMParser()
  const doc = parser.parseFromString(mei, 'application/xml')

  // Find the element by xml:id
  const el = doc.querySelector(`[*|id="${noteId}"]`)
  if (!el) return null

  const parent = el.parentNode
  const isInChord = parent && parent.tagName === 'chord'

  if (isInChord) {
    // Remove note from chord
    parent.removeChild(el)

    // Count remaining notes in chord
    const remaining = parent.querySelectorAll('note')
    if (remaining.length <= 1 && remaining.length > 0) {
      // Unwrap: move the dur from chord to the remaining note, then replace chord with note
      const lastNote = remaining[0]
      const chordDur = parent.getAttribute('dur')
      if (chordDur && !lastNote.getAttribute('dur')) {
        lastNote.setAttribute('dur', chordDur)
      }
      const chordDurPpq = parent.getAttribute('dur.ppq')
      if (chordDurPpq && !lastNote.getAttribute('dur.ppq')) {
        lastNote.setAttribute('dur.ppq', chordDurPpq)
      }
      parent.parentNode.replaceChild(lastNote, parent)
    } else if (remaining.length === 0) {
      // Empty chord, remove it
      parent.parentNode.removeChild(parent)
    }
  } else {
    // Regular note or rest — just remove
    parent.removeChild(el)
  }

  const serializer = new XMLSerializer()
  mei = serializer.serializeToString(doc)

  mei = cleanupBeams(mei)
  toolkit.loadData(mei)
  return mei
}

// ──────── Beaming ────────

/**
 * Safe beam cleanup: only removes empty beams and unwraps single-element beams.
 * Does NOT attempt to re-beam — that was causing score corruption.
 */
function cleanupBeams(mei) {
  // Remove empty beams
  mei = mei.replace(/<beam[^>]*>\s*<\/beam>/g, '')

  // Unwrap beams with only one child element
  // Use a loop since unwrapping may create new single-child beams
  let prev = ''
  while (prev !== mei) {
    prev = mei
    mei = mei.replace(
      /<beam([^>]*)>\s*((?:<(?:note|rest|chord)[^>]*(?:\/>|>[\s\S]*?<\/(?:note|rest|chord)>)\s*){1})\s*<\/beam>/g,
      (match, attrs, inner) => {
        const elements = inner.match(/<(note|rest|chord)/g) || []
        if (elements.length <= 1) return inner.trim()
        return match
      }
    )
  }

  return mei
}

// ──────── Add/Delete Measure (operates on MEI) ────────

export function addMeasureMEI(toolkit) {
  let mei = toolkit.getMEI()

  const measures = mei.match(/<measure[^>]*>/g) || []
  const newNum = measures.length + 1
  const id = newId()

  // Build a new measure with 4 quarter-note rests
  let notes = ''
  for (let i = 0; i < 4; i++) {
    notes += `<rest xml:id="${newId()}" dur="4"/>\n`
  }

  const newMeasure = `
<measure xml:id="${id}" n="${newNum}">
  <staff n="1">
    <layer n="1">
      ${notes}
    </layer>
  </staff>
</measure>`

  // Insert before </section>
  mei = mei.replace(/<\/section>/, `${newMeasure}\n</section>`)

  toolkit.loadData(mei)
  return mei
}

export function deleteLastMeasureMEI(toolkit) {
  let mei = toolkit.getMEI()
  const measures = mei.match(/<measure[\s\S]*?<\/measure>/g) || []
  if (measures.length <= 1) return null

  // Remove last measure
  const lastMeasure = measures[measures.length - 1]
  mei = mei.replace(lastMeasure, '')

  toolkit.loadData(mei)
  return mei
}

export function getMeasureCountMEI(toolkit) {
  const mei = toolkit.getMEI()
  return (mei.match(/<measure[^>]*>/g) || []).length
}
