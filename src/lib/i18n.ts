import i18n from "i18next"
import type { Resource } from "i18next"
import { initReactI18next } from "react-i18next"

const localeModules = import.meta.glob(
  "/src/screens/**/{en,de}.json",
  { eager: true }
)

const resources: Resource = {}

for (const [filePath, mod] of Object.entries(localeModules)) {
  const match = filePath.match(/\/src\/screens\/(.+)\/(en|de)\.json$/)
  if (!match) continue

  const namespace = match[1].replace(/\//g, "-")
  const lang = match[2]

  resources[lang] ??= {}
  resources[lang][namespace] = (mod as { default: Record<string, string> }).default
}

i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
})

export default i18n
