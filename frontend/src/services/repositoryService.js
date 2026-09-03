import { api, authHeaders } from './api'
import { filenameFrom } from './scoreService'

export const repositoryService = {
  async list(params = {}, token) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== '' && value != null),
    ).toString()
    const { data } = await api.get(`/api/repository${query ? `?${query}` : ''}`, {
      headers: authHeaders(token),
    })
    return data
  },
  /** Read a published score. No account needed. */
  async get(scoreId) {
    const { data } = await api.get(`/api/repository/${scoreId}`)
    return data
  },
  async exportScore(scoreId, format) {
    const response = await api.get(`/api/repository/${scoreId}/export`, {
      params: { format },
      responseType: 'blob',
    })
    return {
      blob: response.data,
      filename: filenameFrom(response.headers, `partitura.${format}`),
    }
  },
  async publish(scoreId, token) {
    const { data } = await api.post(`/api/repository/${scoreId}/publish`, {}, {
      headers: authHeaders(token),
    })
    return data
  },
  async unpublish(scoreId, token) {
    const { data } = await api.post(`/api/repository/${scoreId}/unpublish`, {}, {
      headers: authHeaders(token),
    })
    return data
  },
  async rate(scoreId, value, token) {
    const { data } = await api.put(`/api/repository/${scoreId}/rating`, { value }, {
      headers: authHeaders(token),
    })
    return data
  },
}
