/** Notation vocabulary the editor offers, in the user's language. */

export const DURATIONS = [
  { dur: '1', label: 'Redonda', glyph: '𝅝', beats: 4 },
  { dur: '2', label: 'Blanca', glyph: '𝅗𝅥', beats: 2 },
  { dur: '4', label: 'Negra', glyph: '♩', beats: 1 },
  { dur: '8', label: 'Corchea', glyph: '♪', beats: 0.5 },
  { dur: '16', label: 'Semicorchea', glyph: '𝅘𝅥𝅯', beats: 0.25 },
  { dur: '32', label: 'Fusa', glyph: '𝅘𝅥𝅰', beats: 0.125 },
]

export const DURATION_LABELS = Object.fromEntries(
  DURATIONS.map((item) => [item.dur, item.label]),
)

export const ACCIDENTALS = [
  { value: 's', label: 'Sostenido', glyph: '♯' },
  { value: 'f', label: 'Bemol', glyph: '♭' },
  { value: 'n', label: 'Becuadro', glyph: '♮' },
  { value: 'ss', label: 'Doble sostenido', glyph: '𝄪' },
  { value: 'ff', label: 'Doble bemol', glyph: '𝄫' },
  { value: '', label: 'Sin alteración', glyph: '—' },
]

export const ACCIDENTAL_GLYPHS = Object.fromEntries(
  ACCIDENTALS.filter((item) => item.value).map((item) => [item.value, item.glyph]),
)

export const CLEFS = [
  { shape: 'G', line: '2', label: 'Sol (violín)' },
  { shape: 'F', line: '4', label: 'Fa (bajo)' },
  { shape: 'C', line: '3', label: 'Do en 3ª (contralto)' },
  { shape: 'C', line: '4', label: 'Do en 4ª (tenor)' },
  { shape: 'G', line: '1', label: 'Sol en 1ª (francesa)' },
  { shape: 'F', line: '3', label: 'Fa en 3ª (barítono)' },
  { shape: 'perc', line: '3', label: 'Percusión' },
]

export const KEY_SIGNATURES = [
  { sig: '7f', label: 'Do♭ mayor / La♭ menor (7♭)' },
  { sig: '6f', label: 'Sol♭ mayor / Mi♭ menor (6♭)' },
  { sig: '5f', label: 'Re♭ mayor / Si♭ menor (5♭)' },
  { sig: '4f', label: 'La♭ mayor / Fa menor (4♭)' },
  { sig: '3f', label: 'Mi♭ mayor / Do menor (3♭)' },
  { sig: '2f', label: 'Si♭ mayor / Sol menor (2♭)' },
  { sig: '1f', label: 'Fa mayor / Re menor (1♭)' },
  { sig: '0', label: 'Do mayor / La menor' },
  { sig: '1s', label: 'Sol mayor / Mi menor (1♯)' },
  { sig: '2s', label: 'Re mayor / Si menor (2♯)' },
  { sig: '3s', label: 'La mayor / Fa♯ menor (3♯)' },
  { sig: '4s', label: 'Mi mayor / Do♯ menor (4♯)' },
  { sig: '5s', label: 'Si mayor / Sol♯ menor (5♯)' },
  { sig: '6s', label: 'Fa♯ mayor / Re♯ menor (6♯)' },
  { sig: '7s', label: 'Do♯ mayor / La♯ menor (7♯)' },
]

export const TIME_SIGNATURES = [
  { count: '2', unit: '4', label: '2/4' },
  { count: '3', unit: '4', label: '3/4' },
  { count: '4', unit: '4', label: '4/4' },
  { count: '5', unit: '4', label: '5/4' },
  { count: '6', unit: '4', label: '6/4' },
  { count: '2', unit: '2', label: '2/2' },
  { count: '3', unit: '2', label: '3/2' },
  { count: '3', unit: '8', label: '3/8' },
  { count: '6', unit: '8', label: '6/8' },
  { count: '9', unit: '8', label: '9/8' },
  { count: '12', unit: '8', label: '12/8' },
  { count: '7', unit: '8', label: '7/8' },
]

