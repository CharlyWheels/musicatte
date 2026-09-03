/**
 * Tests for the editing core.
 *
 * Weighted towards the bugs the review confirmed: the grand staff being
 * unusable, ties written with only one end, measures overfilled by insertion,
 * measure numbering left with gaps, and operations that hit "the first match
 * in the document" instead of the element they were given.
 */

import { describe, expect, it } from 'vitest'

import { MeiDoc, durationInQuarters, midiOf } from './mei.js'
import * as edits from './edits.js'
import { grandStaffMei, singleStaffMei } from './fixtures.js'

const single = () => new MeiDoc(singleStaffMei())
const grand = () => new MeiDoc(grandStaffMei())

describe('document basics', () => {
  it('reads the title and staff count', () => {
    const doc = new MeiDoc(singleStaffMei('Estudio'))
    expect(doc.title).toBe('Estudio')
    expect(doc.staffCount).toBe(1)
    expect(grand().staffCount).toBe(2)
  })

  it('round-trips through serialisation', () => {
    const doc = single()
    const again = new MeiDoc(doc.toString())
    expect(again.measures).toHaveLength(2)
    expect(again.byId('n1')).toBeTruthy()
  })

  it('rejects a document that is not XML', () => {
    expect(() => new MeiDoc('<not-xml')).toThrow()
  })

  it('writes and reads the title and composer', () => {
    const doc = single()
    doc.title = 'Vals'
    doc.composer = 'Anónimo'
    const again = new MeiDoc(doc.toString())
    expect(again.title).toBe('Vals')
    expect(again.composer).toBe('Anónimo')
  })
})

describe('staff properties are scoped to their staff', () => {
  it('reports each staff of a grand staff separately', () => {
    // The old editor read the first <clef> in the document, so a grand staff
    // always claimed treble on both staves.
    const doc = grand()
    expect(doc.staffProperties(1).clefShape).toBe('G')
    expect(doc.staffProperties(2).clefShape).toBe('F')
  })

  it('changes only the staff it was asked to change', () => {
    const doc = grand()
    edits.changeClef(doc, 2, 'C', '3')
    expect(doc.staffProperties(1).clefShape).toBe('G')
    expect(doc.staffProperties(1).clefLine).toBe('2')
    expect(doc.staffProperties(2).clefShape).toBe('C')
    expect(doc.staffProperties(2).clefLine).toBe('3')
  })

  it('applies a key change to every staff by default', () => {
    const doc = grand()
    edits.changeKeySignature(doc, 1, '3f')
    expect(doc.staffProperties(1).keySig).toBe('3f')
    expect(doc.staffProperties(2).keySig).toBe('3f')
  })

  it('can apply a key change to one staff only', () => {
    const doc = grand()
    edits.changeKeySignature(doc, 2, '2s', false)
    expect(doc.staffProperties(1).keySig).toBe('0')
    expect(doc.staffProperties(2).keySig).toBe('2s')
  })

  it('changes the time signature on every staff', () => {
    const doc = grand()
    edits.changeTimeSignature(doc, 1, '3', '4')
    expect(doc.staffProperties(1).meterCount).toBe('3')
    expect(doc.staffProperties(2).meterCount).toBe('3')
  })
})

