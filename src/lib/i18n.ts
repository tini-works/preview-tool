import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import enHelloWorld from "@/locales/en/helloWorld.json"
import deHelloWorld from "@/locales/de/helloWorld.json"

i18n.use(initReactI18next).init({
  resources: {
    en: { helloWorld: enHelloWorld },
    de: { helloWorld: deHelloWorld },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
})

export default i18n
