/**
 * Turning a click position on a staff into a written pitch.
 *
 * What made the old "insert mode" a false promise: it told the user to click
 * on the staff and then appended a C4 quarter note to the end of the measure,
 * with no relation to where they clicked. Reading the pitch off the staff
 * needs nothing more than which line the click landed on and what the clef is.
 */

import { DIATONIC } from './mei.js'

/** Absolute diatonic number: C4 is 4 * 7 = 28. */
function diatonicNumber(pname, octave) {
  const step = DIATONIC.indexOf(String(pname).toLowerCase())
  if (step < 0) return null
  return octave * 7 + step
}

function fromDiatonicNumber(value) {
  const octave = Math.floor(value / 7)
  const step = ((value % 7) + 7) % 7
  return { pname: DIATONIC[step], octave }
}

/** The pitch sitting on the line a clef is drawn around. */
const CLEF_REFERENCE = {
  G: { pname: 'g', octave: 4 },
  F: { pname: 'f', octave: 3 },
  C: { pname: 'c', octave: 4 },
}

/**
 * The pitch of the staff's top line for a given clef.
 *
 * Lines are numbered from the bottom, so the top line of a five-line staff is
 * line 5, and each line up is two diatonic steps.
 */
export function topLinePitch(clefShape = 'G', clefLine = '2', lines = 5) {
  const reference = CLEF_REFERENCE[String(clefShape).toUpperCase()] || CLEF_REFERENCE.G
  const base = diatonicNumber(reference.pname, reference.octave)
  if (base == null) return null
  const line = parseInt(clefLine, 10) || 2
  return base + (lines - line) * 2
}

/**
 * Which written pitch a click means.
 *
 * @param {number} halfStepsFromTopLine  0 is the top line, 1 the space below
 *   it, and so on downwards; negative values are above the staff.
 */
export function pitchAt(halfStepsFromTopLine, { clefShape = 'G', clefLine = '2' } = {}) {
  const top = topLinePitch(clefShape, clefLine)
  if (top == null) return { pname: 'c', octave: 4 }
  const value = top - Math.round(halfStepsFromTopLine)
  // Keep it inside a range a person can actually play or sing.
  const clamped = Math.max(diatonicNumber('c', 0), Math.min(diatonicNumber('c', 8), value))
  return fromDiatonicNumber(clamped)
}

/** Where a written pitch sits, for placing a cursor or a hint. */
export function positionOf(pname, octave, { clefShape = 'G', clefLine = '2' } = {}) {
  const top = topLinePitch(clefShape, clefLine)
  const value = diatonicNumber(pname, octave)
  if (top == null || value == null) return 0
  return top - value
}

export { diatonicNumber, fromDiatonicNumber }
