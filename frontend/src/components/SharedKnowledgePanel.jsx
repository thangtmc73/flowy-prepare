import { useState } from 'react'

export default function SharedKnowledgePanel({
  sharedKnowledge,
  onDownloadZip,
  downloadingZip,
}) {
  const [activeTab, setActiveTab] = useState(0)
  const [copiedKey, setCopiedKey] = useState('')

  const files = sharedKnowledge?.files || []
  if (!files.length) return null

  const activeFile = files[activeTab]

  const handleCopy = async (text, key) => {
    await navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(''), 2000)
  }

  const handleDownloadSingle = (file) => {
    const blob = new Blob([file.json_text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.key
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mt-8 border border-emerald-200 rounded-xl bg-emerald-50/50 overflow-hidden">
      <div className="px-5 py-4 border-b border-emerald-200 bg-emerald-50">
        <h3 className="text-lg font-semibold text-emerald-900">File catalog dùng chung</h3>
        <p className="text-sm text-emerald-700 mt-1">
          3 file cập nhật từ catalog GitHub + FAQ sản phẩm bạn đã chỉnh sửa.
          Copy hoặc download để import vào flowy-agent.
        </p>
        <button
          type="button"
          onClick={onDownloadZip}
          disabled={downloadingZip}
          className="mt-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {downloadingZip ? 'Đang tạo zip...' : 'Download cả 3 file (.zip)'}
        </button>
      </div>

      <div className="flex flex-wrap gap-1 px-4 pt-3 bg-white border-b border-emerald-100">
        {files.map((file, i) => (
          <button
            key={file.key}
            type="button"
            onClick={() => setActiveTab(i)}
            className={`px-3 py-2 text-xs font-mono rounded-t-lg border-b-2 transition-colors ${
              activeTab === i
                ? 'border-emerald-600 text-emerald-800 bg-emerald-50'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {file.display_path}
          </button>
        ))}
      </div>

      {activeFile && (
        <div className="p-4 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <p className="text-xs font-medium text-slate-500">Đại diện cho</p>
              <p className="text-sm font-mono text-slate-800">{activeFile.display_path}</p>
              <p className="text-xs text-slate-400 mt-0.5">Trong zip: {activeFile.zip_path}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleCopy(activeFile.json_text, activeFile.key)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                {copiedKey === activeFile.key ? 'Đã copy!' : 'Copy JSON'}
              </button>
              <button
                type="button"
                onClick={() => handleDownloadSingle(activeFile)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Download
              </button>
            </div>
          </div>
          <textarea
            readOnly
            value={activeFile.json_text}
            className="w-full h-96 font-mono text-xs border border-slate-200 rounded-lg p-3 bg-slate-50 resize-y"
          />
        </div>
      )}
    </div>
  )
}
