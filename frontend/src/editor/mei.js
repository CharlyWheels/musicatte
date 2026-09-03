/**
 * The score document: an MEI DOM, edited through the DOM.
 *
 * This replaces string surgery with regular expressions over the serialised
 * MEI. That approach failed in ways that were invisible until a score was
 * already broken: `changeClef` replaced the first `<clef>` match in the whole
 * document, so on a grand staff the bass clef could never be changed and the
 * picker always claimed treble; `addMeasure` emitted a hardcoded
 * `<staff n="1">`, so a measure appended to a piano score silently lost its
 * lower staff; attribute removal deleted the first match after an id rather
 * than the one on that element.
 *
 * Every operation here works on real nodes, is scoped to the element or staff
 * it names, and returns whether it changed anything so the caller can decide
 * whether to push an undo entry.
 */

export const MEI_NS = 'http://www.music-encoding.org/ns/mei'
export const XML_NS = 'http://www.w3.org/XML/1998/namespace'

const DIATONIC = ['c', 'd', 'e', 'f', 'g', 'a', 'b']
// Semitones above C for each diatonic step, used for transposition and playback.
const STEP_SEMITONES = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }

/** Duration values as MEI writes them, in quarter notes. */
export const DUR_IN_QUARTERS = {
  long: 16,
  breve: 8,
  1: 4,
  2: 2,
  4: 1,
  8: 0.5,
  16: 0.25,
  32: 0.125,
  64: 0.0625,
}

let idCounter = 0

