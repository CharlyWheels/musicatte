/**
 * Editing operations on a {@link MeiDoc}.
 *
 * Every function takes the document plus what to change, mutates the DOM, and
 * returns either `null` (nothing changed, so no undo entry) or a result
 * object. Anything that creates an element returns its id so the caller can
 * select it.
 *
 * Two invariants the previous editor did not hold:
 *
 * - **Scope.** An operation touches the element or staff it names, never "the
 *   first match in the document".
 * - **Rhythm.** Inserting into a measure respects what is left of the bar.
 *   Notes used to be inserted with the duration of their neighbour regardless
 *   of whether the measure had room, which quietly overfilled it.
 */

import {
  DIATONIC,
  DUR_IN_QUARTERS,
  MEI_NS,
  XML_NS,
  durationInQuarters,
  findChild,
  isElement,
  layersOfMeasure,
  localName,
  midiOf,
  newId,
} from './mei.js'

const TIME_CONSUMING = new Set(['note', 'rest', 'chord', 'space', 'mRest'])

function ok(extra = {}) {
  return { changed: true, ...extra }
}

// ── pitch ────────────────────────────────────────────────────────────

/** Move a note by diatonic steps. Chord members move individually. */
export function changePitch(doc, id, steps) {
  const element = doc.byId(id)
  if (!element || !element.getAttribute('pname')) return null
  return shiftPitch(element, steps) ? ok() : null
}

function shiftPitch(element, steps) {
  const pname = (element.getAttribute('pname') || '').toLowerCase()
  let index = DIATONIC.indexOf(pname)
  if (index < 0) return false
  let octave = parseInt(element.getAttribute('oct') || '4', 10)

  index += steps
  while (index >= DIATONIC.length) {
    index -= DIATONIC.length
    octave += 1
  }
  while (index < 0) {
    index += DIATONIC.length
    octave -= 1
  }
  octave = Math.max(0, Math.min(9, octave))

  const nextName = DIATONIC[index]
  if (nextName === pname && String(octave) === element.getAttribute('oct')) return false
  element.setAttribute('pname', nextName)
  element.setAttribute('oct', String(octave))
  return true
}

/** Set an absolute pitch, used when entering notes by clicking or by letter. */
export function setPitch(doc, id, pname, octave) {
  const element = doc.byId(id)
  if (!element) return null
  if (localName(element) === 'rest') {
    const note = restToNote(doc, element, pname, octave)
    return note ? ok({ id: note.getAttribute('xml:id') }) : null
  }
  element.setAttribute('pname', pname)
  element.setAttribute('oct', String(octave))
  return ok()
}

/** Shift a selection by octaves. */
export function shiftOctave(doc, ids, delta) {
  if (!delta) return null
  let changed = false
  for (const id of ids) {
    const element = doc.byId(id)
    if (!element || !element.getAttribute('pname')) continue
    const octave = parseInt(element.getAttribute('oct') || '4', 10) + delta
    if (octave < 0 || octave > 9) continue
    element.setAttribute('oct', String(octave))
    changed = true
  }
  return changed ? ok() : null
}

/**
 * Transpose by semitones, spelling the result with the accidental that keeps
 * the letter closest to the original: a chromatic transposition of a written
 * pitch has to pick a spelling, and picking the nearest letter is what a
 * musician expects.
 */
export function transpose(doc, ids, semitones) {
  if (!semitones) return null
  let changed = false
  const targets = ids && ids.length ? ids : doc.events.map((e) => e.getAttribute('xml:id'))
  for (const id of targets) {
    const element = doc.byId(id)
    if (!element || !element.getAttribute('pname')) continue
    const midi = midiOf(element)
    if (midi == null) continue
    const spelled = spellMidi(midi + semitones, semitones > 0 ? 's' : 'f')
    if (!spelled) continue
    element.setAttribute('pname', spelled.pname)
    element.setAttribute('oct', String(spelled.octave))
    if (spelled.accid) element.setAttribute('accid', spelled.accid)
    else element.removeAttribute('accid')
    element.removeAttribute('accid.ges')
    changed = true
  }
  return changed ? ok() : null
}

const SHARP_SPELLING = [
  ['c', ''], ['c', 's'], ['d', ''], ['d', 's'], ['e', ''], ['f', ''],
  ['f', 's'], ['g', ''], ['g', 's'], ['a', ''], ['a', 's'], ['b', ''],
]
const FLAT_SPELLING = [
  ['c', ''], ['d', 'f'], ['d', ''], ['e', 'f'], ['e', ''], ['f', ''],
  ['g', 'f'], ['g', ''], ['a', 'f'], ['a', ''], ['b', 'f'], ['b', ''],
]

function spellMidi(midi, preference = 's') {
  if (midi < 0 || midi > 127) return null
  const table = preference === 'f' ? FLAT_SPELLING : SHARP_SPELLING
  const [pname, accid] = table[((midi % 12) + 12) % 12]
  return { pname, accid, octave: Math.floor(midi / 12) - 1 }
}

export { spellMidi }

// ── duration, dots, rests ────────────────────────────────────────────

