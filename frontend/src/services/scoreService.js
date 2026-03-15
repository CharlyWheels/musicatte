import { api, authHeaders } from './api'

export const scoreService = {
  async create(payload, token) {
    const { data } = await api.post('/api/scores', payload, {
      headers: authHeaders(token),
    })
    return data
  },
  async update(scoreId, payload, token) {
    const { data } = await api.put(`/api/scores/${scoreId}`, payload, {
      headers: authHeaders(token),
    })
    return data
  },
  async get(scoreId, token) {
    const { data } = await api.get(`/api/scores/${scoreId}`, {
      headers: authHeaders(token),
    })
    return data
  },
  async listMine(token, page = 1, pageSize = 20) {
    const { data } = await api.get(
      `/api/scores?mine=true&page=${page}&page_size=${pageSize}`,
      { headers: authHeaders(token) },
    )
    return data
  },
  async remove(scoreId, token) {
    await api.delete(`/api/scores/${scoreId}`, {
      headers: authHeaders(token),
    })
  },
}
