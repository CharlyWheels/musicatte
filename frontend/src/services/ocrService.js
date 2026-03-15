import { api, authHeaders } from './api'

export const ocrService = {
  async createJob(file, token) {
    const form = new FormData()
    form.append('image', file)
    const { data } = await api.post('/api/ocr/jobs', form, {
      headers: {
        ...authHeaders(token),
      },
    })
    return data
  },
  async getJob(jobId, token) {
    const { data } = await api.get(`/api/ocr/jobs/${jobId}`, {
      headers: authHeaders(token),
    })
    return data
  },
}
