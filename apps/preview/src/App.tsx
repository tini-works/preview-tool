import { PreviewShell } from '@preview-tool/runtime'
import { useScreenModules } from '@/screens/useScreenModules'
import { useFlowRegistration } from '@/flow/useFlowRegistration'
import i18n from '@/lib/i18n'

function App() {
  const screens = useScreenModules()
  useFlowRegistration()

  return (
    <PreviewShell
      screens={screens}
      onLanguageChange={(lang) => i18n.changeLanguage(lang)}
    />
  )
}

export default App