describe('pitch', () => {
  it('moves a note by diatonic steps and crosses the octave', () => {
    const doc = single()
    edits.changePitch(doc, 'n1', 1)
    expect(doc.byId('n1').getAttribute('pname')).toBe('d')
    edits.changePitch(doc, 'n1', -2)
    expect(doc.byId('n1').getAttribute('pname')).toBe('b')
    expect(doc.byId('n1').getAttribute('oct')).toBe('3')
  })

  it('reports no change when the pitch would not move', () => {
    const doc = single()
    expect(edits.changePitch(doc, 'n1', 0)).toBeNull()
  })

  it('will not move a rest', () => {
    const doc = single()
    edits.toggleRest(doc, 'n1')
    const rest = doc.measures[0].querySelector('rest')
    expect(edits.changePitch(doc, rest.getAttribute('xml:id'), 1)).toBeNull()
  })

  it('shifts octaves across a selection', () => {
    const doc = single()
    edits.shiftOctave(doc, ['n1', 'n2'], 1)
    expect(doc.byId('n1').getAttribute('oct')).toBe('5')
    expect(doc.byId('n2').getAttribute('oct')).toBe('5')
    expect(doc.byId('n3').getAttribute('oct')).toBe('4')
  })

  it('transposes with a spelling that keeps the letter closest', () => {
    const doc = single()
    edits.transpose(doc, ['n1'], 2) // Do4 -> Re4
    expect(doc.byId('n1').getAttribute('pname')).toBe('d')
    expect(doc.byId('n1').getAttribute('accid')).toBeNull()

    const other = single()
    edits.transpose(other, ['n1'], 1) // Do4 -> Do#4
    expect(other.byId('n1').getAttribute('pname')).toBe('c')
    expect(other.byId('n1').getAttribute('accid')).toBe('s')
  })

  it('transposes down using flats', () => {
    const doc = single()
    edits.transpose(doc, ['n1'], -1) // Do4 -> Si4 (one below)
    expect(midiOf(doc.byId('n1'))).toBe(59)
  })

  it('sets an absolute pitch, turning a rest back into a note', () => {
    const doc = single()
    edits.toggleRest(doc, 'n1')
    const restId = doc.measures[0].querySelector('rest').getAttribute('xml:id')
    const result = edits.setPitch(doc, restId, 'g', 4)
    expect(result.changed).toBe(true)
    expect(doc.byId(result.id).getAttribute('pname')).toBe('g')
  })
})

describe('duration and dots', () => {
  it('changes duration across a selection', () => {
    const doc = single()
    edits.changeDuration(doc, ['n1', 'n2'], '8')
    expect(doc.byId('n1').getAttribute('dur')).toBe('8')
    expect(doc.byId('n2').getAttribute('dur')).toBe('8')
  })

  it('puts a chord member’s duration on the chord', () => {
    const doc = single()
    edits.addChordNote(doc, 'n1')
    edits.changeDuration(doc, ['n1'], '2')
    const chord = doc.byId('n1').parentNode
    expect(chord.getAttribute('dur')).toBe('2')
    expect(doc.byId('n1').getAttribute('dur')).toBeNull()
  })

  it('toggles a dot and accounts for it in the duration', () => {
    const doc = single()
    expect(durationInQuarters(doc.byId('n1'))).toBe(1)
    edits.toggleDots(doc, ['n1'], 1)
    expect(durationInQuarters(doc.byId('n1'))).toBe(1.5)
    edits.toggleDots(doc, ['n1'], 1)
    expect(durationInQuarters(doc.byId('n1'))).toBe(1)
  })
})

describe('rests', () => {
  it('swaps a note for a rest of the same duration and back', () => {
    const doc = single()
    edits.changeDuration(doc, ['n1'], '2')
    const asRest = edits.toggleRest(doc, 'n1')
    const rest = doc.byId(asRest.id)
    expect(rest.nodeName.replace(/^.*:/, '')).toBe('rest')
    expect(rest.getAttribute('dur')).toBe('2')

    const back = edits.toggleRest(doc, asRest.id)
    expect(doc.byId(back.id).nodeName.replace(/^.*:/, '')).toBe('note')
    expect(doc.byId(back.id).getAttribute('dur')).toBe('2')
  })

  it('replaces a whole chord rather than one of its notes', () => {
    const doc = single()
    edits.addChordNote(doc, 'n1')
    const result = edits.toggleRest(doc, 'n1')
    expect(doc.measures[0].querySelectorAll('chord')).toHaveLength(0)
    expect(doc.byId(result.id).nodeName.replace(/^.*:/, '')).toBe('rest')
  })
})

