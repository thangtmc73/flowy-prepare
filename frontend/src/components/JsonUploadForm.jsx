import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { useToast } from './Toast'
import {
  checkJsonIndex,
  fileToBase64,
  importJsonUpload,
  previewJsonUpload,
} from '../utils/api'
import { CATEGORIES } from '../constants/categories'

function IndexCheckBadge({ check }) {
  if (!check) return null

  if (check.exists_in_index) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
        Trùng catalog — cập nhật
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
      Mới — thêm vào catalog
    </span>
  )
}

export default function JsonUploadForm() {
  const [, setLocation] = useLocation()
  const { showToast } = useToast()
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [indexCheck, setIndexCheck] = useState(null)
  const [mode, setMode] = useState('update')
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(false)
  const [checkingIndex, setCheckingIndex] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const fileBase64Ref = useRef('')
  const modeTouchedRef = useRef(false)

  const reset = () => {
    setPreview(null)
    setIndexCheck(null)
    setForm(null)
    setMode('update')
    setError('')
    modeTouchedRef.current = false
    fileBase64Ref.current = ''
  }

  const handleFileChange = async (e) => {
    const selected = e.target.files?.[0] || null
    setFile(selected)
    reset()
    if (!selected) return

    setLoading(true)
    try {
      const file_base64 = await fileToBase64(selected)
      fileBase64Ref.current = file_base64
      const result = await previewJsonUpload({
        filename: selected.name,
        file_base64,
      })
      const p = result.preview
      setPreview(p)
      setForm({ ...p.metadata })
      setIndexCheck(p.index_check)
      setMode(p.index_check.recommended_action)
    } catch (err) {
      setError(err.message)
      setFile(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!file || !form?.partner_id || !form?.product_id || !preview) return

    const timer = setTimeout(async () => {
      setCheckingIndex(true)
      try {
        const result = await checkJsonIndex({
          filename: file.name,
          partner_id: form.partner_id,
          product_id: form.product_id,
        })
        setIndexCheck(result.index_check)
        if (!modeTouchedRef.current) {
          setMode(result.index_check.recommended_action)
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setCheckingIndex(false)
      }
    }, 450)

    return () => clearTimeout(timer)
  }, [file, form?.partner_id, form?.product_id, preview])

  const handleModeChange = (nextMode) => {
    modeTouchedRef.current = true
    setMode(nextMode)
  }

  const handleImport = async (e) => {
    e.preventDefault()
    if (!file || !form || !preview) return

    setImporting(true)
    setError('')
    try {
      const result = await importJsonUpload({
        filename: file.name,
        file_base64: fileBase64Ref.current,
        mode,
        ...form,
      })
      showToast(`Import ${result.faq_count} FAQ thành công`)
      setLocation(`/review/${result.session_id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  const check = indexCheck
  const canImport = preview && form && !loading
  const showMetadataEdit = mode === 'add_new'

  return (
    <form onSubmit={handleImport} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">File JSON</label>
        <input
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-brand-light file:text-brand file:font-medium"
        />
        {loading && (
          <p className="mt-2 text-sm text-slate-500">Đang kiểm tra file và catalog GitHub...</p>
        )}
      </div>

      {preview && check && (
        <div className="rounded-lg border border-slate-200 p-4 space-y-3 bg-slate-50">
          <div className="flex flex-wrap items-center gap-2">
            <IndexCheckBadge check={check} />
            <span className="text-sm text-slate-600">{preview.faq_count} FAQ</span>
            {checkingIndex && (
              <span className="text-xs text-slate-400">Đang kiểm tra lại catalog...</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-slate-500">Đối tác:</span>{' '}
              <span className="font-medium">{form.partner_name}</span>
              <span className="text-slate-400 font-mono ml-1">({form.partner_id})</span>
            </div>
            <div>
              <span className="text-slate-500">Sản phẩm:</span>{' '}
              <span className="font-medium">{form.product_name}</span>
              <span className="text-slate-400 font-mono ml-1">({form.product_id})</span>
            </div>
          </div>

          <div className="text-xs text-slate-500 space-y-1">
            <p>
              Tên file mong đợi:{' '}
              <span className="font-mono text-slate-700">{check.expected_filename}</span>
              {check.filename_matches ? (
                <span className="text-emerald-600 ml-1">✓ khớp</span>
              ) : (
                <span className="text-amber-600 ml-1">✗ không khớp</span>
              )}
            </p>
            {check.exists_in_index && check.index_entry && (
              <p>
                Trong catalog:{' '}
                <span className="font-mono">{check.index_entry.file}</span>
                {' — '}
                {check.index_entry.product_name}
              </p>
            )}
          </div>

          {check.warnings?.length > 0 && (
            <ul className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
              {check.warnings.map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          )}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">Xử lý trùng catalog</legend>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="update"
                checked={mode === 'update'}
                onChange={() => handleModeChange('update')}
                disabled={!check.exists_in_index}
                className="mt-1"
              />
              <span className={!check.exists_in_index ? 'text-slate-400' : ''}>
                <strong>Cập nhật</strong> — thay FAQ sản phẩm đã có trong catalog
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="add_new"
                checked={mode === 'add_new'}
                onChange={() => handleModeChange('add_new')}
                className="mt-1"
              />
              <span>
                <strong>Thêm mới</strong> — sản phẩm chưa có trong catalog
                {check.exists_in_index && ' (đổi mã đối tác / sản phẩm bên dưới)'}
              </span>
            </label>
          </fieldset>
        </div>
      )}

      {form && showMetadataEdit && (
        <fieldset className="space-y-4 border-t border-slate-200 pt-4">
          <p className="text-sm font-medium text-slate-700">Thông tin sản phẩm</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Mã đối tác</label>
              <input
                required
                value={form.partner_id}
                onChange={(e) => setForm({ ...form, partner_id: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Tên đối tác</label>
              <input
                required
                value={form.partner_name}
                onChange={(e) => setForm({ ...form, partner_name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Mã sản phẩm</label>
              <input
                required
                value={form.product_id}
                onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Tên sản phẩm</label>
              <input
                required
                value={form.product_name}
                onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Loại bảo hiểm</label>
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
        disabled={!canImport || importing || checkingIndex}
        className="w-full bg-brand hover:bg-brand-hover text-white font-medium py-2.5 rounded-lg disabled:opacity-50 transition-colors"
      >
        {importing ? 'Đang import...' : 'Import & Review FAQ'}
      </button>
    </form>
  )
}
