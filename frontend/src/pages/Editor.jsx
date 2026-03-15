import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ScoreCanvas from '../editor/ScoreCanvas'
import Toolbar from '../editor/Toolbar'
import NotePanel from '../editor/NotePanel'
import AccidentalPanel from '../editor/AccidentalPanel'
import ScoreSettingsPanel from '../editor/ScoreSettingsPanel'
import {
  changePitch,
  changeDuration,
  changeAccidental,
  changeClef,
  changeKeySig,
  changeTimeSig,
  toggleDot,
  toggleTie,
  toggleRest,
  insertNoteAfter,
  addNoteToChord,
  deleteNote,
  getNoteInfo,
  getScoreProperties,
  addMeasureMEI,
  deleteLastMeasureMEI,
  getMeasureCountMEI,
} from '../editor/meiEditor'
import { getTitleFromMusicXML, setTitleInMusicXML } from '../editor/musicxmlUtils'
import { scoreService } from '../services/scoreService'
import { repositoryService } from '../services/repositoryService'
import { DEFAULT_MUSICXML } from '../editor/defaults'
import { ChevronDown, ChevronUp, Music, Plus, Trash2, Minus, MousePointer2, Layers } from 'lucide-react'

export default function Editor() {
  const location = useLocation()
  const { token } = useAuth()
  const importedMusicXML = location.state?.musicxml
  const importedScoreId = location.state?.scoreId || null

  const [musicxml, setMusicxml] = useState(importedMusicXML || DEFAULT_MUSICXML)
  const [renderKey, setRenderKey] = useState(0)
  const undoStack = useRef([])
  const redoStack = useRef([])
  const [selectedId, setSelectedId] = useState(null)
  const [noteInfo, setNoteInfo] = useState(null)
  const [scoreProps, setScoreProps] = useState(null)
  const [measureCount, setMeasureCount] = useState(0)
  const [scoreId, setScoreId] = useState(importedScoreId)
  const [toast, setToast] = useState(null)
  const [panelsOpen, setPanelsOpen] = useState(true)
  const [insertMode, setInsertMode] = useState(false)
  const toolkitRef = useRef(null)

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  function handleToolkitReady(tk) {
    toolkitRef.current = tk
    tk.loadData(musicxml)
    refreshState()
    setRenderKey((k) => k + 1)
  }

  function refreshState() {
    if (!toolkitRef.current) return
    setScoreProps(getScoreProperties(toolkitRef.current))
    setMeasureCount(getMeasureCountMEI(toolkitRef.current))
  }

  useEffect(() => {
    if (selectedId && toolkitRef.current) {
      setNoteInfo(getNoteInfo(toolkitRef.current, selectedId))
    } else {
      setNoteInfo(null)
    }
  }, [selectedId, renderKey])

  useEffect(() => { refreshState() }, [renderKey])

  function pushUndo() {
    if (!toolkitRef.current) return
    undoStack.current.push(toolkitRef.current.getMEI())
    redoStack.current = []
  }

  function applyEdit(fn) {
    if (!toolkitRef.current) return
    pushUndo()
    const result = fn()
    if (result) {
      setRenderKey((k) => k + 1)
    } else {
      undoStack.current.pop()
    }
  }

  function doUndo() {
    if (!toolkitRef.current || undoStack.current.length === 0) return
    redoStack.current.push(toolkitRef.current.getMEI())
    toolkitRef.current.loadData(undoStack.current.pop())
    setSelectedId(null)
    setRenderKey((k) => k + 1)
  }

  function doRedo() {
    if (!toolkitRef.current || redoStack.current.length === 0) return
    undoStack.current.push(toolkitRef.current.getMEI())
    toolkitRef.current.loadData(redoStack.current.pop())
    setSelectedId(null)
    setRenderKey((k) => k + 1)
  }

  function handleDragPitch(noteId, steps) {
    applyEdit(() => changePitch(toolkitRef.current, noteId, steps))
  }

  function handleChangeDuration(dur) {
    if (!selectedId) return
    applyEdit(() => changeDuration(toolkitRef.current, selectedId, dur))
  }

  function handleChangeAccidental(accid) {
    if (!selectedId) return
    applyEdit(() => changeAccidental(toolkitRef.current, selectedId, accid))
  }

  function handleToggleDot() {
    if (!selectedId) return
    applyEdit(() => toggleDot(toolkitRef.current, selectedId))
  }

  function handleToggleTie() {
    if (!selectedId) return
    applyEdit(() => toggleTie(toolkitRef.current, selectedId))
  }

  function handleToggleRest() {
    if (!selectedId) return
    applyEdit(() => toggleRest(toolkitRef.current, selectedId))
  }

  // Add note to chord (same beat, different pitch)
  function handleAddToChord() {
    if (!selectedId || !toolkitRef.current) return
    pushUndo()
    const result = addNoteToChord(toolkitRef.current, selectedId)
    if (result) {
      setSelectedId(result.newId)
      setRenderKey((k) => k + 1)
    } else {
      undoStack.current.pop()
    }
  }

  // Insert note sequentially after selected
  function handleInsertAfter() {
    if (!selectedId || !toolkitRef.current) return
    pushUndo()
    const result = insertNoteAfter(toolkitRef.current, selectedId)
    if (result) {
      setSelectedId(result.newId)
      setRenderKey((k) => k + 1)
    } else {
      undoStack.current.pop()
    }
  }

  // Insert mode: click on staff to add note at position
  function handleInsertAtPosition(afterNoteId) {
    if (!toolkitRef.current || !afterNoteId) return
    pushUndo()
    const result = insertNoteAfter(toolkitRef.current, afterNoteId)
    if (result) {
      setSelectedId(result.newId)
      setInsertMode(false)
      setRenderKey((k) => k + 1)
    } else {
      undoStack.current.pop()
    }
  }

  function handleDeleteNote() {
    if (!selectedId) return
    applyEdit(() => {
      const r = deleteNote(toolkitRef.current, selectedId)
      if (r) setSelectedId(null)
      return r
    })
  }

  function handleChangeClef(shape, line) {
    applyEdit(() => changeClef(toolkitRef.current, shape, line))
  }
  function handleChangeKeySig(sig) {
    applyEdit(() => changeKeySig(toolkitRef.current, sig))
  }
  function handleChangeTimeSig(count, unit) {
    applyEdit(() => changeTimeSig(toolkitRef.current, count, unit))
  }
  function handleTitleChange(title) {
    setMusicxml((prev) => setTitleInMusicXML(prev, title))
  }
  function handleAddMeasure() {
    applyEdit(() => addMeasureMEI(toolkitRef.current))
  }
  function handleDeleteMeasure() {
    applyEdit(() => deleteLastMeasureMEI(toolkitRef.current))
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
      if (e.key === 'Escape') { setInsertMode(false); return }
      if (e.key === 'i') { setInsertMode((m) => !m); return }
      if (e.key === 'ArrowUp' && selectedId) { e.preventDefault(); handleDragPitch(selectedId, 1) }
      if (e.key === 'ArrowDown' && selectedId) { e.preventDefault(); handleDragPitch(selectedId, -1) }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { e.preventDefault(); handleDeleteNote() }
      if (e.key === '.' && selectedId) { e.preventDefault(); handleToggleDot() }
      if (e.key === 'r' && selectedId) { e.preventDefault(); handleToggleRest() }
      if (e.key === 't' && selectedId) { e.preventDefault(); handleToggleTie() }
      if (e.key === 'n' && selectedId) { e.preventDefault(); handleInsertAfter() }
      if (e.key === 'a' && selectedId) { e.preventDefault(); handleAddToChord() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); doUndo() }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); doRedo() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId])

  function getCurrentData() {
    return toolkitRef.current ? toolkitRef.current.getMEI() : musicxml
  }

  async function onSave() {
    try {
      const data = getCurrentData()
      const title = getTitleFromMusicXML(musicxml)
      const payload = { title, instrument: 'piano', genre: 'general', musicxml: data, status: 'draft' }
      const saved = scoreId
        ? await scoreService.update(scoreId, payload, token)
        : await scoreService.create(payload, token)
      setScoreId(saved.id)
      showToast('Partitura guardada')
    } catch {
      showToast('Error al guardar', 'error')
    }
  }

  async function onPublish() {
    if (!scoreId) { showToast('Guarda antes de publicar', 'error'); return }
    try {
      await repositoryService.publish(scoreId, token)
      showToast('Publicada en el repositorio')
    } catch {
      showToast('Error al publicar', 'error')
    }
  }

  function onExport() {
    const data = getCurrentData()
    const title = getTitleFromMusicXML(musicxml) || 'partitura'
    const blob = new Blob([data], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title}.xml`
    a.click()
    URL.revokeObjectURL(url)
  }

  const title = getTitleFromMusicXML(musicxml)

  return (
    <div className="flex flex-col gap-4">
      {toast && (
        <div className={`fixed right-4 top-20 z-50 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
          <Music size={20} />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">Editor de partituras</h1>
          <p className="text-sm text-slate-500">Selecciona notas y edítalas con las herramientas</p>
        </div>
        {/* Insert mode toggle */}
        <button
          onClick={() => setInsertMode((m) => !m)}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium transition active:scale-95 ${
            insertMode
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
          title="Modo insertar (I) — Haz clic en el pentagrama para añadir notas"
        >
          <MousePointer2 size={16} />
          {insertMode ? 'Insertando...' : 'Insertar'}
        </button>
      </div>

      <Toolbar
        title={title}
        onTitleChange={handleTitleChange}
        onSave={onSave}
        onPublish={onPublish}
        onExport={onExport}
        onAddMeasure={handleAddMeasure}
        onDeleteMeasure={handleDeleteMeasure}
        onUndo={doUndo}
        onRedo={doRedo}
        canUndo={undoStack.current.length > 0}
        canRedo={redoStack.current.length > 0}
        measureCount={measureCount}
      />

      {/* Insert mode hint */}
      {insertMode && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
          <MousePointer2 size={16} />
          <span className="font-medium">Modo insertar activo</span>
          <span className="text-emerald-600">— Haz clic en cualquier compás para añadir una nota</span>
          <button onClick={() => setInsertMode(false)} className="ml-auto text-xs font-medium text-emerald-500 hover:text-emerald-700">
            Esc para salir
          </button>
        </div>
      )}

      {/* Selected note info + actions */}
      {noteInfo && !insertMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2.5 text-sm">
          <span className="font-bold text-indigo-700">
            {noteInfo.isRest ? 'Silencio' : `${noteInfo.pname}${noteInfo.oct}`}
          </span>
          <span className="text-indigo-500">{noteInfo.durLabel}</span>
          {noteInfo.accid && (
            <span className="text-indigo-500">
              {noteInfo.accid === 's' ? '\u266f' : noteInfo.accid === 'f' ? '\u266d' : '\u266e'}
            </span>
          )}
          {noteInfo.dots === '1' && <span className="text-indigo-500">con puntillo</span>}

          <div className="ml-auto flex flex-wrap gap-1">
            <button onClick={handleToggleDot} title="Puntillo (.)" className="rounded-lg border border-indigo-200 bg-white px-2 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-100 active:scale-95">.</button>
            <button onClick={handleToggleTie} title="Ligadura (T)" className="rounded-lg border border-indigo-200 bg-white px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-100 active:scale-95">{'\u2040'}</button>
            <button onClick={handleToggleRest} title="Silencio (R)" className="rounded-lg border border-indigo-200 bg-white px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-100 active:scale-95">
              <Minus size={12} />
            </button>

            <div className="mx-1 h-5 w-px bg-indigo-200" />

            <button
              onClick={handleAddToChord}
              title="Añadir al acorde (A) — Añade una nota en el mismo tiempo"
              className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-100 active:scale-95"
            >
              <Layers size={12} /> Acorde
            </button>
            <button
              onClick={handleInsertAfter}
              title="Insertar después (N) — Añade una nota después"
              className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-100 active:scale-95"
            >
              <Plus size={12} /> Después
            </button>
            <button
              onClick={handleDeleteNote}
              title="Eliminar (Del)"
              className="flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 active:scale-95"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      )}

      <ScoreCanvas
        onToolkitReady={handleToolkitReady}
        renderKey={renderKey}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onDragPitch={handleDragPitch}
        insertMode={insertMode}
        onInsertAtPosition={handleInsertAtPosition}
      />

      <button
        onClick={() => setPanelsOpen(!panelsOpen)}
        className="flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-700 md:hidden"
      >
        {panelsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        {panelsOpen ? 'Ocultar herramientas' : 'Mostrar herramientas'}
      </button>

      <div className={`grid gap-3 sm:grid-cols-2 ${panelsOpen ? '' : 'hidden md:grid'}`}>
        <NotePanel activeDur={noteInfo?.dur} onChangeDuration={handleChangeDuration} />
        <AccidentalPanel activeAccid={noteInfo?.accid} onChangeAccidental={handleChangeAccidental} />
      </div>

      <div className={panelsOpen ? '' : 'hidden md:block'}>
        <ScoreSettingsPanel
          clefShape={scoreProps?.clefShape}
          clefLine={scoreProps?.clefLine}
          keySig={scoreProps?.keySig}
          meterCount={scoreProps?.meterCount}
          meterUnit={scoreProps?.meterUnit}
          onChangeClef={handleChangeClef}
          onChangeKeySig={handleChangeKeySig}
          onChangeTimeSig={handleChangeTimeSig}
        />
      </div>

      <div className="hidden text-xs text-slate-400 md:block">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{'\u2191\u2193'}</span> tono
        {' \u00b7 '}
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">A</span> acorde
        {' \u00b7 '}
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">N</span> nota después
        {' \u00b7 '}
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">I</span> modo insertar
        {' \u00b7 '}
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">R</span> silencio
        {' \u00b7 '}
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">.</span> puntillo
        {' \u00b7 '}
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">T</span> ligadura
        {' \u00b7 '}
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">Del</span> eliminar
        {' \u00b7 '}
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{'\u2318Z'}</span> deshacer
      </div>
    </div>
  )
}
