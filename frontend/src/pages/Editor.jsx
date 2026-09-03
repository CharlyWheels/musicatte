/**
 * The editor: score first, one contextual panel, everything else out of the way.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ChevronRight, Keyboard, X } from 'lucide-react'

import { useAuth } from '../context/AuthContext.jsx'
import { useDevice } from '../hooks/useDevice.js'
import { useFillHeight } from '../hooks/useFillHeight.js'
import ScoreView from '../components/editor/ScoreView.jsx'
import { revealMeasure } from '../components/editor/scoreDom.js'
import EditorToolbar from '../components/editor/EditorToolbar.jsx'
import ContextPanel from '../components/editor/ContextPanel.jsx'
import ZoomControls from '../components/editor/ZoomControls.jsx'
import ToolSheet from '../components/editor/ToolSheet.jsx'
import ShortcutsDialog from '../components/editor/ShortcutsDialog.jsx'
import { useScoreEditor, readDraft, clearDraft } from '../editor/useScoreEditor.js'
import * as edits from '../editor/edits.js'
import { DURATION_LABELS, KEY_TO_PNAME } from '../editor/constants.js'
import { DEFAULT_MEI } from '../editor/fixtures.js'
import { localName, midiOf } from '../editor/mei.js'
import { pitchAt } from '../editor/pitchGeometry.js'
import { Playback } from '../editor/playback.js'
import { scoreService } from '../services/scoreService.js'
import { repositoryService } from '../services/repositoryService.js'

// The mobile navigation bar, which the sheet and the score both sit above.
const NAV_HEIGHT_PX = 60

export default function Editor() {
  const location = useLocation()
  const params = useParams()
  const navigate = useNavigate()
  const { token } = useAuth()

  const routeScoreId = params.id ? Number(params.id) : null
  const [scoreId, setScoreId] = useState(routeScoreId || location.state?.scoreId || null)
  // The state update from the first save has not landed by the time publishing
  // or exporting needs the id, so it is also tracked in a ref.
  const scoreIdRef = useRef(scoreId)
  const [published, setPublished] = useState(false)
  const [loadingScore, setLoadingScore] = useState(Boolean(routeScoreId))
  const [initialData, setInitialData] = useState(
    routeScoreId ? null : location.state?.scoreData || location.state?.musicxml || DEFAULT_MEI,
  )
  const [metadata, setMetadata] = useState({ instrument: 'piano', genre: 'general' })
  const [draftOffer, setDraftOffer] = useState(null)

  // ── open a saved score ─────────────────────────────────────────────

  useEffect(() => {
    if (!routeScoreId) return
    let cancelled = false
    ;(async () => {
      try {
        const score = await scoreService.get(routeScoreId, token)
        if (cancelled) return
        setInitialData(score.score_data)
        setPublished(score.status === 'published')
        setMetadata({ instrument: score.instrument, genre: score.genre })
        scoreIdRef.current = score.id
        setScoreId(score.id)
      } catch {
        if (!cancelled) navigate('/mis-partituras', { replace: true })
      } finally {
        if (!cancelled) setLoadingScore(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [routeScoreId, token, navigate])

  const autosave = useCallback(
    async (mei) => {
      const payload = {
        title: editorRef.current?.snapshot.title || 'Sin título',
        composer: editorRef.current?.snapshot.composer || null,
        instrument: metadata.instrument,
        genre: metadata.genre,
        score_data: mei,
        score_format: 'mei',
      }
      const existing = scoreIdRef.current
      if (existing) {
        await scoreService.update(existing, payload, token)
      } else {
        const created = await scoreService.create(payload, token)
        scoreIdRef.current = created.id
        setScoreId(created.id)
        // Keep the address bar honest so a refresh reopens the saved score
        // rather than a blank one.
        navigate(`/editor/${created.id}`, { replace: true, state: null })
      }
    },
    [metadata.genre, metadata.instrument, navigate, token],
  )

  const editor = useScoreEditor({
    initialData: initialData || DEFAULT_MEI,
    scoreId,
    onAutosave: token ? autosave : null,
  })
  const editorRef = useRef(editor)
  editorRef.current = editor

  const {
    ready,
    loadError,
    revision,
    engineRef,
    docRef,
    clipboardRef,
    selection,
    setSelection,
    apply,
    restore,
    undo,
    redo,
    canUndo,
    canRedo,
    dirty,
    saving,
    savedAt,
    saveNow,
    setTitle,
    snapshot,
    message,
    notify,
  } = editor

  // ── offer back work interrupted by a refresh ───────────────────────

  useEffect(() => {
    if (!ready || loadError) return
    const draft = readDraft(scoreId)
    if (!draft) return
    // Only offer it if it differs from what we just opened.
    if (docRef.current && draft.mei === docRef.current.toString()) {
      clearDraft(scoreId)
      return
    }
    setDraftOffer(draft)
  }, [ready, loadError, scoreId, docRef])

  // ── local UI state ─────────────────────────────────────────────────

  const [insertMode, setInsertMode] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [activeStaff, setActiveStaff] = useState('1')
  const [currentMeasure, setCurrentMeasure] = useState(1)
  const [entryDuration, setEntryDuration] = useState('4')
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  // The collapsed sheet's height, measured, so the score gets exactly the
  // space that is left rather than a guess at it.
  const [sheetHeight, setSheetHeight] = useState(96)
  const [exporting, setExporting] = useState(false)
  const [soundingIds, setSoundingIds] = useState([])
  const [playing, setPlaying] = useState(false)
  // Bumped when the engraving is re-laid out for a new width, so the pages are
  // redrawn from the new layout.
  const [layoutTick, setLayoutTick] = useState(0)
  const bumpLayout = useCallback(() => setLayoutTick((value) => value + 1), [])

  const { isCompact, isTouch } = useDevice()
  const scoreContainerRef = useRef(null)
  const frameRef = useRef(null)
  const playbackRef = useRef(null)
  if (!playbackRef.current) playbackRef.current = new Playback()

  useEffect(() => {
    const playback = playbackRef.current
    playback.onHighlight = (id, on) => {
      setSoundingIds((current) => {
        if (id == null) return []
        if (on) return [...current, id]
        return current.filter((value) => value !== id)
      })
    }
    playback.onEnded = () => setPlaying(false)
    return () => playback.stop({ silent: true })
  }, [])

  // Stop playback when the document changes under it.
  useEffect(() => {
    if (playing) {
      playbackRef.current.stop()
      setPlaying(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision])

  useEffect(() => {
    if (engineRef.current) engineRef.current.setZoom(zoom)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, ready])

  // ── information about the selection ────────────────────────────────

  const noteInfo = useMemo(() => {
    const doc = docRef.current
    if (!doc || selection.length !== 1) return null
    const element = doc.byId(selection[0])
    if (!element) return null
    const parent = element.parentNode
    const holder =
      parent && localName(parent) === 'chord' ? parent : element
    return {
      pname: element.getAttribute('pname'),
      oct: element.getAttribute('oct'),
      accid: element.getAttribute('accid') || '',
      dur: holder.getAttribute('dur') || '4',
      durLabel: DURATION_LABELS[holder.getAttribute('dur') || '4'] || '',
      dots: holder.getAttribute('dots') || '',
      artic: holder.getAttribute('artic') || '',
      isRest: localName(element) === 'rest',
      measure: doc.measureNumber(element),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, revision, docRef])

  const lyric = useMemo(() => {
    const doc = docRef.current
    if (!doc || selection.length !== 1) return ''
    return edits.readLyric(doc, selection[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, revision, docRef])

  const tempo = useMemo(() => {
    const doc = docRef.current
    return doc ? edits.readTempo(doc) : { text: '', bpm: null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, docRef])

  const currentBarline = useMemo(() => {
    const doc = docRef.current
    return doc ? edits.readBarline(doc, currentMeasure) : ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMeasure, revision, docRef])

  useEffect(() => {
    if (selection.length === 1 && noteInfo?.measure) setCurrentMeasure(noteInfo.measure)
  }, [selection, noteInfo])

  // Ids rather than numbers: only the visible pages are in the DOM, so a
  // measure cannot be located by counting rendered ones.
  const flaggedMeasureIds = useMemo(() => {
    const doc = docRef.current
    if (!doc) return []
    return snapshot.problems
      .map((problem) => doc.measureByNumber(problem.measure))
      .filter(Boolean)
      .map((measure) => measure.getAttribute('xml:id'))
      .filter(Boolean)
  }, [snapshot.problems, docRef])

  // ── selection handling ─────────────────────────────────────────────

  const handleSelect = useCallback(
    (id, { extend = false } = {}) => {
      setSelection((current) => {
        if (!extend) return [id]
        if (current.includes(id)) return current.filter((value) => value !== id)
        // Keep the selection in document order, which is what slurs, beams and
        // tuplets need.
        const doc = docRef.current
        const next = [...current, id]
        if (!doc) return next
        const order = doc.events.map((event) => event.getAttribute('xml:id'))
        return next.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b))
      })
    },
    [setSelection, docRef],
  )

  // ── actions ────────────────────────────────────────────────────────

  const withSelection = useCallback(
    (operation, { requireSelection = true } = {}) => {
      if (requireSelection && !selection.length) {
        notify('Selecciona una nota primero.', 'warning')
        return
      }
      const result = apply(operation)
      if (result?.id) setSelection([result.id])
      if (result?.ids) setSelection(result.ids)
    },
    [apply, notify, selection.length, setSelection],
  )

  const actions = useMemo(
    () => ({
      currentBarline,
      setDuration: (dur) => {
        setEntryDuration(dur)
        if (selection.length) withSelection((doc) => edits.changeDuration(doc, selection, dur))
      },
      toggleDot: () => withSelection((doc) => edits.toggleDots(doc, selection, 1)),
      setAccidental: (accid) =>
        withSelection((doc) => edits.changeAccidental(doc, selection, accid)),
      toggleRest: () => withSelection((doc) => edits.toggleRest(doc, selection[0])),
      addChordNote: () => withSelection((doc) => edits.addChordNote(doc, selection[0])),
      insertAfter: () =>
        withSelection((doc) => edits.insertAfter(doc, selection[0], { dur: entryDuration })),
      deleteSelection: () => withSelection((doc) => edits.deleteEvents(doc, selection)),
      shiftOctave: (delta) => withSelection((doc) => edits.shiftOctave(doc, selection, delta)),
      transpose: (semitones) =>
        withSelection((doc) => edits.transpose(doc, selection, semitones)),
      toggleArticulation: (artic) =>
        withSelection((doc) => edits.toggleArticulation(doc, selection, artic)),
      setDynamic: (value) => withSelection((doc) => edits.addDynamic(doc, selection[0], value)),
      addHairpin: (form) => withSelection((doc) => edits.addHairpin(doc, selection, form)),
      toggleTie: () => withSelection((doc) => edits.toggleTie(doc, selection[0])),
      addSlur: () => withSelection((doc) => edits.addSlur(doc, selection)),
      beam: () => withSelection((doc) => edits.beamSelection(doc, selection)),
      unbeam: () => withSelection((doc) => edits.unbeamSelection(doc, selection)),
      makeTuplet: (num, numbase) =>
        withSelection((doc) => edits.makeTuplet(doc, selection, num, numbase)),
      removeTuplet: () => withSelection((doc) => edits.removeTuplet(doc, selection)),
      setLyric: (text) => withSelection((doc) => edits.setLyric(doc, selection[0], text)),
      copy: () => {
        const doc = docRef.current
        if (!doc || !selection.length) return
        const copied = edits.copyEvents(doc, selection)
        if (copied) {
          clipboardRef.current = copied
          notify(`${copied.length} elemento(s) copiados.`)
        }
      },
      paste: () => {
        if (!clipboardRef.current.length) {
          notify('No hay nada copiado.', 'warning')
          return
        }
        withSelection((doc) => edits.pasteEvents(doc, selection[0], clipboardRef.current))
      },

      setClef: (shape, line) =>
        apply((doc) => edits.changeClef(doc, activeStaff, shape, line)),
      setKeySignature: (sig) => apply((doc) => edits.changeKeySignature(doc, activeStaff, sig)),
      setTimeSignature: (count, unit) =>
        apply((doc) => edits.changeTimeSignature(doc, activeStaff, count, unit)),
      setTempo: (text, bpm) => apply((doc) => edits.setTempo(doc, 1, text, bpm)),
      addStaff: () => apply((doc) => edits.addStaff(doc, { clefShape: 'F', clefLine: '4' })),
      removeStaff: (staff) => {
        apply((doc) => edits.removeStaff(doc, staff))
        setActiveStaff('1')
      },
      addLayer: (staff) => apply((doc) => edits.addLayer(doc, staff)),
      setBarline: (form) => apply((doc) => edits.setBarline(doc, currentMeasure, form)),
      insertMeasureAfter: (number) => apply((doc) => edits.insertMeasure(doc, number)),
      clearMeasure: (number) => apply((doc) => edits.clearMeasure(doc, number)),
      deleteMeasure: (number) => {
        apply((doc) => edits.deleteMeasure(doc, number))
        setSelection([])
        setCurrentMeasure((current) => Math.max(1, current - 1))
      },
      addKeyChange: (number) => {
        const sig = window.prompt(
          'Nueva armadura a partir de este compás (por ejemplo 2s para dos sostenidos, 3f para tres bemoles):',
          '2s',
        )
        if (sig) apply((doc) => edits.addMidScoreChange(doc, number, { keySig: sig }))
      },
      addMeterChange: (number) => {
        const value = window.prompt('Nuevo compás (por ejemplo 3/4):', '3/4')
        if (!value) return
        const [count, unit] = value.split('/')
        if (!count || !unit) {
          notify('Escribe el compás como 3/4.', 'warning')
          return
        }
        apply((doc) =>
          edits.addMidScoreChange(doc, number, { meter: { count: count.trim(), unit: unit.trim() } }),
        )
      },
      addVolta: (number) => {
        const label = window.prompt('Número de la casilla de repetición:', '1')
        if (label) apply((doc) => edits.addVolta(doc, number, number, label))
      },
    }),
    [
      activeStaff,
      apply,
      clipboardRef,
      currentBarline,
      currentMeasure,
      docRef,
      entryDuration,
      notify,
      selection,
      setSelection,
      withSelection,
    ],
  )

  const handleOpenMeasure = useCallback(
    (measureId) => {
      const doc = docRef.current
      const element = measureId ? doc?.byId(measureId) : null
      const number = element ? doc.measureNumber(element) : null
      if (number) setCurrentMeasure(number)
    },
    [docRef],
  )

  /** Follow a warning to the bar it is about. */
  const goToMeasure = useCallback(
    (number) => {
      setCurrentMeasure(number)
      const doc = docRef.current
      const measure = doc?.measureByNumber(number)
      const id = measure?.getAttribute('xml:id')
      if (id) revealMeasure(scoreContainerRef.current, id)
    },
    [docRef],
  )

  const handleDragPitch = useCallback(
    (id, steps) => {
      apply((doc) => edits.changePitch(doc, id, steps))
    },
    [apply],
  )

  const handleAddNoteAt = useCallback(
    ({ measureId, staff, halfStepsFromTopLine }) => {
      const doc = docRef.current
      if (!doc) return
      const measureElement = measureId ? doc.byId(measureId) : null
      const measure = measureElement ? doc.measureNumber(measureElement) : null
      if (!measure) return
      setCurrentMeasure(measure)

      const properties = doc.staffProperties(staff) || {}
      const { pname, octave } = pitchAt(halfStepsFromTopLine, properties)
      const result = apply((candidate) =>
        edits.appendToMeasure(candidate, measure, {
          staff,
          pname,
          octave,
          dur: entryDuration,
        }),
      )
      if (result?.id) {
        setSelection([result.id])
        const element = docRef.current?.byId(result.id)
        if (element) playbackRef.current.preview(midiOf(element))
      }
    },
    [apply, docRef, entryDuration, setSelection],
  )

  // ── playback ───────────────────────────────────────────────────────

  const togglePlay = useCallback(() => {
    const playback = playbackRef.current
    if (playing) {
      playback.stop()
      setPlaying(false)
      return
    }
    const engine = engineRef.current
    const doc = docRef.current
    if (!engine || !doc) return
    if (!playback.available) {
      notify('Tu navegador no permite reproducir audio.', 'warning')
      return
    }
    const duration = playback.prepare(engine.timemap(), doc)
    if (!duration) {
      notify('No hay notas que reproducir.', 'warning')
      return
    }
    playback.play(0)
    setPlaying(true)
  }, [docRef, engineRef, notify, playing])

  // ── saving, publishing, exporting ──────────────────────────────────

  const handlePublish = useCallback(async () => {
    if (!scoreIdRef.current || dirty) {
      // Publishing saves first. Refusing with "save before publishing" was the
      // system asking the user to do its own bookkeeping.
      const saved = await saveNow()
      if (!saved) return
    }
    const id = scoreIdRef.current
    if (!id) {
      notify('Guarda la partitura antes de publicarla.', 'warning')
      return
    }
    try {
      if (published) {
        await repositoryService.unpublish(id, token)
        setPublished(false)
        notify('Retirada del repositorio.')
      } else {
        await repositoryService.publish(id, token)
        setPublished(true)
        notify('Publicada en el repositorio comunitario.')
      }
    } catch (error) {
      notify(error?.response?.data?.detail || 'No se pudo cambiar la publicación.', 'error')
    }
  }, [dirty, notify, published, saveNow, token])

  const handleExport = useCallback(
    async (format) => {
      if (format === 'print') {
        window.print()
        return
      }
      if (format === 'mei') {
        const doc = docRef.current
        if (!doc) return
        downloadBlob(
          new Blob([doc.toString()], { type: 'application/xml' }),
          `${snapshot.title || 'partitura'}.mei`,
        )
        return
      }
      if (!scoreIdRef.current || dirty) {
        const saved = await saveNow()
        if (!saved) return
      }
      const id = scoreIdRef.current
      if (!id) {
        notify('Guarda la partitura antes de descargarla.', 'warning')
        return
      }
      setExporting(true)
      try {
        // Conversion happens on the server: Verovio can only write MEI, so
        // "download MusicXML" has to go through a real converter rather than
        // renaming a MEI file.
        const { blob, filename } = await scoreService.exportScore(id, format, token)
        downloadBlob(blob, filename)
      } catch (error) {
        notify(
          error?.response?.data?.detail ||
            'No se pudo convertir la partitura a ese formato.',
          'error',
        )
      } finally {
        setExporting(false)
      }
    },
    [dirty, docRef, notify, saveNow, snapshot.title, token],
  )

  // ── keyboard ───────────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(event) {
      const target = event.target
      // Never steal keys from a field the user is typing in.
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }

      const meta = event.metaKey || event.ctrlKey

      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (meta && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
        return
      }
      if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault()
        saveNow()
        return
      }
      if (meta && event.key.toLowerCase() === 'c') {
        actions.copy()
        return
      }
      if (meta && event.key.toLowerCase() === 'v') {
        actions.paste()
        return
      }
      if (meta) return

      if (event.key === 'Escape') {
        setInsertMode(false)
        setSelection([])
        return
      }
      if (event.key === ' ') {
        event.preventDefault()
        togglePlay()
        return
      }
      if (event.key === '?') {
        setShortcutsOpen(true)
        return
      }

      // Note entry by letter: the way music is actually typed.
      const letter = event.key.toLowerCase()
      if (KEY_TO_PNAME[letter] && selection.length === 1 && !insertMode) {
        event.preventDefault()
        const doc = docRef.current
        const element = doc?.byId(selection[0])
        const octave = parseInt(element?.getAttribute('oct') || '4', 10)
        const result = apply((candidate) =>
          edits.setPitch(candidate, selection[0], KEY_TO_PNAME[letter], octave),
        )
        if (result?.id) setSelection([result.id])
        const updated = docRef.current?.byId(result?.id || selection[0])
        if (updated) playbackRef.current.preview(midiOf(updated))
        return
      }

      if (['1', '2', '3', '4', '5', '6'].includes(event.key)) {
        const map = { 1: '1', 2: '2', 3: '4', 4: '8', 5: '16', 6: '32' }
        actions.setDuration(map[event.key])
        return
      }

      if (!selection.length) {
        if (event.key === 'i') setInsertMode((mode) => !mode)
        return
      }

      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault()
          if (event.shiftKey) actions.shiftOctave(1)
          else withSelection((doc) => edits.changePitch(doc, selection[0], 1))
          break
        case 'ArrowDown':
          event.preventDefault()
          if (event.shiftKey) actions.shiftOctave(-1)
          else withSelection((doc) => edits.changePitch(doc, selection[0], -1))
          break
        case 'ArrowRight':
        case 'ArrowLeft': {
          event.preventDefault()
          const doc = docRef.current
          if (!doc) break
          const order = doc.events
            .filter((element) => localName(element) !== 'chord')
            .map((element) => element.getAttribute('xml:id'))
          const index = order.indexOf(selection[selection.length - 1])
          const next = order[index + (event.key === 'ArrowRight' ? 1 : -1)]
          if (next) handleSelect(next, { extend: event.shiftKey })
          break
        }
        case 'Delete':
        case 'Backspace':
          event.preventDefault()
          actions.deleteSelection()
          break
        case '.':
          event.preventDefault()
          actions.toggleDot()
          break
        case 'r':
          actions.toggleRest()
          break
        case 't':
          actions.toggleTie()
          break
        case 'n':
          actions.insertAfter()
          break
        case 'a':
          actions.addChordNote()
          break
        case 'i':
          setInsertMode((mode) => !mode)
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    actions,
    apply,
    docRef,
    handleSelect,
    insertMode,
    redo,
    saveNow,
    selection,
    setSelection,
    togglePlay,
    undo,
    withSelection,
  ])

  // ── render ─────────────────────────────────────────────────────────

  // On a phone the score gets whatever is left between the toolbar above it
  // and the sheet plus navigation below. Measured, because the pieces above it
  // change height (a second toolbar row, a warning strip) and adding up
  // constants was wrong by tens of pixels in both directions.
  useFillHeight(frameRef, {
    enabled: isCompact,
    // The sheet, the navigation bar, and a little air between them.
    reserveBottom: sheetHeight + NAV_HEIGHT_PX + 12,
    min: 240,
  })

  const panel = (
    <ContextPanel
      selection={selection}
      noteInfo={noteInfo}
      staves={snapshot.staves}
      activeStaff={activeStaff}
      onSelectStaff={setActiveStaff}
      measureCount={snapshot.measureCount}
      currentMeasure={currentMeasure}
      tempo={tempo}
      lyric={lyric}
      actions={actions}
      compact={isCompact}
    />
  )

  if (loadingScore) {
    return <p className="py-12 text-center text-sm text-slate-400">Abriendo la partitura…</p>
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
        <AlertTriangle className="mx-auto mb-3 text-rose-500" size={28} />
        <h1 className="mb-1 text-lg font-semibold text-rose-900">No se pudo abrir la partitura</h1>
        <p className="text-sm text-rose-700">{loadError}</p>
        <button
          type="button"
          onClick={() => navigate('/mis-partituras')}
          className="mt-4 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white"
        >
          Volver a mis partituras
        </button>
      </div>
    )
  }

  return (
    <div
      ref={frameRef}
      className={`flex flex-col gap-2 md:gap-3 ${
        isCompact ? 'min-h-[16rem]' : 'h-[calc(100dvh-8rem)] min-h-[30rem]'
      }`}
    >
      {message && (
        <div
          role="status"
          className={`fixed right-4 top-20 z-50 max-w-sm rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
            message.tone === 'error'
              ? 'bg-rose-600 text-white'
              : message.tone === 'warning'
                ? 'bg-amber-500 text-white'
                : 'bg-slate-800 text-white'
          }`}
        >
          {message.text}
        </div>
      )}

      {draftOffer && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="text-amber-600" />
          <span className="text-amber-900">
            Tienes cambios sin guardar de{' '}
            {new Date(draftOffer.at).toLocaleString('es-ES', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
            .
          </span>
          <button
            type="button"
            onClick={() => {
              restore(draftOffer.mei)
              setDraftOffer(null)
              notify('Cambios recuperados.')
            }}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white"
          >
            Recuperarlos
          </button>
          <button
            type="button"
            onClick={() => {
              clearDraft(scoreId)
              setDraftOffer(null)
            }}
            className="rounded-lg px-2 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
          >
            Descartar
          </button>
        </div>
      )}

      <EditorToolbar
        title={snapshot.title}
        onTitleChange={setTitle}
        onSave={saveNow}
        saving={saving}
        dirty={dirty}
        savedAt={savedAt}
        onPublish={handlePublish}
        published={published}
        onExport={handleExport}
        exporting={exporting}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        onAddMeasure={() => apply((doc) => edits.insertMeasure(doc))}
        measureCount={snapshot.measureCount}
        insertMode={insertMode}
        onToggleInsertMode={() => setInsertMode((mode) => !mode)}
        playing={playing}
        onTogglePlay={togglePlay}
        canPlay={ready && snapshot.measureCount > 0}
      />

      {insertMode && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          <ChevronRight size={15} className="shrink-0" />
          <span>
            {isTouch ? 'Toca' : 'Haz clic en'} el pentagrama{' '}
            <strong>a la altura de la nota</strong> que quieras añadir.
          </span>
          <button
            type="button"
            onClick={() => setInsertMode(false)}
            className="ml-auto rounded p-1 hover:bg-emerald-100"
            aria-label="Salir del modo añadir"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {snapshot.problems.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 md:flex-wrap md:overflow-visible md:px-4">
          <AlertTriangle size={15} className="shrink-0 text-amber-600" />
          <span className="shrink-0">
            {snapshot.problems.length === 1
              ? 'Un compás no cuadra:'
              : `${snapshot.problems.length} compases no cuadran:`}
          </span>
          {snapshot.problems.slice(0, 6).map((problem) => (
            <button
              key={`${problem.measure}-${problem.staff}-${problem.layer}`}
              type="button"
              onClick={() => goToMeasure(problem.measure)}
              className="shrink-0 rounded-md bg-white px-2 py-1 text-xs font-medium text-amber-800 shadow-sm hover:bg-amber-100"
              title={`Tiene ${problem.filled} de ${problem.expected} tiempos. Ir a este compás.`}
            >
              compás {problem.measure} ({problem.filled}/{problem.expected})
            </button>
          ))}
        </div>
      )}

      {/* The side panel appears from tablet-portrait width upwards. It used to
          need 1024px, so an iPad held upright -- the likeliest way to use this
          at a music stand -- got the phone layout and left the score 150px
          tall beside a mostly empty panel. */}
      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="relative min-h-0" ref={scoreContainerRef}>
          <ScoreView
            engine={engineRef.current}
            revision={revision + layoutTick * 1000000}
            selection={selection}
            onSelect={handleSelect}
            onDragPitch={handleDragPitch}
            onAddNoteAt={handleAddNoteAt}
            onOpenMeasure={handleOpenMeasure}
            soundingIds={soundingIds}
            insertMode={insertMode}
            flaggedMeasureIds={flaggedMeasureIds}
            onLayoutChange={bumpLayout}
            onZoom={setZoom}
            className="h-full min-h-0 rounded-xl"
          />
          <ZoomControls zoom={zoom} onZoom={setZoom} showHint={isTouch} />
        </div>

        <div className="hidden min-h-0 md:block md:h-full">
          {panel}
        </div>
      </div>

      {/* On a phone the same panel is a sheet, so the score keeps the screen. */}
      {isCompact && (
        <ToolSheet
          open={sheetOpen}
          onToggle={setSheetOpen}
          selection={selection}
          noteInfo={noteInfo}
          actions={actions}
          onHeightChange={setSheetHeight}
        >
          {panel}
        </ToolSheet>
      )}

      {/* A keyboard-shortcut list is noise on a device with no keyboard. */}
      {!isTouch && (
        <button
          type="button"
          onClick={() => setShortcutsOpen(true)}
          className="self-start text-xs font-medium text-slate-400 transition hover:text-slate-600"
        >
          <Keyboard size={13} className="mr-1 inline" />
          Atajos de teclado
        </button>
      )}

      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
    </div>
  )
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoking immediately can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}
