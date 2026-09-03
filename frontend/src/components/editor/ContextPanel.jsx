/**
 * One panel that changes with what is selected.
 *
 * Replaces the three permanent panels (duration, accidentals, score
 * properties) that were on screen whether or not they applied to anything.
 * With nothing selected it explains how to start; with a note selected it
 * offers what you can do to a note; with several, what you can do to a run.
 */

import { useState } from 'react'
import {
  ArrowDownUp,
  Braces,
  Clock,
  Layers,
  ListMusic,
  Music2,
  Settings2,
  Trash2,
  Type,
} from 'lucide-react'

import {
  ACCIDENTALS,
  ARTICULATIONS,
  BARLINES,
  CLEFS,
  DURATIONS,
  DYNAMICS,
  KEY_SIGNATURES,
  TEMPO_PRESETS,
  TIME_SIGNATURES,
  TUPLETS,
  noteLabel,
} from '../../editor/constants.js'

function Section({ icon: Icon, title, children, hint }) {
  return (
    <section className="border-b border-slate-100 px-4 py-3 last:border-b-0">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {Icon && <Icon size={13} />}
        {title}
      </h3>
      {children}
      {hint && <p className="mt-2 text-xs leading-relaxed text-slate-400">{hint}</p>}
    </section>
  )
}

