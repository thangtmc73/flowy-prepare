import { Link, useLocation } from 'wouter'
import { ToastProvider } from './components/Toast'
import ReviewPage from './pages/ReviewPage'
import UploadHubPage from './pages/UploadHubPage'

function Layout({ children }) {
  return (
    <div className="min-h-full flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <Link href="/" className="inline-block hover:opacity-80 transition-opacity">
            <h1 className="text-lg font-semibold text-slate-900">Flowy Pre</h1>
            <p className="text-xs text-slate-500">FAQ Generator cho flowy-agent</p>
          </Link>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  )
}

export default function App() {
  const [location] = useLocation()

  let page = <UploadHubPage />
  if (location.startsWith('/review/')) {
    page = <ReviewPage sessionId={location.replace('/review/', '')} />
  } else if (location === '/upload-json') {
    page = <UploadHubPage initialTab="json" />
  }

  return (
    <ToastProvider>
      <Layout>{page}</Layout>
    </ToastProvider>
  )
}
