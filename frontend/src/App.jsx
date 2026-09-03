import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import Layout from './components/Layout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Home from './pages/Home.jsx'
import Library from './pages/Library.jsx'
import Scan from './pages/Scan.jsx'
import Editor from './pages/Editor.jsx'
import Repository from './pages/Repository.jsx'
import PublicScore from './pages/PublicScore.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'

/**
 * One address, one thing.
 *
 * `/` used to render either a marketing page or the user's dashboard
 * depending on the session, with `/dashboard` rendering the same dashboard
 * again, so no two visits agreed on what any address meant. Now `/` is always
 * the front page and the library has an address of its own.
 *
 * The editor is deliberately outside ProtectedRoute: it works on a local
 * document, so somebody without an account can try it and is only asked to
 * sign in when they save. Sending them to a login screen for clicking
 * "Editor" in the nav was a dead end.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />

          <Route path="escanear" element={<ProtectedRoute><Scan /></ProtectedRoute>} />
          <Route path="mis-partituras" element={<ProtectedRoute><Library /></ProtectedRoute>} />

          <Route path="editor" element={<Editor />} />
          <Route path="editor/:id" element={<ProtectedRoute><Editor /></ProtectedRoute>} />

          <Route path="repositorio" element={<Repository />} />
          <Route path="partitura/:id" element={<PublicScore />} />

          <Route path="entrar" element={<Login />} />
          <Route path="registro" element={<Register />} />

          {/* Addresses the earlier version used. */}
          <Route path="scanner" element={<Navigate to="/escanear" replace />} />
          <Route path="dashboard" element={<Navigate to="/mis-partituras" replace />} />
          <Route path="repository" element={<Navigate to="/repositorio" replace />} />
          <Route path="login" element={<Navigate to="/entrar" replace />} />
          <Route path="register" element={<Navigate to="/registro" replace />} />
          <Route path="score/:id" element={<LegacyScoreRedirect />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

function LegacyScoreRedirect() {
  const id = window.location.pathname.split('/').pop()
  return <Navigate to={`/editor/${id}`} replace />
}