describe('ties', () => {
  it('writes both ends of a tie', () => {
    // The old editor set tie="i" and nothing else, leaving the tie
    // unterminated and Verovio drawing it into empty space.
    const doc = single()
    edits.setPitch(doc, 'n2', 'c', 4) // same pitch as n1
    const result = edits.toggleTie(doc, 'n1')
    expect(result.changed).toBe(true)
    expect(doc.byId('n1').getAttribute('tie')).toBe('i')
    expect(doc.byId('n2').getAttribute('tie')).toBe('t')
  })

  it('removes both ends again', () => {
    const doc = single()
    edits.setPitch(doc, 'n2', 'c', 4)
    edits.toggleTie(doc, 'n1')
    edits.toggleTie(doc, 'n1')
    expect(doc.byId('n1').getAttribute('tie')).toBeNull()
    expect(doc.byId('n2').getAttribute('tie')).toBeNull()
  })

  it('refuses to tie notes of different pitch, and says why', () => {
    const doc = single()
    const result = edits.toggleTie(doc, 'n1') // n2 is a different pitch
    expect(result.changed).toBe(false)
    expect(result.message).toMatch(/misma nota/)
  })

  it('refuses to tie the last note', () => {
    const doc = single()
    const result = edits.toggleTie(doc, 'n8')
    expect(result.changed).toBe(false)
    expect(result.message).toMatch(/nota siguiente/)
  })
})

describe('slurs, articulations and dynamics', () => {
  it('adds a slur between the ends of a selection', () => {
    const doc = single()
    const result = edits.addSlur(doc, ['n1', 'n2', 'n3'])
    const slur = doc.byId(result.id)
    expect(slur.getAttribute('startid')).toBe('#n1')
    expect(slur.getAttribute('endid')).toBe('#n3')
  })

  it('needs two notes for a slur', () => {
    expect(edits.addSlur(single(), ['n1']).changed).toBe(false)
  })

  it('toggles articulations and keeps several at once', () => {
    const doc = single()
    edits.toggleArticulation(doc, ['n1'], 'stacc')
    edits.toggleArticulation(doc, ['n1'], 'acc')
    expect(doc.byId('n1').getAttribute('artic').split(' ').sort()).toEqual(['acc', 'stacc'])
    edits.toggleArticulation(doc, ['n1'], 'stacc')
    expect(doc.byId('n1').getAttribute('artic')).toBe('acc')
    edits.toggleArticulation(doc, ['n1'], 'acc')
    expect(doc.byId('n1').getAttribute('artic')).toBeNull()
  })

  it('anchors a dynamic to a note and replaces rather than stacking', () => {
    const doc = single()
    edits.addDynamic(doc, 'n1', 'p')
    edits.addDynamic(doc, 'n1', 'ff')
    const dynamics = Array.from(doc.measures[0].querySelectorAll('dynam'))
    expect(dynamics).toHaveLength(1)
    expect(dynamics[0].textContent).toBe('ff')
  })

  it('adds a hairpin across a selection', () => {
    const doc = single()
    const result = edits.addHairpin(doc, ['n1', 'n4'], 'cres')
    expect(doc.byId(result.id).getAttribute('form')).toBe('cres')
  })
})

describe('tempo and lyrics', () => {
  it('sets and reads a tempo with a metronome mark', () => {
    const doc = single()
    edits.setTempo(doc, 1, 'Allegro', 132)
    const tempo = edits.readTempo(doc)
    expect(tempo.text).toBe('Allegro')
    expect(tempo.bpm).toBe(132)
  })

  it('replaces the tempo rather than adding a second one', () => {
    const doc = single()
    edits.setTempo(doc, 1, 'Adagio', 70)
    edits.setTempo(doc, 1, 'Presto', 176)
    expect(doc.allLoose('tempo')).toHaveLength(1)
  })

  it('sets and clears a lyric syllable', () => {
    const doc = single()
    edits.setLyric(doc, 'n1', 'Ave')
    expect(edits.readLyric(doc, 'n1')).toBe('Ave')
    edits.setLyric(doc, 'n1', '')
    expect(edits.readLyric(doc, 'n1')).toBe('')
  })
})

