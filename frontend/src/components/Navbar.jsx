import { Link, NavLink } from 'react-router-dom'
import { Camera, FileMusic, Library, LogOut, Music, Pencil, User } from 'lucide-react'

import { useAuth } from '../context/AuthContext'

/**
 * Fixed labels, fixed destinations.
 *
 * The nav used to rename itself between sessions -- "Editor" became "Nueva",
 * "Mis partituras" pointed at `/` -- so the same control meant different
 * things depending on whether you were signed in.
 */
const ITEMS = [
  { to: '/escanear', label: 'Escanear', icon: Camera, needsAccount: true },
  { to: '/mis-partituras', label: 'Mis partituras', icon: FileMusic, needsAccount: true },
  { to: '/editor', label: 'Editor', icon: Pencil },
  { to: '/repositorio', label: 'Repositorio', icon: Library },
]

export default function Navbar() {
  const { user, logout, isAuthenticated } = useAuth()
  const items = ITEMS.filter((item) => !item.needsAccount || isAuthenticated)

  return (
    <>
      <header className="sticky top-0 z-30 hidden border-b border-slate-200 bg-white/85 backdrop-blur-lg md:block no-print">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link
            to="/"
            className="flex items-center gap-2.5 font-bold text-slate-900 transition hover:text-indigo-600"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
              <Music size={16} className="text-white" />
            </span>
            <span className="text-lg">Musicatte</span>
          </Link>

          <nav className="flex items-center gap-1" aria-label="Secciones">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                <item.icon size={16} />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <>
                <span
                  className="max-w-[12rem] truncate rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600"
                  title={user?.email}
                >
                  {user?.email}
                </span>
                <button
                  type="button"
                  onClick={logout}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
                >
                  <LogOut size={14} /> Salir
                </button>
              </>
            ) : (
              <Link
                to="/entrar"
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                <User size={14} /> Entrar
              </Link>
            )}
          </div>
        </div>
      </header>

      <nav
        className="safe-bottom fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-lg md:hidden no-print"
        aria-label="Secciones"
      >
        <div
          className="mx-auto grid max-w-lg"
          style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}
        >
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition ${
                  isActive ? 'text-indigo-600' : 'text-slate-400'
                }`
              }
            >
              <item.icon size={20} />
              {item.label}
            </NavLink>
          ))}
          {isAuthenticated ? (
            <button
              type="button"
              onClick={logout}
              className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-slate-400"
            >
              <LogOut size={20} />
              Salir
            </button>
          ) : (
            <NavLink
              to="/entrar"
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition ${
                  isActive ? 'text-indigo-600' : 'text-slate-400'
                }`
              }
            >
              <User size={20} />
              Entrar
            </NavLink>
          )}
        </div>
      </nav>
    </>
  )
}
