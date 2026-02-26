import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import {
  ScreenHeader,
  Stack,
  Card,
  Badge,
  Note,
  Footer,
  Button,
} from '@/components/screen'
import { Stepper } from '../_shared/Stepper'
import type { PrescriptionListData } from './scenarios'

const statusVariant = {
  ready: 'success',
  pending: 'warning',
  expired: 'error',
} as const

export default function PrescriptionListScreen({ data }: { data: PrescriptionListData }) {
  const { view, insurer, memberId, prescriptions, selectedIds } = data
  const { t } = useTranslation('prescription-list')

  const steps = [
    t('steps.scan'),
    t('steps.select'),
    t('steps.delivery'),
    t('steps.location'),
    t('steps.confirm'),
  ]

  const readyCount = prescriptions.filter((p) => p.status === 'ready').length

  return (
    <>
      <ScreenHeader
        title={t('title')}
        data-flow-target="ScreenHeader:Your Prescriptions"
      />

      <Stepper current={1} steps={steps} />

      {view === 'loading' && (
        <>
          <Stack gap="md" className="p-4">
            <Card>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>🏥</span>
                <span>{insurer}</span>
                <span className="text-xs text-slate-400">{memberId}</span>
              </div>
            </Card>
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-2 text-slate-500">
                <Loader2 className="size-4 animate-spin" />
                <span className="text-sm">{t('loading')}</span>
              </div>
            </div>
          </Stack>

          <Footer>
            <Button
              variant="secondary"
              size="lg"
              className="w-full opacity-50"
            >
              {t('continue')}
            </Button>
          </Footer>
        </>
      )}

      {view === 'empty' && (
        <>
          <Stack gap="md" className="p-4">
            <Card>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>🏥</span>
                <span>{insurer}</span>
                <span className="text-xs text-slate-400">{memberId}</span>
              </div>
            </Card>
            <Note type="info">{t('noResults')}</Note>
          </Stack>

          <Footer>
            <Button
              variant="secondary"
              size="lg"
              className="w-full opacity-50"
            >
              {t('continue')}
            </Button>
          </Footer>
        </>
      )}

      {view === 'populated' && (
        <>
          <Stack gap="md" className="p-4">
            <Card>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>🏥</span>
                <span>{insurer}</span>
                <span className="text-xs text-slate-400">{memberId}</span>
              </div>
            </Card>

            <div className="flex items-center gap-2 px-1">
              <div
                className={`flex size-5 items-center justify-center rounded border-2 text-xs ${
                  selectedIds.length === readyCount
                    ? 'border-teal-500 bg-teal-500 text-white'
                    : 'border-slate-300'
                }`}
              >
                {selectedIds.length === readyCount && '✓'}
              </div>
              <span className="text-sm text-charcoal-500">
                {t('selectAll', { count: readyCount })}
              </span>
            </div>

            <Stack gap="sm">
              {prescriptions.map((rx) => {
                const isSelected = selectedIds.includes(rx.id)
                const isDisabled = rx.status !== 'ready'

                return (
                  <Card
                    key={rx.id}
                    className={`p-4 ${isDisabled ? 'opacity-50' : ''} ${
                      isSelected ? 'border-2 border-teal-500 bg-teal-50' : ''
                    }`}
                  >
                    <div className="flex gap-3">
                      <div
                        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border-2 text-xs ${
                          isSelected
                            ? 'border-teal-500 bg-teal-500 text-white'
                            : isDisabled
                              ? 'border-slate-200 bg-slate-50'
                              : 'border-slate-300'
                        }`}
                      >
                        {isSelected && '✓'}
                      </div>
                      <div className="flex flex-1 flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-charcoal-500">
                            {rx.medication}
                          </span>
                          <Badge variant={statusVariant[rx.status]}>
                            {t(`status${rx.status.charAt(0).toUpperCase()}${rx.status.slice(1)}`)}
                          </Badge>
                        </div>
                        <span className="text-xs text-slate-500">{rx.dosage}</span>
                        <span className="text-xs text-slate-400">
                          {rx.doctor} · {rx.date}
                        </span>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </Stack>

            <p className="text-center text-xs text-slate-400">
              {t('selectedCount', {
                selected: selectedIds.length,
                total: prescriptions.length,
              })}
            </p>
          </Stack>

          <Footer>
            <Button
              size="lg"
              variant={selectedIds.length > 0 ? 'primary' : 'secondary'}
              className={`w-full ${selectedIds.length === 0 ? 'opacity-50' : ''}`}
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
