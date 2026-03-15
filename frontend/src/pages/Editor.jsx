import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Toolbar from '../editor/Toolbar'
import ScoreCanvas from '../editor/ScoreCanvas'
import NotePanel from '../editor/NotePanel'
import AccidentalPanel from '../editor/AccidentalPanel'
import ClefPanel from '../editor/ClefPanel'
import KeySignature from '../editor/KeySignature'
import { initialScoreModel, movePitch } from '../editor/scoreModel'
import { scoreService } from '../services/scoreService'
import { repositoryService } from '../services/repositoryService'

export default function Editor() {
  const location = useLocation()
  const { token } = useAuth()
  const [score, setScore] = useState(() => location.state?.importedScore || initialScoreModel)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [scoreId, setScoreId] = useState(null)
  const selected = useMemo(() => score.measures[0].notes[selectedIndex], [score, selectedIndex])

  const updateSelected = useCallback(
    (transform) => {
      setScore((prev) => {
        const next = structuredClone(prev)
        next.measures[0].notes[selectedIndex] = transform(next.measures[0].notes[selectedIndex])
        return next
      })
    },
    [selectedIndex],
  )

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'ArrowUp') updateSelected((n) => ({ ...n, pitch: movePitch(n.pitch, 1) }))
      if (event.key === 'ArrowDown')
        updateSelected((n) => ({ ...n, pitch: movePitch(n.pitch, -1) }))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [updateSelected])

  async function onSave() {
    const payload = {
      title: score.title,
      instrument: 'piano',
      genre: 'general',
      score_data: score,
      status: 'draft',
    }
    const saved = scoreId
      ? await scoreService.update(scoreId, payload, token)
      : await scoreService.create(payload, token)
    setScoreId(saved.id)
    alert('Partitura guardada')
  }

  async function onPublish() {
    if (!scoreId) {
      alert('Guarda antes de publicar')
      return
    }
    await repositoryService.publish(scoreId, token)
    alert('Publicada en repositorio')
  }

  function onExport() {
    const blob = new Blob([JSON.stringify(score, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${score.title || 'partitura'}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Editor de partituras</h1>
      <Toolbar
        title={score.title}
        tempo={score.tempo}
        onTitleChange={(title) => setScore((prev) => ({ ...prev, title }))}
        onTempoChange={(tempo) => setScore((prev) => ({ ...prev, tempo }))}
        onSave={onSave}
        onPublish={onPublish}
        onExport={onExport}
      />
      <ScoreCanvas score={score} selectedIndex={selectedIndex} onSelectIndex={setSelectedIndex} />
      <div className="grid gap-3 lg:grid-cols-2">
        <NotePanel
          activeDuration={selected?.duration}
          onChangeDuration={(duration) => updateSelected((n) => ({ ...n, duration }))}
        />
        <AccidentalPanel onChangeAccidental={(accidental) => updateSelected((n) => ({ ...n, accidental }))} />
        <ClefPanel
          activeClef={score.clef}
          onChangeClef={(clef) => setScore((prev) => ({ ...prev, clef }))}
        />
        <KeySignature
          value={score.keySignature}
          onChange={(keySignature) => setScore((prev) => ({ ...prev, keySignature }))}
        />
      </div>
    </section>
  )
}
