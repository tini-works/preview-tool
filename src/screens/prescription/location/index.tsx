import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import {
  ScreenHeader,
  Stack,
  Card,
  Input,
  Textarea,
  Badge,
  Footer,
  Button,
} from '@/components/screen'
import { Stepper } from '../_shared/Stepper'
import type { PrescriptionLocationData } from './scenarios'

export default function PrescriptionLocationScreen({
  data,
  flags,
}: {
  data: PrescriptionLocationData
  flags?: Record<string, boolean>
}) {
  const { method, savedAddress, pickupView, apotheken, selectedApothekeId } = data
  const { t } = useTranslation('prescription-location')

  const steps = [
    t('steps.scan'),
    t('steps.select'),
    t('steps.delivery'),
    t('steps.location'),
    t('steps.confirm'),
  ]

  const isDelivery = method === 'delivery'
  const title = isDelivery ? t('deliveryTitle') : t('pickupTitle')

  return (
    <>
      <ScreenHeader
        title={title}
        data-flow-target={`ScreenHeader:${isDelivery ? 'Delivery Address' : 'Choose Apotheke'}`}
      />

      <Stepper current={3} steps={steps} />

      {/* ─── Delivery: Address Form ─── */}
      {isDelivery && (
        <>
          <Stack gap="md" className="p-4">
            {savedAddress ? (
              <Card>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    <span>📍</span>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-charcoal-500">
                        {t('savedAddress')}
                      </span>
                      <span className="text-xs text-slate-500">{savedAddress}</span>
                    </div>
                  </div>
                  <button className="text-xs font-medium text-teal-600">
                    {t('changeAddress')}
                  </button>
                </div>
              </Card>
            ) : (
              <Card>
                <Stack gap="sm">
                  <div className="flex gap-3">
                    <Input label={t('street')} placeholder="Marienplatz" className="flex-1" />
                    <Input label={t('houseNumber')} placeholder="1" className="w-24 whitespace-nowrap" />
                  </div>
                  <div className="flex gap-3">
                    <Input label={t('postalCode')} placeholder="80331" className="w-28" />
                    <Input label={t('city')} placeholder="München" className="flex-1" />
                  </div>
                </Stack>
              </Card>
            )}

            <Textarea
              label={t('deliveryNote')}
              placeholder={t('deliveryNotePlaceholder')}
            />

            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>📦</span>
              <span>{t('estimatedDelivery')}</span>
            </div>
          </Stack>

          <Footer>
            <Button
              size="lg"
              className="w-full"
              data-flow-target="Button:Continue"
            >
              {t('continue')}
            </Button>
          </Footer>
        </>
      )}

      {/* ─── Pickup: Map + Location List ─── */}
      {!isDelivery && (
        <>
          {/* Map placeholder */}
          {flags?.showMap !== false && (
            <div className="flex h-40 items-center justify-center bg-cream-200">
              <div className="flex flex-col items-center gap-1 text-slate-400">
                <span className="text-2xl">🗺️</span>
                <span className="text-xs">📍 📍 📍</span>
              </div>
            </div>
          )}

          {pickupView === 'loading' && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-2 text-slate-500">
                <Loader2 className="size-4 animate-spin" />
                <span className="text-sm">{t('loading')}</span>
              </div>
            </div>
          )}

          {(pickupView === 'list' || pickupView === 'selected') && apotheken && (
            <Stack gap="md" className="p-4">
              <p className="text-xs font-semibold tracking-wider text-slate-400">
                {t('nearbyCount', { count: apotheken.length }).toUpperCase()}
              </p>

              <Stack gap="sm">
                {apotheken.map((apo) => {
                  const isSelected = apo.id === selectedApothekeId
                  return (
                    <Card
                      key={apo.id}
                      className={`p-4 ${
                        isSelected ? 'border-2 border-teal-500 bg-teal-50' : ''
                      }`}
                    >
                      <div className="flex gap-3">
                        <span
                          className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                            isSelected ? 'border-teal-500' : 'border-slate-300'
                          }`}
                        >
                          {isSelected && (
                            <span className="size-2.5 rounded-full bg-teal-500" />
                          )}
                        </span>
                        <div className="flex flex-1 flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-charcoal-500">
                              {apo.name}
                            </span>
                            <span className="text-xs text-slate-400">{apo.distance}</span>
                          </div>
                          <span className="text-xs text-slate-500">{apo.address}</span>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-400">
                              {t('openUntil', { time: apo.openUntil })}
                            </span>
                            <Badge
                              variant={apo.availability === 'available' ? 'success' : 'warning'}
                            >
                              {apo.availability === 'available'
                                ? t('available')
                                : t('limited')}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </Stack>
            </Stack>
          )}

          <Footer>
            <Button
              size="lg"
              variant={selectedApothekeId ? 'primary' : 'secondary'}
              className={`w-full ${!selectedApothekeId ? 'opacity-50' : ''}`}
              data-flow-target="Button:Continue"
            >
              {t('continue')}
            </Button>
          </Footer>
        </>
      )}
    </>
  )
}
