import { trpc } from "@/lib/trpc";
import { PRICES, type ServicePrices } from "@shared/businessSupport";

/**
 * The prices the server will charge (businessCheck.prices), or undefined until they arrive or if they cannot be read.
 * Where a payment is being asked for, show nothing rather than a guess: a price the server did not confirm is never shown there.
 */
export function useServicePrices(): ServicePrices | undefined {
  return trpc.businessCheck.prices.useQuery(undefined, { staleTime: 60_000, retry: 1 }).data;
}

/** For copy that is not a payment prompt: the standard price until the server's arrive. */
export function useServicePricesOrDefault(): ServicePrices {
  return useServicePrices() ?? PRICES;
}
