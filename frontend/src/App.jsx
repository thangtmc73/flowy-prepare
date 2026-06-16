import { Link, useLocation } from 'wouter'
import UploadPage from './pages/UploadPage'
import ReviewPage from './pages/ReviewPage'
import KnowledgeListPage from './pages/KnowledgeListPage'
import ProductPage from './pages/ProductPage'
import CrossProductPage from './pages/CrossProductPage'
import UpdatePage from './pages/UpdatePage'

function NavLink({ href, children }) {
  const [location] = useLocation()
  const active = location === href || (href !== '/' && location.startsWith(href))
  return (
    <Link
      href={href}
      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-brand text-white'
          : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {children}
    </Link>
  )
}

function Layout({ children }) {
  return (
    <div className="min-h-full flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Flowy Pre</h1>
            <p className="text-xs text-slate-500">Knowledge Builder — PDF/DOCX → FAQ</p>
          </div>
          <nav className="flex flex-wrap gap-1">
            <NavLink href="/">Upload</NavLink>
            <NavLink href="/knowledge">Knowledge</NavLink>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  )
}

export default function App() {
  const [location] = useLocation()

  let page = <UploadPage />
  if (location.startsWith('/review/')) {
    const sessionId = location.replace('/review/', '')
    page = <ReviewPage sessionId={sessionId} />
  } else if (location.startsWith('/update/')) {
    const parts = location.replace('/update/', '').split('/')
    page = <UpdatePage partnerId={parts[0]} productId={parts[1]} />
  } else if (location.startsWith('/knowledge/')) {
    const parts = location.replace('/knowledge/', '').split('/')
    if (parts[0] === 'cross-product' && parts[1]) {
      page = <CrossProductPage fileId={parts[1]} />
    } else if (parts.length >= 2) {
      page = <ProductPage partnerId={parts[0]} productId={parts[1]} />
    } else {
      page = <KnowledgeListPage />
    }
  } else if (location === '/knowledge') {
    page = <KnowledgeListPage />
  }

  return <Layout>{page}</Layout>
}
