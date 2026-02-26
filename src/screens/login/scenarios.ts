export type LoginFormData = {
  state: 'idle' | 'filling' | 'error' | 'success'
}

export const scenarios = {
  idle: {
    label: 'Empty login form',
    data: { state: 'idle' } satisfies LoginFormData,
  },
  filling: {
    label: 'User is typing credentials',
    data: { state: 'filling' } satisfies LoginFormData,
  },
  error: {
    label: 'Login failed with error message',
    data: { state: 'error' } satisfies LoginFormData,
  },
  success: {
    label: 'Login succeeded',
    data: { state: 'success' } satisfies LoginFormData,
  },
}
