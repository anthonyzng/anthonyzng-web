import { Component, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  /** Rendered in place of `children` once one of them has thrown while rendering. */
  fallback: ReactNode
  children: ReactNode
}

interface ErrorBoundaryState {
  failed: boolean
}

/**
 * Keeps a render error (a lazy chunk that cannot be loaded) inside its own part of the page:
 * without a boundary React unmounts the whole root and leaves a blank tab. React logs the error.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
