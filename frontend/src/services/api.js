import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL,
})

export function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}
