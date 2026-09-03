/**
 * The editor's state: one document, one engine, undo, autosave.
 *
 * Three things it fixes beyond the document model itself.
 *
 * **One document.** The old editor kept the title in React state and the notes
 * in Verovio's copy of the MEI, so saving sent notes without the new title and
 * a title column that disagreed with the file. There is one document here and
 * everything writes to it.
 *
 * **Undo that reflects reality.** `canUndo` was read from a ref during render,
 * so the buttons only happened to enable when some other state change forced a
 * re-render.
 *
 * **Work that survives a refresh.** The score used to arrive through
 * `location.state`, which is gone after F5 — a scan and an hour of corrections
 * with it. Changes are now mirrored to local storage and offered back.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { MeiDoc } from './mei.js'
import { ScoreEngine } from './scoreEngine.js'
import { renumberMeasures } from './edits.js'

const UNDO_LIMIT = 100
const DRAFT_PREFIX = 'musicatte_draft_'
const DRAFT_DEBOUNCE_MS = 800
const AUTOSAVE_DEBOUNCE_MS = 4000

function draftKey(scoreId) {
  return `${DRAFT_PREFIX}${scoreId ?? 'new'}`
}

export function readDraft(scoreId) {
  try {
    const raw = window.localStorage.getItem(draftKey(scoreId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.mei) return null
    return parsed
  } catch {
    return null
  }
}

export function clearDraft(scoreId) {
  try {
    window.localStorage.removeItem(draftKey(scoreId))
  } catch {
    /* storage unavailable: nothing to clear */
  }
}

/**
 * @param {object} options
 * @param {string} options.initialData  MEI or MusicXML to open.
 * @param {number|null} options.scoreId  Server id, when editing a saved score.
 * @param {(mei: string) => Promise<void>} [options.onAutosave]
 */
