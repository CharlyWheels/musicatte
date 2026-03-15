import { api, authHeaders } from './api'

export const repositoryService = {
  async list(params = {}) {
    const query = new URLSearchParams(params).toString()
    const { data } = await api.get(`/api/repository${query ? `?${query}` : ''}`)
    return data
  },
  async publish(scoreId, token) {
    const { data } = await api.post(
      `/api/repository/${scoreId}/publish`,
      {},
      { headers: authHeaders(token) },
    )
    return data
  },
  async rate(scoreId, value, token) {
    const { data } = await api.put(
      `/api/repository/${scoreId}/rating`,
      { value },
      { headers: authHeaders(token) },
    )
    return data
  },
}
