import { useServicePricesOrDefault } from "@/lib/servicePrices";
import type { ServicePrices } from "@shared/businessSupport";
import type { PriceModel, Product } from "@shared/products";

/**
 * A product's price as the site shows it. The Full Report and the Business Review can be set on the server
 * (server/businessSupportPrices.ts), so their pages show the server's figure, the one that will be charged; every other
 * product's price is the catalogue's.
 */
export function displayPrice(product: Pick<Product, "id" | "price">, prices: ServicePrices): PriceModel {
  if (product.id === "full_report") return { kind: "fixed", amount: prices.fullReport };
  if (product.id === "business_review") return { kind: "fixed", amount: prices.currentState };
  return product.price;
}

export function useProductPrice(product: Pick<Product, "id" | "price">): PriceModel {
  return displayPrice(product, useServicePricesOrDefault());
}
