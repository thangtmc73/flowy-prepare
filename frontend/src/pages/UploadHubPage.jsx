import { Link, useLocation } from 'wouter'
import { useMemo } from 'react'
import DocUploadForm from '../components/DocUploadForm'
import JsonUploadForm from '../components/JsonUploadForm'
import Stepper from '../components/Stepper'

function UploadTab({ active, href, onClick, children }) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
          active
            ? 'bg-brand text-white'
            : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        {children}
      </button>
    )
  }
  return (
    <Link
      href={href}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        active
          ? 'bg-brand text-white'
          : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {children}
    </Link>
  )
}

export default function UploadHubPage({ initialTab = 'doc' }) {
  const [location] = useLocation()
  const tab = useMemo(() => {
    if (location === '/upload-json') return 'json'
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('tab')
      if (q === 'json') return 'json'
    }
    return initialTab === 'json' ? 'json' : 'doc'
  }, [location, initialTab])

  return (
    <div className="max-w-2xl">
      <Stepper current={1} />

      <h2 className="text-2xl font-semibold text-slate-900 mb-2">Bắt đầu</h2>
      <p className="text-slate-600 mb-4 text-sm">
        Tạo hoặc cập nhật FAQ sản phẩm, xuất JSON và file catalog dùng chung cho flowy-agent.
      </p>

      <div className="flex flex-wrap gap-2 mb-6 p-1 bg-slate-100 rounded-xl w-fit">
        <UploadTab active={tab === 'doc'} href="/">
          Từ tài liệu (PDF/DOCX)
        </UploadTab>
        <UploadTab active={tab === 'json'} href="/?tab=json">
          Từ JSON có sẵn
        </UploadTab>
      </div>

      {tab === 'json' ? (
        <div>
          <p className="text-sm text-slate-500 mb-4">
            Đã có file <span className="font-mono">{`{partner}_{product}.json`}</span>?
            Import trực tiếp để chỉnh sửa hoặc cập nhật catalog.
          </p>
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <JsonUploadForm />
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm text-slate-500 mb-4">
            Chưa có JSON? Upload PDF/DOCX để AI generate FAQ tự động.
          </p>
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <DocUploadForm />
          </div>
        </div>
      )}
    </div>
  )
}
