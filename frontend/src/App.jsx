import { Link, useLocation } from 'wouter'
import UploadPage from './pages/UploadPage'
import ReviewPage from './pages/ReviewPage'

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
            <p className="text-xs text-slate-500">PDF/DOCX → FAQ JSON Generator</p>
          </div>
          <nav className="flex flex-wrap gap-1">
            <NavLink href="/">Upload</NavLink>
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
  }

  return <Layout>{page}</Layout>
}
