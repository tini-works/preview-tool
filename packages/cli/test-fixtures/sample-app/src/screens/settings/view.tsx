import type { SettingsData } from './model'

interface SettingsViewProps {
  settings: SettingsData
  isSaving: boolean
  onUpdate: <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => void
  onSave: () => void
}

export function SettingsView({ settings, isSaving, onUpdate, onSave }: SettingsViewProps) {
  return (
    <div>
      <h1>Settings</h1>
      <div>
        <label>
          Name:
          <input
            value={settings.userName}
            onChange={e => onUpdate('userName', e.target.value)}
          />
        </label>
      </div>
      <div>
        <label>
          Email:
          <input
            value={settings.email}
            onChange={e => onUpdate('email', e.target.value)}
          />
        </label>
      </div>
      <div>
        <label>
          Notifications:
          <input
            type="checkbox"
            checked={settings.notifications}
            onChange={e => onUpdate('notifications', e.target.checked)}
          />
        </label>
      </div>
      <ul>
        {settings.items.map(item => (
          <li key={item.id}>
            {item.label}: {item.value}
          </li>
        ))}
      </ul>
      <button onClick={onSave} disabled={isSaving}>
        {isSaving ? 'Saving...' : 'Save'}
      </button>
    </div>
  )
}
