import { useRef, useState } from 'react'

function matchesAccept(file, accept) {
  if (!accept) return true
  const name = file.name.toLowerCase()
  return accept.split(',').some((token) => {
    const t = token.trim().toLowerCase()
    if (!t) return false
    if (t.startsWith('.')) return name.endsWith(t)
    if (t.includes('/')) return file.type === t
    return false
  })
}

export default function FileDropZone({
  accept,
  label,
  hint,
  file,
  disabled = false,
  onFileSelect,
  onClear,
}) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  const pickFile = (selected) => {
    if (!selected || disabled) return
    if (!matchesAccept(selected, accept)) {
      onFileSelect(null, `File không hợp lệ. Chỉ chấp nhận: ${hint || accept}`)
      return
    }
    onFileSelect(selected)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    if (disabled) return
    pickFile(e.dataTransfer.files?.[0] || null)
  }

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      )}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false)
        }}
        onDrop={handleDrop}
        className={`relative rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors cursor-pointer ${
          disabled
            ? 'opacity-60 cursor-not-allowed border-slate-200 bg-slate-50'
            : dragOver
              ? 'border-brand bg-brand-light'
              : file
                ? 'border-brand/40 bg-brand-light/30'
                : 'border-slate-300 bg-slate-50 hover:border-brand/50 hover:bg-brand-light/20'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => pickFile(e.target.files?.[0] || null)}
        />

        {file ? (
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-800 break-all">{file.name}</p>
            <p className="text-xs text-slate-500">
              {(file.size / 1024).toFixed(0)} KB · Kéo file khác để thay thế
            </p>
            {onClear && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (inputRef.current) inputRef.current.value = ''
                  onClear()
                }}
                className="mt-2 text-xs text-slate-500 hover:text-red-600 underline"
              >
                Xóa file
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-1 pointer-events-none">
            <p className="text-sm font-medium text-slate-700">
              Kéo thả file vào đây
            </p>
            <p className="text-xs text-slate-500">hoặc bấm để chọn file</p>
            {hint && <p className="text-xs text-slate-400 mt-2">{hint}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