export function useScoreEditor({ initialData, scoreId = null, onAutosave = null }) {
  const engineRef = useRef(null)
  const docRef = useRef(null)
  const undoRef = useRef([])
  const redoRef = useRef([])
  const clipboardRef = useRef([])
  const draftTimer = useRef(null)
  const autosaveTimer = useRef(null)

  const [ready, setReady] = useState(false)
  const [revision, setRevision] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [history, setHistory] = useState({ canUndo: false, canRedo: false })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [message, setMessage] = useState(null)
  const [selection, setSelection] = useState([])

  const notify = useCallback((text, tone = 'info') => {
    if (!text) return
    setMessage({ text, tone, at: Date.now() })
  }, [])

  useEffect(() => {
    if (!message) return undefined
    const timer = window.setTimeout(() => setMessage(null), 4000)
    return () => window.clearTimeout(timer)
  }, [message])

  // ── set-up ─────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    let engine = null

    ;(async () => {
      try {
        engine = await ScoreEngine.create()
        if (cancelled) {
          engine.destroy()
          return
        }
        engineRef.current = engine

        // Verovio reads MusicXML too, so a fresh score or an import can start
        // from either; from here on the document is MEI.
        if (!engine.load(initialData)) {
          setLoadError(
            engine.lastError ||
              'No se pudo abrir la partitura. Puede que el archivo esté dañado.',
          )
          setReady(true)
          return
        }
        docRef.current = new MeiDoc(engine.getMEI())
        setReady(true)
        setRevision((value) => value + 1)
      } catch (error) {
        if (!cancelled) {
          setLoadError(error?.message || 'No se pudo iniciar el motor de partituras.')
          setReady(true)
        }
      }
    })()

    return () => {
      cancelled = true
      if (draftTimer.current) window.clearTimeout(draftTimer.current)
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
      // Each editor owns its engine, so tearing it down here cannot disturb
      // any other view -- the old shared toolkit made that impossible.
      engineRef.current?.destroy()
      engineRef.current = null
    }
    // Deliberately keyed on the document identity only: re-running this would
    // discard the user's edits.
  }, [initialData])

  // ── persistence ────────────────────────────────────────────────────

  const persistDraft = useCallback(() => {
    if (!docRef.current) return
    try {
      window.localStorage.setItem(
        draftKey(scoreId),
        JSON.stringify({
          mei: docRef.current.toString(),
          title: docRef.current.title,
          at: Date.now(),
        }),
      )
    } catch {
      // Storage full or blocked. Not worth interrupting the user over; the
      // server save is the real safety net.
    }
  }, [scoreId])

  const scheduleAutosave = useCallback(() => {
    if (!onAutosave) return
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
    autosaveTimer.current = window.setTimeout(async () => {
      if (!docRef.current) return
      setSaving(true)
      try {
        await onAutosave(docRef.current.toString())
        setDirty(false)
        setSavedAt(Date.now())
        clearDraft(scoreId)
      } catch (error) {
        notify(
          error?.response?.data?.detail || 'No se pudo guardar automáticamente.',
          'error',
        )
      } finally {
        setSaving(false)
      }
    }, AUTOSAVE_DEBOUNCE_MS)
  }, [onAutosave, scoreId, notify])

  /** Warn before leaving with unsaved work. */
  useEffect(() => {
    if (!dirty) return undefined
    const handler = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // ── applying an edit ───────────────────────────────────────────────

  const syncEngine = useCallback(() => {
    const engine = engineRef.current
    const doc = docRef.current
    if (!engine || !doc) return false
    const accepted = engine.load(doc.toString())
    if (!accepted) {
      notify(
        'Ese cambio deja la partitura en un estado que el motor no puede dibujar. Se ha deshecho.',
        'error',
      )
    }
    return accepted
  }, [notify])

  /**
   * Run an edit against the document.
   *
   * The operation reports whether it changed anything, so a no-op leaves the
   * undo history alone; and if Verovio then refuses the result the change is
   * rolled back rather than leaving an unrenderable document on screen.
   */
  const apply = useCallback(
    (operation) => {
      const doc = docRef.current
      if (!doc) return null
      const before = doc.toString()

      let result
      try {
        result = operation(doc)
      } catch (error) {
        notify(error?.message || 'No se pudo aplicar el cambio.', 'error')
        return null
      }

      if (!result || result.changed === false) {
        if (result?.message) notify(result.message, 'warning')
        return result || null
      }

      if (!syncEngine()) {
        docRef.current = new MeiDoc(before)
        syncEngine()
        return null
      }

      undoRef.current.push(before)
      if (undoRef.current.length > UNDO_LIMIT) undoRef.current.shift()
      redoRef.current = []
      setHistory({ canUndo: true, canRedo: false })
      setDirty(true)
      setRevision((value) => value + 1)

      if (draftTimer.current) window.clearTimeout(draftTimer.current)
      draftTimer.current = window.setTimeout(persistDraft, DRAFT_DEBOUNCE_MS)
      scheduleAutosave()

      if (result.message) notify(result.message, 'info')
      return result
    },
    [notify, persistDraft, scheduleAutosave, syncEngine],
  )

  const restore = useCallback(
    (xml) => {
      docRef.current = new MeiDoc(xml)
      syncEngine()
      setSelection([])
      setRevision((value) => value + 1)
      setDirty(true)
      scheduleAutosave()
    },
    [scheduleAutosave, syncEngine],
  )

  /**
   * Keep whatever is still there after a history move.
   *
   * Clearing the selection on every undo means losing your place: you undo a
   * duration change and then have to find the note again to try something
   * else.
   */
  const keepValidSelection = useCallback(() => {
    setSelection((current) => current.filter((id) => docRef.current?.byId(id)))
  }, [])

  const undo = useCallback(() => {
    if (!undoRef.current.length || !docRef.current) return
    redoRef.current.push(docRef.current.toString())
    const previous = undoRef.current.pop()
    docRef.current = new MeiDoc(previous)
    syncEngine()
    keepValidSelection()
    setRevision((value) => value + 1)
    setDirty(true)
    setHistory({ canUndo: undoRef.current.length > 0, canRedo: true })
    scheduleAutosave()
  }, [keepValidSelection, scheduleAutosave, syncEngine])

  const redo = useCallback(() => {
    if (!redoRef.current.length || !docRef.current) return
    undoRef.current.push(docRef.current.toString())
    const next = redoRef.current.pop()
    docRef.current = new MeiDoc(next)
    syncEngine()
    keepValidSelection()
    setRevision((value) => value + 1)
    setDirty(true)
    setHistory({ canUndo: true, canRedo: redoRef.current.length > 0 })
    scheduleAutosave()
  }, [keepValidSelection, scheduleAutosave, syncEngine])

  /** Save now, cancelling any pending autosave. */
  const saveNow = useCallback(async () => {
    if (!onAutosave || !docRef.current) return false
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
    setSaving(true)
    try {
      await onAutosave(docRef.current.toString())
      setDirty(false)
      setSavedAt(Date.now())
      clearDraft(scoreId)
      return true
    } catch (error) {
      notify(error?.response?.data?.detail || 'No se pudo guardar la partitura.', 'error')
      return false
    } finally {
      setSaving(false)
    }
  }, [notify, onAutosave, scoreId])

  const setTitle = useCallback(
    (title) => {
      const doc = docRef.current
      if (!doc || doc.title === title) return
      doc.title = title
      setDirty(true)
      setRevision((value) => value + 1)
      if (draftTimer.current) window.clearTimeout(draftTimer.current)
      draftTimer.current = window.setTimeout(persistDraft, DRAFT_DEBOUNCE_MS)
      scheduleAutosave()
    },
    [persistDraft, scheduleAutosave],
  )

  const setComposer = useCallback(
    (composer) => {
      const doc = docRef.current
      if (!doc || doc.composer === composer) return
      doc.composer = composer
      setDirty(true)
      setRevision((value) => value + 1)
      scheduleAutosave()
    },
    [scheduleAutosave],
  )

  // ── derived, recomputed when the document changes ──────────────────

  const snapshot = useMemo(() => {
    const doc = docRef.current
    if (!doc || !ready) {
      return {
        revision,
        title: '',
        composer: '',
        staves: [],
        measureCount: 0,
        pageCount: 0,
        problems: [],
      }
    }
    renumberMeasures(doc)
    return {
      // The revision this describes. Also what makes the dependency below
      // honest: the memo reads a mutable document, so the counter is the only
      // thing that tells it the contents moved.
      revision,
      title: doc.title,
      composer: doc.composer,
      staves: doc.allStaffProperties(),
      measureCount: doc.measures.length,
      pageCount: engineRef.current?.pageCount || 0,
      problems: doc.overfullOrShortMeasures(),
    }
  }, [revision, ready])

  return {
    ready,
    loadError,
    revision,
    engine: engineRef.current,
    doc: docRef.current,
    docRef,
    engineRef,
    clipboardRef,
    selection,
    setSelection,
    apply,
    restore,
    undo,
    redo,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    dirty,
    saving,
    savedAt,
    saveNow,
    setTitle,
    setComposer,
    snapshot,
    message,
    notify,
    persistDraft,
  }
}
