import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import enHelloWorld from "@/locales/en/helloWorld.json"
import deHelloWorld from "@/locales/de/helloWorld.json"
import enProfile from "@/locales/en/profile.json"
import enPrescription from "@/locales/en/prescription.json"

i18n.use(initReactI18next).init({
  resources: {
    en: { helloWorld: enHelloWorld, profile: enProfile, prescription: enPrescription },
    de: { helloWorld: deHelloWorld },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
})

export default i18n
