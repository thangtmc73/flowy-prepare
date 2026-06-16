import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { deleteProduct, listProducts } from '../utils/api'

export default function KnowledgeListPage() {
  const [products, setProducts] = useState([])
  const [crossProducts, setCrossProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [deletingKey, setDeletingKey] = useState(null)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    listProducts()
      .then((data) => {
        setProducts(data.products || [])
        setCrossProducts(data.cross_products || [])
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (product, e) => {
    e.preventDefault()
    e.stopPropagation()
    if (
      !confirm(
        `Xóa knowledge "${product.product_name}"?\n\nHành động này không thể hoàn tác. Bản cuối sẽ được archive trước khi xóa.`
      )
    ) {
      return
    }
    const key = `${product.partner_id}-${product.product_id}`
    setDeletingKey(key)
    setError('')
    try {
      await deleteProduct(product.partner_id, product.product_id)
      setProducts((prev) => prev.filter((p) => `${p.partner_id}-${p.product_id}` !== key))
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingKey(null)
    }
  }

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

      <section className="mb-8">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
          Cross-product
        </h3>
        <p className="text-xs text-slate-500 mb-3">
          So sánh, liệt kê gói, chi phí tổng hợp — đồng bộ cấu trúc với flowy-agent (
          <code className="text-slate-600">knowledge/cross_product/</code>
          ). Không thể xóa.
        </p>
        <div className="grid gap-3">
          {crossProducts.map((cp) => (
            <Link
              key={cp.file_id}
              href={`/knowledge/cross-product/${cp.file_id}`}
              className="block bg-white rounded-xl border border-indigo-100 p-4 hover:border-brand/40 hover:shadow-sm transition-all"
            >
              <div className="flex justify-between items-start gap-4">
                <div>
                  <h3 className="font-medium text-slate-900">{cp.name}</h3>
                  <p className="text-sm text-slate-500">{cp.description}</p>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">{cp.file}</p>
                </div>
                <span className="text-sm font-mono text-slate-400 shrink-0">{cp.faq_count} FAQ</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
          Partner / Product
        </h3>
        {products.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
            Chưa có knowledge partner. Upload tài liệu để bắt đầu.
          </div>
        ) : (
          <div className="grid gap-3">
            {products.map((p) => {
              const key = `${p.partner_id}-${p.product_id}`
              return (
                <Link
                  key={key}
                  href={`/knowledge/${p.partner_id}/${p.product_id}`}
                  className="block bg-white rounded-xl border border-slate-200 p-4 hover:border-brand/40 hover:shadow-sm transition-all"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <h3 className="font-medium text-slate-900">{p.product_name}</h3>
                      <p className="text-sm text-slate-500">{p.partner_name} · {p.category}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono text-slate-400">{p.faq_count} FAQ</span>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(p, e)}
                        disabled={deletingKey === key}
                        className="text-xs text-red-600 hover:underline disabled:opacity-50"
                      >
                        {deletingKey === key ? 'Đang xóa...' : 'Xóa'}
                      </button>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
