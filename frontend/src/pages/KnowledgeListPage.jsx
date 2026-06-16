import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { listProducts } from '../utils/api'

export default function KnowledgeListPage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listProducts()
      .then((data) => setProducts(data.products || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-slate-500">Đang tải...</p>

  return (
    <div>
      <h2 className="text-2xl font-semibold text-slate-900 mb-2">Knowledge Base</h2>
      <p className="text-sm text-slate-600 mb-6">
        Xem, chỉnh sửa, và cập nhật knowledge đã submit. Upload file mới qua{' '}
        <Link href="/" className="text-brand underline">Upload</Link>
        {' '}hoặc{' '}
        <strong>Update</strong> từ trang product.
      </p>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {products.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
          Chưa có knowledge. Upload tài liệu để bắt đầu.
        </div>
      ) : (
        <div className="grid gap-3">
          {products.map((p) => (
            <Link
              key={`${p.partner_id}-${p.product_id}`}
              href={`/knowledge/${p.partner_id}/${p.product_id}`}
              className="block bg-white rounded-xl border border-slate-200 p-4 hover:border-brand/40 hover:shadow-sm transition-all"
            >
              <div className="flex justify-between items-start gap-4">
                <div>
                  <h3 className="font-medium text-slate-900">{p.product_name}</h3>
                  <p className="text-sm text-slate-500">{p.partner_name} · {p.category}</p>
                </div>
                <span className="text-sm font-mono text-slate-400">{p.faq_count} FAQ</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
