const BASE = import.meta.env.VITE_API_BASE_URL || ''

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.detail || data.error || `HTTP ${res.status}`)
  }
  return data
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      const base64 = result.split(',')[1] || result
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function analyzeDocument(payload) {
  return request('/api/analyze', { method: 'POST', body: JSON.stringify(payload) })
}

export async function getJob(jobId) {
  return request(`/api/jobs/${jobId}`)
}

export async function pollJob(jobId, { intervalMs = 1500, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const job = await getJob(jobId)
        if (onProgress) onProgress(job.progress, job)
        if (job.status === 'done') {
          resolve(job.result)
          return
        }
        if (job.status === 'error') {
          reject(new Error(job.error || 'Job failed'))
          return
        }
        setTimeout(poll, intervalMs)
      } catch (err) {
        reject(err)
      }
    }
    poll()
  })
}

export async function checkJsonIndex(payload) {
  return request('/api/json/check-index', { method: 'POST', body: JSON.stringify(payload) })
}

export async function previewJsonUpload(payload) {
  return request('/api/json/preview', { method: 'POST', body: JSON.stringify(payload) })
}

export async function importJsonUpload(payload) {
  return request('/api/json/import', { method: 'POST', body: JSON.stringify(payload) })
}

export async function uploadDocument(payload) {
  return request('/api/upload', { method: 'POST', body: JSON.stringify(payload) })
}

export async function getSession(sessionId) {
  return request(`/api/sessions/${sessionId}`)
}

export async function updateSessionFaqs(sessionId, faqs) {
  return request(`/api/sessions/${sessionId}/faqs`, {
    method: 'PUT',
    body: JSON.stringify({ faqs }),
  })
}

export async function regenerateSession(sessionId) {
  return request(`/api/sessions/${sessionId}/regenerate`, { method: 'POST' })
}

export async function finishSession(sessionId) {
  return request(`/api/sessions/${sessionId}/done`, { method: 'POST' })
}

export async function downloadProductJson(sessionId, partnerId, productId) {
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/export`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || `HTTP ${res.status}`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${partnerId}_${productId}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadSharedKnowledgeZip(sessionId) {
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/shared-knowledge/zip`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || `HTTP ${res.status}`)
  }
  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition') || ''
  const match = disposition.match(/filename="([^"]+)"/)
  const filename = match?.[1] || 'knowledge_shared.zip'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadJsonText(text, filename) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function copyToClipboard(text) {
  await navigator.clipboard.writeText(text)
}