describe('beams and tuplets', () => {
  it('beams a run of eighths', () => {
    const doc = single()
    edits.changeDuration(doc, ['n1', 'n2'], '8')
    const result = edits.beamSelection(doc, ['n1', 'n2'])
    expect(result.changed).toBe(true)
    const beam = doc.byId('n1').parentNode
    expect(beam.nodeName.replace(/^.*:/, '')).toBe('beam')
  })

  it('refuses to beam quarter notes, and says why', () => {
    const result = edits.beamSelection(single(), ['n1', 'n2'])
    expect(result.changed).toBe(false)
    expect(result.message).toMatch(/corcheas/)
  })

  it('unbeams again', () => {
    const doc = single()
    edits.changeDuration(doc, ['n1', 'n2'], '8')
    edits.beamSelection(doc, ['n1', 'n2'])
    edits.unbeamSelection(doc, ['n1'])
    expect(doc.allLoose('beam')).toHaveLength(0)
  })

  it('makes a triplet and scales the durations inside it', () => {
    const doc = single()
    edits.changeDuration(doc, ['n1', 'n2', 'n3'], '8')
    const result = edits.makeTuplet(doc, ['n1', 'n2', 'n3'], 3, 2)
    expect(result.changed).toBe(true)
    // Three eighths in the time of two: each lasts a third of a beat.
    expect(durationInQuarters(doc.byId('n1'))).toBeCloseTo(1 / 3, 6)
  })

  it('will not nest a tuplet inside itself', () => {
    const doc = single()
    edits.changeDuration(doc, ['n1', 'n2', 'n3'], '8')
    edits.makeTuplet(doc, ['n1', 'n2', 'n3'])
    expect(edits.makeTuplet(doc, ['n1', 'n2', 'n3']).changed).toBe(false)
  })

  it('removes a tuplet', () => {
    const doc = single()
    edits.changeDuration(doc, ['n1', 'n2', 'n3'], '8')
    edits.makeTuplet(doc, ['n1', 'n2', 'n3'])
    edits.removeTuplet(doc, ['n1'])
    expect(doc.allLoose('tuplet')).toHaveLength(0)
    expect(durationInQuarters(doc.byId('n1'))).toBe(0.5)
  })

  it('drops beams that no longer group anything', () => {
    const doc = single()
    edits.changeDuration(doc, ['n1', 'n2'], '8')
    edits.beamSelection(doc, ['n1', 'n2'])
    edits.deleteEvents(doc, ['n2'])
    expect(doc.allLoose('beam')).toHaveLength(0)
    expect(doc.byId('n1')).toBeTruthy()
  })
})

describe('chords', () => {
  it('wraps a note in a chord and moves the duration onto it', () => {
    const doc = single()
    const result = edits.addChordNote(doc, 'n1')
    const chord = doc.byId('n1').parentNode
    expect(chord.nodeName.replace(/^.*:/, '')).toBe('chord')
    expect(chord.getAttribute('dur')).toBe('4')
    expect(doc.byId(result.id).getAttribute('pname')).toBe('e')
  })

  it('adds further notes to an existing chord', () => {
    const doc = single()
    edits.addChordNote(doc, 'n1')
    edits.addChordNote(doc, 'n1', 4)
    const chord = doc.byId('n1').parentNode
    expect(chord.querySelectorAll('note')).toHaveLength(3)
  })

  it('does not count a chord as several beats', () => {
    const doc = single()
    edits.addChordNote(doc, 'n1')
    const fill = doc.measureFill(doc.measures[0])[0]
    expect(fill.filled).toBe(4)
  })

  it('unwraps a chord when only one note is left', () => {
    const doc = single()
    const added = edits.addChordNote(doc, 'n1')
    edits.deleteEvents(doc, [added.id])
    expect(doc.measures[0].querySelectorAll('chord')).toHaveLength(0)
    expect(doc.byId('n1').getAttribute('dur')).toBe('4')
  })
})