function Chip({ active, onClick, children, title, disabled, tone = 'indigo' }) {
  const activeTone =
    tone === 'rose' ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`rounded-lg border px-2.5 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? `${activeTone} border-transparent shadow-sm`
          : 'border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700'
      }`}
    >
      {children}
    </button>
  )
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function ContextPanel({
  selection,
  noteInfo,
  staves,
  activeStaff,
  onSelectStaff,
  measureCount,
  currentMeasure,
  tempo,
  lyric,
  actions,
}) {
  const single = selection.length === 1
  const many = selection.length > 1
  const selectionKey = selection.join()

  // Which tab to show is derived, not stored-and-synced: the note tab when
  // something is selected, the score tab otherwise, and whatever the user last
  // clicked in between. Keeping it in state and correcting it from an effect
  // meant a render with the wrong tab before every correction.
  const [tabChoice, setTabChoice] = useState(null)
  const tab = !selection.length && tabChoice !== 'score' ? 'score' : (tabChoice ?? 'note')

  // The lyric field is a draft the user is typing, so it cannot simply mirror
  // the document -- but it must reset when the selection moves to another
  // note. This is the "adjust state when props change" pattern: correcting it
  // during render rather than after one.
  const [lyricDraft, setLyricDraft] = useState(lyric || '')
  const [lyricFor, setLyricFor] = useState(selectionKey)
  if (lyricFor !== selectionKey) {
    setLyricFor(selectionKey)
    setLyricDraft(lyric || '')
  }

  const staffProperties = staves.find((staff) => staff.staff === String(activeStaff)) || staves[0]

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex shrink-0 border-b border-slate-200 bg-slate-50">
        {[
          { id: 'note', label: 'Nota', icon: Music2, disabled: !selection.length },
          { id: 'score', label: 'Partitura', icon: Settings2 },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            onClick={() => setTabChoice(item.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition disabled:opacity-40 ${
              tab === item.id
                ? 'border-b-2 border-indigo-600 bg-white text-indigo-700'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <item.icon size={14} />
            {item.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'note' ? (
          selection.length === 0 ? (
            <Section title="Nada seleccionado">
              <p className="text-sm leading-relaxed text-slate-500">
                Haz clic en una nota para editarla, o pulsa{' '}
                <kbd className="rounded bg-slate-100 px-1 font-mono text-xs">I</kbd> y haz clic
                en el pentagrama a la altura que quieras para añadir notas.
              </p>
            </Section>
          ) : (
            <>
              <Section icon={Music2} title={many ? `${selection.length} elementos` : 'Selección'}>
                {single && noteInfo && (
                  <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-2xl font-semibold text-slate-800">
                      {noteLabel(noteInfo.pname, noteInfo.oct, noteInfo.accid)}
                    </span>
                    <span className="text-sm text-slate-500">{noteInfo.durLabel}</span>
                    {noteInfo.dots && <span className="text-sm text-slate-500">con puntillo</span>}
                    {noteInfo.measure && (
                      <span className="text-xs text-slate-400">compás {noteInfo.measure}</span>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <Chip onClick={actions.toggleRest} title="Convertir en silencio (R)">
                    Silencio
                  </Chip>
                  <Chip onClick={actions.addChordNote} title="Añadir nota al acorde (A)">
                    <Layers size={13} className="mr-1 inline" />
                    Acorde
                  </Chip>
                  <Chip onClick={actions.insertAfter} title="Insertar nota después (N)">
                    Insertar
                  </Chip>
                  <Chip onClick={actions.deleteSelection} tone="rose" title="Eliminar (Supr)">
                    <Trash2 size={13} className="mr-1 inline" />
                    Eliminar
                  </Chip>
                </div>
              </Section>

              <Section icon={Clock} title="Duración">
                <div className="flex flex-wrap gap-1.5">
                  {DURATIONS.map((item) => (
                    <Chip
                      key={item.dur}
                      active={single && noteInfo?.dur === item.dur}
                      onClick={() => actions.setDuration(item.dur)}
                      title={item.label}
                    >
                      <span className="text-lg leading-none">{item.glyph}</span>
                    </Chip>
                  ))}
                  <Chip
                    active={single && Boolean(noteInfo?.dots)}
                    onClick={actions.toggleDot}
                    title="Puntillo (.)"
                  >
                    Puntillo
                  </Chip>
                </div>
              </Section>

              <Section icon={Braces} title="Alteración">
                <div className="flex flex-wrap gap-1.5">
                  {ACCIDENTALS.map((item) => (
                    <Chip
                      key={item.value || 'none'}
                      active={single && (noteInfo?.accid || '') === item.value}
                      onClick={() => actions.setAccidental(item.value)}
                      title={item.label}
                    >
                      <span className="text-base leading-none">{item.glyph}</span>
                    </Chip>
                  ))}
                </div>
              </Section>

              <Section icon={ArrowDownUp} title="Altura">
                <div className="flex flex-wrap gap-1.5">
                  <Chip onClick={() => actions.shiftOctave(1)} title="Subir una octava">
                    +8ª
                  </Chip>
                  <Chip onClick={() => actions.shiftOctave(-1)} title="Bajar una octava">
                    −8ª
                  </Chip>
                  <Chip onClick={() => actions.transpose(1)} title="Subir un semitono">
                    +½ tono
                  </Chip>
                  <Chip onClick={() => actions.transpose(-1)} title="Bajar un semitono">
                    −½ tono
                  </Chip>
                </div>
              </Section>

              <Section icon={ListMusic} title="Articulación">
                <div className="flex flex-wrap gap-1.5">
                  {ARTICULATIONS.map((item) => (
                    <Chip
                      key={item.value}
                      active={single && (noteInfo?.artic || '').includes(item.value)}
                      onClick={() => actions.toggleArticulation(item.value)}
                      title={item.label}
                    >
                      {item.label}
                    </Chip>
                  ))}
                </div>
              </Section>

              <Section
                title="Dinámica"
                hint="Los reguladores necesitan al menos dos notas seleccionadas."
              >
                <div className="flex flex-wrap gap-1.5">
                  {DYNAMICS.map((value) => (
                    <Chip key={value} onClick={() => actions.setDynamic(value)} title={value}>
                      <em className="font-serif font-bold not-italic">{value}</em>
                    </Chip>
                  ))}
                  <Chip onClick={() => actions.setDynamic('')} title="Quitar la dinámica">
                    Quitar
                  </Chip>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Chip disabled={!many} onClick={() => actions.addHairpin('cres')}>
                    Crescendo
                  </Chip>
                  <Chip disabled={!many} onClick={() => actions.addHairpin('dim')}>
                    Diminuendo
                  </Chip>
                </div>
              </Section>

              <Section
                title="Unir y agrupar"
                hint="Las ligaduras de unión requieren la misma nota; las de expresión, dos notas cualesquiera."
              >
                <div className="flex flex-wrap gap-1.5">
                  <Chip onClick={actions.toggleTie} title="Ligadura de unión (T)">
                    Ligadura de unión
                  </Chip>
                  <Chip disabled={!many} onClick={actions.addSlur} title="Ligadura de expresión">
                    Ligadura de expresión
                  </Chip>
                  <Chip disabled={!many} onClick={actions.beam} title="Barrar">
                    Barrar
                  </Chip>
                  <Chip onClick={actions.unbeam} title="Quitar barrado">
                    Quitar barrado
                  </Chip>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {TUPLETS.map((item) => (
                    <Chip
                      key={item.num}
                      disabled={!many}
                      onClick={() => actions.makeTuplet(item.num, item.numbase)}
                      title={`${item.label} (${item.num}:${item.numbase})`}
                    >
                      {item.label}
                    </Chip>
                  ))}
                  <Chip onClick={actions.removeTuplet}>Deshacer grupo</Chip>
                </div>
              </Section>

              {single && (
                <Section icon={Type} title="Letra">
                  <div className="flex gap-2">
                    <input
                      value={lyricDraft}
                      onChange={(event) => setLyricDraft(event.target.value)}
                      onBlur={() => actions.setLyric(lyricDraft)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          actions.setLyric(lyricDraft)
                        }
                      }}
                      placeholder="Sílaba"
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                    <Chip onClick={() => actions.setLyric(lyricDraft)}>Aplicar</Chip>
                  </div>
                </Section>
              )}

              <Section title="Portapapeles">
                <div className="flex flex-wrap gap-1.5">
                  <Chip onClick={actions.copy} title="Copiar (Ctrl+C)">
                    Copiar
                  </Chip>
                  <Chip onClick={actions.paste} title="Pegar (Ctrl+V)">
                    Pegar
                  </Chip>
                </div>
              </Section>
            </>
          )
        ) : (
          <>
            {staves.length > 1 && (
              <Section icon={Layers} title="Pentagrama">
                <div className="flex flex-wrap gap-1.5">
                  {staves.map((staff) => (
                    <Chip
                      key={staff.staff}
                      active={String(activeStaff) === staff.staff}
                      onClick={() => onSelectStaff(staff.staff)}
                    >
                      {staff.label || `Pentagrama ${staff.staff}`}
                    </Chip>
                  ))}
                </div>
              </Section>
            )}

            <Section
              title="Clave, armadura y compás"
              hint={
                staves.length > 1
                  ? 'La clave se aplica al pentagrama seleccionado arriba; la armadura y el compás, a todos.'
                  : undefined
              }
            >
              <div className="grid gap-3">
                <Select
                  label="Clave"
                  value={`${staffProperties?.clefShape}|${staffProperties?.clefLine}`}
                  onChange={(value) => {
                    const [shape, line] = value.split('|')
                    actions.setClef(shape, line)
                  }}
                  options={CLEFS.map((clef) => ({
                    value: `${clef.shape}|${clef.line}`,
                    label: clef.label,
                  }))}
                />
                <Select
                  label="Armadura"
                  value={staffProperties?.keySig || '0'}
                  onChange={actions.setKeySignature}
                  options={KEY_SIGNATURES.map((key) => ({ value: key.sig, label: key.label }))}
                />
                <Select
                  label="Compás"
                  value={`${staffProperties?.meterCount}|${staffProperties?.meterUnit}`}
                  onChange={(value) => {
                    const [count, unit] = value.split('|')
                    actions.setTimeSignature(count, unit)
                  }}
                  options={TIME_SIGNATURES.map((meter) => ({
                    value: `${meter.count}|${meter.unit}`,
                    label: meter.label,
                  }))}
                />
              </div>
            </Section>

            <Section icon={Clock} title="Tempo">
              <div className="flex flex-wrap gap-1.5">
                {TEMPO_PRESETS.map((preset) => (
                  <Chip
                    key={preset.text}
                    active={tempo?.text === preset.text}
                    onClick={() => actions.setTempo(preset.text, preset.bpm)}
                    title={`${preset.text} · ♩ = ${preset.bpm}`}
                  >
                    {preset.text}
                  </Chip>
                ))}
                <Chip onClick={() => actions.setTempo('', null)}>Quitar</Chip>
              </div>
              {tempo?.bpm && (
                <p className="mt-2 text-xs text-slate-400">Actual: ♩ = {tempo.bpm}</p>
              )}
            </Section>

            <Section icon={Layers} title="Pentagramas y voces">
              <div className="flex flex-wrap gap-1.5">
                <Chip onClick={actions.addStaff} title="Añadir un pentagrama a toda la partitura">
                  Añadir pentagrama
                </Chip>
                <Chip
                  disabled={staves.length <= 1}
                  onClick={() => actions.removeStaff(activeStaff)}
                  tone="rose"
                >
                  Quitar este
                </Chip>
                <Chip onClick={() => actions.addLayer(activeStaff)} title="Añadir una segunda voz">
                  Añadir voz
                </Chip>
              </div>
            </Section>

            <Section
              title={`Compás ${currentMeasure || 1} de ${measureCount}`}
              hint="Haz doble clic en un compás de la partitura para seleccionarlo aquí."
            >
              <div className="mb-3 grid gap-3">
                <Select
                  label="Barra de compás"
                  value={actions.currentBarline || ''}
                  onChange={actions.setBarline}
                  options={BARLINES.map((bar) => ({ value: bar.value, label: bar.label }))}
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Chip onClick={() => actions.insertMeasureAfter(currentMeasure)}>
                  Insertar después
                </Chip>
                <Chip onClick={() => actions.clearMeasure(currentMeasure)}>Vaciar</Chip>
                <Chip
                  disabled={measureCount <= 1}
                  onClick={() => actions.deleteMeasure(currentMeasure)}
                  tone="rose"
                >
                  Eliminar compás
                </Chip>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip onClick={() => actions.addKeyChange(currentMeasure)}>
                  Cambio de armadura aquí
                </Chip>
                <Chip onClick={() => actions.addMeterChange(currentMeasure)}>
                  Cambio de compás aquí
                </Chip>
                <Chip onClick={() => actions.addVolta(currentMeasure)}>Casilla de repetición</Chip>
              </div>
            </Section>
          </>
        )}
      </div>
    </aside>
  )
}
