import { useState } from "react"
import { FlaskConical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Scenario } from "@/hooks/use-scenarios"
import { cn } from "@/lib/utils"

type ScenarioSwitcherProps<T> = {
  scenarios: Record<string, Scenario<T>>
  activeKey: string
  onChange: (key: string) => void
}

export function ScenarioSwitcher<T>({
  scenarios,
  activeKey,
  onChange,
}: ScenarioSwitcherProps<T>) {
  const [isOpen, setIsOpen] = useState(false)

  if (!import.meta.env.DEV) return null

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isOpen ? (
        <Card className="w-56 shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <FlaskConical className="size-4" />
                Scenarios
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setIsOpen(false)}
              >
                &times;
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {Object.entries(scenarios).map(([key, scenario]) => (
              <button
                key={key}
                onClick={() => onChange(key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-left text-sm transition-colors",
                  key === activeKey
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent"
                )}
              >
                {scenario.label}
              </button>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsOpen(true)}
          title="Toggle scenario switcher"
        >
          <FlaskConical className="size-4" />
        </Button>
      )}
    </div>
  )
}
