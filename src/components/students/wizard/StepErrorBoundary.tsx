"use client";

import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  title: string;
  message: string;
};

type State = { hasError: boolean };

/**
 * Wraps just the current step's body (not the stepper/footer, which live
 * outside it) — a future step bug shows an inline message in place of that
 * step's content, with the rest of the modal (navigation, other steps'
 * already-entered data) staying intact, rather than the whole wizard going
 * blank. React only supports error boundaries via class components (no
 * hook equivalent exists), hence the one spot in this feature that isn't a
 * function component.
 *
 * Reset strategy: StudentWizard.tsx mounts this with `key={step}` — React
 * remounts (and clears hasError) on every step change by design, so an
 * error on step 3 doesn't linger once the user navigates elsewhere.
 */
export class StepErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }): void {
    // eslint-disable-next-line no-console -- intentional: this is the only signal a step crashed, with no other error-reporting pipeline wired up yet
    console.error("Add Student wizard step crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center gap-2 rounded-md border border-error/30 bg-error/10 px-4 py-10 text-center">
          <p className="text-sm font-semibold text-error">{this.props.title}</p>
          <p className="text-sm text-text-muted">{this.props.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
