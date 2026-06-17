const STEPS = [
  { id: 1, label: 'Upload' },
  { id: 2, label: 'Review FAQ' },
  { id: 3, label: 'Catalog dùng chung' },
  { id: 4, label: 'Export' },
]

export default function Stepper({ current = 1 }) {
  return (
    <ol className="flex flex-wrap items-center gap-1 sm:gap-0 mb-6">
      {STEPS.map((step, i) => {
        const done = step.id < current
        const active = step.id === current
        return (
          <li key={step.id} className="flex items-center">
            {i > 0 && (
              <span
                className={`hidden sm:inline w-8 h-px mx-1 ${
                  done ? 'bg-brand' : 'bg-slate-200'
                }`}
                aria-hidden
              />
            )}
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium ${
                active
                  ? 'bg-brand text-white'
                  : done
                    ? 'bg-brand-light text-brand'
                    : 'bg-slate-100 text-slate-400'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  active
                    ? 'bg-white/20 text-white'
                    : done
                      ? 'bg-brand/10 text-brand'
                      : 'bg-slate-200 text-slate-500'
                }`}
              >
                {done ? '✓' : step.id}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
