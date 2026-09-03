/**
 * One compact bar above the score.
 *
 * The editor used to stack a header, a toolbar, a mode banner, a
 * selected-note bar, two panels, a settings panel and a shortcut legend, with
 * the score squeezed between them at a 180px minimum height. Everything that
 * is not about the current selection lives here, in one row, and the panels
 * that used to be permanent are now one contextual panel.
 */

import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  Download,
  Globe,
  Loader2,
  MousePointerClick,
  Pause,
  Play,
  Plus,
  Redo2,
  Save,
  Undo2,
} from 'lucide-react'

import { EXPORT_FORMATS } from '../../editor/constants.js'

function Divider() {
  return <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />
}

function IconButton({ onClick, disabled, title, children, tone = 'ghost' }) {
  const tones = {
    ghost: 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm',
    active: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`rounded-lg p-2 transition disabled:cursor-not-allowed disabled:opacity-30 ${tones[tone]}`}
    >
      {children}
    </button>
  )
}

export default function EditorToolbar({
  title,
  onTitleChange,
  onSave,
  saving,
  dirty,
  savedAt,
  onPublish,
  published,
  onExport,
  exporting,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onAddMeasure,
  measureCount,
  insertMode,
  onToggleInsertMode,
  playing,
  onTogglePlay,
  canPlay,
}) {
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef(null)

  useEffect(() => {
    if (!exportOpen) return undefined
    const close = (event) => {
      if (!exportRef.current?.contains(event.target)) setExportOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [exportOpen])

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <input
        className="min-w-[9rem] flex-1 rounded-lg border border-transparent bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 transition focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        placeholder="Título de la partitura"
        aria-label="Título de la partitura"
      />

      <div className="flex items-center">
        <IconButton onClick={onUndo} disabled={!canUndo} title="Deshacer (Ctrl+Z)">
          <Undo2 size={17} />
        </IconButton>
        <IconButton onClick={onRedo} disabled={!canRedo} title="Rehacer (Ctrl+Shift+Z)">
          <Redo2 size={17} />
        </IconButton>
      </div>

      <Divider />

      <IconButton
        onClick={onTogglePlay}
        disabled={!canPlay}
        title={playing ? 'Parar (Espacio)' : 'Escuchar (Espacio)'}
        tone={playing ? 'active' : 'ghost'}
      >
        {playing ? <Pause size={17} /> : <Play size={17} />}
      </IconButton>

      <Divider />

      <button
        type="button"
        onClick={onToggleInsertMode}
        title="Añadir notas haciendo clic en el pentagrama (I)"
        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
          insertMode
            ? 'bg-emerald-600 text-white shadow-sm'
            : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        <MousePointerClick size={16} />
        <span className="hidden lg:inline">{insertMode ? 'Añadiendo' : 'Añadir notas'}</span>
      </button>

      <button
        type="button"
        onClick={onAddMeasure}
        title="Añadir un compás al final"
        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
      >
        <Plus size={16} />
        <span className="hidden lg:inline">Compás</span>
        <span className="text-xs tabular-nums text-slate-400">{measureCount}</span>
      </button>

      <Divider />

      <div className="ml-auto flex items-center gap-1.5">
        <span className="hidden text-xs text-slate-400 sm:block" aria-live="polite">
          {saving
            ? 'Guardando…'
            : dirty
              ? 'Sin guardar'
              : savedAt
                ? `Guardado ${new Date(savedAt).toLocaleTimeString('es-ES', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : ''}
        </span>

        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          <span className="hidden sm:inline">Guardar</span>
        </button>

        <button
          type="button"
          onClick={onPublish}
          title={
            published
              ? 'Quitar del repositorio comunitario'
              : 'Publicar en el repositorio comunitario'
          }
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
            published
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Globe size={16} />
          <span className="hidden lg:inline">{published ? 'Publicada' : 'Publicar'}</span>
        </button>

        <div className="relative" ref={exportRef}>
          <button
            type="button"
            onClick={() => setExportOpen((open) => !open)}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            aria-haspopup="menu"
            aria-expanded={exportOpen}
          >
            {exporting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            <span className="hidden lg:inline">Descargar</span>
            <ChevronDown size={14} />
          </button>

          {exportOpen && (
            <div
              role="menu"
              className="absolute right-0 z-40 mt-1 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
            >
              {EXPORT_FORMATS.map((format) => (
                <button
                  key={format.value}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setExportOpen(false)
                    onExport(format.value)
                  }}
                  className="flex w-full flex-col items-start px-3 py-2 text-left transition hover:bg-slate-50"
                >
                  <span className="text-sm font-medium text-slate-800">{format.label}</span>
                  <span className="text-xs text-slate-400">{format.hint}</span>
                </button>
              ))}
              <div className="my-1 h-px bg-slate-100" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setExportOpen(false)
                  onExport('print')
                }}
                className="flex w-full flex-col items-start px-3 py-2 text-left transition hover:bg-slate-50"
              >
                <span className="text-sm font-medium text-slate-800">Imprimir o guardar en PDF</span>
                <span className="text-xs text-slate-400">
                  Usa el diálogo de impresión del navegador
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
