import { keySignatures } from './scoreModel'

export default function KeySignature({ value, onChange }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <h3 className="mb-2 text-sm font-semibold">Armadura</h3>
      <select
        className="rounded-md border px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {keySignatures.map((key) => (
          <option key={key} value={key}>
            {key}
          </option>
        ))}
      </select>
    </div>
  )
}
