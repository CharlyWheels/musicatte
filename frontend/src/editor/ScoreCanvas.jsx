import { useEffect, useRef } from 'react'
import { Accidental, Factory, Formatter, Stave, StaveNote } from 'vexflow'

export default function ScoreCanvas({ score, selectedIndex, onSelectIndex }) {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.innerHTML = ''

    const factory = new Factory({
      renderer: { elementId: container.id, width: 900, height: 220 },
    })
    const context = factory.getContext()

    const stave = new Stave(20, 40, 840)
    stave.addClef(score.clef).addTimeSignature('4/4').addKeySignature(score.keySignature)
    stave.setContext(context).draw()

    const notes = score.measures[0].notes.map((n) => {
      const note = new StaveNote({
        keys: [n.pitch.toLowerCase()],
        duration: n.duration,
        clef: score.clef,
      })
      if (n.accidental) {
        note.addModifier(new Accidental(n.accidental), 0)
      }
      return note
    })
    Formatter.FormatAndDraw(context, stave, notes)

    // Click mapping basic: split stave width into note slots.
    const clickHandler = (evt) => {
      const rect = container.getBoundingClientRect()
      const x = evt.clientX - rect.left
      const idx = Math.max(0, Math.min(notes.length - 1, Math.floor((x - 40) / 180)))
      onSelectIndex(idx)
    }
    container.addEventListener('click', clickHandler)
    return () => container.removeEventListener('click', clickHandler)
  }, [score, onSelectIndex])

  return (
    <div className="rounded-lg border bg-white p-2">
      <p className="mb-2 text-sm text-slate-600">
        Nota seleccionada: {selectedIndex >= 0 ? selectedIndex + 1 : 'ninguna'}
      </p>
      <div id="score-canvas" ref={containerRef} className="overflow-x-auto" />
    </div>
  )
}
