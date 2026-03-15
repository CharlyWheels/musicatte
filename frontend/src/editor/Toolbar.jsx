export default function Toolbar({
  title,
  onTitleChange,
  tempo,
  onTempoChange,
  onSave,
  onPublish,
  onExport,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-3">
      <input
        className="rounded-md border px-3 py-2"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Título"
      />
      <input
        className="w-24 rounded-md border px-3 py-2"
        value={tempo}
        type="number"
        min={30}
        max={240}
        onChange={(e) => onTempoChange(Number(e.target.value))}
      />
      <button className="rounded-md border px-3 py-2 text-sm" onClick={onSave}>
        Guardar
      </button>
      <button className="rounded-md border px-3 py-2 text-sm" onClick={onPublish}>
        Publicar
      </button>
      <button className="rounded-md border px-3 py-2 text-sm" onClick={onExport}>
        Exportar MusicXML
      </button>
    </div>
  )
}
