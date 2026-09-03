/**
 * The score itself: the thing the editor is for, given the whole screen.
 *
 * Rendering is per page and on demand. The old canvas rebuilt the innerHTML of
 * every page after each edit, so dragging one note through a ten-page score
 * redrew ten pages of SVG on every pointer step.
 *
 * Clicking an empty staff position adds a note *at that pitch*. The old insert
 * mode promised "click anywhere on the staff" and actually appended a C4
 * quarter note to the end of whichever measure was clicked, regardless of
 * where in it or at what height.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import {
  applySelection,
  elementIdOf,
  markFlagged,
  staffLineGeometry,
  staffNumberOf,
} from './scoreDom.js'

const SELECTED_CLASS = 'is-selected'
const SOUNDING_CLASS = 'is-sounding'
const DRAG_STEP_PX = 11
// How far from a note a click still counts as aiming at it.
const NEAR_RADIUS_PX = 18
// How far above or below a staff a click still counts as aimed at it, so
// ledger-line notes and imprecise aim both work.
const STAFF_REACH_PX = 90

export default function ScoreView({
  engine,
  revision,
  selection,
  onSelect,
  onDragPitch,
  onAddNoteAt,
  onOpenMeasure,
  soundingIds = [],
  insertMode = false,
  flaggedMeasureIds = [],
  onLayoutChange,
  className = '',
}) {
  const containerRef = useRef(null)
  const pageRefs = useRef(new Map())
  const dragRef = useRef(null)
  // Which note this pointer gesture already selected, so the click that
  // follows does not act on it a second time.
  const gestureRef = useRef(null)
  const [revealed, setRevealed] = useState(() => new Set())
  const pageCount = engine?.pageCount || 0

  // ── which pages to draw ────────────────────────────────────────────

  // Derived rather than stored: the first page always, plus any page that has
  // scrolled into view and still exists. Correcting a stored set from an
  // effect after the page count changed rendered one frame with pages that
  // were no longer there.
  const visiblePages = useMemo(() => {
    const pages = new Set([1])
    for (const page of revealed) {
      if (page >= 1 && page <= pageCount) pages.add(page)
    }
    return pages
  }, [revealed, pageCount])

  useEffect(() => {
    const container = containerRef.current
    if (!container || pageCount <= 1) return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        const seen = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => Number(entry.target.dataset.page))
          .filter(Boolean)
        if (!seen.length) return
        setRevealed((current) => {
          if (seen.every((page) => current.has(page))) return current
          const next = new Set(current)
          for (const page of seen) next.add(page)
          return next
        })
      },
      { root: container, rootMargin: '400px 0px' },
    )
    for (const element of pageRefs.current.values()) {
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
  }, [pageCount, revision])

  // Reflow the engraving when the container changes width, so the music is
  // laid out for the space it actually has.
  useEffect(() => {
    const container = containerRef.current
    if (!container || !engine) return undefined
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width
      if (!width) return
      if (engine.setContainerWidth(width)) onLayoutChange?.()
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [engine, onLayoutChange])

  // ── drawing ────────────────────────────────────────────────────────

  useLayoutEffect(() => {
    if (!engine) return
    for (const [page, element] of pageRefs.current.entries()) {
      if (!element) continue
      if (!visiblePages.has(page)) continue
      const stamp = element.dataset.revision
      if (stamp === String(revision)) continue
      element.innerHTML = engine.renderPage(page)
      element.dataset.revision = String(revision)
    }
    applySelection(containerRef.current, selection)
    markFlagged(containerRef.current, flaggedMeasureIds)
  }, [engine, revision, visiblePages, selection, flaggedMeasureIds])

  useLayoutEffect(() => {
    applySelection(containerRef.current, selection)
  }, [selection])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    for (const element of container.querySelectorAll(`.${SOUNDING_CLASS}`)) {
      element.classList.remove(SOUNDING_CLASS)
    }
    for (const id of soundingIds) {
      const element = container.querySelector(`g[data-id="${id}"]`)
      if (element) element.classList.add(SOUNDING_CLASS)
    }
  }, [soundingIds])

  // Keep the sounding note in view during playback.
  useEffect(() => {
    if (!soundingIds.length) return
    const container = containerRef.current
    if (!container) return
    const element = container.querySelector(`g[data-id="${soundingIds[0]}"]`)
    if (!element) return
    const bounds = element.getBoundingClientRect()
    const view = container.getBoundingClientRect()
    if (bounds.top < view.top + 40 || bounds.bottom > view.bottom - 40) {
      element.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [soundingIds])

  // ── hit testing ────────────────────────────────────────────────────

  const eventTargetFrom = useCallback((target) => {
    if (!target?.closest) return null
    const group = target.closest('g[data-class="note"], g[data-class="rest"], g[data-class="mRest"]')
    return group ? group.getAttribute('data-id') : null
  }, [])

  /**
   * The note nearest a click, within a comfortable radius.
   *
   * Engraved note glyphs are a couple of pixels of ink: a note head is small
   * and a stem is a hairline, so requiring a direct hit means most attempts
   * land on the empty staff behind the note and nothing gets selected. That is
   * unusable with a finger and merely annoying with a mouse. Picking the
   * closest note instead matches what the user was aiming at.
   */
  const nearestEventTo = useCallback((clientX, clientY, scope) => {
    const candidates = (scope || containerRef.current)?.querySelectorAll(
      'g[data-class="note"], g[data-class="rest"], g[data-class="mRest"]',
    )
    if (!candidates?.length) return null
    let best = null
    let bestDistance = Infinity
    for (const candidate of candidates) {
      const box = candidate.getBoundingClientRect()
      if (!box.width && !box.height) continue
      // Distance to the box, zero when the point is inside it.
      const dx = Math.max(box.left - clientX, 0, clientX - box.right)
      const dy = Math.max(box.top - clientY, 0, clientY - box.bottom)
      const distance = Math.hypot(dx, dy)
      if (distance < bestDistance) {
        bestDistance = distance
        best = candidate
      }
    }
    if (!best || bestDistance > NEAR_RADIUS_PX) return null
    return best.getAttribute('data-id')
  }, [])

  /**
   * Which staff a click is aimed at, and at what height on it.
   *
   * Not "the staff element under the pointer": a staff group's box is only as
   * tall as its five lines, about thirty pixels, so clicking a hair above or
   * below it -- which is exactly where ledger-line notes go -- hit nothing and
   * silently did nothing. The nearest staff within a generous band is taken
   * instead, and the height is extrapolated from its line spacing, so notes
   * above and below the staff can be entered too.
   */
  const staffTargetAt = useCallback((clientX, clientY) => {
    const staves = containerRef.current?.querySelectorAll('g[data-class="staff"]')
    if (!staves?.length) return null

    let best = null
    let bestScore = Infinity
    for (const staff of staves) {
      const box = staff.getBoundingClientRect()
      if (!box.height) continue
      const insideX = clientX >= box.left - 8 && clientX <= box.right + 8
      const dy = Math.max(box.top - clientY, 0, clientY - box.bottom)
      const dx = insideX ? 0 : Math.min(Math.abs(clientX - box.left), Math.abs(clientX - box.right))
      // Horizontal misses matter more than vertical ones: the note belongs in
      // the measure you clicked, at the height you clicked.
      const score = dy + dx * 3
      if (score < bestScore) {
        bestScore = score
        best = { staff, box }
      }
    }
    if (!best || bestScore > STAFF_REACH_PX) return null

    const geometry = staffLineGeometry(best.staff)
    if (!geometry) return null

    return {
      staffGroup: best.staff,
      // Half a line spacing per step, counted downwards from the top line.
      halfStepsFromTopLine: Math.round((clientY - geometry.top) / (geometry.spacing / 2)),
    }
  }, [])

  const handleClick = useCallback(
    (event) => {
      const measureGroup = event.target.closest?.('g[data-class="measure"]')
      const staffGroup = event.target.closest?.('g[data-class="staff"]')

      // In insert mode every click on a staff adds a note, including a click
      // that happens to land on an existing one: the mode says "add notes", so
      // selecting instead would be the same broken promise the old insert mode
      // made when it claimed to add notes where you clicked and did not.
      const id = insertMode
        ? null
        : eventTargetFrom(event.target) ||
          nearestEventTo(event.clientX, event.clientY, staffGroup || measureGroup)
      if (id) {
        // Selection is settled here, and only here. Pointerdown also sees this
        // gesture (it has to, to start a drag), and when both handlers acted on
        // it a shift-click added the note and then immediately removed it
        // again, so extending a selection was impossible.
        if (gestureRef.current?.id !== id) {
          onSelect?.(id, { extend: event.shiftKey || event.metaKey || event.ctrlKey })
        }
        gestureRef.current = null
        return
      }

      gestureRef.current = null

      if (!insertMode) {
        if (event.detail === 2 && measureGroup) {
          onOpenMeasure?.(elementIdOf(measureGroup))
        }
        return
      }

      const target = staffTargetAt(event.clientX, event.clientY)
      if (!target) return
      const measure = target.staffGroup.closest('g[data-class="measure"]')
      if (!measure) return

      onAddNoteAt?.({
        // The measure's MEI id, not its position in the rendered SVG: pages
        // are separate SVG documents and only the visible ones are in the DOM,
        // so counting position numbered the first measure of page two as one.
        measureId: elementIdOf(measure),
        staff: staffNumberOf(target.staffGroup),
        halfStepsFromTopLine: target.halfStepsFromTopLine,
      })
    },
    [
      eventTargetFrom,
      insertMode,
      nearestEventTo,
      onAddNoteAt,
      onOpenMeasure,
      onSelect,
      staffTargetAt,
    ],
  )

  // ── dragging a note's pitch ────────────────────────────────────────

  const beginDrag = useCallback(
    (clientY, id) => {
      dragRef.current = { id, lastY: clientY, moved: false }
    },
    [],
  )

  const continueDrag = useCallback(
    (clientY) => {
      const drag = dragRef.current
      if (!drag) return
      const delta = drag.lastY - clientY
      if (Math.abs(delta) < DRAG_STEP_PX) return
      const steps = Math.round(delta / DRAG_STEP_PX)
      if (!steps) return
      drag.lastY -= steps * DRAG_STEP_PX
      drag.moved = true
      onDragPitch?.(drag.id, steps)
    },
    [onDragPitch],
  )

  const endDrag = useCallback(() => {
    dragRef.current = null
  }, [])

  const handlePointerDown = useCallback(
    (event) => {
      if (insertMode || event.button !== 0) return
      const scope =
        event.target.closest?.('g[data-class="staff"]') ||
        event.target.closest?.('g[data-class="measure"]')
      const id =
        eventTargetFrom(event.target) ||
        nearestEventTo(event.clientX, event.clientY, scope)
      if (!id) return
      beginDrag(event.clientY, id)

      // Dragging an unselected note has to select it, because the drag changes
      // it and the panel must show what changed. A modified click is left to
      // the click handler, which owns extending the selection.
      const modified = event.shiftKey || event.metaKey || event.ctrlKey
      if (!modified && !selection.includes(id)) {
        onSelect?.(id, { extend: false })
        gestureRef.current = { id }
      } else {
        gestureRef.current = null
      }
    },
    [beginDrag, eventTargetFrom, insertMode, nearestEventTo, onSelect, selection],
  )

  useEffect(() => {
    if (!containerRef.current) return undefined
    const move = (event) => continueDrag(event.clientY)
    const up = () => endDrag()
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [continueDrag, endDrag])

  // Touch: the same gesture, with a larger threshold for a finger.
  const handleTouchStart = useCallback(
    (event) => {
      if (insertMode) return
      const touch = event.touches[0]
      const element = document.elementFromPoint(touch.clientX, touch.clientY)
      const scope =
        element?.closest?.('g[data-class="staff"]') ||
        element?.closest?.('g[data-class="measure"]')
      const id =
        eventTargetFrom(element) || nearestEventTo(touch.clientX, touch.clientY, scope)
      if (!id) return
      beginDrag(touch.clientY, id)
      onSelect?.(id, { extend: false })
    },
    [beginDrag, eventTargetFrom, insertMode, nearestEventTo, onSelect],
  )

  const handleTouchMove = useCallback(
    (event) => {
      if (!dragRef.current) return
      event.preventDefault()
      continueDrag(event.touches[0].clientY)
    },
    [continueDrag],
  )

  if (!engine) {
    return (
      <div
        className={`flex min-h-[300px] items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-400 ${className}`}
      >
        <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
        Preparando el motor de partituras…
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`score-view relative overflow-auto rounded-xl border ${
        insertMode ? 'cursor-crosshair border-emerald-300' : 'border-slate-200'
      } ${className}`}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={endDrag}
      role="application"
      aria-label="Partitura"
    >
      {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => (
        <div
          key={page}
          data-page={page}
          ref={(element) => {
            if (element) pageRefs.current.set(page, element)
            else pageRefs.current.delete(page)
          }}
          className="score-page"
        >
          {!visiblePages.has(page) && (
            <div className="flex h-64 items-center justify-center text-xs text-slate-300">
              Página {page}
            </div>
          )}
        </div>
      ))}
      {pageCount === 0 && (
        <div className="flex min-h-[240px] items-center justify-center text-sm text-slate-400">
          Esta partitura no tiene nada que mostrar todavía.
        </div>
      )}
    </div>
  )
}
