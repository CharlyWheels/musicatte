import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Home from './pages/Home.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ScoreDetail from './pages/ScoreDetail.jsx'
import Scanner from './pages/Scanner.jsx'
import Editor from './pages/Editor.jsx'
import Repository from './pages/Repository.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import { useAuth } from './context/AuthContext.jsx'

function HomeOrDashboard() {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return null
  return isAuthenticated ? <Dashboard /> : <Home />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomeOrDashboard />} />
          <Route path="dashboard" element={
            <ProtectedRoute><Dashboard /></ProtectedRoute>
          } />
          <Route path="score/:id" element={
            <ProtectedRoute><ScoreDetail /></ProtectedRoute>
          } />
          <Route path="repository" element={<Repository />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="scanner" element={
            <ProtectedRoute><Scanner /></ProtectedRoute>
          } />
          <Route path="editor" element={
            <ProtectedRoute><Editor /></ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