export const ARTICULATIONS = [
  { value: 'stacc', label: 'Staccato', glyph: '•' },
  { value: 'acc', label: 'Acento', glyph: '>' },
  { value: 'ten', label: 'Tenuto', glyph: '–' },
  { value: 'marc', label: 'Marcato', glyph: '∧' },
  { value: 'stacciss', label: 'Staccatissimo', glyph: '▾' },
]

export const DYNAMICS = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'sf', 'sfz']

export const BARLINES = [
  { value: '', label: 'Sencilla' },
  { value: 'dbl', label: 'Doble' },
  { value: 'end', label: 'Final' },
  { value: 'rptstart', label: 'Inicio de repetición' },
  { value: 'rptend', label: 'Fin de repetición' },
  { value: 'rptboth', label: 'Repetición a ambos lados' },
]

export const TUPLETS = [
  { num: 3, numbase: 2, label: 'Tresillo' },
  { num: 5, numbase: 4, label: 'Quintillo' },
  { num: 6, numbase: 4, label: 'Seisillo' },
  { num: 7, numbase: 4, label: 'Septillo' },
]

export const TEMPO_PRESETS = [
  { text: 'Largo', bpm: 50 },
  { text: 'Adagio', bpm: 70 },
  { text: 'Andante', bpm: 90 },
  { text: 'Moderato', bpm: 108 },
  { text: 'Allegro', bpm: 132 },
  { text: 'Presto', bpm: 176 },
]

export const INSTRUMENTS = [
  { value: 'piano', label: 'Piano' },
  { value: 'guitar', label: 'Guitarra' },
  { value: 'violin', label: 'Violín' },
  { value: 'cello', label: 'Violonchelo' },
  { value: 'flute', label: 'Flauta' },
  { value: 'clarinet', label: 'Clarinete' },
  { value: 'trumpet', label: 'Trompeta' },
  { value: 'saxophone', label: 'Saxofón' },
  { value: 'drums', label: 'Percusión' },
  { value: 'voice', label: 'Voz' },
  { value: 'other', label: 'Otro' },
]

export const GENRES = [
  { value: 'general', label: 'General' },
  { value: 'classical', label: 'Clásica' },
  { value: 'jazz', label: 'Jazz' },
  { value: 'pop', label: 'Pop' },
  { value: 'rock', label: 'Rock' },
  { value: 'folk', label: 'Folk' },
  { value: 'latin', label: 'Latina' },
  { value: 'film', label: 'Cine' },
  { value: 'religious', label: 'Religiosa' },
  { value: 'educational', label: 'Didáctica' },
  { value: 'other', label: 'Otro' },
]

export const NOTE_NAMES_ES = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si']
const PNAME_TO_INDEX = { c: 0, d: 1, e: 2, f: 3, g: 4, a: 5, b: 6 }

/** "Do♯4" from a note's MEI attributes, for a Spanish-speaking musician. */
export function noteLabel(pname, octave, accid) {
  if (!pname) return 'Silencio'
  const index = PNAME_TO_INDEX[String(pname).toLowerCase()]
  const name = index == null ? String(pname).toUpperCase() : NOTE_NAMES_ES[index]
  const glyph = accid ? ACCIDENTAL_GLYPHS[accid] || '' : ''
  return `${name}${glyph}${octave ?? ''}`
}

/** Letter keys for note entry, mapped to diatonic steps. */
export const KEY_TO_PNAME = {
  c: 'c',
  d: 'd',
  e: 'e',
  f: 'f',
  g: 'g',
  a: 'a',
  b: 'b',
}

export const EXPORT_FORMATS = [
  { value: 'musicxml', label: 'MusicXML', hint: 'MuseScore, Sibelius, Finale' },
  { value: 'mxl', label: 'MusicXML comprimido', hint: 'Archivo .mxl más pequeño' },
  { value: 'midi', label: 'MIDI', hint: 'Para secuenciadores y DAW' },
  { value: 'mei', label: 'MEI', hint: 'Formato interno de Musicatte' },
]
