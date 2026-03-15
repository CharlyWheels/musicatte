import { api, authHeaders } from './api'

export const authService = {
  async register(payload) {
    const { data } = await api.post('/api/auth/register', payload)
    return data
  },
  async login(payload) {
    const { data } = await api.post('/api/auth/login', payload)
    return data
  },
  async me(token) {
    const { data } = await api.get('/api/auth/me', {
      headers: authHeaders(token),
    })
    return data
  },
}
