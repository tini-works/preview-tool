import { useTranslation } from 'react-i18next'
import { ScreenHeader, Stack, Card, Footer, Button } from '@/components/screen'
import type { PrescriptionConfirmationData } from './scenarios'

const steps = ['stepScan', 'stepSelect', 'stepDelivery', 'stepConfirm'] as const

function Stepper({ currentStep, t }: { currentStep: number; t: (key: string) => string }) {
  return (
    <div className="flex items-center justify-between px-2">
      {steps.map((stepKey, i) => (
        <div key={stepKey} className="flex flex-1 items-center">
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

export default function ConfirmationScreen({ data }: { data: PrescriptionConfirmationData }) {
  const { t } = useTranslation('prescription-confirmation')
  const {
    state,
    deliveryMethod,
    prescriptions,
    deliveryLabel,
    locationLabel,
    locationDetail,
    timeline,
    insurer,
    memberId: mId,
    consentChecked,
  } = data

  if (state === 'success') {
    return (
      <>
        <ScreenHeader
          title={t('title')}
          data-flow-target="ScreenHeader:Review & Confirm"
        />

        <Stack gap="lg" className="flex min-h-[70vh] flex-col items-center justify-center p-4">
          {/* Success icon */}
          <div className="flex size-24 items-center justify-center rounded-full bg-teal-100">
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

          {/* Title */}
          <h2 className="text-xl font-semibold text-charcoal-500">
            {t('successTitle')}
          </h2>

          {/* Contextual message */}
          <p className="max-w-[300px] text-center text-sm text-slate-500">
            {deliveryMethod === 'pickup'
              ? t('successPickup', { location: locationLabel })
              : t('successDelivery', { address: locationLabel })}
          </p>
        </Stack>

        <Footer>
          <Button
            data-flow-target="Button:Back to Home"
            variant="primary"
            size="lg"
            className="w-full"
          >
            {t('backToHome')}
          </Button>
        </Footer>
      </>
    )
  }

  const isSubmitting = state === 'submitting'

  return (
    <>
      <ScreenHeader
        title={t('title')}
        data-flow-target="ScreenHeader:Review & Confirm"
      />

      <Stack gap="lg" className="p-4 pb-20">
        {/* Stepper */}
        <Stepper currentStep={3} t={t} />

        {/* Prescriptions Section */}
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wider text-charcoal-400">
            {t('prescriptionsSection').toUpperCase()}
          </p>
          <Card className="overflow-hidden p-0">
            {prescriptions.map((rx, i) => (
              <div
                key={i}
                className={
                  i < prescriptions.length - 1
                    ? 'border-b border-cream-300 px-4 py-3'
                    : 'px-4 py-3'
                }
              >
                <p className="text-sm font-medium text-charcoal-500">{rx.medication}</p>
                <p className="text-xs text-slate-500">{rx.dosage}</p>
              </div>
            ))}
          </Card>
        </div>

        {/* Delivery Section */}
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wider text-charcoal-400">
            {t('deliverySection').toUpperCase()}
          </p>
          <Card className="overflow-hidden p-0">
            {/* Delivery method row */}
            <div className="flex items-center justify-between border-b border-cream-300 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-charcoal-500">{deliveryLabel}</p>
              </div>
              <span className="text-xs font-medium text-teal-600">{t('edit')}</span>
            </div>

            {/* Location/address row */}
            <div className="flex items-center justify-between border-b border-cream-300 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-charcoal-500">{locationLabel}</p>
                {locationDetail && (
                  <p className="text-xs text-slate-500">{locationDetail}</p>
                )}
              </div>
              <span className="text-xs font-medium text-teal-600">{t('edit')}</span>
            </div>

            {/* Timeline row */}
            <div className="px-4 py-3">
              <p className="text-sm text-charcoal-500">{timeline}</p>
            </div>
          </Card>
        </div>

        {/* Insurance Section */}
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wider text-charcoal-400">
            {t('insuranceSection').toUpperCase()}
          </p>
          <Card className="overflow-hidden p-0">
            <div className="px-4 py-3">
              <p className="text-sm font-medium text-charcoal-500">{insurer}</p>
              <p className="text-xs text-slate-500">{t('memberId', { id: mId })}</p>
            </div>
          </Card>
        </div>

        {/* Consent Checkbox */}
        <div className="flex items-center gap-3">
          <div
            className={`flex size-5 items-center justify-center rounded border-2 ${consentChecked ? 'border-teal-500 bg-teal-500' : 'border-slate-300'}`}
          >
            {consentChecked && <span className="text-xs text-white">✓</span>}
          </div>
          <span className="text-sm text-charcoal-500">{t('consent')}</span>
        </div>
      </Stack>

      <Footer>
        <Button
          data-flow-target="Button:Confirm Redemption"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={!consentChecked || isSubmitting}
        >
          {isSubmitting ? t('submitting') : t('confirmBtn')}
        </Button>
      </Footer>
    </>
  )
}
