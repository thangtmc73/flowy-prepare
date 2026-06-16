import { useState } from 'react'
import { useLocation } from 'wouter'
import { fileToBase64, uploadDocument } from '../utils/api'

const CATEGORIES = [
  { id: 'health', label: 'Bảo hiểm sức khỏe' },
  { id: 'travel', label: 'Bảo hiểm du lịch' },
  { id: 'financial', label: 'Bảo hiểm tài chính' },
  { id: 'cyber', label: 'An ninh mạng' },
  { id: 'car', label: 'Bảo hiểm xe' },
]

export default function UploadPage() {
  const [, setLocation] = useLocation()
  const [file, setFile] = useState(null)
  const [form, setForm] = useState({
    partner_id: '',
    partner_name: '',
    product_id: '',
    product_name: '',
    category: 'health',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) {
      setError('Vui lòng chọn file PDF hoặc DOCX.')
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

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-semibold text-slate-900 mb-2">Upload tài liệu</h2>
      <p className="text-slate-600 mb-6 text-sm">
        Upload PDF hoặc DOCX. MiniMax sẽ rã nhỏ nội dung thành các FAQ chi tiết theo knowledge rules.
        Bạn review và chỉnh sửa trước khi submit vào knowledge base.
      </p>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">File (PDF / DOCX)</label>
          <input
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-brand-light file:text-brand file:font-medium"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Partner ID</label>
            <input
              required
              placeholder="msig"
              value={form.partner_id}
              onChange={(e) => setForm({ ...form, partner_id: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Partner name</label>
            <input
              required
              placeholder="MSIG Việt Nam"
              value={form.partner_name}
              onChange={(e) => setForm({ ...form, partner_name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Product ID</label>
            <input
              required
              placeholder="health_247"
              value={form.product_id}
              onChange={(e) => setForm({ ...form, product_id: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Product name</label>
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
          <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
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

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand hover:bg-brand-hover text-white font-medium py-2.5 rounded-lg disabled:opacity-50 transition-colors"
        >
          {loading ? 'Đang upload...' : 'Upload & Generate FAQ'}
        </button>
      </form>
    </div>
  )
}
