/**
 * Integration: does Verovio actually accept what the editor produces?
 *
 * The unit tests check that the DOM ends up the right shape. They cannot
 * catch a document that is structurally plausible and that Verovio then
 * refuses, or renders wrongly — which is exactly the class of failure the old
 * string-editing produced. So each significant edit is applied and then loaded
 * into the real engine.
 *
 * These run against the WebAssembly build, so they are slower than the rest.
 */

import { beforeAll, describe, expect, it } from 'vitest'

import { MeiDoc } from './mei.js'
import * as edits from './edits.js'
import { grandStaffMei, singleStaffMei } from './fixtures.js'
import { DEFAULT_OPTIONS } from './scoreEngine.js'

let toolkit

beforeAll(async () => {
  const [{ VerovioToolkit }, moduleFactory] = await Promise.all([
    import('verovio/esm'),
    import('verovio/wasm').then((wasm) => wasm.default),
  ])
  const instance = await moduleFactory()
  toolkit = new VerovioToolkit(instance)
  // The application's own options, so the test cannot drift from what ships.
  // In particular svgHtml5 is what puts data-id and data-class on the SVG,
  // and selection, highlighting and playback all read those.
  toolkit.setOptions(DEFAULT_OPTIONS)
}, 60000)

/** Load a document and fail with Verovio's own log if it is rejected. */
function render(doc) {
  const accepted = toolkit.loadData(doc.toString())
  const log = (toolkit.getLog() || '').trim()
  expect(accepted, `Verovio rejected the document:\n${log}`).toBeTruthy()
  const pages = toolkit.getPageCount()
  expect(pages).toBeGreaterThan(0)
  const svg = toolkit.renderToSVG(1)
  expect(svg).toContain('<svg')
  return { svg, log, pages }
}

function countIn(svg, dataClass) {
  return (svg.match(new RegExp(`data-class="${dataClass}"`, 'g')) || []).length
}