export function changeDuration(doc, ids, dur) {
  let changed = false
  for (const id of ids) {
    const element = doc.byId(id)
    if (!element) continue
    // A chord member's duration lives on the chord.
    const target =
      isElement(element.parentNode) && localName(element.parentNode) === 'chord'
        ? element.parentNode
        : element
    if (target.getAttribute('dur') === dur) continue
    target.setAttribute('dur', dur)
    target.removeAttribute('dur.ppq')
    changed = true
  }
  if (!changed) return null
  cleanBeams(doc)
  return ok()
}

export function toggleDots(doc, ids, dots = 1) {
  let changed = false
  for (const id of ids) {
    const element = doc.byId(id)
    if (!element) continue
    const target =
      isElement(element.parentNode) && localName(element.parentNode) === 'chord'
        ? element.parentNode
        : element
    const current = parseInt(target.getAttribute('dots') || '0', 10)
    if (current === dots) target.removeAttribute('dots')
    else target.setAttribute('dots', String(dots))
    changed = true
  }
  return changed ? ok() : null
}

/** Swap a note for a rest of the same duration, or back again. */
export function toggleRest(doc, id) {
  const element = doc.byId(id)
  if (!element) return null
  const name = localName(element)
  if (name === 'note') {
    const parent = element.parentNode
    if (isElement(parent) && localName(parent) === 'chord') {
      // Turning one chord member into a rest is meaningless; replace the
      // whole chord.
      return replaceWithRest(doc, parent)
    }
    return replaceWithRest(doc, element)
  }
  if (name === 'rest') {
    const note = restToNote(doc, element)
    return note ? ok({ id: note.getAttribute('xml:id') }) : null
  }
  if (name === 'chord') return replaceWithRest(doc, element)
  return null
}

function replaceWithRest(doc, element) {
  const rest = doc.create('rest')
  copyAttributes(element, rest, ['dur', 'dots', 'dur.ppq'])
  element.parentNode.replaceChild(rest, element)
  cleanBeams(doc)
  return ok({ id: rest.getAttribute('xml:id') })
}

function restToNote(doc, rest, pname = 'c', octave = 4) {
  const note = doc.create('note')
  copyAttributes(rest, note, ['dur', 'dots', 'dur.ppq'])
  note.setAttribute('pname', pname)
  note.setAttribute('oct', String(octave))
  rest.parentNode.replaceChild(note, rest)
  return note
}

function copyAttributes(from, to, names) {
  for (const name of names) {
    const value = from.getAttribute(name)
    if (value != null) to.setAttribute(name, value)
  }
}

// ── accidentals ──────────────────────────────────────────────────────

export function changeAccidental(doc, ids, accid) {
  let changed = false
  for (const id of ids) {
    const element = doc.byId(id)
    if (!element || !element.getAttribute('pname')) continue
    if (accid) {
      element.setAttribute('accid', accid)
    } else {
      element.removeAttribute('accid')
      element.removeAttribute('accid.ges')
    }
    // Verovio also accepts accidentals as child elements; drop those so the
    // two spellings cannot disagree.
    for (const child of Array.from(element.children)) {
      if (localName(child) === 'accid') element.removeChild(child)
    }
    changed = true
  }
  return changed ? ok() : null
}

// ── ties and slurs ───────────────────────────────────────────────────

/**
 * Tie a note to the next one at the same pitch.
 *
 * A tie needs both ends. Writing `tie="i"` on its own -- which is what the
 * previous editor did -- leaves the tie unterminated, and Verovio draws it
 * running off into nothing.
 */
export function toggleTie(doc, id) {
  const element = doc.byId(id)
  if (!element || !element.getAttribute('pname')) return null

  const existing = element.getAttribute('tie')
  if (existing === 'i' || existing === 'm') {
    element.removeAttribute('tie')
    const next = nextPitchedEvent(doc, element)
    if (next) {
      const nextTie = next.getAttribute('tie')
      if (nextTie === 't') next.removeAttribute('tie')
      else if (nextTie === 'm') next.setAttribute('tie', 'i')
    }
    return ok()
  }

  const next = nextPitchedEvent(doc, element)
  if (!next) {
    return { changed: false, message: 'No hay una nota siguiente a la que ligar.' }
  }
  if (
    next.getAttribute('pname') !== element.getAttribute('pname') ||
    next.getAttribute('oct') !== element.getAttribute('oct')
  ) {
    return {
      changed: false,
      message: 'Una ligadura de unión necesita la misma nota. Usa una ligadura de expresión.',
    }
  }
  element.setAttribute('tie', element.getAttribute('tie') === 't' ? 'm' : 'i')
  next.setAttribute('tie', next.getAttribute('tie') === 'i' ? 'm' : 't')
  return ok()
}

/** A phrase mark between two selected notes. */
export function addSlur(doc, ids) {
  if (!ids || ids.length < 2) {
    return { changed: false, message: 'Selecciona al menos dos notas para la ligadura.' }
  }
  const first = doc.byId(ids[0])
  const last = doc.byId(ids[ids.length - 1])
  if (!first || !last) return null
  const measure = doc.measureOf(first)
  if (!measure) return null

  const slur = doc.create('slur')
  slur.setAttribute('startid', `#${ids[0]}`)
  slur.setAttribute('endid', `#${ids[ids.length - 1]}`)
  measure.appendChild(slur)
  return ok({ id: slur.getAttribute('xml:id') })
}

