import { Download, Globe, Plus, Save, Trash2, Undo2, Redo2 } from 'lucide-react'

export default function Toolbar({
  title,
  onTitleChange,
  onSave,
  onPublish,
  onExport,
  onAddMeasure,
  onDeleteMeasure,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  measureCount,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <input
        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Título de la partitura"
      />

      <div className="flex items-center gap-1">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
          title="Deshacer"
        >
          <Undo2 size={18} />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
          title="Rehacer"
        >
          <Redo2 size={18} />
        </button>
      </div>

      <div className="h-6 w-px bg-slate-200" />

      <div className="flex items-center gap-1">
        <button
          onClick={onAddMeasure}
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-emerald-50 hover:text-emerald-700"
          title="Añadir compás"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Compás</span>
        </button>
        {measureCount > 1 && (
          <button
            onClick={onDeleteMeasure}
            className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-red-50 hover:text-red-700"
            title="Eliminar último compás"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      <div className="h-6 w-px bg-slate-200" />

      <div className="flex items-center gap-1">
        <button
          onClick={onSave}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 active:scale-95"
        >
          <Save size={16} />
          <span className="hidden sm:inline">Guardar</span>
        </button>
        <button
          onClick={onPublish}
          className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100 active:scale-95"
        >
          <Globe size={16} />
          <span className="hidden sm:inline">Publicar</span>
        </button>
        <button
          onClick={onExport}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 active:scale-95"
        >
          <Download size={16} />
          <span className="hidden sm:inline">MusicXML</span>
        </button>
      </div>
    </div>
  )
}
