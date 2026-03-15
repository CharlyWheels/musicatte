import { clefs } from './scoreModel'

export default function ClefPanel({ activeClef, onChangeClef }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <h3 className="mb-2 text-sm font-semibold">Clave</h3>
      <div className="flex gap-2">
        {clefs.map((item) => (
          <button
            key={item.value}
            className={`rounded-md border px-3 py-2 text-sm ${
              activeClef === item.value ? 'bg-slate-900 text-white' : ''
            }`}
            onClick={() => onChangeClef(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