export function removeControlEvent(doc, id) {
  const element = doc.byId(id)
  if (!element) return null
  element.parentNode.removeChild(element)
  return ok()
}

function nextPitchedEvent(doc, element) {
  const events = doc.events.filter((event) => event.getAttribute('pname'))
  const index = events.indexOf(element)
  if (index < 0 || index + 1 >= events.length) return null
  return events[index + 1]
}

// ── articulations, dynamics, tempo, lyrics ───────────────────────────

/** Toggle an articulation (staccato, accent, tenuto, marcato, fermata). */
export function toggleArticulation(doc, ids, artic) {
  let changed = false
  for (const id of ids) {
    const element = doc.byId(id)
    if (!element) continue
    const target =
      isElement(element.parentNode) && localName(element.parentNode) === 'chord'
        ? element.parentNode
        : element
    const current = (target.getAttribute('artic') || '').split(/\s+/).filter(Boolean)
    const next = current.includes(artic)
      ? current.filter((value) => value !== artic)
      : [...current, artic]
    if (next.length) target.setAttribute('artic', next.join(' '))
    else target.removeAttribute('artic')
    changed = true
  }
  return changed ? ok() : null
}

/** A dynamic marking anchored to a note. */
export function addDynamic(doc, id, value) {
  const element = doc.byId(id)
  if (!element) return null
  const measure = doc.measureOf(element)
  if (!measure) return null

  // One dynamic per note: replace rather than stack.
  for (const existing of Array.from(measure.children)) {
    if (localName(existing) === 'dynam' && existing.getAttribute('startid') === `#${id}`) {
      measure.removeChild(existing)
    }
  }
  if (!value) return ok()

  const dynam = doc.create('dynam')
  dynam.setAttribute('startid', `#${id}`)
  dynam.setAttribute('place', 'below')
  dynam.textContent = value
  measure.appendChild(dynam)
  return ok({ id: dynam.getAttribute('xml:id') })
}

/** A crescendo or diminuendo spanning the selection. */
export function addHairpin(doc, ids, form = 'cres') {
  if (!ids || ids.length < 2) {
    return { changed: false, message: 'Selecciona al menos dos notas para el regulador.' }
  }
  const first = doc.byId(ids[0])
  const measure = first ? doc.measureOf(first) : null
  if (!measure) return null
  const hairpin = doc.create('hairpin')
  hairpin.setAttribute('startid', `#${ids[0]}`)
  hairpin.setAttribute('endid', `#${ids[ids.length - 1]}`)
  hairpin.setAttribute('form', form)
  hairpin.setAttribute('place', 'below')
  measure.appendChild(hairpin)
  return ok({ id: hairpin.getAttribute('xml:id') })
}

/** A tempo marking, optionally with a metronome mark. */
export function setTempo(doc, measureNumber, text, bpm) {
  const measure = doc.measureByNumber(measureNumber) || doc.measures[0]
  if (!measure) return null

  for (const existing of Array.from(measure.children)) {
    if (localName(existing) === 'tempo') measure.removeChild(existing)
  }
  if (!text && !bpm) return ok()

  const tempo = doc.create('tempo')
  tempo.setAttribute('place', 'above')
  tempo.setAttribute('staff', '1')
  tempo.setAttribute('tstamp', '1')
  if (bpm) {
    tempo.setAttribute('midi.bpm', String(bpm))
    tempo.setAttribute('mm', String(bpm))
    tempo.setAttribute('mm.unit', '4')
  }
  tempo.textContent = text || `♩ = ${bpm}`
  measure.appendChild(tempo)
  return ok({ id: tempo.getAttribute('xml:id') })
}

export function readTempo(doc) {
  for (const tempo of doc.allLoose('tempo')) {
    const bpm = tempo.getAttribute('midi.bpm') || tempo.getAttribute('mm')
    return { text: tempo.textContent.trim(), bpm: bpm ? parseInt(bpm, 10) : null }
  }
  return { text: '', bpm: null }
}

/** Set or clear the lyric syllable under a note. */
export function setLyric(doc, id, text, verse = 1) {
  const element = doc.byId(id)
  if (!element || localName(element) !== 'note') return null

  for (const child of Array.from(element.children)) {
    if (localName(child) === 'verse' && (child.getAttribute('n') || '1') === String(verse)) {
      element.removeChild(child)
    }
  }
  if (!text) return ok()

  const verseElement = doc.create('verse')
  verseElement.setAttribute('n', String(verse))
  const syl = doc.create('syl')
  syl.textContent = text
  verseElement.appendChild(syl)
  element.appendChild(verseElement)
  return ok()
}

export function readLyric(doc, id, verse = 1) {
  const element = doc.byId(id)
  if (!element) return ''
  for (const child of Array.from(element.children)) {
    if (localName(child) === 'verse' && (child.getAttribute('n') || '1') === String(verse)) {
      const syl = findChild(child, 'syl')
      return syl ? syl.textContent : ''
    }
  }
  return ''
}

// ── beams and tuplets ────────────────────────────────────────────────

