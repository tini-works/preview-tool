import { Card, Input, Button, Note } from '@/components/screen'
import type { LoginFormData } from './scenarios'

export default function LoginFormScreen({ data }: { data: LoginFormData }) {
  if (data.state === 'success') {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-2xl font-bold">Login</h1>
        <Card>
          <Note type="success">Welcome back! Redirecting...</Note>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold">Login</h1>
      <Card>
        {data.state === 'error' && (
          <Note type="error" className="mb-4">
            Invalid email or password. Please try again.
          </Note>
        )}
        <Input label="Email" placeholder="you@example.com" />
        <Input label="Password" type="password" placeholder="Enter password" className="mt-3" />
        <Button className="mt-4">Sign In</Button>
        {data.state === 'filling' && (
          <p className="mt-2 text-sm text-neutral-500">Typing...</p>
        )}
      </Card>
    </div>
  )
}
