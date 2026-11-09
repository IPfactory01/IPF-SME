/**
 * The app with its data providers and router: the same tree in the browser (main.tsx) and at build time
 * (entry-server.tsx), so the browser can take over a page rendered at build time without redrawing it (R70).
 */
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import React from "react";
import { Router } from "wouter";
import App from "./App";
import { trpc } from "./lib/trpc";

type TrpcClient = ReturnType<typeof trpc.createClient>;

/** `ssrPath`: the address being rendered at build time; in the browser the router reads the address bar. */
export function Root({ queryClient, trpcClient, ssrPath }: { queryClient: QueryClient; trpcClient: TrpcClient; ssrPath?: string }) {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Router ssrPath={ssrPath}>
          <App />
        </Router>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
