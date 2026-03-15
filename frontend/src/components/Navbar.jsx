import { Link, NavLink } from 'react-router-dom'
import { BookOpenText, Camera, Library, LogOut, Music, User } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const navItems = [
  { to: '/scanner', label: 'Scanner', icon: Camera },
  { to: '/editor', label: 'Editor', icon: Music },
  { to: '/repository', label: 'Repositorio', icon: Library },
]

function NavItem({ to, label, icon }) {
  const IconComponent = icon
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
          isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
        }`
      }
    >
      <IconComponent size={16} />
      <span>{label}</span>
    </NavLink>
  )
}

export default function Navbar() {
  const { user, logout, isAuthenticated } = useAuth()
  return (
    <>
      <header className="sticky top-0 z-10 hidden border-b bg-white md:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold text-slate-900">
            <BookOpenText size={20} />
            <span>Musicatte</span>
          </Link>
          <nav className="flex items-center gap-2">
            {navItems.map((item) => (
              <NavItem key={item.to} to={item.to} label={item.label} icon={item.icon} />
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <>
                <span className="text-sm text-slate-600">{user?.email}</span>
                <button
                  onClick={logout}
                  className="flex items-center gap-1 rounded-md border px-3 py-2 text-sm"
                >
                  <LogOut size={14} />
                  Salir
                </button>
              </>
            ) : (
              <Link to="/login" className="rounded-md border px-3 py-2 text-sm">
                <User size={14} className="inline-block" /> Entrar
              </Link>
            )}
          </div>
        </div>
      </header>

      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t bg-white md:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-3 text-xs ${
                  isActive ? 'text-slate-900' : 'text-slate-500'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  )
}
