// client/src/app/ErrorBoundary.tsx

import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Veyra application error", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-white">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-danger/10 text-danger">
            !
          </div>

          <h1 className="mt-5 text-xl font-semibold">
            Veyra encountered an error
          </h1>

          <p className="mt-2 text-sm leading-6 text-zinc-500">
            The application recovered from an unexpected error. Reload the
            workspace to continue.
          </p>

          <div className="mt-6">
            <Button onClick={this.handleReload}>Reload workspace</Button>
          </div>

          {this.state.error?.message && (
            <p className="mt-5 break-words text-xs text-zinc-700">
              {this.state.error.message}
            </p>
          )}
        </div>
      </div>
    );
  }
}