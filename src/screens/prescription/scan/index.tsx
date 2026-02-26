import { useTranslation } from 'react-i18next'
import { ScreenHeader, Stack, Note, Footer, Button } from '@/components/screen'
import type { PrescriptionScanData } from './scenarios'

const steps = ['stepScan', 'stepSelect', 'stepDelivery', 'stepConfirm'] as const

function Stepper({ currentStep, t }: { currentStep: number; t: (key: string) => string }) {
  return (
    <div className="flex items-center justify-between px-2">
      {steps.map((stepKey, i) => (
        <div key={stepKey} className="flex flex-1 items-center">
          {/* Step circle */}
          <div className="flex flex-col items-center gap-1">
            <div
              className={
                i < currentStep
                  ? 'flex size-8 items-center justify-center rounded-full bg-teal-500 text-xs font-semibold text-white'
                  : i === currentStep
                    ? 'flex size-8 items-center justify-center rounded-full bg-teal-500 text-xs font-semibold text-white ring-4 ring-teal-100'
                    : 'flex size-8 items-center justify-center rounded-full bg-cream-200 text-xs font-semibold text-slate-500'
              }
            >
              {i < currentStep ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span
              className={
                i <= currentStep
                  ? 'text-xs font-medium text-charcoal-500'
                  : 'text-xs text-slate-400'
              }
            >
              {t(stepKey)}
            </span>
          </div>

          {/* Connecting line (not after last step) */}
          {i < steps.length - 1 && (
            <div
              className={
                i < currentStep
                  ? 'mx-1 mt-[-1.25rem] h-0.5 flex-1 bg-teal-500'
                  : 'mx-1 mt-[-1.25rem] h-0.5 flex-1 bg-cream-300'
              }
            />
          )}
        </div>
      ))}
    </div>
  )
}

function NfcIllustration({ state }: { state: PrescriptionScanData['state'] }) {
  if (state === 'success') {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="flex size-24 animate-[scaleIn_0.4s_ease-out] items-center justify-center rounded-full bg-teal-100">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-teal-600"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="flex size-24 items-center justify-center rounded-full bg-coral-100">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-coral-600"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative flex size-24 items-center justify-center">
        {/* Pulsing rings when scanning */}
        {state === 'scanning' && (
          <>
            <div className="absolute inset-0 animate-ping rounded-full bg-teal-200 opacity-20" />
            <div className="absolute inset-2 animate-ping rounded-full bg-teal-200 opacity-30 [animation-delay:0.3s]" />
          </>
        )}

        {/* Phone icon */}
        <div className="relative z-10 flex size-20 items-center justify-center rounded-2xl border-2 border-cream-400 bg-cream-50 shadow-md">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={state === 'scanning' ? 'animate-pulse text-teal-500' : 'text-slate-500'}
          >
            {/* Phone body */}
            <rect x="5" y="2" width="14" height="20" rx="2" />
            <path d="M12 18h.01" />
            {/* NFC waves */}
            <path d="M8.5 8.5a3 3 0 0 1 4.24 0" />
            <path d="M7.1 7.1a5 5 0 0 1 7.07 0" />
            <path d="M10.75 11a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1" />
          </svg>
        </div>
      </div>

      {/* Card floating below phone */}
      <div
        className={
          state === 'scanning'
            ? 'flex h-12 w-20 animate-bounce items-center justify-center rounded-lg border-2 border-teal-300 bg-teal-50 shadow-sm [animation-duration:1.5s]'
            : 'flex h-12 w-20 items-center justify-center rounded-lg border-2 border-cream-400 bg-cream-100 shadow-sm'
        }
      >
        <span className="text-xs font-semibold text-slate-500">eGK</span>
      </div>
    </div>
  )
}

export default function PrescriptionScanScreen({ data }: { data: PrescriptionScanData }) {
  const { t } = useTranslation('prescription-scan')
  const { state } = data

  return (
    <>
      <ScreenHeader
        title={t('title')}
        data-flow-target="ScreenHeader:Redeem Prescription"
      />

      <Stack gap="lg" className="p-4">
        {/* Stepper */}
        <Stepper currentStep={0} t={t} />

        {/* Illustration area */}
        <div className="flex flex-col items-center gap-6 py-8">
          <NfcIllustration state={state} />

          {/* Status text */}
          <div className="flex flex-col items-center gap-2 text-center">
            {state === 'idle' && (
              <>
                <h2 className="text-lg font-semibold text-charcoal-500">
                  {t('instruction')}
                </h2>
                <p className="max-w-[260px] text-sm text-slate-500">
                  {t('subtitle')}
                </p>
              </>
            )}

            {state === 'scanning' && (
              <h2 className="animate-pulse text-lg font-semibold text-teal-600">
                {t('scanning')}
              </h2>
            )}

            {state === 'success' && (
              <h2 className="text-lg font-semibold text-teal-600">
                {t('success')}
              </h2>
            )}

            {state === 'error' && (
              <Note type="error">
                {t('error')}
              </Note>
            )}
          </div>
        </div>

        {/* APO group branding */}
        <p className="text-center text-xs text-slate-400">
          {t('poweredBy')}
        </p>
      </Stack>

      <Footer>
        {state === 'error' ? (
          <Button
            data-flow-target="Button:Try Again"
            variant="outline"
            size="lg"
            className="w-full"
          >
            {t('tryAgainBtn')}
          </Button>
        ) : state !== 'success' ? (
          <Button
            data-flow-target="Button:Simulate NFC Scan"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={state === 'scanning'}
          >
            {state === 'scanning' ? t('scanning') : t('simulateBtn')}
          </Button>
        ) : null}
      </Footer>
    </>
  )
}
