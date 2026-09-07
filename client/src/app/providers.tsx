// client/src/app/providers.tsx

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { ReactNode } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },

    mutations: {
      retry: 0,
    },
  },
});

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
