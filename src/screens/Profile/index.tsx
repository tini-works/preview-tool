import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import {
  ScreenHeader,
  Stack,
  Card,
  Avatar,
  Badge,
  ListItem,
  Note,
  Footer,
  Button,
} from '@/components/screen'
import type { ProfileData } from './scenarios'

export default function ProfileScreen({ data }: { data: ProfileData }) {
  const { isLoading, user, insurances, familyMembers, settings } = data
  const { t } = useTranslation('profile')

  if (isLoading) {
    return (
      <>
        <ScreenHeader title={t('title')} />
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex items-center gap-2 text-neutral-500">
            <Loader2 className="size-4 animate-spin" />
            <span>{t('loading')}</span>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <ScreenHeader title={t('title')} />

      <Stack gap="md" className="p-4 pb-20">
        {/* Avatar + Name Banner */}
        <div className="flex flex-col items-center gap-2 py-4">
          <Avatar initials={user.initials} size="lg" />
          <div className="text-center">
            <p className="text-lg font-semibold text-neutral-900">{user.fullName}</p>
            <p className="text-sm text-neutral-500">{user.email}</p>
          </div>
        </div>

        {/* Personal Information */}
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wider text-neutral-400">
            {t('personalInfo').toUpperCase()}
          </p>
          <Card className="overflow-hidden p-0">
            <ListItem
              icon="👤"
              label={t('fullName')}
              trailing={<span className="text-sm text-neutral-500">{user.fullName}</span>}
            />
            <ListItem
              icon="🎂"
              label={t('dateOfBirth')}
              trailing={<span className="text-sm text-neutral-500">{user.dateOfBirth}</span>}
            />
            <ListItem
              icon="⚥"
              label={t('gender')}
              trailing={<span className="text-sm text-neutral-500">{user.gender}</span>}
            />
            <ListItem
              icon="📱"
              label={t('phone')}
              trailing={<span className="text-sm text-neutral-500">{user.phone}</span>}
            />
            <ListItem
              icon="✉️"
              label={t('email')}
              trailing={<span className="text-sm text-neutral-500">{user.email}</span>}
            />
            <ListItem
              icon="📍"
              label={t('address')}
              trailing={<span className="text-sm text-neutral-500">{user.address}</span>}
            />
          </Card>
        </div>

        {/* Insurance */}
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wider text-neutral-400">
            {t('insurance').toUpperCase()}
          </p>
          {insurances.length === 0 ? (
            <Note type="info">{t('noInsurance')}</Note>
          ) : (
            <Card className="overflow-hidden p-0">
              {insurances.map((ins) => (
                <div
                  key={ins.memberId}
                  className="flex items-start gap-3 border-b border-neutral-100 px-4 py-3 last:border-b-0"
                >
                  <Badge>{ins.type}</Badge>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-medium text-neutral-900">{ins.insurer}</p>
                    <p className="text-xs text-neutral-500">{ins.memberId}</p>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>

        {/* Family Members */}
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wider text-neutral-400">
            {t('familyMembers').toUpperCase()}
          </p>
          {familyMembers.length === 0 ? (
            <Stack gap="sm">
              <Note type="info">{t('noFamily')}</Note>
              <Card className="overflow-hidden p-0">
                <ListItem
                  icon="+"
                  label={t('addFamilyMember')}
                />
              </Card>
            </Stack>
          ) : (
            <Card className="overflow-hidden p-0">
              {familyMembers.map((member) => (
                <div
                  key={member.name}
                  className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3 last:border-b-0"
                >
                  <Avatar initials={member.initials} size="sm" variant="secondary" />
                  <div className="flex flex-1 flex-col">
                    <span className="text-sm font-medium text-neutral-900">{member.name}</span>
                    <span className="text-xs text-neutral-500">{member.relationship}</span>
                  </div>
                  <svg className="size-4 shrink-0 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                </div>
              ))}
              <ListItem
                icon="+"
                label={t('addFamilyMember')}
              />
            </Card>
          )}
        </div>

        {/* Settings */}
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wider text-neutral-400">
            {t('settings').toUpperCase()}
          </p>
          <Card className="overflow-hidden p-0">
            <ListItem
              icon="🌐"
              label={t('language')}
              trailing={<span className="text-sm text-neutral-500">{settings.language}</span>}
            />
            <ListItem
              icon="🔔"
              label={t('notifications')}
              trailing={
                <span className="text-sm text-neutral-500">
                  {settings.notificationsEnabled ? t('notificationsOn') : t('notificationsOff')}
                </span>
              }
            />
          </Card>
        </div>
      </Stack>

      {/* Sticky Footer */}
      <Footer>
        <Button variant="primary" size="lg" className="w-full">
          {t('editProfile')}
        </Button>
      </Footer>
    </>
  )
}
