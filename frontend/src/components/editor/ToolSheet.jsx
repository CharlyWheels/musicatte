/**
 * The tool panel as a sheet, for a phone.
 *
 * On a small screen a panel stacked under the score leaves the music about
 * 230 px tall and the tools below the fold, so editing means scrolling the
 * page away from the thing being edited. A sheet keeps the score in place: it
 * sits collapsed as a strip of the few actions used constantly, and opens over
 * the score only while the full set is needed.
 *
 * Collapsed, it carries what a correction actually needs -- durations, sharps
 * and flats, delete -- because reaching those should never cost a gesture.
 */

import { useEffect, useLayoutEffect, useRef } from 'react'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'

import { ACCIDENTALS, DURATIONS, noteLabel } from '../../editor/constants.js'

const QUICK_DURATIONS = DURATIONS.filter((item) =>
  ['1', '2', '4', '8', '16'].includes(item.dur),
)
const QUICK_ACCIDENTALS = ACCIDENTALS.filter((item) => ['s', 'f', 'n', ''].includes(item.value))

function QuickButton({ active, onClick, label, children, tone = 'default' }) {
  const tones = {
    default: active
      ? 'bg-indigo-600 text-white border-transparent'
      : 'border-slate-200 bg-white text-slate-700',
    danger: 'border-rose-200 bg-white text-rose-600',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active || undefined}
      title={label}
      className={`flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border px-3 text-base font-medium shadow-sm transition active:scale-95 ${tones[tone]}`}
    >
      {children}
    </button>
  )
}

export default function ToolSheet({
  open,
  onToggle,
  selection,
  noteInfo,
  actions,
  onHeightChange,
  children,
}) {
  const panelRef = useRef(null)
  const sheetRef = useRef(null)
  const single = selection.length === 1

  /**
   * Report the collapsed height so the score can be given the rest.
   *
   * The whole sheet, not just its strip: what the score has to clear is the
   * sheet's full box, grip and borders included. And only while it is closed,
   * because open it covers most of the screen on purpose -- reporting that
   * would shrink the score to nothing behind it.
   */
  useLayoutEffect(() => {
    const element = sheetRef.current
    if (!element || !onHeightChange) return undefined
    const report = () => {
      if (open) return
      onHeightChange(element.getBoundingClientRect().height)
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(element)
    return () => observer.disconnect()
  }, [onHeightChange, open])

  // Close on Escape, like any other overlay.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') onToggle(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onToggle])

  return (
    <>
      {/* Dimming the score makes it clear the sheet is over it, and gives a
          large target for dismissing it. */}
      {open && (
        <button
          type="button"
          aria-label="Cerrar las herramientas"
          onClick={() => onToggle(false)}
          className="fixed inset-0 z-30 bg-slate-900/25 md:hidden"
        />
      )}

      <div
        ref={sheetRef}
        className={`tool-sheet fixed inset-x-0 z-40 flex flex-col rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-4px_24px_-8px_rgba(15,23,42,0.25)] md:hidden ${
          open ? 'max-h-[70dvh]' : ''
        }`}
        // Above the navigation bar rather than over it: covering the nav with
        // the sheet's own padding hid it entirely.
        // 3.75rem is the navigation bar's own height; anything less and the
        // sheet's edge sits over it.
        style={{ bottom: 'calc(3.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          type="button"
          onClick={() => onToggle(!open)}
          aria-expanded={open}
          className="flex w-full items-center justify-center gap-2 py-2"
        >
          <span className="sheet-grip" aria-hidden="true" />
          <span className="text-xs font-medium text-slate-500">
            {open ? 'Ocultar herramientas' : selection.length ? 'Más opciones' : 'Herramientas'}
          </span>
          {open ? (
            <ChevronDown size={15} className="text-slate-400" />
          ) : (
            <ChevronUp size={15} className="text-slate-400" />
          )}
        </button>

        {/* Always available: what a correction is usually made of. */}
        <div className="border-t border-slate-100 px-3 pb-2 pt-2">
          {selection.length === 0 ? (
            <p className="py-1 text-center text-sm text-slate-400">
              Toca una nota para editarla
            </p>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2 px-0.5">
                <span className="text-lg font-semibold text-slate-800">
                  {single && noteInfo
                    ? noteLabel(noteInfo.pname, noteInfo.oct, noteInfo.accid)
                    : `${selection.length} elementos`}
                </span>
                {single && noteInfo && (
                  <span className="text-sm text-slate-400">{noteInfo.durLabel}</span>
                )}
                <div className="ml-auto flex gap-1.5">
                  <QuickButton onClick={() => actions.shiftOctave(1)} label="Subir una octava">
                    +8ª
                  </QuickButton>
                  <QuickButton onClick={() => actions.shiftOctave(-1)} label="Bajar una octava">
                    −8ª
                  </QuickButton>
                  <QuickButton
                    onClick={actions.deleteSelection}
                    label="Eliminar"
                    tone="danger"
                  >
                    <Trash2 size={17} />
                  </QuickButton>
                </div>
              </div>

              <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1">
                {QUICK_DURATIONS.map((item) => (
                  <QuickButton
                    key={item.dur}
                    active={single && noteInfo?.dur === item.dur}
                    onClick={() => actions.setDuration(item.dur)}
                    label={item.label}
                  >
                    <span className="text-xl leading-none">{item.glyph}</span>
                  </QuickButton>
                ))}
                <span className="mx-0.5 my-1 w-px shrink-0 bg-slate-200" aria-hidden="true" />
                {QUICK_ACCIDENTALS.map((item) => (
                  <QuickButton
                    key={item.value || 'none'}
                    active={single && (noteInfo?.accid || '') === item.value}
                    onClick={() => actions.setAccidental(item.value)}
                    label={item.label}
                  >
                    <span className="text-lg leading-none">{item.glyph}</span>
                  </QuickButton>
                ))}
                <span className="mx-0.5 my-1 w-px shrink-0 bg-slate-200" aria-hidden="true" />
                <QuickButton onClick={actions.toggleDot} label="Puntillo">
                  <span className="text-xl leading-none">·</span>
                </QuickButton>
                <QuickButton onClick={actions.toggleRest} label="Convertir en silencio">
                  <span className="text-sm">Silencio</span>
                </QuickButton>
              </div>
            </>
          )}
        </div>

        {/* The full panel, only while it is open. */}
        {open && (
          <div ref={panelRef} className="min-h-0 flex-1 overflow-y-auto border-t border-slate-100">
            {children}
          </div>
        )}
      </div>
    </>
  )
}
