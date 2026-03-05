import { Component, type ReactNode, type ErrorInfo } from 'react'

interface ErrorBoundaryProps {
  fallback?: (error: Error) => ReactNode
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ScreenErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[PreviewTool] Screen render error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error)
      }

      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 max-w-lg">
            <h3 className="text-lg font-semibold text-red-800 mb-2">Screen Error</h3>
            <p className="text-sm text-red-700 mb-3">
              This screen crashed during rendering. It likely depends on providers
              not available in the preview environment.
            </p>
            <pre className="text-left text-xs bg-red-100 rounded p-3 overflow-auto max-h-40 text-red-900">
              {this.state.error.message}
            </pre>
            <p className="text-xs text-red-500 mt-3">
              Add missing providers in <code className="bg-red-100 px-1 rounded">.preview/wrapper.tsx</code>
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
