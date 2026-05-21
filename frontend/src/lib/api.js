// ClinIQ AI — API Client  v4.1
// Handles RAG-online and Groq-only (RAG-offline) modes gracefully.

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

// ── Core fetch wrapper ────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const url = `${BACKEND}${path}`
  let resp
  try {
    resp = await fetch(url, { ...options, headers: { ...(options.headers || {}) } })
  } catch (err) {
    // Network error — backend not reachable at all
    throw new Error(
      `Cannot reach backend at ${BACKEND}. ` +
      `Make sure the API is running (uvicorn api:app --port 8000).`
    )
  }

  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`
    try {
      const body = await resp.json()
      detail = body.detail || body.message || detail
    } catch (_) {}

    // 503 = Milvus offline — surface a friendly message instead of crashing
    if (resp.status === 503) {
      throw new Error(`RAG service unavailable: ${detail}. Check Milvus / Zilliz Cloud connection.`)
    }
    throw new Error(detail)
  }
  return resp.json()
}

// ── Health ────────────────────────────────────────────────────────────────────
export async function checkHealth() {
  return apiFetch('/health')
}

// ── Analyse text ──────────────────────────────────────────────────────────────
export async function analyzeText(reportText, topK = 5) {
  return apiFetch('/analyze/text', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ report_text: reportText, top_k: topK }),
  })
}

// ── Analyse image ─────────────────────────────────────────────────────────────
export async function analyzeImage(file, clinicalContext = '') {
  const fd = new FormData()
  fd.append('file', file)
  if (clinicalContext) fd.append('clinical_context', clinicalContext)
  return apiFetch('/analyze/image', { method: 'POST', body: fd })
}

// ── Unified (text + any file) ─────────────────────────────────────────────────
export async function analyzeComplete({ text, file, clinicalContext } = {}) {
  const fd = new FormData()
  if (text)            fd.append('text', text)
  if (file)            fd.append('file', file)
  if (clinicalContext) fd.append('clinical_context', clinicalContext)
  return apiFetch('/analyze/complete', { method: 'POST', body: fd })
}

// ── Groq AI only ──────────────────────────────────────────────────────────────
export async function getAIAnalysis(text, isXray = false, clinicalContext = '') {
  return apiFetch('/analyze/ai', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ text, is_xray: isXray, clinical_context: clinicalContext }),
  })
}

// ── Parse file (extract text only) ───────────────────────────────────────────
export async function parseFile(file) {
  const fd = new FormData()
  fd.append('file', file)
  return apiFetch('/parse/file', { method: 'POST', body: fd })
}

// ── Search ────────────────────────────────────────────────────────────────────
export async function searchCases(query, topK = 5) {
  return apiFetch('/search', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query, top_k: topK }),
  })
}

// ── Stats ─────────────────────────────────────────────────────────────────────
export async function getStats() {
  return apiFetch('/stats')
}

// ── Diseases ──────────────────────────────────────────────────────────────────
export async function getDiseases() {
  return apiFetch('/diseases')
}

export async function getDisease(id) {
  return apiFetch(`/diseases/${id}`)
}

export async function getOutbreaks() {
  return apiFetch('/diseases/outbreaks/current')
}

// ── Symptom triage ────────────────────────────────────────────────────────────
export async function analyzeSymptoms(symptoms, age, gender) {
  const body = { symptoms }
  if (age)    body.age    = age
  if (gender) body.gender = gender
  return apiFetch('/symptoms/analyze', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
}
