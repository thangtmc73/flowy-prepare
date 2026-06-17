import { useCallback, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import FileDropZone from './FileDropZone'
import ProgressBar from './ProgressBar'
import { useToast } from './Toast'
import { analyzeDocument, fileToBase64, pollJob, uploadDocument } from '../utils/api'
import { CATEGORIES } from '../constants/categories'

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

function MetadataSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-4 bg-slate-200 rounded w-2/3" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 bg-slate-100 rounded-lg" />
        ))}
      </div>
      <div className="h-10 bg-slate-100 rounded-lg" />
    </div>
  )
}

export default function DocUploadForm() {
  const [, setLocation] = useLocation()
  const { showToast } = useToast()
  const [file, setFile] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [suggested, setSuggested] = useState(false)
  const [reasoning, setReasoning] = useState('')
  const [confidence, setConfidence] = useState('')
  const [isExistingProduct, setIsExistingProduct] = useState(false)
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
    setIsExistingProduct(false)
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
      setIsExistingProduct(Boolean(result.is_existing_product))
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

  const handleFileSelect = (selected, invalidMessage) => {
    if (invalidMessage) {
      setError(invalidMessage)
      return
    }
    setError('')
    setFile(selected)
    if (selected) {
      runAnalyze(selected)
    }
  }

  const handleClearFile = () => {
    analyzeSeq.current += 1
    setFile(null)
    setForm(EMPTY_FORM)
    setSuggested(false)
    setAnalyzing(false)
    setAnalyzeProgress(null)
    setError('')
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
      showToast('Đang generate FAQ...', 'info')
      setLocation(`/review/${result.session_id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const formReady = suggested && !analyzing

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <FileDropZone
        label="File (PDF / DOCX)"
        hint="PDF, DOCX"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        file={file}
        disabled={analyzing || loading}
        onFileSelect={handleFileSelect}
        onClear={handleClearFile}
      />
      {analyzing && (
        <ProgressBar progress={analyzeProgress} className="mt-3" />
      )}

      {file && analyzing && !suggested && (
        <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
          <p className="text-sm text-slate-600 mb-3">Đang đọc tài liệu và gợi ý metadata...</p>
          <MetadataSkeleton />
        </div>
      )}

      {suggested && reasoning && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-600">
          <span className="font-medium text-slate-800">
            Gợi ý {confidence ? `(${confidence})` : ''}:
          </span>{' '}
          {reasoning}
        </div>
      )}

      {isExistingProduct && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
          Sản phẩm này đã có trong catalog GitHub. Bạn có thể generate FAQ mới
          và cập nhật file catalog dùng chung ở bước cuối.
        </div>
      )}

      {formReady && (
        <fieldset className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Mã đối tác
                <SuggestBadge />
              </label>
              <input
                required
                placeholder="msig"
                value={form.partner_id}
                onChange={(e) => setForm({ ...form, partner_id: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tên đối tác
                <SuggestBadge />
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
                Mã sản phẩm
                <SuggestBadge />
              </label>
              <input
                required
                placeholder="health_247"
                value={form.product_id}
                onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tên sản phẩm
                <SuggestBadge />
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
              Loại bảo hiểm
              <SuggestBadge />
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
      )}

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
  )
}
