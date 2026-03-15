import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LogIn, Mail, Lock } from 'lucide-react'

export default function Login() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const destination = location.state?.from || '/'

  // If already authenticated, redirect immediately
  if (isAuthenticated) {
    navigate(destination, { replace: true })
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.email, form.password)
      // Small delay to let auth state propagate, then redirect
      setTimeout(() => navigate(destination, { replace: true }), 100)
    } catch {
      setError('Credenciales inválidas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mx-auto max-w-md pt-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100">
            <LogIn size={24} className="text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Bienvenido</h1>
          <p className="text-sm text-slate-500">Inicia sesión en tu cuenta</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="relative">
            <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              required
            />
          </div>
          <div className="relative">
            <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
              type="password"
              placeholder="Contraseña"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              required
            />
          </div>
          {error && (
            <p className="rounded-lg bg-red-50 p-2.5 text-center text-sm text-red-600">{error}</p>
          )}
          <button
            disabled={loading}
            className="w-full rounded-xl bg-indigo-600 py-2.5 font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          ¿No tienes cuenta?{' '}
          <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-700">
            Regístrate
          </Link>
        </p>
      </div>
    </section>
  )
}
