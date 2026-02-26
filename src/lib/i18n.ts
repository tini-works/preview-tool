import i18n from "i18next"
import { initReactI18next } from "react-i18next"

const localeModules = import.meta.glob("@/locales/**/*.json", { eager: true })

const resources: Record<string, Record<string, unknown>> = {}

for (const [path, module] of Object.entries(localeModules)) {
  const match = path.match(/\/locales\/(\w+)\/(\w+)\.json$/)
  if (!match) continue

  const [, lang, namespace] = match
  resources[lang] ??= {}
  resources[lang][namespace] = (module as { default: unknown }).default
}

i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
})

export default i18n
