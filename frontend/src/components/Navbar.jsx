import { Link, NavLink } from 'react-router-dom'
import { Camera, FileMusic, Library, LogOut, Music, Plus, User } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const { user, logout, isAuthenticated } = useAuth()

  const navItems = isAuthenticated
    ? [
        { to: '/', label: 'Mis partituras', icon: FileMusic },
        { to: '/scanner', label: 'Scanner', icon: Camera },
        { to: '/editor', label: 'Nueva', icon: Plus },
        { to: '/repository', label: 'Repositorio', icon: Library },
      ]
    : [
        { to: '/scanner', label: 'Scanner', icon: Camera },
        { to: '/editor', label: 'Editor', icon: Music },
        { to: '/repository', label: 'Repositorio', icon: Library },
      ]

  return (
    <>
      {/* Desktop navbar */}
      <header className="sticky top-0 z-30 hidden border-b border-slate-200 bg-white/80 backdrop-blur-lg md:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2.5 font-bold text-slate-900 transition hover:text-indigo-600">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
              <Music size={16} className="text-white" />
            </div>
            <span className="text-lg">Musicatte</span>
          </Link>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                <item.icon size={16} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <>
                <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600">
                  {user?.email}
                </span>
                <button
                  onClick={logout}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                >
                  <LogOut size={14} />
                  Salir
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                <User size={14} />
                Entrar
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/90 backdrop-blur-lg md:hidden safe-bottom">
        <div className={`mx-auto grid max-w-lg ${isAuthenticated ? 'grid-cols-5' : 'grid-cols-4'}`}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
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
              onClick={logout}
              className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-slate-400"
            >
              <LogOut size={20} />
              Salir
            </button>
          ) : (
            <NavLink
              to="/login"
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
