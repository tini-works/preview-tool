import { useTranslation } from 'react-i18next'
import {
  ScreenHeader,
  Button,
  Note,
  Footer,
} from '@/components/screen'
import { Stepper } from '../_shared/Stepper'
import type { PrescriptionScanData } from './scenarios'

export default function PrescriptionScanScreen({ data }: { data: PrescriptionScanData }) {
  const { state } = data
  const { t } = useTranslation('prescription-scan')

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
        data-flow-target="ScreenHeader:Redeem Prescription"
      />

      <Stepper current={0} steps={steps} />

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        {state === 'success' ? (
          <>
            <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-teal-100">
              <span className="text-4xl">✅</span>
            </div>
            <h2 className="mb-2 text-xl font-semibold text-charcoal-500">
              {t('success')}
            </h2>
          </>
        ) : state === 'error' ? (
          <>
            <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-coral-100">
              <span className="text-4xl">📱</span>
            </div>
            <h2 className="mb-2 text-xl font-semibold text-charcoal-500">
              {t('instruction')}
            </h2>
            <p className="mb-6 max-w-[280px] text-center text-sm text-slate-500">
              {t('subtitle')}
            </p>
            <Note type="error">{t('error')}</Note>
          </>
        ) : (
          <>
            <div
              className={`mb-6 flex size-20 items-center justify-center rounded-full bg-teal-100 ${
                state === 'scanning' ? 'animate-pulse' : ''
              }`}
            >
              <span className="text-4xl">📱</span>
            </div>
            <h2 className="mb-2 text-xl font-semibold text-charcoal-500">
              {state === 'scanning' ? t('scanning') : t('instruction')}
            </h2>
            {state === 'idle' && (
              <p className="max-w-[280px] text-center text-sm text-slate-500">
                {t('subtitle')}
              </p>
            )}
          </>
        )}
      </div>

      <p className="pb-2 text-center text-xs text-slate-400">
        {t('poweredBy')}
      </p>

      <Footer>
        {state === 'error' ? (
          <Button
            size="lg"
            className="w-full"
            data-flow-target="Button:Try Again"
          >
            {t('tryAgainBtn')}
          </Button>
        ) : (
          <Button
            size="lg"
            className={`w-full ${state === 'scanning' || state === 'success' ? 'opacity-50' : ''}`}
            variant={state === 'scanning' || state === 'success' ? 'secondary' : 'primary'}
            data-flow-target="Button:Simulate NFC Scan"
          >
            {t('simulateBtn')}
          </Button>
        )}
      </Footer>
    </>
  )
}
