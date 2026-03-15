import { accidentals } from './scoreModel'

export default function AccidentalPanel({ onChangeAccidental }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <h3 className="mb-2 text-sm font-semibold">Alteraciones</h3>
      <div className="flex gap-2">
        {accidentals.map((item) => (
          <button
            key={item.value}
            className="rounded-md border px-3 py-2 text-sm"
            onClick={() => onChangeAccidental(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
