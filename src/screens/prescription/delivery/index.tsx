import { useTranslation } from 'react-i18next'
import {
  ScreenHeader,
  Stack,
  RadioCard,
  Footer,
  Button,
} from '@/components/screen'
import { Stepper } from '../_shared/Stepper'
import type { PrescriptionDeliveryData } from './scenarios'

export default function PrescriptionDeliveryScreen({ data }: { data: PrescriptionDeliveryData }) {
  const { selected } = data
  const { t } = useTranslation('prescription-delivery')
  const hasSelection = selected !== 'none'

  const steps = [
    t('steps.scan'),
    t('steps.select'),
    t('steps.delivery'),
    t('steps.location'),
    t('steps.confirm'),
  ]

  return (
    <>
      <ScreenHeader
        title={t('title')}
        data-flow-target="ScreenHeader:Delivery Method"
      />

      <Stepper current={2} steps={steps} />

      <Stack gap="md" className="p-4">
        <p className="text-sm text-charcoal-400">{t('instruction')}</p>

        <Stack gap="sm">
          <RadioCard
            selected={selected === 'delivery'}
            data-flow-target="RadioCard:Home Delivery"
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span>🚚</span>
                <span className="font-semibold">{t('homeDelivery')}</span>
              </div>
              <span className="text-xs text-slate-500">{t('homeDeliveryDesc')}</span>
            </div>
          </RadioCard>

          <RadioCard
            selected={selected === 'pickup'}
            data-flow-target="RadioCard:Apotheke Pickup"
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span>🏪</span>
                <span className="font-semibold">{t('apothekePickup')}</span>
              </div>
              <span className="text-xs text-slate-500">{t('apothekePickupDesc')}</span>
            </div>
          </RadioCard>
        </Stack>
      </Stack>

      <Footer>
        <Button
          size="lg"
          variant={hasSelection ? 'primary' : 'secondary'}
          className={`w-full ${!hasSelection ? 'opacity-50' : ''}`}
          data-flow-target="Button:Continue"
        >
          {t('continue')}
        </Button>
      </Footer>
    </>
  )
}
