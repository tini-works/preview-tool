export type LoginFormData = {
  state: 'idle' | 'filling' | 'error' | 'success'
}

export const regions = {
  login: {
    label: 'Login',
    states: {
      idle: { state: 'idle' } satisfies LoginFormData,
      filling: { state: 'filling' } satisfies LoginFormData,
      error: { state: 'error' } satisfies LoginFormData,
      success: { state: 'success' } satisfies LoginFormData,
    },
    defaultState: 'idle',
  },
}
