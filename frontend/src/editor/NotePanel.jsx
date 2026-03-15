import { durations } from './scoreModel'

export default function NotePanel({ activeDuration, onChangeDuration }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <h3 className="mb-2 text-sm font-semibold">Tipo de nota</h3>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {durations.map((item) => (
          <button
            key={item.value}
            className={`rounded-md border px-3 py-2 text-sm ${
              activeDuration === item.value ? 'bg-slate-900 text-white' : ''
            }`}
            onClick={() => onChangeDuration(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
