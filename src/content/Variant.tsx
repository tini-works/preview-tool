import { type ReactNode, createContext, useContext } from 'react'

interface VariantContextValue {
  activeState: string | null
}

const VariantContext = createContext<VariantContextValue>({
  activeState: null,
})

export function VariantProvider({
  activeState,
  children,
}: {
  activeState: string | null
  children: ReactNode
}) {
  return (
    <VariantContext.Provider value={{ activeState }}>
      {children}
    </VariantContext.Provider>
  )
}

interface VariantProps {
  state: string
  children: ReactNode
}

export function Variant({ state, children }: VariantProps) {
  const { activeState } = useContext(VariantContext)

  // If no active state is set, show the first variant (caller decides)
  // If active state matches this variant's state, render children
  if (activeState !== null && activeState !== state) {
    return null
  }

  return <>{children}</>
}
