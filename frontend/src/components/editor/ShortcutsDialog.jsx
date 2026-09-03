import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

const GROUPS = [
  {
    title: 'Selección y navegación',
    items: [
      ['←  →', 'Nota anterior / siguiente'],
      ['Mayús + ← →', 'Ampliar la selección'],
      ['Esc', 'Quitar la selección'],
      ['Doble clic en un compás', 'Elegir ese compás en el panel'],
    ],
  },
  {
    title: 'Altura',
    items: [
      ['↑  ↓', 'Subir o bajar un grado'],
      ['Mayús + ↑ ↓', 'Subir o bajar una octava'],
      ['C D E F G A B', 'Poner esa nota (do, re, mi…)'],
      ['Arrastrar la nota', 'Cambiar la altura'],
    ],
  },
  {
    title: 'Figuras',
    items: [
      ['1 … 6', 'Redonda, blanca, negra, corchea, semicorchea, fusa'],
      ['.', 'Puntillo'],
      ['R', 'Convertir en silencio'],
      ['T', 'Ligadura de unión'],
      ['A', 'Añadir nota al acorde'],
      ['N', 'Insertar una nota después'],
      ['Supr', 'Eliminar'],
    ],
  },
  {
    title: 'General',
    items: [
      ['I', 'Modo añadir notas con el ratón'],
      ['Espacio', 'Escuchar / parar'],
      ['Ctrl/⌘ + Z', 'Deshacer'],
      ['Ctrl/⌘ + Mayús + Z', 'Rehacer'],
      ['Ctrl/⌘ + S', 'Guardar'],
      ['Ctrl/⌘ + C / V', 'Copiar / pegar'],
      ['?', 'Esta ayuda'],
    ],
  },
]

export default function ShortcutsDialog({ onClose }) {
  const closeRef = useRef(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Atajos de teclado"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Atajos de teclado</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {group.title}
              </h3>
              <dl className="space-y-1.5">
                {group.items.map(([keys, description]) => (
                  <div key={keys} className="flex items-baseline gap-3">
                    <dt className="shrink-0">
                      <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                        {keys}
                      </kbd>
                    </dt>
                    <dd className="text-sm leading-snug text-slate-600">{description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
