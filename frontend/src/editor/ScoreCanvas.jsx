import { useEffect, useRef, useState } from 'react'
import { getToolkit } from './verovioEngine'

export default function ScoreCanvas({
  onToolkitReady,
  renderKey,
  selectedId,
  onSelect,
  onDragPitch,
  insertMode,
  onInsertAtPosition,
}) {
  const containerRef = useRef(null)
  const toolkitRef = useRef(null)
  const [ready, setReady] = useState(false)
  const dragRef = useRef({ active: false, startY: 0, id: null })

  useEffect(() => {
    getToolkit().then((tk) => {
      toolkitRef.current = tk
      setReady(true)
      onToolkitReady?.(tk)
    })
  }, [])

  useEffect(() => {
    if (!ready || !toolkitRef.current || !containerRef.current) return
    const tk = toolkitRef.current
    const pageCount = tk.getPageCount()
    let html = ''
    for (let i = 1; i <= pageCount; i++) {
      html += `<div class="verovio-page">${tk.renderToSVG(i)}</div>`
    }
    containerRef.current.innerHTML = html
    highlightSelected()
  }, [ready, renderKey])

  useEffect(() => {
    highlightSelected()
  }, [selectedId])

  function highlightSelected() {
    if (!containerRef.current) return
    containerRef.current.querySelectorAll('g[data-class="note"], g[data-class="rest"]').forEach((el) => {
      el.style.fill = ''
      el.style.stroke = ''
    })
    if (selectedId) {
      const el = containerRef.current.querySelector(`g[data-id="${selectedId}"]`)
      if (el) {
        el.style.fill = '#6366f1'
        el.style.stroke = '#6366f1'
      }
    }
  }

  function getNoteFromEvent(e) {
    const noteEl = e.target.closest?.('g[data-class="note"]')
    if (noteEl) return noteEl.getAttribute('data-id')
    const restEl = e.target.closest?.('g[data-class="rest"]')
    if (restEl) return restEl.getAttribute('data-id')
    return null
  }

  function handleClick(e) {
    const noteId = getNoteFromEvent(e)
    if (noteId) {
      onSelect?.(noteId)
      return
    }

    // Insert mode: clicking empty space on staff
    if (insertMode && toolkitRef.current) {
      // Find the nearest element using Verovio's getElementsAtTime or by position
      // Simpler approach: find the staff/measure/layer clicked and get the last note in it
      const staffEl = e.target.closest?.('g[data-class="staff"]')
      const measureEl = e.target.closest?.('g[data-class="measure"]')
      if (measureEl) {
        // Find the last note/rest/chord in this measure
        const notes = measureEl.querySelectorAll('g[data-class="note"], g[data-class="rest"]')
        if (notes.length > 0) {
          const lastNote = notes[notes.length - 1]
          const lastId = lastNote.getAttribute('data-id')
          onInsertAtPosition?.(lastId)
        } else {
          // Empty measure — insert at measure level
          const measureId = measureEl.getAttribute('data-id')
          onInsertAtPosition?.(null, measureId)
        }
      }
    }
  }

  function handleMouseDown(e) {
    if (insertMode) return // Don't start drag in insert mode
    const noteId = getNoteFromEvent(e)
    if (noteId) {
      dragRef.current = { active: true, startY: e.clientY, id: noteId }
      onSelect?.(noteId)
      e.preventDefault()
    }
  }

  function handleMouseMove(e) {
    if (!dragRef.current.active) return
    const deltaY = dragRef.current.startY - e.clientY
    if (Math.abs(deltaY) >= 12) {
      const steps = Math.round(deltaY / 12)
      if (steps !== 0) {
        onDragPitch?.(dragRef.current.id, steps)
        dragRef.current.startY = e.clientY
      }
    }
  }

  function handleMouseUp() {
    dragRef.current.active = false
  }

  function handleTouchStart(e) {
    if (insertMode) return
    const touch = e.touches[0]
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    const noteEl = el?.closest?.('g[data-class="note"]') || el?.closest?.('g[data-class="rest"]')
    if (noteEl) {
      const noteId = noteEl.getAttribute('data-id')
      dragRef.current = { active: true, startY: touch.clientY, id: noteId }
      onSelect?.(noteId)
    }
  }

  function handleTouchMove(e) {
    if (!dragRef.current.active) return
    const touch = e.touches[0]
    const deltaY = dragRef.current.startY - touch.clientY
    if (Math.abs(deltaY) >= 15) {
      const steps = Math.round(deltaY / 15)
      if (steps !== 0) {
        onDragPitch?.(dragRef.current.id, steps)
        dragRef.current.startY = touch.clientY
      }
    }
    e.preventDefault()
  }

  function handleTouchEnd() {
    dragRef.current.active = false
  }

  return (
    <div
      ref={containerRef}
      className={`verovio-canvas select-none overflow-auto rounded-xl border bg-white p-4 shadow-sm ${
        insertMode
          ? 'cursor-crosshair border-emerald-300 ring-2 ring-emerald-100'
          : 'cursor-pointer border-slate-200'
      }`}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ minHeight: '180px' }}
    >
      {!ready && (
        <div className="flex h-40 items-center justify-center text-slate-400">
          <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Cargando motor de partituras...
        </div>
      )}
    </div>
  )
}
