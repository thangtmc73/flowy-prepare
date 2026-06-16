export default function ProgressBar({ progress, className = '' }) {
  if (!progress) return null

  const { percent = 0, message, current_chunk, total_chunks, faqs_so_far } = progress
  const chunkLabel =
    total_chunks && current_chunk != null
      ? `Đoạn ${current_chunk}/${total_chunks}`
      : null

  return (
    <div className={`rounded-xl border border-brand/20 bg-brand-light/40 p-4 ${className}`}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-sm font-medium text-brand">{message || 'Đang xử lý...'}</p>
        <span className="text-xs font-semibold text-brand tabular-nums">{percent}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/80 overflow-hidden">
        <div
          className="h-full rounded-full bg-brand transition-all duration-500 ease-out"
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </div>
      {(chunkLabel || faqs_so_far != null) && (
        <p className="mt-2 text-xs text-slate-600">
          {chunkLabel}
          {chunkLabel && faqs_so_far != null ? ' · ' : ''}
          {faqs_so_far != null ? `${faqs_so_far} FAQ tạm thời` : ''}
        </p>
      )}
    </div>
  )
}
