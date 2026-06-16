import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'wouter'
import FaqEditor from '../components/FaqEditor'
import DiffView from '../components/DiffView'
import ProgressBar from '../components/ProgressBar'
import {
  compareSession,
  getSession,
  regenerateSession,
  submitSession,
  updateSessionFaqs,
} from '../utils/api'

const EMPTY_FAQ = {
  canonical_question: '',
  user_questions: [],
  answer: '',
  category: 'Khác',
  tags: [],
  priority: 5,
}

export default function ReviewPage({ sessionId }) {
  const [, setLocation] = useLocation()
  const [session, setSession] = useState(null)
  const [faqs, setFaqs] = useState([])
  const [diff, setDiff] = useState(null)
  const [submitMode, setSubmitMode] = useState('merge')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showDiff, setShowDiff] = useState(false)

  const poll = useCallback(async () => {
    try {
      const data = await getSession(sessionId)
      setSession(data)
      if (data.faqs?.length) setFaqs(data.faqs)
      if (data.status === 'processing' || data.status === 'generating' || data.status === 'uploaded') {
        return false
      }
      return true
    } catch (err) {
      setError(err.message)
      return true
    }
  }, [sessionId])

  useEffect(() => {
    let cancelled = false
    let timer

    const run = async () => {
      const done = await poll()
      if (cancelled) return
      setLoading(false)
      if (!done) {
        timer = setTimeout(run, 1200)
      }
    }
    run()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [poll])

  const loadDiff = async () => {
    try {
      const data = await compareSession(sessionId)
      setDiff(data)
      setShowDiff(true)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await updateSessionFaqs(sessionId, faqs)
      await loadDiff()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    if (!confirm(`Submit ${faqs.length} FAQ vào knowledge với mode "${submitMode}"?`)) return
    setSubmitting(true)
    setError('')
    try {
      await updateSessionFaqs(sessionId, faqs)
      const result = await submitSession(sessionId, submitMode)
      alert(`Đã submit! ${result.faq_count} FAQs (v${result.version})`)
      setLocation(`/knowledge/${session.partner_id}/${session.product_id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleRegenerate = async () => {
    if (!confirm('Generate lại sẽ ghi đè các FAQ hiện tại. Tiếp tục?')) return
    setLoading(true)
    try {
      await regenerateSession(sessionId)
      setFaqs([])
      setSession((s) => ({ ...s, status: 'generating' }))
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const updateFaq = (index, faq) => {
    setFaqs((prev) => prev.map((f, i) => (i === index ? faq : f)))
  }

  const deleteFaq = (index) => {
    setFaqs((prev) => prev.filter((_, i) => i !== index))
  }

  const duplicateFaq = (index) => {
    setFaqs((prev) => {
      const copy = { ...prev[index], id: undefined, canonical_question: `${prev[index].canonical_question} (copy)` }
      return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)]
    })
  }

  const addFaq = () => setFaqs((prev) => [...prev, { ...EMPTY_FAQ }])

  if (loading && !session) {
    return <p className="text-slate-500">Đang tải...</p>
  }

  const isGenerating =
    session?.status === 'processing' ||
    session?.status === 'generating' ||
    session?.status === 'uploaded'

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Review FAQ</h2>
          <p className="text-sm text-slate-600 mt-1">
            {session?.partner_name} — {session?.product_name} · {session?.filename}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">Session: {sessionId}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isGenerating}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            Generate lại
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || isGenerating}
            className="px-3 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? 'Đang lưu...' : 'Lưu draft'}
          </button>
        </div>
      </div>

      {isGenerating && (
        <ProgressBar progress={session?.progress} className="mb-6" />
      )}

      {session?.status === 'error' && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          Lỗi generate: {session.error}
        </div>
      )}

      {session?.existing_product && (
        <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
          Product đã tồn tại ({session.existing_product.faqs?.length || 0} FAQ).
          {' '}
          <button type="button" onClick={loadDiff} className="underline font-medium">
            Xem diff với knowledge hiện tại
          </button>
        </div>
      )}

      {showDiff && diff && (
        <div className="mb-6 p-4 rounded-xl bg-white border border-slate-200">
          <h3 className="font-medium text-slate-800 mb-3">So sánh với knowledge hiện tại</h3>
          <DiffView diffs={diff.diffs} summary={diff.summary} />
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-600">{faqs.length} FAQ</p>
        <button
          type="button"
          onClick={addFaq}
          className="text-sm text-brand hover:underline"
        >
          + Thêm FAQ thủ công
        </button>
      </div>

      <div className="space-y-4 mb-8">
        {faqs.map((faq, i) => (
          <FaqEditor
            key={faq.id || i}
            faq={faq}
            index={i}
            onChange={updateFaq}
            onDelete={deleteFaq}
            onDuplicate={duplicateFaq}
          />
        ))}
      </div>

      {faqs.length > 0 && session?.status !== 'submitted' && (
        <div className="sticky bottom-4 bg-white border border-slate-200 rounded-xl p-4 shadow-lg">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Submit mode</label>
              <select
                value={submitMode}
                onChange={(e) => setSubmitMode(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="merge">Merge — cập nhật matched, thêm mới, giữ cũ</option>
                <option value="append">Append — chỉ thêm FAQ mới</option>
                <option value="replace">Replace — thay toàn bộ</option>
              </select>
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="ml-auto bg-brand hover:bg-brand-hover text-white font-medium px-6 py-2.5 rounded-lg disabled:opacity-50"
            >
              {submitting ? 'Đang submit...' : 'Submit vào Knowledge'}
            </button>
          </div>
        </div>
      )}

      {session?.status === 'submitted' && (
        <div className="p-4 rounded-xl bg-emerald-50 text-emerald-800 text-sm">
          Đã submit.{' '}
          <Link href={`/knowledge/${session.partner_id}/${session.product_id}`} className="underline">
            Xem knowledge
          </Link>
        </div>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}
