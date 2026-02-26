import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import {
  ScreenHeader,
  Stack,
  Card,
  ListItem,
  Footer,
  Button,
} from '@/components/screen'
import { Stepper } from '../PrescriptionScan/Stepper'
import type { PrescriptionConfirmationData } from './scenarios'

export default function PrescriptionConfirmationScreen({ data }: { data: PrescriptionConfirmationData }) {
  const {
    state,
    deliveryMethod,
    prescriptions,
    deliveryLabel,
    locationLabel,
    locationDetail,
    timeline,
    insurer,
    memberId,
    consentChecked,
  } = data
  const { t } = useTranslation('prescription')

  const steps = [
    t('steps.scan'),
    t('steps.select'),
    t('steps.delivery'),
    t('steps.location'),
    t('steps.confirm'),
  ]

  const isSubmitting = state === 'submitting'

  /* ─── Success State ─── */
  if (state === 'success') {
    return (
      <>
        <ScreenHeader
          title={t('flowTitle')}
          data-flow-target="ScreenHeader:Redeem Prescription"
        />

        <Stepper current={5} steps={steps} />

        <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
          <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-teal-100">
            <span className="text-4xl">✅</span>
          </div>
          <h2 className="mb-2 text-xl font-semibold text-charcoal-500">
            {t('confirmation.successTitle')}
          </h2>
          <p className="max-w-[280px] text-center text-sm text-slate-500">
            {deliveryMethod === 'pickup'
              ? t('confirmation.successPickup', { location: locationLabel })
              : t('confirmation.successDelivery', { address: locationLabel })}
          </p>
        </div>

        <Footer>
          <Button
            size="lg"
            className="w-full"
            data-flow-target="Button:Back to Home"
          >
            {t('confirmation.backToHome')}
          </Button>
        </Footer>
      </>
    )
  }

  /* ─── Review / Submitting State ─── */
  return (
    <>
      <ScreenHeader
        title={t('confirmation.title')}
        data-flow-target="ScreenHeader:Review & Confirm"
      />

      <Stepper current={4} steps={steps} />

      <Stack gap="md" className="p-4 pb-20">
        {/* Prescriptions Section */}
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wider text-slate-400">
            {t('confirmation.prescriptionsSection').toUpperCase()}
          </p>
          <Card className="overflow-hidden p-0">
            {prescriptions.map((rx, i) => (
              <ListItem
                key={i}
                icon="💊"
                label={rx.medication}
                description={rx.dosage}
                trailing={<span />}
              />
            ))}
          </Card>
        </div>

        {/* Delivery Section */}
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wider text-slate-400">
            {t('confirmation.deliverySection').toUpperCase()}
          </p>
          <Card className="overflow-hidden p-0">
            <ListItem
              icon={deliveryMethod === 'pickup' ? '🏪' : '🚚'}
              label={deliveryLabel}
              trailing={
                <button className="text-xs font-medium text-teal-600">
                  {t('confirmation.edit')}
                </button>
              }
            />
            <ListItem
              icon="📍"
              label={locationLabel}
              description={locationDetail}
              trailing={
                <button className="text-xs font-medium text-teal-600">
                  {t('confirmation.edit')}
                </button>
              }
            />
            <ListItem
              icon="🕐"
              label={timeline}
              trailing={<span />}
            />
          </Card>
        </div>

        {/* Insurance Section */}
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wider text-slate-400">
            {t('confirmation.insuranceSection').toUpperCase()}
          </p>
          <Card className="overflow-hidden p-0">
            <ListItem
              icon="🏥"
              label={insurer}
              description={t('confirmation.memberId', { id: memberId })}
              trailing={<span />}
            />
          </Card>
        </div>

        {/* Consent Checkbox */}
        <div className="flex items-start gap-3 px-1">
          <div
            className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border-2 text-xs ${
              consentChecked
                ? 'border-teal-500 bg-teal-500 text-white'
                : 'border-slate-300'
            }`}
          >
            {consentChecked && '✓'}
          </div>
          <span className="text-sm text-charcoal-400">
            {t('confirmation.consent')}
          </span>
        </div>
      </Stack>

      <Footer>
        <Button
          size="lg"
          variant={consentChecked && !isSubmitting ? 'primary' : 'secondary'}
          className={`w-full ${!consentChecked || isSubmitting ? 'opacity-50' : ''}`}
          data-flow-target="Button:Confirm Redemption"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              {t('confirmation.submitting')}
            </span>
          ) : (
            t('confirmation.confirmBtn')
          )}
        </Button>
      </Footer>
    </>
  )
}
