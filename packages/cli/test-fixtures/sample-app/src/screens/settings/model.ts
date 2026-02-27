export interface SettingsData {
  userName: string
  email: string
  notifications: boolean
  theme: 'light' | 'dark'
  items: SettingItem[]
}

export interface SettingItem {
  id: string
  label: string
  value: string
}
