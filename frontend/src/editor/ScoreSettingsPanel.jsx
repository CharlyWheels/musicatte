import { CLEF_OPTIONS, KEY_SIG_OPTIONS, TIME_SIG_OPTIONS } from './meiEditor'

export default function ScoreSettingsPanel({
  clefShape, clefLine, keySig, meterCount, meterUnit,
  onChangeClef, onChangeKeySig, onChangeTimeSig,
}) {
  const currentClefIdx = CLEF_OPTIONS.findIndex(
    (o) => o.shape === clefShape && o.line === clefLine
  )
  const currentKeySigIdx = KEY_SIG_OPTIONS.findIndex((o) => o.sig === keySig)
  const currentTimeSigIdx = TIME_SIG_OPTIONS.findIndex(
    (o) => o.count === meterCount && o.unit === meterUnit
  )

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Propiedades de la partitura
      </h3>
      <div className="flex flex-wrap gap-4">
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">Clave</label>
          <select
            value={currentClefIdx >= 0 ? currentClefIdx : 0}
            onChange={(e) => {
              const opt = CLEF_OPTIONS[parseInt(e.target.value)]
              if (opt) onChangeClef(opt.shape, opt.line)
            }}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            {CLEF_OPTIONS.map((opt, i) => (
              <option key={i} value={i}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">Armadura</label>
          <select
            value={keySig || '0'}
            onChange={(e) => onChangeKeySig(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            {KEY_SIG_OPTIONS.map((opt) => (
              <option key={opt.sig} value={opt.sig}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">Compás</label>
          <select
            value={currentTimeSigIdx >= 0 ? currentTimeSigIdx : 0}
            onChange={(e) => {
              const opt = TIME_SIG_OPTIONS[parseInt(e.target.value)]
              if (opt) onChangeTimeSig(opt.count, opt.unit)
            }}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            {TIME_SIG_OPTIONS.map((opt, i) => (
              <option key={i} value={i}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
