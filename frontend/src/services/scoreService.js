import { api, authHeaders } from './api'

/** Filename from a Content-Disposition header, or a sensible fallback. */
function filenameFrom(headers, fallback) {
  const disposition = headers?.['content-disposition'] || ''
  const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
  return match ? decodeURIComponent(match[1]) : fallback
}

export const scoreService = {
  async create(payload, token) {
    const { data } = await api.post('/api/scores', payload, { headers: authHeaders(token) })
    return data
  },
  async update(scoreId, payload, token) {
    const { data } = await api.put(`/api/scores/${scoreId}`, payload, {
      headers: authHeaders(token),
    })
    return data
  },
  /** Metadata-only edit: does not resend the notation. */
  async updateMetadata(scoreId, payload, token) {
    const { data } = await api.patch(`/api/scores/${scoreId}`, payload, {
      headers: authHeaders(token),
    })
    return data
  },
  async get(scoreId, token) {
    const { data } = await api.get(`/api/scores/${scoreId}`, { headers: authHeaders(token) })
    return data
  },
  async listMine(token, { page = 1, pageSize = 24, q = '' } = {}) {
    const params = new URLSearchParams({ page, page_size: pageSize })
    if (q) params.set('q', q)
    const { data } = await api.get(`/api/scores?${params}`, { headers: authHeaders(token) })
    return data
  },
  async remove(scoreId, token) {
    await api.delete(`/api/scores/${scoreId}`, { headers: authHeaders(token) })
  },
  /**
   * Download in a format other tools can open.
   *
   * Conversion is server-side because Verovio can only write MEI: the old
   * client-side "export MusicXML" produced a MEI file with an .xml extension.
   */
  async exportScore(scoreId, format, token) {
    const response = await api.get(`/api/scores/${scoreId}/export`, {
      params: { format },
      headers: authHeaders(token),
      responseType: 'blob',
    })
    return {
      blob: response.data,
      filename: filenameFrom(response.headers, `partitura.${format}`),
    }
  },
  /** Open an existing MusicXML, .mxl, MEI or MIDI file in the editor. */
  async importFile(file, token) {
    const form = new FormData()
    form.append('file', file)
    const { data } = await api.post('/api/import', form, { headers: authHeaders(token) })
    return data
  },
}

export { filenameFrom }