/** Beam a selection of consecutive eighths or shorter. */
export function beamSelection(doc, ids) {
  const elements = ids.map((id) => doc.byId(id)).filter(Boolean).map(topLevelEvent)
  const unique = Array.from(new Set(elements))
  if (unique.length < 2) {
    return { changed: false, message: 'Selecciona al menos dos notas para barrar.' }
  }
  const parent = unique[0].parentNode
  if (!unique.every((element) => element.parentNode === parent)) {
    return { changed: false, message: 'Solo se pueden barrar notas del mismo compás y voz.' }
  }
  const beamable = unique.every((element) => {
    const dur = parseInt(element.getAttribute('dur') || '4', 10)
    return dur >= 8
  })
  if (!beamable) {
    return { changed: false, message: 'Solo se barran corcheas o figuras más breves.' }
  }

  const beam = doc.create('beam')
  parent.insertBefore(beam, unique[0])
  for (const element of unique) beam.appendChild(element)
  return ok({ id: beam.getAttribute('xml:id') })
}

/** Take a selection out of its beams. */
export function unbeamSelection(doc, ids) {
  let changed = false
  for (const id of ids) {
    const element = doc.byId(id)
    if (!element) continue
    let node = topLevelEvent(element)
    while (isElement(node.parentNode) && localName(node.parentNode) === 'beam') {
      const beam = node.parentNode
      const grandparent = beam.parentNode
      while (beam.firstChild) grandparent.insertBefore(beam.firstChild, beam)
      grandparent.removeChild(beam)
      changed = true
      node = topLevelEvent(element)
    }
  }
  return changed ? ok() : null
}

/**
 * Group a selection into a tuplet.
 *
 * Missing entirely before, and triplets are common enough that the editor was
 * unusable for a great deal of ordinary music without them.
 */
export function makeTuplet(doc, ids, num = 3, numbase = 2) {
  const elements = Array.from(
    new Set(ids.map((id) => doc.byId(id)).filter(Boolean).map(topLevelEvent)),
  )
  if (elements.length < 2) {
    return { changed: false, message: `Selecciona las notas del grupo (${num}).` }
  }
  const parent = elements[0].parentNode
  if (!elements.every((element) => element.parentNode === parent)) {
    return { changed: false, message: 'Las notas del grupo deben estar en el mismo compás y voz.' }
  }
  if (isElement(parent) && localName(parent) === 'tuplet') {
    return { changed: false, message: 'Esas notas ya forman un grupo irregular.' }
  }

  const tuplet = doc.create('tuplet')
  tuplet.setAttribute('num', String(num))
  tuplet.setAttribute('numbase', String(numbase))
  tuplet.setAttribute('num.place', 'above')
  tuplet.setAttribute('bracket.visible', 'true')
  parent.insertBefore(tuplet, elements[0])
  for (const element of elements) tuplet.appendChild(element)
  return ok({ id: tuplet.getAttribute('xml:id') })
}

export function removeTuplet(doc, ids) {
  let changed = false
  for (const id of ids) {
    const element = doc.byId(id)
    if (!element) continue
    let node = topLevelEvent(element)
    while (isElement(node.parentNode) && localName(node.parentNode) === 'tuplet') {
      const tuplet = node.parentNode
      const grandparent = tuplet.parentNode
      while (tuplet.firstChild) grandparent.insertBefore(tuplet.firstChild, tuplet)
      grandparent.removeChild(tuplet)
      changed = true
      node = topLevelEvent(element)
    }
  }
  return changed ? ok() : null
}

/**
 * Drop beams that no longer group anything.
 *
 * Only ever removes; it never tries to re-beam. Automatic re-beaming is what
 * used to corrupt documents, and beaming is now an explicit action.
 */
export function cleanBeams(doc) {
  let changed = false
  for (const beam of [...doc.allLoose('beam')]) {
    const events = Array.from(beam.children).filter((child) =>
      TIME_CONSUMING.has(localName(child)),
    )
    if (events.length >= 2) continue
    const parent = beam.parentNode
    if (!parent) continue
    while (beam.firstChild) parent.insertBefore(beam.firstChild, beam)
    parent.removeChild(beam)
    changed = true
  }
  return changed
}

function topLevelEvent(element) {
  // A chord member is represented by its chord for grouping purposes.
  if (isElement(element.parentNode) && localName(element.parentNode) === 'chord') {
    return element.parentNode
  }
  return element
}

// ── chords ───────────────────────────────────────────────────────────

/** Add a note above the selected one, wrapping it in a chord if needed. */
export function addChordNote(doc, id, interval = 2) {
  const element = doc.byId(id)
  if (!element || !element.getAttribute('pname')) return null

  const note = doc.create('note')
  note.setAttribute('pname', element.getAttribute('pname'))
  note.setAttribute('oct', element.getAttribute('oct') || '4')
  const accid = element.getAttribute('accid')
  if (accid) note.setAttribute('accid', accid)
  shiftPitch(note, interval)

  const parent = element.parentNode
  if (isElement(parent) && localName(parent) === 'chord') {
    parent.appendChild(note)
    return ok({ id: note.getAttribute('xml:id') })
  }

  const chord = doc.create('chord')
  copyAttributes(element, chord, ['dur', 'dots', 'dur.ppq', 'artic', 'stem.dir'])
  element.removeAttribute('dur')
  element.removeAttribute('dots')
  element.removeAttribute('dur.ppq')
  parent.replaceChild(chord, element)
  chord.appendChild(element)
  chord.appendChild(note)
  return ok({ id: note.getAttribute('xml:id') })
}