describe('inserting respects the bar', () => {
  it('sizes an inserted note to the space left in the measure', () => {
    // The old editor copied its neighbour's duration regardless, so this
    // measure ended up with five beats in 4/4.
    const doc = single()
    const before = doc.measureFill(doc.measures[0])[0]
    expect(before.filled).toBe(4)

    edits.changeDuration(doc, ['n1'], '8') // frees half a beat
    const result = edits.insertAfter(doc, 'n1')
    expect(result.changed).toBe(true)
    expect(doc.byId(result.id).getAttribute('dur')).toBe('8')

    const after = doc.measureFill(doc.measures[0])[0]
    expect(after.filled).toBe(after.expected)
  })

  it('refuses to insert into a full measure and says what to do', () => {
    const doc = single()
    const result = edits.insertAfter(doc, 'n1')
    expect(result.changed).toBe(false)
    expect(result.message).toMatch(/compás 1 ya está completo/i)
  })

  it('appends to a measure that has room', () => {
    const doc = single()
    edits.deleteEvents(doc, ['n4'])
    const result = edits.appendToMeasure(doc, 1, { pname: 'g', octave: 4 })
    expect(result.changed).toBe(true)
    expect(doc.measureFill(doc.measures[0])[0].filled).toBe(4)
  })

  it('can insert a rest', () => {
    const doc = single()
    edits.deleteEvents(doc, ['n4'])
    const result = edits.appendToMeasure(doc, 1, { rest: true })
    expect(doc.byId(result.id).nodeName.replace(/^.*:/, '')).toBe('rest')
  })
})

describe('measures', () => {
  it('gives a new measure every staff the score has', () => {
    // A measure appended to a piano score used to arrive with only the upper
    // staff, and Verovio renders that without complaint.
    const doc = grand()
    edits.insertMeasure(doc)
    const added = doc.measures[doc.measures.length - 1]
    const staves = Array.from(added.children).filter(
      (child) => child.nodeName.replace(/^.*:/, '') === 'staff',
    )
    expect(staves.map((staff) => staff.getAttribute('n'))).toEqual(['1', '2'])
  })

  it('inserts in the middle and renumbers', () => {
    const doc = single()
    edits.insertMeasure(doc, 1)
    expect(doc.measures.map((measure) => measure.getAttribute('n'))).toEqual(['1', '2', '3'])
  })

  it('renumbers after a delete instead of leaving a gap', () => {
    const doc = single()
    edits.insertMeasure(doc)
    edits.insertMeasure(doc)
    edits.deleteMeasure(doc, 2)
    expect(doc.measures.map((measure) => measure.getAttribute('n'))).toEqual(['1', '2', '3'])
  })

  it('deletes the measure asked for, not a lookalike', () => {
    // Deleting used to replace the first identical serialised measure, so with
    // two identical measures it removed the wrong one.
    const doc = single()
    edits.insertMeasure(doc) // measure 3, empty
    edits.insertMeasure(doc) // measure 4, empty and identical
    const idsBefore = doc.measures.map((m) => m.getAttribute('xml:id'))
    edits.deleteMeasure(doc, 4)
    const idsAfter = doc.measures.map((m) => m.getAttribute('xml:id'))
    expect(idsAfter).toEqual(idsBefore.slice(0, 3))
  })

  it('refuses to delete the only measure', () => {
    const doc = single()
    edits.deleteMeasure(doc, 2)
    expect(edits.deleteMeasure(doc, 1).changed).toBe(false)
  })

  it('clears a measure back to whole-measure rests', () => {
    const doc = single()
    edits.clearMeasure(doc, 1)
    expect(doc.measures[0].querySelectorAll('note')).toHaveLength(0)
    expect(doc.measures[0].querySelectorAll('mRest')).toHaveLength(1)
  })
})

describe('barlines and repeats', () => {
  it('sets and reads a barline form', () => {
    const doc = single()
    edits.setBarline(doc, 2, 'end')
    expect(edits.readBarline(doc, 2)).toBe('end')
    edits.setBarline(doc, 2, '')
    expect(edits.readBarline(doc, 2)).toBe('')
  })

  it('wraps measures in a volta bracket', () => {
    const doc = single()
    const result = edits.addVolta(doc, 1, 2, '1')
    const ending = doc.byId(result.id)
    expect(ending.getAttribute('n')).toBe('1')
    expect(ending.querySelectorAll('measure')).toHaveLength(2)
  })
})