describe('Verovio accepts the editor’s output', () => {
  it('renders the starting document', () => {
    const { svg } = render(new MeiDoc(singleStaffMei()))
    expect(countIn(svg, 'note')).toBe(8)
  })

  it('renders a grand staff with both staves', () => {
    const { svg } = render(new MeiDoc(grandStaffMei()))
    expect(countIn(svg, 'staff')).toBe(4) // two staves across two measures
  })

  it('keeps both staves on a measure added to a grand staff', () => {
    // The old editor emitted a hardcoded <staff n="1">, so Verovio rendered
    // the new measure with the lower staff missing and said nothing.
    const doc = new MeiDoc(grandStaffMei())
    edits.insertMeasure(doc)
    const { svg } = render(doc)
    expect(countIn(svg, 'measure')).toBe(3)
    expect(countIn(svg, 'staff')).toBe(6)
  })

  it('renders a changed bass clef', () => {
    const doc = new MeiDoc(grandStaffMei())
    edits.changeClef(doc, 2, 'C', '3')
    const { svg } = render(doc)
    expect(svg).toContain('<svg')
    // Reading the document back confirms the change survived the round trip.
    const back = new MeiDoc(toolkit.getMEI())
    expect(back.staffProperties(2).clefShape).toBe('C')
    expect(back.staffProperties(1).clefShape).toBe('G')
  })

  it('renders a tie with both ends and logs no warning about it', () => {
    const doc = new MeiDoc(singleStaffMei())
    edits.setPitch(doc, 'n2', 'c', 4)
    edits.toggleTie(doc, 'n1')
    const { svg, log } = render(doc)
    expect(countIn(svg, 'tie')).toBeGreaterThan(0)
    expect(log.toLowerCase()).not.toContain('tie')
  })

  it('renders a triplet', () => {
    const doc = new MeiDoc(singleStaffMei())
    edits.changeDuration(doc, ['n1', 'n2', 'n3'], '8')
    edits.makeTuplet(doc, ['n1', 'n2', 'n3'], 3, 2)
    const { svg } = render(doc)
    expect(countIn(svg, 'tuplet')).toBeGreaterThan(0)
  })

  it('renders a beam', () => {
    const doc = new MeiDoc(singleStaffMei())
    edits.changeDuration(doc, ['n1', 'n2'], '8')
    edits.beamSelection(doc, ['n1', 'n2'])
    const { svg } = render(doc)
    expect(countIn(svg, 'beam')).toBeGreaterThan(0)
  })

  it('renders a chord as one event', () => {
    const doc = new MeiDoc(singleStaffMei())
    edits.addChordNote(doc, 'n1')
    edits.addChordNote(doc, 'n1', 4)
    const { svg } = render(doc)
    expect(countIn(svg, 'chord')).toBe(1)
    expect(countIn(svg, 'note')).toBe(10)
  })

  it('renders slurs, dynamics, hairpins and articulations', () => {
    const doc = new MeiDoc(singleStaffMei())
    edits.addSlur(doc, ['n1', 'n3'])
    edits.addDynamic(doc, 'n1', 'mf')
    edits.addHairpin(doc, ['n2', 'n4'], 'cres')
    edits.toggleArticulation(doc, ['n2'], 'stacc')
    const { svg } = render(doc)
    expect(countIn(svg, 'slur')).toBeGreaterThan(0)
    expect(countIn(svg, 'dynam')).toBeGreaterThan(0)
    expect(countIn(svg, 'hairpin')).toBeGreaterThan(0)
    expect(countIn(svg, 'artic')).toBeGreaterThan(0)
  })

  it('renders a tempo marking and lyrics', () => {
    const doc = new MeiDoc(singleStaffMei())
    edits.setTempo(doc, 1, 'Allegro', 132)
    edits.setLyric(doc, 'n1', 'La')
    const { svg } = render(doc)
    expect(countIn(svg, 'tempo')).toBeGreaterThan(0)
    expect(countIn(svg, 'verse')).toBeGreaterThan(0)
  })

  it('renders a repeat barline and a volta', () => {
    const doc = new MeiDoc(singleStaffMei())
    edits.setBarline(doc, 1, 'rptend')
    edits.addVolta(doc, 2, 2, '1')
    render(doc)
    const back = new MeiDoc(toolkit.getMEI())
    expect(back.allLoose('ending').length).toBeGreaterThan(0)
  })

  it('renders a second voice on one staff', () => {
    const doc = new MeiDoc(singleStaffMei())
    edits.addLayer(doc, 1)
    edits.appendToMeasure(doc, 1, { staff: 1, pname: 'g', octave: 3 })
    const { svg } = render(doc)
    expect(svg).toContain('<svg')
  })

  it('renders a staff added to a single-staff score', () => {
    const doc = new MeiDoc(singleStaffMei())
    edits.addStaff(doc, { clefShape: 'F', clefLine: '4' })
    const { svg } = render(doc)
    expect(countIn(svg, 'staff')).toBe(4)
  })

  it('renders a mid-score key change', () => {
    const doc = new MeiDoc(singleStaffMei())
    edits.addMidScoreChange(doc, 2, { keySig: '3f' })
    const { svg } = render(doc)
    expect(countIn(svg, 'keySig')).toBeGreaterThan(0)
  })

  it('survives a long chain of edits', () => {
    // The old string editing accumulated damage: each operation was fine in
    // isolation and the document was broken after a dozen of them.
    const doc = new MeiDoc(grandStaffMei())
    edits.insertMeasure(doc)
    edits.changeClef(doc, 2, 'C', '4')
    edits.changeKeySignature(doc, 1, '2s')
    edits.changeTimeSignature(doc, 1, '3', '4')
    edits.changeDuration(doc, ['t1', 't2'], '8')
    edits.beamSelection(doc, ['t1', 't2'])
    edits.addChordNote(doc, 't3')
    edits.toggleArticulation(doc, ['t3'], 'acc')
    edits.addDynamic(doc, 't1', 'pp')
    edits.addSlur(doc, ['t1', 't2'])
    edits.setTempo(doc, 1, 'Andante', 88)
    edits.insertMeasure(doc, 1)
    edits.deleteMeasure(doc, 4)
    edits.setBarline(doc, 3, 'end')
    const { svg, pages } = render(doc)
    expect(pages).toBeGreaterThan(0)
    expect(svg).toContain('<svg')

    // Reload what Verovio produced: a document it cannot re-read is broken
    // even if it rendered once.
    const round = new MeiDoc(toolkit.getMEI())
    expect(round.measures.length).toBeGreaterThan(0)
    expect(toolkit.loadData(round.toString())).toBeTruthy()
  })

  it('produces a timemap that playback can use', () => {
    const doc = new MeiDoc(singleStaffMei())
    render(doc)
    const raw = toolkit.renderToTimemap({ includeMeasures: true, includeRests: true })
    const timemap = typeof raw === 'string' ? JSON.parse(raw) : raw
    expect(Array.isArray(timemap)).toBe(true)
    const onsets = timemap.flatMap((entry) => entry.on || [])
    expect(onsets.length).toBeGreaterThan(0)
    // Every id the timemap names must exist in the document, or playback
    // would be sounding notes it cannot find pitches for.
    for (const id of onsets) expect(doc.byId(id)).toBeTruthy()
  })

  it('reports the page an element is on', () => {
    const doc = new MeiDoc(singleStaffMei())
    render(doc)
    expect(toolkit.getPageWithElement('n1')).toBe(1)
  })
})
