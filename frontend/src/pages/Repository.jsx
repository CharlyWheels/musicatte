/**
 * Browsing published scores.
 *
 * Every card now leads somewhere. The old listing had no author, no link and
 * no way to see the music -- only star buttons, which asked people to rate
 * scores they had no way of hearing or reading.
 */

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Library, Loader2, Search, SlidersHorizontal, Star, User } from 'lucide-react'

import { useAuth } from '../context/AuthContext.jsx'
import { useDevice } from '../hooks/useDevice.js'
import { repositoryService } from '../services/repositoryService.js'
import { GENRES, INSTRUMENTS } from '../editor/constants.js'

const SORTS = [
  { value: 'recent', label: 'Más recientes' },
  { value: 'rating', label: 'Mejor valoradas' },
  { value: 'title', label: 'Título' },
]

export default function Repository() {
  const { token } = useAuth()
  const { isCompact } = useDevice()
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ q: '', instrument: '', genre: '', sort: 'recent' })
  const [query, setQuery] = useState('')

  const load = useCallback(
    async (next) => {
      setLoading(true)
      try {
        const data = await repositoryService.list({ ...next, page_size: 24 }, token)
        setItems(data.items || [])
        setTotal(data.total || 0)
      } finally {
        setLoading(false)
      }
    },
    [token],
  )

  useEffect(() => {
    load(filters)
  }, [filters, load])

  // Only the ones that actually narrow the list; the sort order always has a
  // value and counting it would show "1" on a page with no filters set.
  const activeFilters = [filters.instrument, filters.genre].filter(Boolean).length

  const selectClass =
    'min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base sm:text-sm'

  const selects = (
    <>
      <select
        value={filters.instrument}
        onChange={(event) =>
          setFilters((current) => ({ ...current, instrument: event.target.value }))
        }
        className={selectClass}
        aria-label="Instrumento"
      >
        <option value="">Cualquier instrumento</option>
        {INSTRUMENTS.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <select
        value={filters.genre}
        onChange={(event) => setFilters((current) => ({ ...current, genre: event.target.value }))}
        className={selectClass}
        aria-label="Género"
      >
        <option value="">Cualquier género</option>
        {GENRES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <select
        value={filters.sort}
        onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))}
        className={selectClass}
        aria-label="Ordenar por"
      >
        {SORTS.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </>
  )

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
          <Library size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Repositorio comunitario</h1>
          <p className="text-sm text-slate-500">
            {loading ? 'Buscando…' : `${total} partitura${total === 1 ? '' : 's'} publicadas`}
          </p>
        </div>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          setFilters((current) => ({ ...current, q: query }))
        }}
        className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
      >
        <div className="relative">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por título o compositor…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-base transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 sm:text-sm"
          />
        </div>

        {/* Three full-width selects stacked on a phone pushed the first result
            most of a screen down, to narrow a list that is usually short
            enough not to need narrowing. Folded away, with the number of
            active ones on the summary so nothing is hidden silently. */}
        {isCompact ? (
          <details className="rounded-xl border border-slate-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium text-slate-600">
              <SlidersHorizontal size={16} className="text-slate-400" />
              Filtros y orden
              {activeFilters > 0 && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                  {activeFilters}
                </span>
              )}
            </summary>
            <div className="grid gap-2 border-t border-slate-100 p-3">{selects}</div>
          </details>
        ) : (
          selects
        )}
      </form>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={22} className="animate-spin text-indigo-500" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-14 text-center">
          <Library size={38} className="mx-auto mb-3 text-slate-300" />
          <p className="font-medium text-slate-500">No hay partituras que coincidan</p>
          <p className="text-sm text-slate-400">
            Prueba con otra búsqueda, o publica tú la primera desde el editor.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((score) => (
            <li key={score.id}>
              <Link
                to={`/partitura/${score.id}`}
                className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
              >
                <h2 className="font-bold text-slate-900 group-hover:text-indigo-700">
                  {score.title}
                </h2>
                {score.composer && (
                  <p className="truncate text-sm text-slate-500">{score.composer}</p>
                )}
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                  <User size={11} /> {score.author}
                  {score.is_mine && <span className="text-indigo-500">· tuya</span>}
                </p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {INSTRUMENTS.find((item) => item.value === score.instrument)?.label ||
                      score.instrument}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {GENRES.find((item) => item.value === score.genre)?.label || score.genre}
                  </span>
                </div>

                <div className="mt-auto flex items-center gap-1 pt-4">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <Star
                      key={value}
                      size={14}
                      className={
                        value <= Math.round(score.avg_rating || 0)
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-slate-200'
                      }
                    />
                  ))}
                  <span className="ml-1 text-xs text-slate-400">
                    {score.rating_count > 0
                      ? `${score.avg_rating.toFixed(1)} (${score.rating_count})`
                      : 'sin valorar'}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
