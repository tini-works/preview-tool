import { useState, useCallback } from 'react'
import type { SettingsData } from './model'

const DEFAULT_SETTINGS: SettingsData = {
  userName: 'Anna Mueller',
  email: 'anna@example.de',
  notifications: true,
  theme: 'light',
  items: [
    { id: '1', label: 'Language', value: 'German' },
    { id: '2', label: 'Timezone', value: 'CET' },
  ],
}

export function useSettingsController() {
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS)
  const [isSaving, setIsSaving] = useState(false)

  const updateSetting = useCallback(
    <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
      setSettings(prev => ({ ...prev, [key]: value }))
    },
    []
  )

  const save = useCallback(async () => {
    setIsSaving(true)
    await new Promise(resolve => setTimeout(resolve, 500))
    setIsSaving(false)
  }, [])

  return { settings, isSaving, updateSetting, save }
}
