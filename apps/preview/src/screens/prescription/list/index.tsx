import { useTranslation } from 'react-i18next'
import {
  ScreenHeader,
  Stack,
  Card,
  Badge,
  Note,
  Footer,
  Button,
} from '@/components/screen'
import type { PrescriptionListData, Prescription } from './scenarios'

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

/* ─── Checkbox visual ─── */

function Checkbox({ checked, disabled }: { checked: boolean; disabled?: boolean }) {
  return (
    <div
      className={
        'flex size-5 shrink-0 items-center justify-center rounded border-2 ' +
        (checked
          ? 'border-teal-500 bg-teal-500'
          : disabled
            ? 'border-cream-400 bg-cream-200'
            : 'border-cream-500 bg-cream-50')
      }
    >
      {checked && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      )}
    </div>
  )
}

/* ─── Prescription Card ─── */

function PrescriptionCard({
  rx,
  selected,
  t,
}: {
  rx: Prescription
  selected: boolean
  t: (key: string) => string
}) {
  const isSelectable = rx.status === 'ready'
  const statusVariant =
    rx.status === 'ready' ? 'success' : rx.status === 'pending' ? 'warning' : 'error'
  const statusLabel =
    rx.status === 'ready'
      ? t('statusReady')
      : rx.status === 'pending'
        ? t('statusPending')
        : t('statusExpired')

  return (
    <Card
      className={
        'flex items-start gap-3 p-4' +
        (!isSelectable ? ' opacity-50' : '')
      }
    >
      <div className="pt-0.5">
        <Checkbox checked={selected && isSelectable} disabled={!isSelectable} />
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold text-charcoal-500">{rx.medication}</span>
          <Badge variant={statusVariant}>{statusLabel}</Badge>
        </div>
        <span className="text-xs text-charcoal-400">{rx.dosage}</span>
        <span className="text-xs text-slate-500">{rx.doctor}</span>
        <span className="text-xs text-slate-400">{rx.date}</span>
      </div>
    </Card>
  )
}

/* ─── Screen ─── */

export default function PrescriptionListScreen({
  data,
}: {
  data: PrescriptionListData
  flags?: Record<string, boolean>
}) {
  const { t } = useTranslation('prescription-list')
  const { view, insurer, memberId, prescriptions, selectedIds } = data

  const stepLabels = [t('stepScan'), t('stepSelect'), t('stepDelivery'), t('stepConfirm')]
  const readyCount = prescriptions.filter((rx) => rx.status === 'ready').length
  const selectedCount = selectedIds.length
  const hasSelection = selectedCount > 0

  return (
    <>
      <ScreenHeader
        title={t('title')}
        data-flow-target="ScreenHeader:Your Prescriptions"
      />

      <Stack gap="md" className="p-4 pb-24">
        {/* Stepper */}
        <Stepper activeStep={1} labels={stepLabels} />

        {/* Insurance info banner */}
        <Card className="flex items-center gap-3 p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm">
            🛡️
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-charcoal-400">{t('insurerLabel')}</span>
            <span className="text-sm font-semibold text-charcoal-500">{insurer}</span>
            <span className="text-xs text-slate-500">{memberId}</span>
          </div>
        </Card>

        {/* Loading state */}
        {view === 'loading' && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <div className="size-6 animate-spin rounded-full border-2 border-cream-400 border-t-teal-500" />
            <span className="text-sm text-slate-500">{t('loading')}</span>
          </div>
        )}

        {/* Empty state */}
        {view === 'empty' && (
          <Note type="info">
            <p className="font-medium">{t('noResults')}</p>
            <p className="mt-1 text-xs">{t('noResultsHint')}</p>
          </Note>
        )}

        {/* Populated state */}
        {view === 'populated' && (
          <>
            {/* Select all toggle */}
            <div className="flex items-center gap-3 px-1">
              <Checkbox checked={readyCount > 0 && selectedCount === readyCount} />
              <span className="text-sm font-medium text-charcoal-500">
                {t('selectAll', { count: readyCount })}
              </span>
            </div>

            {/* Prescription cards */}
            <Stack gap="sm">
              {prescriptions.map((rx) => (
                <PrescriptionCard
                  key={rx.id}
                  rx={rx}
                  selected={selectedIds.includes(rx.id)}
                  t={t}
                />
              ))}
            </Stack>

            {/* Selected count */}
            <p className="text-center text-sm text-slate-500">
              {t('selectedCount', { selected: selectedCount, total: readyCount })}
            </p>
          </>
        )}
      </Stack>

      {/* Footer */}
      <Footer>
        <Button
          data-flow-target="Button:Continue"
          variant={hasSelection ? 'primary' : 'secondary'}
          size="lg"
          className={'w-full' + (!hasSelection ? ' opacity-50' : '')}
          disabled={!hasSelection}
        >
          {t('continue')}
        </Button>
      </Footer>
    </>
  )
}
