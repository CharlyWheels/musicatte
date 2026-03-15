export const durations = [
  { label: 'Redonda', value: 'w' },
  { label: 'Blanca', value: 'h' },
  { label: 'Negra', value: 'q' },
  { label: 'Corchea', value: '8' },
  { label: 'Semicorchea', value: '16' },
  { label: 'Fusa', value: '32' },
  { label: 'Semifusa', value: '64' },
]

export const accidentals = [
  { label: 'Natural', value: 'n' },
  { label: 'Bemol', value: 'b' },
  { label: 'Sostenido', value: '#' },
]

export const clefs = [
  { label: 'Sol', value: 'treble' },
  { label: 'Fa', value: 'bass' },
  { label: 'Do', value: 'alto' },
]

export const keySignatures = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab']

export const initialScoreModel = {
  schemaVersion: 1,
  title: 'Nueva partitura',
  composer: '',
  tempo: 120,
  timeSignature: { beats: 4, beatType: 4 },
  keySignature: 'C',
  clef: 'treble',
  measures: [
    {
      notes: [
        { pitch: 'C/4', duration: 'q', accidental: null },
        { pitch: 'D/4', duration: 'q', accidental: null },
        { pitch: 'E/4', duration: 'q', accidental: null },
        { pitch: 'F/4', duration: 'q', accidental: null },
      ],
    },
  ],
  metadata: { source: 'manual', ocrJobId: null },
}

const order = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

function parsePitch(pitch) {
  const [note, octaveStr] = pitch.split('/')
  return { note: note[0], octave: Number(octaveStr) }
}

export function movePitch(pitch, direction) {
  const { note, octave } = parsePitch(pitch)
  let idx = order.indexOf(note)
  let nextOctave = octave
  idx += direction
  if (idx < 0) {
    idx = order.length - 1
    nextOctave -= 1
  } else if (idx >= order.length) {
    idx = 0
    nextOctave += 1
  }
  return `${order[idx]}/${nextOctave}`
}
