import { Fragment } from 'react'

export function Stepper({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="flex items-center px-6 py-3">
      {steps.map((label, i) => (
        <Fragment key={label}>
          <div className="flex flex-col items-center gap-1">
            <div
              className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                i <= current
                  ? 'bg-teal-500 text-white'
                  : 'bg-cream-200 text-slate-400'
              }`}
            >
              {i < current ? '✓' : i + 1}
            </div>
            <span
              className={`text-[10px] ${
                i <= current ? 'font-medium text-teal-600' : 'text-slate-400'
              }`}
            >
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`mx-1 h-0.5 flex-1 self-start mt-3 ${
                i < current ? 'bg-teal-500' : 'bg-cream-300'
              }`}
            />
          )}
        </Fragment>
      ))}
    </div>
  )
}
