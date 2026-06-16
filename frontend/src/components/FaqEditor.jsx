import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function FaqEditor({ faq, index, onChange, onDelete, onDuplicate }) {
  const [expanded, setExpanded] = useState(true)
  const variantsText = (faq.user_questions || []).join('\n')

  const update = (field, value) => {
    onChange(index, { ...faq, [field]: value })
  }

  const updateVariants = (text) => {
    const user_questions = text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    onChange(index, { ...faq, user_questions })
  }

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      <div
        className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-xs font-mono text-slate-400">#{index + 1}</span>
        <span className="flex-1 text-sm font-medium text-slate-800 truncate">
          {faq.canonical_question || '(Chưa có câu hỏi)'}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
          {faq.category || 'Khác'}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDuplicate(index) }}
          className="text-xs text-brand hover:underline"
        >
          Nhân bản
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(index) }}
          className="text-xs text-red-600 hover:underline"
        >
          Xóa
        </button>
      </div>

      {expanded && (
        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-500">Canonical question</label>
            <input
              value={faq.canonical_question || ''}
              onChange={(e) => update('canonical_question', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500">Category</label>
              <input
                value={faq.category || ''}
                onChange={(e) => update('category', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Priority (1-10)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={faq.priority ?? 5}
                onChange={(e) => update('priority', Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500">
              User questions (mỗi dòng một biến thể)
            </label>
            <textarea
              rows={5}
              value={variantsText}
              onChange={(e) => updateVariants(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500">Answer (markdown)</label>
            <textarea
              rows={8}
              value={faq.answer || ''}
              onChange={(e) => update('answer', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </div>

          {faq.answer && (
            <div>
              <label className="text-xs font-medium text-slate-500">Preview</label>
              <div className="mt-1 p-3 rounded-lg bg-slate-50 border border-slate-100 text-sm markdown-preview prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{faq.answer}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
