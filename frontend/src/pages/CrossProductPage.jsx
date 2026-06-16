import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import FaqEditor from '../components/FaqEditor'
import {
  getCrossProduct,
  listCrossProductHistory,
  restoreCrossProductHistory,
  updateCrossProductFaqs,
} from '../utils/api'

export default function CrossProductPage({ fileId }) {
  const [item, setItem] = useState(null)
  const [faqs, setFaqs] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [data, hist] = await Promise.all([
        getCrossProduct(fileId),
        listCrossProductHistory(fileId),
      ])
      setItem(data)
      setFaqs(data.faqs || [])
      setHistory(hist.history || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [fileId])

  const handleSave = async () => {
    if (!confirm('Lưu thay đổi vào cross-product knowledge? (Version cũ sẽ được archive)')) return
    setSaving(true)
    try {
      await updateCrossProductFaqs(fileId, faqs)
      await load()
      alert('Đã lưu.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleRestore = async (filename) => {
    if (!confirm(`Restore từ ${filename}?`)) return
    try {
      await restoreCrossProductHistory(fileId, filename)
      await load()
      alert('Đã restore.')
    } catch (err) {
      setError(err.message)
    }
  }

  const updateFaq = (index, faq) => {
    setFaqs((prev) => prev.map((f, i) => (i === index ? faq : f)))
  }
  const deleteFaq = (index) => setFaqs((prev) => prev.filter((_, i) => i !== index))
  const duplicateFaq = (index) => {
    setFaqs((prev) => {
      const copy = { ...prev[index], id: undefined }
      return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)]
    })
  }

  if (loading) return <p className="text-slate-500">Đang tải...</p>
  if (!item) return <p className="text-red-600">{error || 'Not found'}</p>

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <Link href="/knowledge" className="text-sm text-brand hover:underline">← Knowledge</Link>
          <h2 className="text-2xl font-semibold text-slate-900 mt-1">{item.name}</h2>
          <p className="text-sm text-slate-500">
            Cross-product · {item.file} · {item.last_updated}
          </p>
          <p className="text-xs text-slate-400 mt-1">{item.description}</p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-2 text-sm bg-brand text-white rounded-lg hover:bg-brand-hover disabled:opacity-50"
        >
          {saving ? 'Đang lưu...' : 'Lưu chỉnh sửa'}
        </button>
      </div>

      <div className="mb-6 p-4 rounded-xl bg-indigo-50 border border-indigo-100 text-sm text-indigo-900">
        Knowledge cross-product dùng chung cho so sánh / liệt kê nhiều gói bảo hiểm.
        Không thể xóa — chỉ chỉnh sửa và lưu.
      </div>

      {history.length > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
          <h3 className="text-sm font-medium text-slate-700 mb-2">Lịch sử version</h3>
          <div className="flex flex-wrap gap-2">
            {history.map((h) => (
              <button
                key={h.filename}
                type="button"
                onClick={() => handleRestore(h.filename)}
                className="text-xs px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-brand"
              >
                {h.filename} ({h.faq_count} FAQ)
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
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

      {error && <p className="mt-4 text-red-600 text-sm">{error}</p>}
    </div>
  )
}
