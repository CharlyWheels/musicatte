import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <p className="py-12 text-center text-sm text-slate-400">Comprobando la sesión…</p>
  }
  if (!isAuthenticated) {
    // Remember where they were headed so signing in continues the journey
    // instead of dumping them on the front page.
    return <Navigate to="/entrar" state={{ from: location.pathname }} replace />
  }
  return children
}
