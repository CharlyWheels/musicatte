import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react'

/**
 * Zoom sits on the score, not in the document toolbar.
 *
 * It is a way of looking at the music rather than something you do to it, and
 * moving it here is what let the toolbar fit on one row.
 */
export default function ZoomControls({ zoom, onZoom, showHint = false }) {
  return (
    <div className="no-print pointer-events-auto absolute bottom-2 right-2 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white/95 px-1 py-0.5 shadow-sm backdrop-blur md:bottom-3 md:right-3">
      {showHint && (
        <span className="mr-1 hidden text-[11px] text-slate-400 sm:inline">
          Pellizca para ampliar
        </span>
      )}
      <button
        type="button"
        onClick={() => onZoom(zoom - 0.15)}
        disabled={zoom <= 0.55}
        title="Reducir"
        aria-label="Reducir"
        className="rounded p-2 text-slate-500 transition hover:bg-slate-100 disabled:opacity-30"
      >
        <ZoomOut size={15} />
      </button>
      <button
        type="button"
        onClick={() => onZoom(1)}
        title="Tamaño original"
        className="min-w-[2.75rem] rounded px-1 py-2 text-xs font-medium tabular-nums text-slate-500 transition hover:bg-slate-100"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        onClick={() => onZoom(zoom + 0.15)}
        disabled={zoom >= 2.4}
        title="Ampliar"
        aria-label="Ampliar"
        className="rounded p-2 text-slate-500 transition hover:bg-slate-100 disabled:opacity-30"
      >
        <ZoomIn size={15} />
      </button>
      <span className="mx-0.5 h-4 w-px bg-slate-200" aria-hidden="true" />
      <button
        type="button"
        onClick={() => onZoom(1.6)}
        title="Ampliar para leer de cerca"
        aria-label="Ampliar para leer de cerca"
        className="rounded p-2 text-slate-500 transition hover:bg-slate-100"
      >
        <Maximize2 size={15} />
      </button>
    </div>
  )
}