// ── inserting and deleting events ────────────────────────────────────

/**
 * Insert a note or rest after an element, sized to fit what is left of the bar.
 *
 * The bar's remaining space is the point. Inserting a note with its
 * neighbour's duration, as the old editor did, overfills the measure; Verovio
 * renders the overflow without complaint and the score is quietly wrong.
 */
export function insertAfter(doc, id, options = {}) {
  const anchor = doc.byId(id)
  if (!anchor) return null
  const reference = topLevelEvent(anchor)
  const parent = reference.parentNode
  const measure = doc.measureOf(reference)
  if (!measure) return null

  const wanted = options.dur || reference.getAttribute('dur') || '4'

  // Inserting beside a whole-measure rest means filling that empty bar, so
  // the placeholder goes away rather than blocking the insertion.
  if (localName(reference) === 'mRest') {
    const layer = reference.parentNode
    layer.removeChild(reference)
    const created = options.rest ? doc.create('rest') : doc.create('note')
    created.setAttribute('dur', wanted)
    if (!options.rest) {
      created.setAttribute('pname', options.pname || 'c')
      created.setAttribute('oct', String(options.octave ?? 4))
    }
    layer.appendChild(created)
    return ok({ id: created.getAttribute('xml:id') })
  }

  const layerInfo = fillForElement(doc, reference)
  const remaining = layerInfo ? layerInfo.expected - layerInfo.filled : null

  let dur = wanted
  if (remaining != null && remaining > 1e-6) {
    dur = largestDurationFitting(remaining, wanted)
  } else if (remaining != null) {
    return {
      changed: false,
      message: `El compás ${doc.measureNumber(reference)} ya está completo. Añade un compás o acorta una figura.`,
    }
  }

  const element = options.rest ? doc.create('rest') : doc.create('note')
  element.setAttribute('dur', dur)
  if (!options.rest) {
    element.setAttribute('pname', options.pname || reference.getAttribute('pname') || 'c')
    element.setAttribute('oct', String(options.octave ?? reference.getAttribute('oct') ?? 4))
  }

  parent.insertBefore(element, reference.nextSibling)
  cleanBeams(doc)
  return ok({ id: element.getAttribute('xml:id') })
}

/** Append an event to the end of a measure's layer, sized to the space left. */
export function appendToMeasure(doc, measureNumber, options = {}) {
  const measure = doc.measureByNumber(measureNumber)
  if (!measure) return null
  const layers = layersOfMeasure(measure)
  const staffWanted = String(options.staff || 1)
  const layer =
    layers.find((candidate) => {
      const staff = candidate.parentNode
      return (staff.getAttribute('n') || '1') === staffWanted
    }) || layers[0]
  if (!layer) return null

  // A whole-measure rest is a placeholder for an empty bar, not content. It
  // counts as a full measure when checking whether the rhythm adds up, which
  // meant a freshly added measure reported itself as complete and could never
  // be given any notes.
  const placeholder = clearPlaceholderRest(layer)

  const fills = doc.measureFill(measure)
  const fill =
    fills.find(
      (candidate) =>
        candidate.staff === staffWanted &&
        candidate.layer === (layer.getAttribute('n') || '1'),
    ) || fills[0]
  const remaining = fill ? fill.expected - fill.filled : 4
  if (remaining <= 1e-6) {
    if (placeholder) layer.appendChild(placeholder)
    return { changed: false, message: `El compás ${measureNumber} ya está completo.` }
  }

  const dur = largestDurationFitting(remaining, options.dur || '4')
  const element = options.rest ? doc.create('rest') : doc.create('note')
  element.setAttribute('dur', dur)
  if (!options.rest) {
    element.setAttribute('pname', options.pname || 'c')
    element.setAttribute('oct', String(options.octave ?? 4))
  }
  layer.appendChild(element)
  return ok({ id: element.getAttribute('xml:id') })
}

/**
 * Remove a layer's whole-measure rest, if that is all it holds.
 *
 * Returns the removed element so the caller can put it back when it turns out
 * there was nothing to add after all.
 */
function clearPlaceholderRest(layer) {
  const children = Array.from(layer.children).filter((child) =>
    TIME_CONSUMING.has(localName(child)),
  )
  if (children.length !== 1) return null
  if (localName(children[0]) !== 'mRest') return null
  layer.removeChild(children[0])
  return children[0]
}

function fillForElement(doc, element) {
  const measure = doc.measureOf(element)
  if (!measure) return null
  let layer = element.parentNode
  while (isElement(layer) && localName(layer) !== 'layer') layer = layer.parentNode
  if (!isElement(layer)) return null
  const staff = layer.parentNode
  const staffNumber = staff.getAttribute('n') || '1'
  const layerNumber = layer.getAttribute('n') || '1'
  return (
    doc
      .measureFill(measure)
      .find((fill) => fill.staff === staffNumber && fill.layer === layerNumber) || null
  )
}

const DURATION_ORDER = ['1', '2', '4', '8', '16', '32', '64']

function largestDurationFitting(remaining, preferred) {
  const preferredValue = DUR_IN_QUARTERS[preferred]
  if (preferredValue != null && preferredValue <= remaining + 1e-6) return preferred
  for (const dur of DURATION_ORDER) {
    if (DUR_IN_QUARTERS[dur] <= remaining + 1e-6) return dur
  }
  return '64'
}

