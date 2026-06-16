const STATUS_STYLE = {
  new: 'bg-emerald-100 text-emerald-800',
  updated: 'bg-amber-100 text-amber-800',
  unchanged: 'bg-slate-100 text-slate-600',
  removed: 'bg-red-100 text-red-800',
}

const STATUS_LABEL = {
  new: 'Mới',
  updated: 'Cập nhật',
  unchanged: 'Giữ nguyên',
  removed: 'Sẽ bị xóa (replace)',
}

export default function DiffView({ diffs, summary }) {
  if (!diffs?.length) {
    return <p className="text-sm text-slate-500">Không có dữ liệu so sánh.</p>
  }

  return (
    <div className="space-y-4">
      {summary && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(summary).map(([key, count]) => (
            count > 0 && (
              <span
                key={key}
                className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_STYLE[key] || 'bg-slate-100'}`}
              >
                {STATUS_LABEL[key] || key}: {count}
              </span>
            )
          ))}
        </div>
      )}

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {diffs.map((item, idx) => (
          <div key={idx} className="border border-slate-200 rounded-lg p-3 bg-white text-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[item.status]}`}>
                {STATUS_LABEL[item.status]}
              </span>
              {item.similarity > 0 && (
                <span className="text-xs text-slate-400">{Math.round(item.similarity * 100)}% match</span>
              )}
            </div>
            {item.incoming && (
              <p className="font-medium text-slate-800">{item.incoming.canonical_question}</p>
            )}
            {item.existing && item.status === 'updated' && (
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                Trước: {item.existing.answer?.slice(0, 120)}...
              </p>
            )}
            {item.existing && item.status === 'removed' && (
              <p className="font-medium text-slate-600">{item.existing.canonical_question}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
