import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Loader2, Lock, Mail, UserPlus } from 'lucide-react'

import { useAuth } from '../context/AuthContext'

export default function Register() {
  const { register, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const destination = location.state?.from || '/mis-partituras'

  async function onSubmit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register(form)
      // Sign them straight in: asking somebody to type the password they just
      // chose into a second form is a step that exists for no reason.
      await login(form.email, form.password)
      navigate(destination, { replace: true })
    } catch (cause) {
      setError(
        cause?.response?.status === 400
          ? 'Ya hay una cuenta con ese correo. Prueba a entrar.'
          : cause?.response?.data?.detail || 'No se pudo crear la cuenta.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mx-auto max-w-md pt-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100">
            <UserPlus size={24} className="text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Crear cuenta</h1>
          <p className="text-sm text-slate-500">Para guardar y compartir tus partituras</p>
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
              autoComplete="new-password"
              placeholder="Contraseña (mínimo 6 caracteres)"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              required
              minLength={6}
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
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {loading && <Loader2 size={17} className="animate-spin" />}
            Crear cuenta
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          ¿Ya tienes cuenta?{' '}
          <Link to="/entrar" className="font-medium text-indigo-600 hover:text-indigo-800">
            Entrar
          </Link>
        </p>
      </div>
    </section>
  )
}