export function deleteEvents(doc, ids) {
  let changed = false
  for (const id of ids) {
    const element = doc.byId(id)
    if (!element) continue
    const parent = element.parentNode
    if (!isElement(parent)) continue

    // Remove any slur, tie or dynamic that pointed at it, so no dangling
    // references are left behind.
    detachReferences(doc, id)

    if (localName(parent) === 'chord') {
      parent.removeChild(element)
      const members = Array.from(parent.children).filter(
        (child) => localName(child) === 'note',
      )
      if (members.length === 1) {
        const survivor = members[0]
        copyAttributes(parent, survivor, ['dur', 'dots', 'dur.ppq', 'artic'])
        parent.parentNode.replaceChild(survivor, parent)
      } else if (members.length === 0) {
        parent.parentNode.removeChild(parent)
      }
    } else {
      parent.removeChild(element)
    }
    changed = true
  }
  if (!changed) return null
  cleanBeams(doc)
  return ok()
}

function detachReferences(doc, id) {
  const reference = `#${id}`
  for (const name of ['slur', 'tie', 'dynam', 'hairpin', 'fermata', 'trill']) {
    for (const element of [...doc.allLoose(name)]) {
      if (
        element.getAttribute('startid') === reference ||
        element.getAttribute('endid') === reference
      ) {
        element.parentNode.removeChild(element)
      }
    }
  }
}

// ── measures ─────────────────────────────────────────────────────────

/**
 * Insert a measure, with a full set of staves and layers.
 *
 * The old version emitted a hardcoded `<staff n="1">`, so a measure added to
 * a piano score came out missing its lower staff. Verovio renders that without
 * complaint, which is what made it hard to notice.
 */
export function insertMeasure(doc, afterNumber = null) {
  const section = doc.section
  if (!section) return null
  const measures = doc.measures
  const measure = doc.create('measure')

  const layout = staffLayout(doc)
  for (const { staff: staffNumber, layers } of layout) {
    const staff = doc.create('staff')
    staff.setAttribute('n', staffNumber)
    for (const layerNumber of layers) {
      const layer = doc.create('layer')
      layer.setAttribute('n', layerNumber)
      const rest = doc.create('mRest')
      layer.appendChild(rest)
      staff.appendChild(layer)
    }
    measure.appendChild(staff)
  }

  const reference = afterNumber ? doc.measureByNumber(afterNumber) : measures[measures.length - 1]
  if (reference && reference.parentNode) {
    reference.parentNode.insertBefore(measure, reference.nextSibling)
  } else {
    section.appendChild(measure)
  }

  renumberMeasures(doc)
  return ok({ id: measure.getAttribute('xml:id'), number: measure.getAttribute('n') })
}

/** Which staves and layers this score uses, taken from an existing measure. */
function staffLayout(doc) {
  const template = doc.measures.find((measure) =>
    Array.from(measure.children).some((child) => localName(child) === 'staff'),
  )
  if (!template) {
    return [{ staff: '1', layers: ['1'] }]
  }
  const layout = []
  for (const staff of Array.from(template.children)) {
    if (localName(staff) !== 'staff') continue
    const layers = Array.from(staff.children)
      .filter((child) => localName(child) === 'layer')
      .map((layer) => layer.getAttribute('n') || '1')
    layout.push({ staff: staff.getAttribute('n') || '1', layers: layers.length ? layers : ['1'] })
  }
  return layout.length ? layout : [{ staff: '1', layers: ['1'] }]
}

export function deleteMeasure(doc, number) {
  const measures = doc.measures
  if (measures.length <= 1) {
    return { changed: false, message: 'Una partitura necesita al menos un compás.' }
  }
  const measure = doc.measureByNumber(number)
  if (!measure) return null
  // Drop control events that pointed into this measure.
  for (const element of Array.from(measure.querySelectorAll('*'))) {
    const id = element.getAttributeNS(XML_NS, 'id') || element.getAttribute('xml:id')
    if (id) detachReferences(doc, id)
  }
  measure.parentNode.removeChild(measure)
  renumberMeasures(doc)
  return ok()
}

/** Renumber measures from 1. The old delete left gaps in the numbering. */
export function renumberMeasures(doc) {
  doc.measures.forEach((measure, index) => {
    measure.setAttribute('n', String(index + 1))
  })
}

/** Clear a measure's contents back to whole-measure rests. */
export function clearMeasure(doc, number) {
  const measure = doc.measureByNumber(number)
  if (!measure) return null
  for (const layer of layersOfMeasure(measure)) {
    while (layer.firstChild) layer.removeChild(layer.firstChild)
    layer.appendChild(doc.create('mRest'))
  }
  return ok()
}

// ── barlines and repeats ─────────────────────────────────────────────

export const BARLINE_FORMS = {
  single: '',
  dbl: 'dbl',
  end: 'end',
  'rptstart': 'rptstart',
  'rptend': 'rptend',
  'rptboth': 'rptboth',
}

export function setBarline(doc, number, form) {
  const measure = doc.measureByNumber(number)
  if (!measure) return null
  if (!form) measure.removeAttribute('right')
  else measure.setAttribute('right', form)
  return ok()
}