/** A document-unique id. Prefixed so generated ids are recognisable. */
export function newId(prefix = 'm') {
  idCounter += 1
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`
}

function isElement(node) {
  return node && node.nodeType === 1
}

/** Local name without a namespace prefix, for documents that carry one. */
function local(node) {
  return node.localName || node.nodeName.replace(/^.*:/, '')
}

export function localName(node) {
  return local(node)
}

/**
 * The duration an element occupies, in quarter notes, dots and tuplets included.
 * Returns 0 for anything that does not consume time (a chord member, a grace note).
 */
export function durationInQuarters(element) {
  if (!isElement(element)) return 0
  const name = local(element)
  if (name === 'chord') {
    const base = DUR_IN_QUARTERS[element.getAttribute('dur')]
    if (base == null) return 0
    return applyDots(base, element.getAttribute('dots')) * tupletFactor(element)
  }
  if (name !== 'note' && name !== 'rest' && name !== 'space' && name !== 'mRest') return 0
  if (name === 'mRest') return 0 // fills whatever the measure needs
  if (element.getAttribute('grace')) return 0
  // A note inside a chord takes its duration from the chord.
  const parent = element.parentNode
  if (isElement(parent) && local(parent) === 'chord') return 0
  const base = DUR_IN_QUARTERS[element.getAttribute('dur')]
  if (base == null) return 0
  return applyDots(base, element.getAttribute('dots')) * tupletFactor(element)
}

function applyDots(base, dots) {
  const count = parseInt(dots || '0', 10)
  if (!count) return base
  let total = base
  let increment = base
  for (let i = 0; i < count; i += 1) {
    increment /= 2
    total += increment
  }
  return total
}

/** Tuplets scale everything inside them: a triplet's notes each last 2/3. */
function tupletFactor(element) {
  let node = element.parentNode
  let factor = 1
  while (isElement(node)) {
    if (local(node) === 'tuplet') {
      const num = parseInt(node.getAttribute('num') || '3', 10)
      const numbase = parseInt(node.getAttribute('numbase') || '2', 10)
      if (num > 0 && numbase > 0) factor *= numbase / num
    }
    node = node.parentNode
  }
  return factor
}

/** MIDI note number for a note element, or null for a rest. */
export function midiOf(element) {
  if (!isElement(element)) return null
  const pname = element.getAttribute('pname')
  if (!pname) return null
  const octave = parseInt(element.getAttribute('oct') || '4', 10)
  const step = STEP_SEMITONES[pname.toLowerCase()]
  if (step == null) return null
  const accid = element.getAttribute('accid') || element.getAttribute('accid.ges') || ''
  const alter =
    { s: 1, f: -1, ss: 2, ff: -2, x: 2, n: 0, '': 0 }[accid] ?? 0
  return (octave + 1) * 12 + step + alter
}

export class MeiDoc {
  constructor(xml) {
    const parsed = new DOMParser().parseFromString(xml, 'application/xml')
    const error = parsed.querySelector('parsererror')
    if (error) throw new Error(`MEI no válido: ${error.textContent.slice(0, 200)}`)
    this.doc = parsed
  }

  clone() {
    return new MeiDoc(this.toString())
  }

  toString() {
    return new XMLSerializer().serializeToString(this.doc)
  }

  // ── queries ──────────────────────────────────────────────────────────

  create(name) {
    const element = this.doc.createElementNS(MEI_NS, name)
    element.setAttributeNS(XML_NS, 'xml:id', newId(name[0]))
    return element
  }

  /**
   * Find an element by its xml:id.
   *
   * Not `querySelector('[*|id="..."]')`: the namespace-wildcard attribute
   * selector is not supported everywhere (jsdom's selector engine rejects it
   * outright), so that lookup silently returned null and every edit became a
   * no-op. An index is both portable and faster than a selector scan.
   *
   * The index is rebuilt when the element count changes, which covers every
   * insertion and deletion, and a miss forces one rebuild before giving up.
   */
  byId(id) {
    if (!id) return null
    const index = this.#index()
    const found = index.get(id)
    if (found) return found
    // A miss might mean the index is stale rather than the id being absent.
    const rebuilt = this.#index(true)
    return rebuilt.get(id) || null
  }

  #index(force = false) {
    const elements = this.doc.getElementsByTagName('*')
    if (!force && this._index && this._indexSize === elements.length) {
      return this._index
    }
    const map = new Map()
    for (let i = 0; i < elements.length; i += 1) {
      const element = elements[i]
      const id =
        element.getAttributeNS(XML_NS, 'id') || element.getAttribute('xml:id') || null
      if (id) map.set(id, element)
    }
    this._index = map
    this._indexSize = elements.length
    return map
  }

  /** Force the id index to be rebuilt. */
  invalidateIndex() {
    this._index = null
    this._indexSize = -1
  }

  all(name) {
    return Array.from(this.doc.getElementsByTagNameNS(MEI_NS, name))
  }

  /** Fallback for documents serialised without the MEI namespace. */
  allLoose(name) {
    const namespaced = this.all(name)
    if (namespaced.length) return namespaced
    return Array.from(this.doc.getElementsByTagName(name))
  }

  get staffDefs() {
    return this.allLoose('staffDef')
  }

  get measures() {
    return this.allLoose('measure')
  }

  get staffCount() {
    return Math.max(1, this.staffDefs.length)
  }

  get section() {
    return this.allLoose('section')[0] || null
  }

  /** The staffDef for a staff number, or the first one. */
  staffDef(staffNumber = 1) {
    const wanted = String(staffNumber)
    return this.staffDefs.find((def) => (def.getAttribute('n') || '1') === wanted) || null
  }

  /**
   * Clef, key and meter for one staff.
   *
   * Scoped to the staff, which is the whole point: the previous
   * implementation read the first match in the document, so on a grand staff
   * it reported the treble clef as if it were the only one.
   */
  staffProperties(staffNumber = 1) {
    const def = this.staffDef(staffNumber)
    if (!def) return null
    const read = (name, attr, fallbackAttr) => {
      const child = childByName(def, name)
      if (child) return child.getAttribute(attr) || ''
      return def.getAttribute(fallbackAttr) || ''
    }
    return {
      staff: String(staffNumber),
      clefShape: read('clef', 'shape', 'clef.shape') || 'G',
      clefLine: read('clef', 'line', 'clef.line') || '2',
      keySig: read('keySig', 'sig', 'key.sig') || '0',
      meterCount: read('meterSig', 'count', 'meter.count') || '4',
      meterUnit: read('meterSig', 'unit', 'meter.unit') || '4',
      label: def.getAttribute('label') || '',
    }
  }

  allStaffProperties() {
    return this.staffDefs.map((def) => this.staffProperties(def.getAttribute('n') || '1'))
  }

  get title() {
    const title = this.allLoose('title')[0]
    return title ? title.textContent.trim() : ''
  }

  set title(value) {
    let title = this.allLoose('title')[0]
    if (!title) {
      const titleStmt =
        this.allLoose('titleStmt')[0] ||
        (() => {
          const fileDesc = this.allLoose('fileDesc')[0]
          if (!fileDesc) return null
          const created = this.doc.createElementNS(MEI_NS, 'titleStmt')
          fileDesc.insertBefore(created, fileDesc.firstChild)
          return created
        })()
      if (!titleStmt) return
      title = this.doc.createElementNS(MEI_NS, 'title')
      titleStmt.appendChild(title)
    }
    title.textContent = value
  }

  get composer() {
    const composer = this.allLoose('composer')[0]
    return composer ? composer.textContent.trim() : ''
  }

  set composer(value) {
    let composer = this.allLoose('composer')[0]
    if (!composer) {
      const titleStmt = this.allLoose('titleStmt')[0]
      if (!titleStmt) return
      const respStmt = this.doc.createElementNS(MEI_NS, 'respStmt')
      composer = this.doc.createElementNS(MEI_NS, 'composer')
      respStmt.appendChild(composer)
      titleStmt.appendChild(respStmt)
    }
    composer.textContent = value
  }

  /** Which measure an element sits in, and that measure's number. */
  measureOf(element) {
    let node = element
    while (isElement(node) && local(node) !== 'measure') node = node.parentNode
    return isElement(node) ? node : null
  }

  measureNumber(element) {
    const measure = this.measureOf(element)
    if (!measure) return null
    const explicit = measure.getAttribute('n')
    if (explicit) return parseInt(explicit, 10)
    return this.measures.indexOf(measure) + 1
  }

  measureByNumber(number) {
    const wanted = String(number)
    return (
      this.measures.find((measure) => (measure.getAttribute('n') || '') === wanted) ||
      this.measures[number - 1] ||
      null
    )
  }

  /** Every note and rest in document order, chords flattened. */
  get events() {
    const events = []
    for (const measure of this.measures) {
      for (const layer of layersOf(measure)) {
        walkEvents(layer, events)
      }
    }
    return events
  }

  /**
   * How full a measure is, per staff and layer, in quarter notes.
   * Returns [{ staff, layer, filled, expected }].
   */
  measureFill(measure) {
    const results = []
    const staves = Array.from(measure.children).filter((child) => local(child) === 'staff')
    for (const staff of staves) {
      const staffNumber = staff.getAttribute('n') || '1'
      const properties = this.staffProperties(staffNumber) || {
        meterCount: '4',
        meterUnit: '4',
      }
      const expected =
        (4 * parseInt(properties.meterCount || '4', 10)) /
        parseInt(properties.meterUnit || '4', 10)
      for (const layer of Array.from(staff.children).filter(
        (child) => local(child) === 'layer',
      )) {
        let filled = 0
        const stack = [layer]
        while (stack.length) {
          const node = stack.pop()
          for (const child of Array.from(node.children)) {
            const name = local(child)
            if (name === 'note' || name === 'rest' || name === 'space') {
              filled += durationInQuarters(child)
            } else if (name === 'chord') {
              filled += durationInQuarters(child)
            } else if (name === 'beam' || name === 'tuplet' || name === 'graceGrp') {
              stack.push(child)
            } else if (name === 'mRest') {
              filled = expected
            }
          }
        }
        results.push({
          staff: staffNumber,
          layer: layer.getAttribute('n') || '1',
          filled: round(filled),
          expected: round(expected),
        })
      }
    }
    return results
  }

  /** Measures whose contents do not add up, with what they are missing. */
  overfullOrShortMeasures() {
    const problems = []
    this.measures.forEach((measure, index) => {
      const number = parseInt(measure.getAttribute('n') || String(index + 1), 10)
      for (const fill of this.measureFill(measure)) {
        if (fill.filled === 0) continue
        if (Math.abs(fill.filled - fill.expected) > 1e-6) {
          problems.push({ measure: number, ...fill })
        }
      }
    })
    return problems
  }
}

// ── helpers used across this module ──────────────────────────────────

function childByName(parent, name) {
  if (!isElement(parent)) return null
  return Array.from(parent.children).find((child) => local(child) === name) || null
}

export function findChild(parent, name) {
  return childByName(parent, name)
}

function layersOf(measure) {
  const layers = []
  for (const staff of Array.from(measure.children)) {
    if (local(staff) !== 'staff') continue
    for (const layer of Array.from(staff.children)) {
      if (local(layer) === 'layer') layers.push(layer)
    }
  }
  return layers
}

export function layersOfMeasure(measure) {
  return layersOf(measure)
}

function walkEvents(node, out) {
  for (const child of Array.from(node.children)) {
    const name = local(child)
    if (name === 'note' || name === 'rest' || name === 'chord' || name === 'mRest') {
      out.push(child)
      if (name === 'chord') {
        for (const member of Array.from(child.children)) {
          if (local(member) === 'note') out.push(member)
        }
      }
    } else if (name === 'beam' || name === 'tuplet' || name === 'graceGrp') {
      walkEvents(child, out)
    }
  }
}

function round(value) {
  return Math.round(value * 1e6) / 1e6
}

export { DIATONIC, STEP_SEMITONES, isElement, round }
