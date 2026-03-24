// Minimal ambient declaration for test fixture — not the real package types.
declare module 'react-hook-form' {
  export function useForm<T = Record<string, unknown>>(): {
    register: (name: string) => Record<string, unknown>
    handleSubmit: (fn: (data: T) => void) => (e: unknown) => void
    formState: { isDirty: boolean; isSubmitting: boolean; errors: Record<string, { message: string }> }
  }
}
