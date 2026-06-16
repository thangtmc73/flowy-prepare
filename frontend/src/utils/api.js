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

export async function compareSession(sessionId) {
  return request(`/api/sessions/${sessionId}/compare`)
}

export async function submitSession(sessionId, mode = 'merge') {
  return request(`/api/sessions/${sessionId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ mode }),
  })
}

export async function regenerateSession(sessionId) {
  return request(`/api/sessions/${sessionId}/regenerate`, { method: 'POST' })
}

export async function listProducts() {
  return request('/api/products')
}

export async function getCrossProduct(fileId) {
  return request(`/api/cross-products/${fileId}`)
}

export async function updateCrossProductFaqs(fileId, faqs) {
  return request(`/api/cross-products/${fileId}/faqs`, {
    method: 'PUT',
    body: JSON.stringify({ faqs }),
  })
}

export async function listCrossProductHistory(fileId) {
  return request(`/api/cross-products/${fileId}/history`)
}

export async function restoreCrossProductHistory(fileId, filename) {
  return request(`/api/cross-products/${fileId}/history/${filename}/restore`, {
    method: 'POST',
  })
}

export async function getProduct(partnerId, productId) {
  return request(`/api/products/${partnerId}/${productId}`)
}

export async function updateProductFaqs(partnerId, productId, faqs) {
  return request(`/api/products/${partnerId}/${productId}/faqs`, {
    method: 'PUT',
    body: JSON.stringify({ faqs }),
  })
}

export async function deleteProduct(partnerId, productId) {
  return request(`/api/products/${partnerId}/${productId}`, { method: 'DELETE' })
}

export async function listHistory(partnerId, productId) {
  return request(`/api/products/${partnerId}/${productId}/history`)
}

export async function restoreHistory(partnerId, productId, filename) {
  return request(`/api/products/${partnerId}/${productId}/history/${filename}/restore`, {
    method: 'POST',
  })
}

export async function listSessions(status) {
  const q = status ? `?status=${status}` : ''
  return request(`/api/sessions${q}`)
}

export async function searchKnowledge(query, filters = {}) {
  return request('/api/knowledge/search', {
    method: 'POST',
    body: JSON.stringify({ query, ...filters }),
  })
}
