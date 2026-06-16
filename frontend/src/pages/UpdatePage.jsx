import { useEffect, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { fileToBase64, getProduct, uploadDocument } from '../utils/api'

export default function UpdatePage({ partnerId, productId }) {
  const [, setLocation] = useLocation()
  const [product, setProduct] = useState(null)
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getProduct(partnerId, productId)
      .then(setProduct)
      .catch((err) => setError(err.message))
  }, [partnerId, productId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file || !product) return
    setLoading(true)
    setError('')
    try {
      const file_base64 = await fileToBase64(file)
      const result = await uploadDocument({
        filename: file.name,
        file_base64,
        partner_id: partnerId,
        partner_name: product.partner_name,
        product_id: productId,
        product_name: product.product_name,
        category: 'health',
      })
      setLocation(`/review/${result.session_id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl">
      <Link href={`/knowledge/${partnerId}/${productId}`} className="text-sm text-brand hover:underline">
        ← {product?.product_name || 'Product'}
      </Link>
      <h2 className="text-2xl font-semibold text-slate-900 mt-2 mb-2">Update knowledge</h2>
      <p className="text-sm text-slate-600 mb-6">
        Upload bản PDF/DOCX mới. Hệ thống generate FAQ, so sánh diff với knowledge hiện tại,
        và cho phép merge/append/replace trước khi submit.
      </p>

      {product && (
        <p className="text-sm text-slate-500 mb-4">
          Hiện tại: {product.faqs?.length || 0} FAQ · v{product.version}
        </p>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border p-6 space-y-4">
        <input
          type="file"
          accept=".pdf,.docx"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm"
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading || !file}
          className="w-full bg-brand text-white py-2.5 rounded-lg disabled:opacity-50"
        >
          {loading ? 'Đang upload...' : 'Upload & Generate diff'}
        </button>
      </form>
    </div>
  )
}