export function readBarline(doc, number) {
  const measure = doc.measureByNumber(number)
  return measure ? measure.getAttribute('right') || '' : ''
}

/** A volta bracket ("1.", "2.") over a run of measures. */
export function addVolta(doc, fromNumber, toNumber, label) {
  const from = doc.measureByNumber(fromNumber)
  const to = doc.measureByNumber(toNumber) || from
  if (!from || !to) return null
  const ending = doc.create('ending')
  ending.setAttribute('n', label || '1')
  ending.setAttribute('label', label || '1')
  const section = doc.section
  if (!section) return null
  section.insertBefore(ending, from)
  let node = from
  while (node) {
    const next = node.nextSibling
    ending.appendChild(node)
    if (node === to) break
    node = next
  }
  return ok({ id: ending.getAttribute('xml:id') })
}

// ── staff properties ─────────────────────────────────────────────────

/**
 * Change a clef, on the staff asked for.
 *
 * `changeClef` used to replace the first `<clef>` element anywhere in the
 * document, which on a grand staff meant the bass clef could never be changed
 * and the picker permanently claimed treble.
 */
export function changeClef(doc, staffNumber, shape, line) {
  const def = doc.staffDef(staffNumber)
  if (!def) return null
  const clef = findChild(def, 'clef')
  if (clef) {
    clef.setAttribute('shape', shape)
    clef.setAttribute('line', line)
  } else {
    def.setAttribute('clef.shape', shape)
    def.setAttribute('clef.line', line)
  }
  return ok()
}

export function changeKeySignature(doc, staffNumber, sig, applyToAll = true) {
  const defs = applyToAll ? doc.staffDefs : [doc.staffDef(staffNumber)].filter(Boolean)
  if (!defs.length) return null
  for (const def of defs) {
    const keySig = findChild(def, 'keySig')
    if (keySig) keySig.setAttribute('sig', sig)
    else def.setAttribute('key.sig', sig)
  }
  return ok()
}

export function changeTimeSignature(doc, staffNumber, count, unit, applyToAll = true) {
  const defs = applyToAll ? doc.staffDefs : [doc.staffDef(staffNumber)].filter(Boolean)
  if (!defs.length) return null
  for (const def of defs) {
    const meterSig = findChild(def, 'meterSig')
    if (meterSig) {
      meterSig.setAttribute('count', count)
      meterSig.setAttribute('unit', unit)
    } else {
      def.setAttribute('meter.count', count)
      def.setAttribute('meter.unit', unit)
    }
  }
  return ok()
}

/** A key, time or clef change from a given measure onwards. */
export function addMidScoreChange(doc, measureNumber, change) {
  const measure = doc.measureByNumber(measureNumber)
  if (!measure) return null
  const staves = Array.from(measure.children).filter((child) => localName(child) === 'staff')
  if (!staves.length) return null

  let changed = false
  for (const staff of staves) {
    const layer = Array.from(staff.children).find((child) => localName(child) === 'layer')
    if (!layer) continue
    if (change.clef && (change.staff == null || String(change.staff) === (staff.getAttribute('n') || '1'))) {
      const clef = doc.create('clef')
      clef.setAttribute('shape', change.clef.shape)
      clef.setAttribute('line', change.clef.line)
      layer.insertBefore(clef, layer.firstChild)
      changed = true
    }
    if (change.keySig != null) {
      const keySig = doc.create('keySig')
      keySig.setAttribute('sig', change.keySig)
      layer.insertBefore(keySig, layer.firstChild)
      changed = true
    }
    if (change.meter) {
      const meterSig = doc.create('meterSig')
      meterSig.setAttribute('count', change.meter.count)
      meterSig.setAttribute('unit', change.meter.unit)
      layer.insertBefore(meterSig, layer.firstChild)
      changed = true
    }
  }
  return changed ? ok() : null
}

// ── staves and voices ────────────────────────────────────────────────

/** Add a staff to the score: every measure gets one, so nothing is left ragged. */
export function addStaff(doc, { clefShape = 'F', clefLine = '4', label = '' } = {}) {
  const defs = doc.staffDefs
  if (!defs.length) return null
  const reference = defs[defs.length - 1]
  const number = String(defs.length + 1)

  const def = doc.create('staffDef')
  def.setAttribute('n', number)
  def.setAttribute('lines', '5')
  if (label) def.setAttribute('label', label)
  const clef = doc.create('clef')
  clef.setAttribute('shape', clefShape)
  clef.setAttribute('line', clefLine)
  def.appendChild(clef)
  const source = doc.staffProperties(reference.getAttribute('n') || '1')
  if (source) {
    const keySig = doc.create('keySig')
    keySig.setAttribute('sig', source.keySig)
    def.appendChild(keySig)
    const meterSig = doc.create('meterSig')
    meterSig.setAttribute('count', source.meterCount)
    meterSig.setAttribute('unit', source.meterUnit)
    def.appendChild(meterSig)
  }
  reference.parentNode.insertBefore(def, reference.nextSibling)

  for (const measure of doc.measures) {
    const staff = doc.create('staff')
    staff.setAttribute('n', number)
    const layer = doc.create('layer')
    layer.setAttribute('n', '1')
    layer.appendChild(doc.create('mRest'))
    staff.appendChild(layer)
    const staves = Array.from(measure.children).filter((child) => localName(child) === 'staff')
    const last = staves[staves.length - 1]
    if (last) measure.insertBefore(staff, last.nextSibling)
    else measure.appendChild(staff)
  }
  return ok({ staff: number })
}

