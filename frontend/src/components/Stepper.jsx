const STEPS = [
  { id: 1, label: 'Upload' },
  { id: 2, label: 'Review FAQ' },
  { id: 3, label: 'Catalog dùng chung' },
  { id: 4, label: 'Export' },
]

export default function Stepper({ current = 1 }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-6 text-xs">
      {STEPS.map((step, i) => {
        const done = step.id < current
        const active = step.id === current
        return (
          <li key={step.id} className="flex items-center gap-2">
            {i > 0 && (
              <span
                className={`hidden sm:inline ${done ? 'text-brand' : 'text-slate-300'}`}
                aria-hidden
              >
                /
              </span>
            )}
            <span
              className={
                active
                  ? 'font-semibold text-brand'
                  : done
                    ? 'font-medium text-brand'
                    : 'font-normal text-slate-400'
              }
            >
              {done ? '✓ ' : `${step.id}. `}
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
