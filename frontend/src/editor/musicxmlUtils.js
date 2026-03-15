const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

const DURATION_LABELS = [
  { type: 'whole', label: 'Redonda', icon: '\ud834\udd5d', divisions: 16 },
  { type: 'half', label: 'Blanca', icon: '\ud834\udd5e', divisions: 8 },
  { type: 'quarter', label: 'Negra', icon: '\u2669', divisions: 4 },
  { type: 'eighth', label: 'Corchea', icon: '\u266a', divisions: 2 },
  { type: '16th', label: 'Semicorchea', icon: '\ud834\udd61', divisions: 1 },
]

export { DURATION_LABELS }

export function parseMusicXML(xmlStr) {
  const parser = new DOMParser()
  return parser.parseFromString(xmlStr, 'application/xml')
}

export function serializeMusicXML(doc) {
  const serializer = new XMLSerializer()
  return serializer.serializeToString(doc)
}

export function getTitleFromMusicXML(xmlStr) {
  try {
    const doc = parseMusicXML(xmlStr)
    return doc.querySelector('work-title')?.textContent || 'Sin título'
  } catch {
    return 'Sin título'
  }
}

export function setTitleInMusicXML(xmlStr, title) {
  const doc = parseMusicXML(xmlStr)
  let workTitle = doc.querySelector('work-title')
  if (!workTitle) {
    let work = doc.querySelector('work')
    if (!work) {
      work = doc.createElement('work')
      const root = doc.querySelector('score-partwise')
      root.insertBefore(work, root.firstChild)
    }
    workTitle = doc.createElement('work-title')
    work.appendChild(workTitle)
  }
  workTitle.textContent = title
  return serializeMusicXML(doc)
}

export function getMeasureCount(xmlStr) {
  try {
    const doc = parseMusicXML(xmlStr)
    return doc.querySelectorAll('measure').length
  } catch {
    return 0
  }
}

export function getNoteIndexFromMEI(toolkit, noteId) {
  try {
    const mei = toolkit.getMEI()
    const meiDoc = parseMusicXML(mei)
    const allNotes = meiDoc.querySelectorAll('note')
    let pitchedIndex = 0
    for (let i = 0; i < allNotes.length; i++) {
      const id = allNotes[i].getAttribute('xml:id')
      const pname = allNotes[i].getAttribute('pname')
      if (id === noteId) return pitchedIndex
      if (pname) pitchedIndex++
    }
  } catch {
    // ignore
  }
  return -1
}

export function changePitchAtIndex(xmlStr, noteIndex, steps) {
  const doc = parseMusicXML(xmlStr)
  const notes = doc.querySelectorAll('note')

  let realIndex = 0
  for (const note of notes) {
    if (note.querySelector('rest')) continue
    if (realIndex === noteIndex) {
      const pitchEl = note.querySelector('pitch')
      if (!pitchEl) break

      const stepEl = pitchEl.querySelector('step')
      const octaveEl = pitchEl.querySelector('octave')
      if (!stepEl || !octaveEl) break

      let idx = STEPS.indexOf(stepEl.textContent)
      let oct = parseInt(octaveEl.textContent)

      idx += steps
      while (idx >= STEPS.length) { idx -= STEPS.length; oct++ }
      while (idx < 0) { idx += STEPS.length; oct-- }

      stepEl.textContent = STEPS[idx]
      octaveEl.textContent = String(Math.max(1, Math.min(8, oct)))
      return serializeMusicXML(doc)
    }
    realIndex++
  }
  return xmlStr
}

export function changeDurationAtIndex(xmlStr, noteIndex, newType) {
  const doc = parseMusicXML(xmlStr)
  const notes = doc.querySelectorAll('note')

  const durInfo = DURATION_LABELS.find((d) => d.type === newType)
  if (!durInfo) return xmlStr

  let realIndex = 0
  for (const note of notes) {
    if (note.querySelector('rest')) continue
    if (realIndex === noteIndex) {
      const typeEl = note.querySelector('type')
      if (typeEl) typeEl.textContent = newType

      const durationEl = note.querySelector('duration')
      if (durationEl) durationEl.textContent = String(durInfo.divisions)

      return serializeMusicXML(doc)
    }
    realIndex++
  }
  return xmlStr
}

export function changeAccidentalAtIndex(xmlStr, noteIndex, accidental) {
  const doc = parseMusicXML(xmlStr)
  const notes = doc.querySelectorAll('note')

  const alterMap = { sharp: '1', flat: '-1', natural: '0', none: null }

  let realIndex = 0
  for (const note of notes) {
    if (note.querySelector('rest')) continue
    if (realIndex === noteIndex) {
      const pitchEl = note.querySelector('pitch')
      if (!pitchEl) break

      let alterEl = pitchEl.querySelector('alter')
      const alterValue = alterMap[accidental]

      if (alterValue === null || alterValue === undefined) {
        if (alterEl) alterEl.parentNode.removeChild(alterEl)
      } else {
        if (!alterEl) {
          alterEl = doc.createElement('alter')
          const stepEl = pitchEl.querySelector('step')
          if (stepEl.nextSibling) {
            pitchEl.insertBefore(alterEl, stepEl.nextSibling)
          } else {
            pitchEl.appendChild(alterEl)
          }
        }
        alterEl.textContent = alterValue
      }

      let accidentalEl = note.querySelector('accidental')
      if (accidental === 'none') {
        if (accidentalEl) accidentalEl.parentNode.removeChild(accidentalEl)
      } else {
        if (!accidentalEl) {
          accidentalEl = doc.createElement('accidental')
          note.appendChild(accidentalEl)
        }
        accidentalEl.textContent = accidental
      }

      return serializeMusicXML(doc)
    }
    realIndex++
  }
  return xmlStr
}

export function addMeasure(xmlStr) {
  const doc = parseMusicXML(xmlStr)
  const part = doc.querySelector('part')
  if (!part) return xmlStr

  const measures = part.querySelectorAll('measure')
  const newNumber = measures.length + 1

  const divisions = doc.querySelector('attributes > divisions')?.textContent || '4'
  const divNum = parseInt(divisions)

  const measure = doc.createElement('measure')
  measure.setAttribute('number', String(newNumber))

  for (let i = 0; i < 4; i++) {
    const note = doc.createElement('note')
    const pitch = doc.createElement('pitch')
    const step = doc.createElement('step')
    step.textContent = ['C', 'D', 'E', 'F'][i]
    const octave = doc.createElement('octave')
    octave.textContent = '4'
    pitch.appendChild(step)
    pitch.appendChild(octave)
    note.appendChild(pitch)

    const duration = doc.createElement('duration')
    duration.textContent = String(divNum)
    note.appendChild(duration)

    const type = doc.createElement('type')
    type.textContent = 'quarter'
    note.appendChild(type)

    measure.appendChild(note)
  }

  part.appendChild(measure)
  return serializeMusicXML(doc)
}

export function deleteMeasure(xmlStr, measureNumber) {
  const doc = parseMusicXML(xmlStr)
  const measures = doc.querySelectorAll('measure')
  if (measures.length <= 1) return xmlStr

  for (const m of measures) {
    if (m.getAttribute('number') === String(measureNumber)) {
      m.parentNode.removeChild(m)
      break
    }
  }

  const remaining = doc.querySelectorAll('measure')
  remaining.forEach((m, i) => m.setAttribute('number', String(i + 1)))

  return serializeMusicXML(doc)
}
