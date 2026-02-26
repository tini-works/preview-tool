import { useTranslation } from 'react-i18next'
import {
  ScreenHeader,
  Stack,
  Card,
  RadioCard,
  Badge,
  Textarea,
  Divider,
  Footer,
  Button,
} from '@/components/screen'
import type { PrescriptionDeliveryData, Apotheke } from './scenarios'

/* ─── Stepper ─── */

function Stepper({ activeStep, labels }: { activeStep: number; labels: string[] }) {
  return (
    <div className="flex items-center justify-between px-2">
      {labels.map((label, i) => {
        const isActive = i === activeStep
        const isCompleted = i < activeStep
        return (
          <div key={label} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={
                  'flex size-7 items-center justify-center rounded-full text-xs font-semibold ' +
                  (isActive
                    ? 'bg-teal-500 text-white'
                    : isCompleted
                      ? 'bg-teal-100 text-teal-700'
                      : 'bg-cream-200 text-slate-400')
                }
              >
                {isCompleted ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={
                  'text-[10px] font-medium ' +
                  (isActive ? 'text-teal-700' : 'text-slate-400')
                }
              >
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <div
                className={
                  'mx-1 h-px flex-1 ' +
                  (i < activeStep ? 'bg-teal-400' : 'bg-cream-400')
                }
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ─── Map Placeholder ─── */

function MapPlaceholder() {
  return (
    <div className="relative flex h-40 items-center justify-center overflow-hidden rounded-lg bg-cream-200">
      {/* Decorative map dots */}
      <div className="absolute left-[20%] top-[30%] text-lg">📍</div>
      <div className="absolute left-[55%] top-[45%] text-lg">📍</div>
      <div className="absolute left-[40%] top-[65%] text-lg">📍</div>
      <span className="z-10 text-xs font-medium text-slate-500">Map view</span>
    </div>
  )
}

/* ─── Apotheke Location Card ─── */

function ApothekeCard({
  apotheke,
  selected,
  t,
}: {
  apotheke: Apotheke
  selected: boolean
  t: (key: string, opts?: Record<string, string>) => string
}) {
  return (
    <RadioCard
      selected={selected}
      data-flow-target={`RadioCard:${apotheke.name}`}
    >
      <div className="flex w-full flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium text-charcoal-500">{apotheke.name}</span>
          <span className="shrink-0 text-xs font-medium text-teal-600">{apotheke.distance}</span>
        </div>
        <span className="text-xs text-slate-500">{apotheke.address}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {t('openUntil', { time: apotheke.openUntil })}
          </span>
          <Badge variant={apotheke.availability === 'available' ? 'success' : 'warning'}>
            {apotheke.availability === 'available' ? t('available') : t('limited')}
          </Badge>
        </div>
      </div>
    </RadioCard>
  )
}

/* ─── Home Delivery Section ─── */

function HomeDeliverySection({
  data,
  t,
}: {
  data: PrescriptionDeliveryData
  t: (key: string) => string
}) {
  const { savedAddress, deliveryNote } = data

  return (
    <>
      <Divider />

      {savedAddress !== undefined ? (
        /* Pre-filled address card */
        <Card className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-charcoal-400">
                {t('savedAddress')}
              </span>
              <span className="text-sm text-charcoal-500">{savedAddress}</span>
            </div>
            <button className="text-xs font-medium text-teal-600">
              {t('changeAddress')}
            </button>
          </div>
        </Card>
      ) : (
        /* Empty address form */
        <Stack gap="sm">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label htmlFor="street" className="text-sm font-medium text-charcoal-400">
                {t('street')}
              </label>
              <input
                id="street"
                type="text"
                className="mt-1.5 h-10 w-full rounded-md border border-cream-500 bg-cream-50 px-3 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label htmlFor="houseNumber" className="text-sm font-medium text-charcoal-400">
                {t('houseNumber')}
              </label>
              <input
                id="houseNumber"
                type="text"
                className="mt-1.5 h-10 w-full rounded-md border border-cream-500 bg-cream-50 px-3 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="postalCode" className="text-sm font-medium text-charcoal-400">
                {t('postalCode')}
              </label>
              <input
                id="postalCode"
                type="text"
                className="mt-1.5 h-10 w-full rounded-md border border-cream-500 bg-cream-50 px-3 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label htmlFor="city" className="text-sm font-medium text-charcoal-400">
                {t('city')}
              </label>
              <input
                id="city"
                type="text"
                className="mt-1.5 h-10 w-full rounded-md border border-cream-500 bg-cream-50 px-3 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>
        </Stack>
      )}

      {/* Delivery note */}
      <Textarea
        label={t('deliveryNote')}
        placeholder={t('deliveryNotePlaceholder')}
        value={deliveryNote ?? ''}
        maxLength={200}
      />

      {/* Estimated delivery */}
      <p className="text-center text-sm text-slate-500">
        {t('estimatedDelivery')}
      </p>
    </>
  )
}

/* ─── Apotheke Pickup Section ─── */

function ApothekePickupSection({
  data,
  t,
}: {
  data: PrescriptionDeliveryData
  t: (key: string, opts?: Record<string, string | number>) => string
}) {
  const { pickupView, apotheken = [], selectedApothekeId } = data

  return (
    <>
      <Divider />

      {/* Map placeholder */}
      <MapPlaceholder />

      {pickupView === 'loading' ? (
        <div className="flex flex-col items-center justify-center gap-3 py-8">
          <div className="size-6 animate-spin rounded-full border-2 border-cream-400 border-t-teal-500" />
          <span className="text-sm text-slate-500">{t('loading')}</span>
        </div>
      ) : (
        <>
          {/* Location count */}
          <p className="text-sm font-medium text-charcoal-400">
            {t('nearbyCount', { count: apotheken.length })}
          </p>

          {/* Location cards */}
          <Stack gap="sm">
            {apotheken.map((apo) => (
              <ApothekeCard
                key={apo.id}
                apotheke={apo}
                selected={selectedApothekeId === apo.id}
                t={t}
              />
            ))}
          </Stack>
        </>
      )}
    </>
  )
}

/* ─── Screen ─── */

export default function DeliveryScreen({ data }: { data: PrescriptionDeliveryData }) {
  const { t } = useTranslation('prescription-delivery')
  const { selected, pickupView, selectedApothekeId } = data

  const stepLabels = [t('stepScan'), t('stepSelect'), t('stepDelivery'), t('stepConfirm')]

  const canContinue =
    (selected === 'delivery') ||
    (selected === 'pickup' && pickupView === 'selected' && !!selectedApothekeId)

  return (
    <>
      <ScreenHeader
        title={t('title')}
        data-flow-target="ScreenHeader:Delivery"
      />

      <Stack gap="md" className="p-4 pb-24">
        {/* Stepper — step 3 (index 2) */}
        <Stepper activeStep={2} labels={stepLabels} />

        {/* Instruction */}
        <p className="text-center text-sm text-charcoal-400">
          {t('instruction')}
        </p>

        {/* Delivery method radio cards */}
        <Stack gap="sm">
          <RadioCard
            selected={selected === 'delivery'}
            data-flow-target="RadioCard:Home Delivery"
          >
            <div className="flex flex-col">
              <span className="flex items-center gap-2">
                <span>🚚</span>
                <span className="font-medium">{t('homeDelivery')}</span>
              </span>
              <span className="text-xs text-slate-500">{t('homeDeliveryDesc')}</span>
            </div>
          </RadioCard>

          <RadioCard
            selected={selected === 'pickup'}
            data-flow-target="RadioCard:Apotheke Pickup"
          >
            <div className="flex flex-col">
              <span className="flex items-center gap-2">
                <span>🏪</span>
                <span className="font-medium">{t('apothekePickup')}</span>
              </span>
              <span className="text-xs text-slate-500">{t('apothekePickupDesc')}</span>
            </div>
          </RadioCard>
        </Stack>

        {/* Variant A: Home Delivery details */}
        {selected === 'delivery' && (
          <HomeDeliverySection data={data} t={t} />
        )}

        {/* Variant B: Apotheke Pickup details */}
        {selected === 'pickup' && (
          <ApothekePickupSection data={data} t={t} />
        )}
      </Stack>

      {/* Footer */}
      <Footer>
        <Button
          data-flow-target="Button:Continue"
          variant={canContinue ? 'primary' : 'secondary'}
          size="lg"
          className={'w-full' + (!canContinue ? ' opacity-50' : '')}
          disabled={!canContinue}
        >
          {t('continue')}
        </Button>
      </Footer>
    </>
  )
}
