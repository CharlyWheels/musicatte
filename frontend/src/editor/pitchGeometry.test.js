import { describe, expect, it } from 'vitest'
import { pitchAt, positionOf, topLinePitch } from './pitchGeometry.js'

describe('reading a pitch off the staff', () => {
  it('knows the top line of the common clefs', () => {
    // Treble: top line is F5. Bass: top line is A3. Alto: top line is G4.
    expect(pitchAt(0, { clefShape: 'G', clefLine: '2' })).toEqual({ pname: 'f', octave: 5 })
    expect(pitchAt(0, { clefShape: 'F', clefLine: '4' })).toEqual({ pname: 'a', octave: 3 })
    expect(pitchAt(0, { clefShape: 'C', clefLine: '3' })).toEqual({ pname: 'g', octave: 4 })
  })

  it('walks down the treble staff one step at a time', () => {
    const clef = { clefShape: 'G', clefLine: '2' }
    const walk = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((step) => {
      const { pname, octave } = pitchAt(step, clef)
      return `${pname}${octave}`
    })
    // F5 E5 D5 C5 B4 A4 G4 F4 E4: the treble staff from top line to bottom.
    expect(walk).toEqual(['f5', 'e5', 'd5', 'c5', 'b4', 'a4', 'g4', 'f4', 'e4'])
  })

  it('reads ledger lines above the staff', () => {
    expect(pitchAt(-2, { clefShape: 'G', clefLine: '2' })).toEqual({ pname: 'a', octave: 5 })
  })

  it('is the inverse of positionOf', () => {
    const clef = { clefShape: 'F', clefLine: '4' }
    for (const step of [-3, 0, 4, 8, 12]) {
      const { pname, octave } = pitchAt(step, clef)
      expect(positionOf(pname, octave, clef)).toBe(step)
    }
  })

  it('clamps to a playable range instead of running off', () => {
    const veryLow = pitchAt(200, { clefShape: 'G', clefLine: '2' })
    expect(veryLow.octave).toBeGreaterThanOrEqual(0)
    const veryHigh = pitchAt(-200, { clefShape: 'G', clefLine: '2' })
    expect(veryHigh.octave).toBeLessThanOrEqual(8)
  })

  it('falls back to treble for an unknown clef', () => {
    expect(topLinePitch('perc', '3')).toBe(topLinePitch('G', '3'))
  })
})