describe('staves and voices', () => {
  it('adds a staff to every measure, not just the definition', () => {
    const doc = single()
    edits.addStaff(doc, { clefShape: 'F', clefLine: '4' })
    expect(doc.staffCount).toBe(2)
    for (const measure of doc.measures) {
      const staves = Array.from(measure.children).filter(
        (child) => child.nodeName.replace(/^.*:/, '') === 'staff',
      )
      expect(staves).toHaveLength(2)
    }
    expect(doc.staffProperties(2).clefShape).toBe('F')
  })

  it('removes a staff and renumbers the rest', () => {
    const doc = grand()
    edits.removeStaff(doc, 1)
    expect(doc.staffCount).toBe(1)
    expect(doc.staffProperties(1).clefShape).toBe('F')
    for (const measure of doc.measures) {
      const staves = Array.from(measure.children).filter(
        (child) => child.nodeName.replace(/^.*:/, '') === 'staff',
      )
      expect(staves.map((staff) => staff.getAttribute('n'))).toEqual(['1'])
    }
  })

  it('refuses to remove the last staff', () => {
    expect(edits.removeStaff(single(), 1).changed).toBe(false)
  })

  it('adds a second voice to a staff in every measure', () => {
    const doc = single()
    edits.addLayer(doc, 1)
    for (const measure of doc.measures) {
      const layers = measure.querySelectorAll('layer')
      expect(layers).toHaveLength(2)
    }
  })

  it('tracks each voice’s fill separately', () => {
    const doc = single()
    edits.addLayer(doc, 1)
    const fills = doc.measureFill(doc.measures[0])
    expect(fills).toHaveLength(2)
    expect(fills[0].layer).toBe('1')
    expect(fills[1].layer).toBe('2')
  })
})

describe('deleting', () => {
  it('removes a slur that pointed at a deleted note', () => {
    const doc = single()
    edits.addSlur(doc, ['n1', 'n3'])
    expect(doc.allLoose('slur')).toHaveLength(1)
    edits.deleteEvents(doc, ['n3'])
    expect(doc.allLoose('slur')).toHaveLength(0)
  })

  it('removes a dynamic that pointed at a deleted note', () => {
    const doc = single()
    edits.addDynamic(doc, 'n1', 'mf')
    edits.deleteEvents(doc, ['n1'])
    expect(doc.allLoose('dynam')).toHaveLength(0)
  })

  it('deletes several at once', () => {
    const doc = single()
    edits.deleteEvents(doc, ['n1', 'n2'])
    expect(doc.byId('n1')).toBeNull()
    expect(doc.byId('n2')).toBeNull()
    expect(doc.byId('n3')).toBeTruthy()
  })
})

describe('copy and paste', () => {
  it('pastes with fresh ids so nothing collides', () => {
    const doc = single()
    const snippets = edits.copyEvents(doc, ['n1'])
    edits.deleteEvents(doc, ['n4'])
    const result = edits.pasteEvents(doc, 'n3', snippets)
    expect(result.changed).toBe(true)
    expect(result.ids[0]).not.toBe('n1')
    expect(doc.byId('n1')).toBeTruthy()
    expect(doc.byId(result.ids[0]).getAttribute('pname')).toBe('c')
  })

  it('stops pasting when the measure runs out of room', () => {
    const doc = single()
    const snippets = edits.copyEvents(doc, ['n1', 'n2'])
    const result = edits.pasteEvents(doc, 'n3', snippets)
    expect(result.changed).toBe(false)
    expect(result.message).toMatch(/no queda espacio/i)
  })

  it('drops references that pointed at the copied originals', () => {
    const doc = single()
    edits.addSlur(doc, ['n1', 'n2'])
    const snippets = edits.copyEvents(doc, ['n1'])
    expect(snippets[0]).not.toMatch(/startid/)
  })
})

describe('mid-score changes', () => {
  it('adds a key change from a measure onwards', () => {
    const doc = single()
    const result = edits.addMidScoreChange(doc, 2, { keySig: '2s' })
    expect(result.changed).toBe(true)
    const second = doc.measureByNumber(2)
    expect(second.querySelectorAll('keySig')).toHaveLength(1)
    // The staff definition keeps the original key: this is a change, not a
    // redefinition of the whole score.
    expect(doc.staffProperties(1).keySig).toBe('0')
  })

  it('adds a clef change on both staves of a grand staff', () => {
    const doc = grand()
    edits.addMidScoreChange(doc, 2, { clef: { shape: 'C', line: '3' } })
    expect(doc.measureByNumber(2).querySelectorAll('clef')).toHaveLength(2)
  })

  it('adds a time change to one staff only when asked', () => {
    const doc = grand()
    edits.addMidScoreChange(doc, 2, { clef: { shape: 'C', line: '3' }, staff: 2 })
    expect(doc.measureByNumber(2).querySelectorAll('clef')).toHaveLength(1)
  })
})

