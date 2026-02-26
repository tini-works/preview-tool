import { Card, Button, Note } from '@/components/screen'

export default function HelloScreen() {
  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold">Hello Preview Tool</h1>
      <p className="mb-4">This is a sample screen rendered inside a device frame.</p>

      <Card>
        <p>This card is a built-in screen component.</p>
        <Button className="mt-3">Click me</Button>
      </Card>

      <Note type="info" className="mt-4">
        Edit this file and watch it hot-reload inside the device frame.
      </Note>
    </div>
  )
}
