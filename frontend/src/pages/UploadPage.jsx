import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import ProgressBar from '../components/ProgressBar'
import { analyzeDocument, fileToBase64, getProduct, pollJob, uploadDocument } from '../utils/api'

const CATEGORIES = [
  { id: 'health', label: 'Bảo hiểm sức khỏe' },
  { id: 'travel', label: 'Bảo hiểm du lịch' },
  { id: 'financial', label: 'Bảo hiểm tài chính' },
  { id: 'cyber', label: 'An ninh mạng' },
  { id: 'car', label: 'Bảo hiểm xe' },
]

const EMPTY_FORM = {
  partner_id: '',
  partner_name: '',
  product_id: '',
  product_name: '',
  category: 'health',
}

function SuggestBadge() {
  return (
    <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-brand bg-brand-light px-1.5 py-0.5 rounded">
      AI gợi ý
    </span>
  )
}

export default function UploadPage() {
  const [, setLocation] = useLocation()
  const [file, setFile] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [suggested, setSuggested] = useState(false)
  const [reasoning, setReasoning] = useState('')
  const [confidence, setConfidence] = useState('')
  const [existingProduct, setExistingProduct] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeProgress, setAnalyzeProgress] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const analyzeSeq = useRef(0)

  const runAnalyze = useCallback(async (selectedFile) => {
    const seq = ++analyzeSeq.current
    setAnalyzing(true)
    setAnalyzeProgress(null)
    setError('')
    setSuggested(false)
    setReasoning('')
    setConfidence('')
    setExistingProduct(null)
    setForm(EMPTY_FORM)

    try {
      const file_base64 = await fileToBase64(selectedFile)
      const { job_id } = await analyzeDocument({
        filename: selectedFile.name,
        file_base64,
      })
      const result = await pollJob(job_id, {
        intervalMs: 1200,
        onProgress: (progress) => {
          if (seq === analyzeSeq.current) setAnalyzeProgress(progress)
        },
      })
      if (seq !== analyzeSeq.current) return

      const m = result.metadata || {}
      setForm({
        partner_id: m.partner_id || '',
        partner_name: m.partner_name || '',
        product_id: m.product_id || '',
        product_name: m.product_name || '',
        category: m.category || 'health',
      })
      setSuggested(true)
      setReasoning(m.reasoning || '')
      setConfidence(m.confidence || '')
      setExistingProduct(result.existing_product || null)
    } catch (err) {
      if (seq === analyzeSeq.current) {
        setError(err.message)
      }
    } finally {
      if (seq === analyzeSeq.current) {
        setAnalyzing(false)
        setAnalyzeProgress(null)
      }
    }
  }, [])

  useEffect(() => {
    if (!suggested || !form.partner_id || !form.product_id) {
      return
    }
    let cancelled = false
    getProduct(form.partner_id, form.product_id)
      .then((product) => {
        if (!cancelled) setExistingProduct(product)
      })
      .catch(() => {
        if (!cancelled) setExistingProduct(null)
      })
    return () => {
      cancelled = true
    }
  }, [suggested, form.partner_id, form.product_id])

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0] || null
    setFile(selected)
    if (selected) {
      runAnalyze(selected)
    } else {
      analyzeSeq.current += 1
      setForm(EMPTY_FORM)
      setSuggested(false)
      setAnalyzing(false)
      setAnalyzeProgress(null)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) {
      setError('Vui lòng chọn file PDF hoặc DOCX.')
      return
    }
    if (analyzing) {
      setError('Đang phân tích file, vui lòng đợi...')
      return
    }
    setLoading(true)
    setError('')
    try {
      const file_base64 = await fileToBase64(file)
      const result = await uploadDocument({
        filename: file.name,
        file_base64,
        ...form,
      })
      setLocation(`/review/${result.session_id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const formReady = suggested && !analyzing

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-semibold text-slate-900 mb-2">Upload tài liệu</h2>
      <p className="text-slate-600 mb-6 text-sm">
        Chọn PDF hoặc DOCX — MiniMax sẽ đọc file và gợi ý Partner / Product / Category.
        Bạn chỉnh sửa nếu cần, rồi generate FAQ chi tiết để review.
      </p>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">File (PDF / DOCX)</label>
          <input
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileChange}
            className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-brand-light file:text-brand file:font-medium"
          />
          {analyzing && (
            <ProgressBar progress={analyzeProgress} className="mt-3" />
          )}
        </div>

        {suggested && reasoning && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-600">
            <span className="font-medium text-slate-800">
              Gợi ý {confidence ? `(${confidence})` : ''}:
            </span>{' '}
            {reasoning}
          </div>
        )}

        {existingProduct && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
            Product đã tồn tại trong knowledge ({existingProduct.faqs?.length || 0} FAQ).
            Submit sẽ merge/cập nhật knowledge hiện có.
          </div>
        )}

        <fieldset
          disabled={!file || analyzing}
          className={`space-y-4 ${!file || analyzing ? 'opacity-60' : ''}`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Partner ID
                {suggested && <SuggestBadge />}
              </label>
              <input
                required
                placeholder="msig"
                value={form.partner_id}
                onChange={(e) => setForm({ ...form, partner_id: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Partner name
                {suggested && <SuggestBadge />}
              </label>
              <input
                required
                placeholder="MSIG Việt Nam"
                value={form.partner_name}
                onChange={(e) => setForm({ ...form, partner_name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Product ID
                {suggested && <SuggestBadge />}
              </label>
              <input
                required
                placeholder="health_247"
                value={form.product_id}
                onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Product name
                {suggested && <SuggestBadge />}
              </label>
              <input
                required
                placeholder="Bảo hiểm Sức khỏe 24/7"
                value={form.product_name}
                onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Category
              {suggested && <SuggestBadge />}
            </label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
        </fieldset>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || analyzing || !file || !formReady}
          className="w-full bg-brand hover:bg-brand-hover text-white font-medium py-2.5 rounded-lg disabled:opacity-50 transition-colors"
        >
          {loading ? 'Đang upload...' : analyzing ? 'Đang phân tích...' : 'Generate FAQ'}
        </button>
      </form>
    </div>
  )
}
