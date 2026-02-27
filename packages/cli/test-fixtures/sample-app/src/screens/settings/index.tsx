import { useSettingsController } from './controller'
import { SettingsView } from './view'

export default function Settings() {
  const { settings, isSaving, updateSetting, save } = useSettingsController()

  return (
    <SettingsView
      settings={settings}
      isSaving={isSaving}
      onUpdate={updateSetting}
      onSave={save}
    />
  )
}