export function removeStaff(doc, staffNumber) {
  const defs = doc.staffDefs
  if (defs.length <= 1) {
    return { changed: false, message: 'La partitura necesita al menos un pentagrama.' }
  }
  const wanted = String(staffNumber)
  const def = doc.staffDef(wanted)
  if (!def) return null
  def.parentNode.removeChild(def)
  for (const measure of doc.measures) {
    for (const staff of Array.from(measure.children)) {
      if (localName(staff) === 'staff' && (staff.getAttribute('n') || '1') === wanted) {
        measure.removeChild(staff)
      }
    }
  }
  // Renumber the remaining staves so they stay 1..n.
  doc.staffDefs.forEach((remaining, index) => {
    const from = remaining.getAttribute('n')
    const to = String(index + 1)
    remaining.setAttribute('n', to)
    if (from === to) return
    for (const measure of doc.measures) {
      for (const staff of Array.from(measure.children)) {
        if (localName(staff) === 'staff' && staff.getAttribute('n') === from) {
          staff.setAttribute('n', to)
        }
      }
    }
  })
  return ok()
}

/** Add a second voice to a staff, so two independent lines can share it. */
export function addLayer(doc, staffNumber) {
  const wanted = String(staffNumber)
  let changed = false
  for (const measure of doc.measures) {
    for (const staff of Array.from(measure.children)) {
      if (localName(staff) !== 'staff') continue
      if ((staff.getAttribute('n') || '1') !== wanted) continue
      const layers = Array.from(staff.children).filter(
        (child) => localName(child) === 'layer',
      )
      const layer = doc.create('layer')
      layer.setAttribute('n', String(layers.length + 1))
      layer.appendChild(doc.create('mRest'))
      staff.appendChild(layer)
      changed = true
    }
  }
  return changed ? ok() : null
}

export function removeLayer(doc, staffNumber, layerNumber) {
  const wantedStaff = String(staffNumber)
  const wantedLayer = String(layerNumber)
  let changed = false
  for (const measure of doc.measures) {
    for (const staff of Array.from(measure.children)) {
      if (localName(staff) !== 'staff') continue
      if ((staff.getAttribute('n') || '1') !== wantedStaff) continue
      const layers = Array.from(staff.children).filter(
        (child) => localName(child) === 'layer',
      )
      if (layers.length <= 1) continue
      const layer = layers.find((candidate) => (candidate.getAttribute('n') || '1') === wantedLayer)
      if (layer) {
        staff.removeChild(layer)
        changed = true
      }
    }
  }
  return changed ? ok() : null
}

// ── copy and paste ───────────────────────────────────────────────────

/** Serialise a selection so it can be pasted elsewhere. */
export function copyEvents(doc, ids) {
  const elements = Array.from(
    new Set(ids.map((id) => doc.byId(id)).filter(Boolean).map(topLevelEvent)),
  )
  if (!elements.length) return null
  const serializer = new XMLSerializer()
  return elements.map((element) => serializer.serializeToString(element))
}

/** Paste previously copied events after an element, respecting the bar. */
export function pasteEvents(doc, id, snippets) {
  if (!snippets || !snippets.length) return null
  const anchor = doc.byId(id)
  if (!anchor) return null
  const reference = topLevelEvent(anchor)
  const parent = reference.parentNode

  const fill = fillForElement(doc, reference)
  let remaining = fill ? fill.expected - fill.filled : Infinity

  let insertAfterNode = reference
  const inserted = []
  for (const snippet of snippets) {
    const fragment = new DOMParser().parseFromString(snippet, 'application/xml')
    const element = fragment.documentElement
    if (!element || element.nodeName === 'parsererror') continue
    const imported = doc.doc.importNode(element, true)
    // Fresh ids: pasted content must not collide with what it was copied from.
    reassignIds(doc, imported)
    const cost = durationInQuarters(imported)
    if (cost > remaining + 1e-6) break
    remaining -= cost
    parent.insertBefore(imported, insertAfterNode.nextSibling)
    insertAfterNode = imported
    inserted.push(imported.getAttributeNS(XML_NS, 'id') || imported.getAttribute('xml:id'))
  }
  if (!inserted.length) {
    return { changed: false, message: 'No queda espacio en el compás para pegar eso.' }
  }
  cleanBeams(doc)
  return ok({ ids: inserted, partial: inserted.length < snippets.length })
}

function reassignIds(doc, root) {
  const assign = (element) => {
    element.setAttributeNS(XML_NS, 'xml:id', newId(localName(element)[0]))
    for (const child of Array.from(element.children)) assign(child)
  }
  assign(root)
  // Copied slurs and ties referenced the originals; those references are
  // meaningless now.
  for (const element of Array.from(root.querySelectorAll('*'))) {
    element.removeAttribute('startid')
    element.removeAttribute('endid')
  }
  root.removeAttribute('startid')
  root.removeAttribute('endid')
  void doc
}

export { MEI_NS }
