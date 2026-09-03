import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Loader2, Lock, LogIn, Mail } from 'lucide-react'

import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Continue where they were headed, rather than dropping them on the front
  // page after signing in.
  const destination = location.state?.from || '/mis-partituras'

  async function onSubmit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.email, form.password)
      navigate(destination, { replace: true })
    } catch (cause) {
      setError(
        cause?.response?.status === 401
          ? 'Ese correo o esa contraseña no son correctos.'
          : cause?.response?.data?.detail || 'No se pudo entrar. Inténtalo de nuevo.',
      )
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
          <h1 className="text-2xl font-bold text-slate-900">Entrar</h1>
          <p className="text-sm text-slate-500">Accede a tus partituras</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="relative block">
            <span className="sr-only">Correo electrónico</span>
            <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
              type="email"
              autoComplete="email"
              placeholder="tu@correo.com"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
          </label>

          <label className="relative block">
            <span className="sr-only">Contraseña</span>
            <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
              type="password"
              autoComplete="current-password"
              placeholder="Contraseña"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              required
            />
          </label>

          {error && (
            <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading && <Loader2 size={17} className="animate-spin" />}
            Entrar
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          ¿No tienes cuenta?{' '}
          <Link to="/registro" className="font-medium text-indigo-600 hover:text-indigo-800">
            Crear una
          </Link>
        </p>
      </div>
    </section>
  )
}
