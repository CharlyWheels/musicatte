/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { authService } from '../services/authService'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('musicatte_token'))
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function loadUser() {
      if (!token) {
        if (active) {
          setUser(null)
          setLoading(false)
        }
        return
      }
      try {
        const me = await authService.me(token)
        if (active) {
          setUser(me)
        }
      } catch {
        localStorage.removeItem('musicatte_token')
        if (active) {
          setToken(null)
          setUser(null)
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    setLoading(true)
    loadUser()
    return () => {
      active = false
    }
  }, [token])

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      isAuthenticated: Boolean(token && user),
      async login(email, password) {
        const data = await authService.login({ email, password })
        localStorage.setItem('musicatte_token', data.access_token)
        setToken(data.access_token)
      },
      async register(payload) {
        await authService.register(payload)
      },
      logout() {
        localStorage.removeItem('musicatte_token')
        setToken(null)
        setUser(null)
      },
    }),
    [token, user, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
