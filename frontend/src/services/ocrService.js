import { api, authHeaders } from './api'

export const ocrService = {
  /** Upload limits, served rather than hardcoded in the UI. */
  async limits() {
    const { data } = await api.get('/api/ocr/limits')
    return data
  },
  /** Judge a photo before committing to a full recognition run. */
  async analyze(file, token) {
    const form = new FormData()
    form.append('image', file)
    const { data } = await api.post('/api/ocr/analyze', form, { headers: authHeaders(token) })
    return data
  },
  async createJob(file, token) {
    const form = new FormData()
    form.append('image', file)
    const { data } = await api.post('/api/ocr/jobs', form, { headers: authHeaders(token) })
    return data
  },
  async getJob(jobId, token) {
    const { data } = await api.get(`/api/ocr/jobs/${jobId}`, { headers: authHeaders(token) })
    return data
  },
  async listJobs(token) {
    const { data } = await api.get('/api/ocr/jobs', { headers: authHeaders(token) })
    return data
  },
  /** Re-cut piece boundaries without re-running recognition. */
  async resplit(jobId, boundaries, token) {
    const { data } = await api.post(`/api/ocr/jobs/${jobId}/split`, { boundaries }, {
      headers: authHeaders(token),
    })
    return data
  },
  async retry(jobId, token) {
    const { data } = await api.post(`/api/ocr/jobs/${jobId}/retry`, {}, {
      headers: authHeaders(token),
    })
    return data
  },
  async remove(jobId, token) {
    await api.delete(`/api/ocr/jobs/${jobId}`, { headers: authHeaders(token) })
  },
}
