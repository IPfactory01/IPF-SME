import { isRefusal } from "@/lib/readPolicy";
import { trpc } from "@/lib/trpc";

/**
 * The signed-in universal account (a person), or null. The server decides on every call: this is only a view of
 * the server's session, never a source of authority. Independent of the legacy platform-OAuth `useAuth`.
 */
export function useAccount() {
  const query = trpc.account.me.useQuery(undefined, { refetchOnWindowFocus: false });
  // A request that failed (no connection, a server fault) is not the same as being signed out: the signed-in pages
  // say so and offer Try again instead of sending the person to sign in (R69).
  const failed = Boolean(query.error) && !isRefusal(query.error) && query.data === undefined;
  return { account: query.data ?? null, loading: query.isLoading, failed, retrying: query.isFetching, refetch: query.refetch };
}
