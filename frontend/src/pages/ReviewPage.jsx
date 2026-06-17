import { useCallback, useEffect, useState } from 'react'
import FaqEditor from '../components/FaqEditor'
import ProgressBar from '../components/ProgressBar'
import SharedKnowledgePanel from '../components/SharedKnowledgePanel'
import {
  downloadProductJson,
  downloadSharedKnowledgeZip,
  finishSession,
  getSession,
  regenerateSession,
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
  const [session, setSession] = useState(null)
  const [faqs, setFaqs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [downloadingProduct, setDownloadingProduct] = useState(false)
  const [downloadingZip, setDownloadingZip] = useState(false)
  const [error, setError] = useState('')
  const [pollKey, setPollKey] = useState(0)

  const poll = useCallback(async () => {
    try {
      const data = await getSession(sessionId)
      setSession(data)
      const generating =
        data.status === 'processing' ||
        data.status === 'generating' ||
        data.status === 'generating_shared' ||
        data.status === 'uploaded'
      if (generating && data.status !== 'generating_shared') {
        setFaqs(data.faqs?.length ? data.faqs : [])
      } else if (data.status !== 'generating_shared') {
        setFaqs(data.faqs || [])
      }
      if (generating) {
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
  }, [poll, pollKey])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await updateSessionFaqs(sessionId, faqs)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDownloadProduct = async () => {
    setDownloadingProduct(true)
    setError('')
    try {
      await updateSessionFaqs(sessionId, faqs)
      await downloadProductJson(sessionId, session.partner_id, session.product_id)
    } catch (err) {
      setError(err.message)
    } finally {
      setDownloadingProduct(false)
    }
  }

  const handleDone = async () => {
    if (!confirm(`Done — generate shared knowledge từ ${faqs.length} FAQ?`)) return
    setFinishing(true)
    setError('')
    try {
      await updateSessionFaqs(sessionId, faqs)
      await finishSession(sessionId)
      setSession((s) => ({ ...s, status: 'generating_shared' }))
      setPollKey((k) => k + 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setFinishing(false)
    }
  }

  const handleDownloadZip = async () => {
    setDownloadingZip(true)
    setError('')
    try {
      await downloadSharedKnowledgeZip(sessionId)
    } catch (err) {
      setError(err.message)
    } finally {
      setDownloadingZip(false)
    }
  }

  const handleRegenerate = async () => {
    if (!confirm('Generate lại sẽ ghi đè các FAQ hiện tại. Tiếp tục?')) return
    setLoading(true)
    setError('')
    try {
      await regenerateSession(sessionId)
      setFaqs([])
      setSession((s) => ({ ...s, status: 'generating', faqs: [], shared_knowledge: null }))
      setPollKey((k) => k + 1)
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
      const copy = {
        ...prev[index],
        id: undefined,
        canonical_question: `${prev[index].canonical_question} (copy)`,
      }
      return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)]
    })
  }

  const addFaq = () => setFaqs((prev) => [...prev, { ...EMPTY_FAQ }])

  if (loading && !session) {
    return <p className="text-slate-500">Đang tải...</p>
  }

  const isGeneratingFaqs =
    session?.status === 'processing' ||
    session?.status === 'generating' ||
    session?.status === 'uploaded'

  const isGeneratingShared = session?.status === 'generating_shared'
  const isDone = session?.status === 'done'
  const productFilename = `${session?.partner_id}_${session?.product_id}.json`

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Review FAQ</h2>
          <p className="text-sm text-slate-600 mt-1">
            {session?.partner_name} — {session?.product_name} · {session?.filename}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Export: <span className="font-mono">{productFilename}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isGeneratingFaqs || isGeneratingShared}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            Generate lại
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || isGeneratingFaqs || isGeneratingShared}
            className="px-3 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? 'Đang lưu...' : 'Lưu draft'}
          </button>
          {faqs.length > 0 && (
            <button
              type="button"
              onClick={handleDownloadProduct}
              disabled={downloadingProduct || isGeneratingFaqs || isGeneratingShared}
              className="px-3 py-2 text-sm border border-brand text-brand rounded-lg hover:bg-brand-light disabled:opacity-50"
            >
              {downloadingProduct ? 'Đang tải...' : `Download ${productFilename}`}
            </button>
          )}
        </div>
      </div>

      {(isGeneratingFaqs || isGeneratingShared) && (
        <ProgressBar progress={session?.progress} className="mb-6" />
      )}

      {session?.status === 'error' && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          Lỗi: {session.error}
        </div>
      )}

      {session?.shared_knowledge_error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          Lỗi generate shared knowledge: {session.shared_knowledge_error}
        </div>
      )}

      {!isGeneratingFaqs && session?.status === 'review' && faqs.length === 0 && (
        <div className="mb-6 p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700">
          Chưa có FAQ nào được generate. Bấm{' '}
          <button type="button" onClick={handleRegenerate} className="underline font-medium text-brand">
            Generate lại
          </button>
          {' '}để thử lại.
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-600">{faqs.length} FAQ</p>
        {!isDone && (
          <button
            type="button"
            onClick={addFaq}
            disabled={isGeneratingFaqs || isGeneratingShared}
            className="text-sm text-brand hover:underline disabled:opacity-50"
          >
            + Thêm FAQ thủ công
          </button>
        )}
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

      {faqs.length > 0 && !isDone && !isGeneratingShared && session?.status !== 'error' && (
        <div className="sticky bottom-4 bg-white border border-slate-200 rounded-xl p-4 shadow-lg">
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-sm text-slate-600 flex-1">
              Bấm <strong>Done</strong> để tải knowledge mới nhất từ GitHub và generate 3 file shared knowledge.
            </p>
            <button
              type="button"
              onClick={handleDone}
              disabled={finishing}
              className="bg-brand hover:bg-brand-hover text-white font-medium px-6 py-2.5 rounded-lg disabled:opacity-50"
            >
              {finishing ? 'Đang xử lý...' : 'Done'}
            </button>
          </div>
        </div>
      )}

      {isDone && session?.shared_knowledge && (
        <>
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
            Hoàn tất! Product JSON: <span className="font-mono">{productFilename}</span>.
            Shared knowledge đã được generate bên dưới.
          </div>
          <SharedKnowledgePanel
            sharedKnowledge={session.shared_knowledge}
            onDownloadZip={handleDownloadZip}
            downloadingZip={downloadingZip}
          />
          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={handleDownloadProduct}
              disabled={downloadingProduct}
              className="px-4 py-2 text-sm border border-brand text-brand rounded-lg hover:bg-brand-light disabled:opacity-50"
            >
              {downloadingProduct ? 'Đang tải...' : `Download ${productFilename}`}
            </button>
          </div>
        </>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}
