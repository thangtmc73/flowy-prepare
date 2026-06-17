import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'wouter'
import ConfirmModal from '../components/ConfirmModal'
import FaqEditor from '../components/FaqEditor'
import ProgressBar from '../components/ProgressBar'
import SharedKnowledgePanel from '../components/SharedKnowledgePanel'
import Stepper from '../components/Stepper'
import { useToast } from '../components/Toast'
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

function faqsSnapshot(faqs) {
  return JSON.stringify(faqs)
}

export default function ReviewPage({ sessionId }) {
  const { showToast } = useToast()
  const [session, setSession] = useState(null)
  const [faqs, setFaqs] = useState([])
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [downloadingProduct, setDownloadingProduct] = useState(false)
  const [downloadingZip, setDownloadingZip] = useState(false)
  const [error, setError] = useState('')
  const [pollKey, setPollKey] = useState(0)
  const [expandedMap, setExpandedMap] = useState({})
  const [confirm, setConfirm] = useState(null)
  const sharedPanelRef = useRef(null)

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

  useEffect(() => {
    if (
      !loading &&
      session &&
      savedSnapshot === '' &&
      session.status !== 'processing' &&
      session.status !== 'generating' &&
      session.status !== 'uploaded'
    ) {
      setSavedSnapshot(faqsSnapshot(faqs))
    }
  }, [loading, session, faqs, savedSnapshot])

  const isGeneratingFaqs =
    session?.status === 'processing' ||
    session?.status === 'generating' ||
    session?.status === 'uploaded'
  const isGeneratingShared = session?.status === 'generating_shared'
  const isDone = session?.status === 'done'
  const isJsonImport = session?.source_type === 'json_import'
  const productFilename = `${session?.partner_id}_${session?.product_id}.json`
  const indexCheck = session?.index_check
  const stepperStep = isDone ? 4 : isGeneratingShared ? 3 : 2
  const isDirty = savedSnapshot !== '' && faqsSnapshot(faqs) !== savedSnapshot

  useEffect(() => {
    if (isDone || !isDirty) return undefined
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty, isDone])

  useEffect(() => {
    if (isDone && session?.shared_knowledge && sharedPanelRef.current) {
      sharedPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [isDone, session?.shared_knowledge])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await updateSessionFaqs(sessionId, faqs)
      setSavedSnapshot(faqsSnapshot(faqs))
      showToast('Đã lưu draft')
    } catch (err) {
      setError(err.message)
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDownloadProduct = async () => {
    setDownloadingProduct(true)
    setError('')
    try {
      if (isDirty) {
        await updateSessionFaqs(sessionId, faqs)
        setSavedSnapshot(faqsSnapshot(faqs))
      }
      await downloadProductJson(sessionId, session.partner_id, session.product_id)
      showToast(`Đã tải ${productFilename}`)
    } catch (err) {
      setError(err.message)
      showToast(err.message, 'error')
    } finally {
      setDownloadingProduct(false)
    }
  }

  const runFinish = async () => {
    setFinishing(true)
    setError('')
    try {
      await updateSessionFaqs(sessionId, faqs)
      setSavedSnapshot(faqsSnapshot(faqs))
      await finishSession(sessionId)
      setSession((s) => ({ ...s, status: 'generating_shared' }))
      setPollKey((k) => k + 1)
      showToast('Đang generate file catalog dùng chung...', 'info')
      setConfirm(null)
    } catch (err) {
      setError(err.message)
      showToast(err.message, 'error')
    } finally {
      setFinishing(false)
    }
  }

  const handleDone = () => {
    setConfirm({
      title: 'Generate file catalog dùng chung?',
      message: `Hệ thống sẽ tải catalog mới nhất từ GitHub và cập nhật 3 file (_index.json, comparisons.json, general_faqs.json) dựa trên ${faqs.length} FAQ. Quá trình có thể mất vài phút.`,
      confirmLabel: 'Generate',
      onConfirm: runFinish,
    })
  }

  const runRegenerate = async () => {
    setLoading(true)
    setError('')
    try {
      await regenerateSession(sessionId)
      setFaqs([])
      setSavedSnapshot('')
      setSession((s) => ({ ...s, status: 'generating', faqs: [], shared_knowledge: null }))
      setPollKey((k) => k + 1)
      showToast('Đang generate lại FAQ...', 'info')
      setConfirm(null)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const handleRegenerate = () => {
    setConfirm({
      title: 'Generate lại FAQ?',
      message: 'Thao tác này sẽ ghi đè toàn bộ FAQ hiện tại bằng kết quả generate mới từ tài liệu gốc.',
      confirmLabel: 'Generate lại',
      variant: 'danger',
      onConfirm: runRegenerate,
    })
  }

  const handleDownloadZip = async () => {
    setDownloadingZip(true)
    setError('')
    try {
      await downloadSharedKnowledgeZip(sessionId)
      showToast('Đã tải file zip catalog dùng chung')
    } catch (err) {
      setError(err.message)
      showToast(err.message, 'error')
    } finally {
      setDownloadingZip(false)
    }
  }

  const handleBack = (e) => {
    if (isDirty && !isDone) {
      const ok = window.confirm('Bạn có thay đổi chưa lưu. Rời trang anyway?')
      if (!ok) e.preventDefault()
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
  const expandAllFaqs = () => setExpandedMap(Object.fromEntries(faqs.map((_, i) => [i, true])))
  const collapseAllFaqs = () => setExpandedMap({})

  if (loading && !session) {
    return <p className="text-slate-500">Đang tải...</p>
  }

  return (
    <div>
      <Link
        href="/"
        onClick={handleBack}
        className="inline-flex items-center gap-1 text-sm text-brand hover:underline mb-4"
      >
        ← Tạo session mới
      </Link>

      <Stepper current={stepperStep} />

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Review FAQ</h2>
          <p className="text-sm text-slate-600 mt-1">
            {session?.partner_name} — {session?.product_name} · {session?.filename}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            File xuất: <span className="font-mono">{productFilename}</span>
            {isJsonImport && (
              <span className="ml-2 text-brand">
                · Import JSON ({session.import_mode === 'update' ? 'cập nhật' : 'thêm mới'})
              </span>
            )}
            {isDirty && !isDone && (
              <span className="ml-2 text-amber-600">· Chưa lưu thay đổi</span>
            )}
          </p>
        </div>
        {!isDone && (
          <div className="flex flex-wrap gap-2">
            {!isJsonImport && (
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={isGeneratingFaqs || isGeneratingShared}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                Generate lại
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || isGeneratingFaqs || isGeneratingShared || !isDirty}
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
                {downloadingProduct ? 'Đang tải...' : 'Tải JSON sản phẩm'}
              </button>
            )}
          </div>
        )}
      </div>

      {(isGeneratingFaqs || isGeneratingShared) && (
        <ProgressBar progress={session?.progress} className="mb-6" />
      )}

      {indexCheck && !isDone && (
        <div
          className={`mb-6 p-4 rounded-xl text-sm border ${
            indexCheck.exists_in_index
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
        >
          {indexCheck.exists_in_index ? (
            <>
              <strong>Trùng catalog</strong> —{' '}
              {indexCheck.index_entry?.product_name || session?.product_name}
              {' '}(<span className="font-mono">{indexCheck.index_entry?.file}</span>).
              Sẽ cập nhật FAQ sản phẩm hiện có.
            </>
          ) : (
            <>
              <strong>Sản phẩm mới</strong> — chưa có trong catalog GitHub.
              Sẽ thêm partner/sản phẩm mới khi generate file catalog dùng chung.
            </>
          )}
        </div>
      )}

      {session?.status === 'error' && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          Lỗi: {session.error}
        </div>
      )}

      {session?.shared_knowledge_error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          Lỗi generate catalog: {session.shared_knowledge_error}
        </div>
      )}

      {!isGeneratingFaqs && !isJsonImport && session?.status === 'review' && faqs.length === 0 && (
        <div className="mb-6 p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700">
          Chưa có FAQ nào. Bấm{' '}
          <button type="button" onClick={handleRegenerate} className="underline font-medium text-brand">
            Generate lại
          </button>
          {' '}để thử lại.
        </div>
      )}

      {isDone && (
        <div ref={sharedPanelRef} className="mb-8 scroll-mt-4">
          <div className="mb-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
            Hoàn tất! Tải <span className="font-mono">{productFilename}</span> và 3 file catalog dùng chung bên dưới.
          </div>
          {session?.shared_knowledge && (
            <>
              <SharedKnowledgePanel
                sharedKnowledge={session.shared_knowledge}
                onDownloadZip={handleDownloadZip}
                downloadingZip={downloadingZip}
              />
              <div className="mt-4">
                <button
                  type="button"
                  onClick={handleDownloadProduct}
                  disabled={downloadingProduct}
                  className="px-4 py-2 text-sm bg-brand text-white rounded-lg hover:bg-brand-hover disabled:opacity-50"
                >
                  {downloadingProduct ? 'Đang tải...' : `Tải ${productFilename}`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {!isDone && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <p className="text-sm text-slate-600">{faqs.length} FAQ</p>
            <div className="flex flex-wrap items-center gap-3">
              {faqs.length > 0 && (
                <>
                  <button type="button" onClick={expandAllFaqs} className="text-xs text-slate-500 hover:text-slate-700">
                    Mở tất cả
                  </button>
                  <button type="button" onClick={collapseAllFaqs} className="text-xs text-slate-500 hover:text-slate-700">
                    Thu gọn tất cả
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={addFaq}
                disabled={isGeneratingFaqs || isGeneratingShared}
                className="text-sm text-brand hover:underline disabled:opacity-50"
              >
                + Thêm FAQ
              </button>
            </div>
          </div>

          <div className="space-y-4 mb-8">
            {faqs.map((faq, i) => (
              <FaqEditor
                key={faq.id || i}
                faq={faq}
                index={i}
                expanded={expandedMap[i] ?? false}
                onExpandedChange={(v) => setExpandedMap((prev) => ({ ...prev, [i]: v }))}
                onChange={updateFaq}
                onDelete={deleteFaq}
                onDuplicate={duplicateFaq}
              />
            ))}
          </div>
        </>
      )}

      {isDone && faqs.length > 0 && (
        <p className="mb-8 text-xs text-slate-400">
          {faqs.length} FAQ đã được dùng để generate catalog ở trên.
        </p>
      )}

      {faqs.length > 0 && !isDone && !isGeneratingShared && session?.status !== 'error' && (
        <div className="sticky bottom-4 bg-white border border-slate-200 rounded-xl p-4 shadow-lg">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm font-medium text-slate-800">Bước tiếp theo</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Tải catalog GitHub mới nhất và generate 3 file: _index.json, comparisons.json, general_faqs.json
              </p>
            </div>
            <button
              type="button"
              onClick={handleDone}
              disabled={finishing}
              className="bg-brand hover:bg-brand-hover text-white font-medium px-6 py-2.5 rounded-lg disabled:opacity-50 whitespace-nowrap"
            >
              {finishing ? 'Đang generate...' : 'Generate catalog dùng chung'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <ConfirmModal
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        variant={confirm?.variant}
        loading={finishing || loading}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
