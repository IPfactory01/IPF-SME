import { readRetryDelay, retryRead } from "@/lib/readPolicy";
import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot, hydrateRoot } from "react-dom/client";
import superjson from "superjson";
import { preloadPage } from "./App";
import { Root } from "./Root";
import { ADMIN_LOGIN_PATH } from "./adminLoginPath";
import "./index.css";

// Every read retries twice on a failed request, never on a refusal (lib/readPolicy.ts, design brief §5).
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: retryRead, retryDelay: readRetryDelay } } });

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  // Staff sign in with email and password; the old Manus OAuth redirect is no longer the default entry.
  if (window.location.pathname.startsWith(ADMIN_LOGIN_PATH)) return;
  window.location.href = ADMIN_LOGIN_PATH;
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

/*
 * A public page arrives already rendered (scripts/prerender.ts, R70): load that page's code, then take the HTML over
 * as it stands (hydrate) instead of drawing it again. Every other address starts from the empty shell.
 */
const container = document.getElementById("root")!;
const app = <Root queryClient={queryClient} trpcClient={trpcClient} />;
if (container.hasAttribute("data-prerendered")) {
  void preloadPage(window.location.pathname).then(() => hydrateRoot(container, app));
} else {
  createRoot(container).render(app);
}
