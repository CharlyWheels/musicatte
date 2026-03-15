import { ACCIDENTAL_LABELS } from './meiEditor'

export default function AccidentalPanel({ activeAccid, onChangeAccidental }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Alteraciones
      </h3>
      <div className="flex flex-wrap gap-2">
        {ACCIDENTAL_LABELS.map((item) => (
          <button
            key={item.value}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition active:scale-95 ${
              activeAccid === item.value
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'border border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700'
            }`}
            onClick={() => onChangeAccidental(item.value)}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span className="hidden sm:inline">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
