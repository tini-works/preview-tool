import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

function App() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-4">
      <h1 className="text-4xl font-bold tracking-tight">Preview Tool</h1>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>
            Your app is set up with Vite + React + Tailwind CSS + shadcn/ui.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button>Get Started</Button>
          <Button variant="outline">Learn More</Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default App