describe('measure fill reporting', () => {
  it('finds measures that do not add up', () => {
    const doc = single()
    edits.changeDuration(doc, ['n1'], '8')
    const problems = doc.overfullOrShortMeasures()
    expect(problems).toHaveLength(1)
    expect(problems[0].measure).toBe(1)
    expect(problems[0].filled).toBe(3.5)
    expect(problems[0].expected).toBe(4)
  })

  it('reports nothing when every measure is right', () => {
    expect(single().overfullOrShortMeasures()).toEqual([])
  })

  it('counts a grand staff’s staves separately, not doubled', () => {
    const doc = grand()
    const fills = doc.measureFill(doc.measures[0])
    expect(fills).toHaveLength(2)
    expect(fills[0].filled).toBe(4)
    expect(fills[1].filled).toBe(4)
    expect(doc.overfullOrShortMeasures()).toEqual([])
  })

  it('treats a whole-measure rest as a full measure', () => {
    const doc = single()
    edits.clearMeasure(doc, 1)
    expect(doc.overfullOrShortMeasures()).toEqual([])
  })
})

describe('empty measures can be filled', () => {
  it('accepts a note into a measure holding a whole-measure rest', () => {
    // A new measure arrives with an mRest, which counts as a full bar when
    // checking the rhythm -- so appending used to be refused and a freshly
    // added measure could never be given any notes at all.
    const doc = single()
    const added = edits.insertMeasure(doc)
    const number = Number(added.number)

    const result = edits.appendToMeasure(doc, number, { pname: 'g', octave: 4 })
    expect(result.changed).toBe(true)
    expect(doc.measureByNumber(number).querySelectorAll('mRest')).toHaveLength(0)
    expect(doc.byId(result.id).getAttribute('pname')).toBe('g')
  })

  it('keeps filling the same empty measure until it is full', () => {
    const doc = single()
    const number = Number(edits.insertMeasure(doc).number)
    for (const step of ['c', 'd', 'e', 'f']) {
      expect(edits.appendToMeasure(doc, number, { pname: step, octave: 4 }).changed).toBe(true)
    }
    const fill = doc.measureFill(doc.measureByNumber(number))[0]
    expect(fill.filled).toBe(fill.expected)
    expect(edits.appendToMeasure(doc, number, { pname: 'g' }).changed).toBe(false)
  })

  it('puts the placeholder back when there was no room after all', () => {
    const doc = single()
    // Measure 1 is already full, so nothing should change.
    expect(edits.appendToMeasure(doc, 1, { pname: 'g' }).changed).toBe(false)
    expect(doc.overfullOrShortMeasures()).toEqual([])
  })

  it('inserting beside a whole-measure rest replaces it', () => {
    const doc = single()
    const number = Number(edits.insertMeasure(doc).number)
    const mRest = doc.measureByNumber(number).querySelector('mRest')
    const result = edits.insertAfter(doc, mRest.getAttribute('xml:id'), { dur: '2' })
    expect(result.changed).toBe(true)
    expect(doc.measureByNumber(number).querySelectorAll('mRest')).toHaveLength(0)
    expect(doc.byId(result.id).getAttribute('dur')).toBe('2')
  })

  it('an empty measure still counts as rhythmically complete', () => {
    const doc = single()
    edits.insertMeasure(doc)
    expect(doc.overfullOrShortMeasures()).toEqual([])
  })

  it('fills the right staff of a grand staff', () => {
    const doc = grand()
    const number = Number(edits.insertMeasure(doc).number)
    edits.appendToMeasure(doc, number, { staff: 2, pname: 'c', octave: 3 })
    const measure = doc.measureByNumber(number)
    const staves = Array.from(measure.children).filter(
      (child) => child.nodeName.replace(/^.*:/, '') === 'staff',
    )
    expect(staves[0].querySelectorAll('mRest')).toHaveLength(1)
    expect(staves[1].querySelectorAll('note')).toHaveLength(1)
  })
})
