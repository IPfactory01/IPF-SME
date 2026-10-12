/**
 * The browser side of paying online. The pay page remembers itself for this tab before the owner leaves for
 * Paystack, so the return page can offer "Try again" if the payment is not completed; storage can be blocked, so
 * nothing depends on it.
 */
const RETURN_KEY = "ipf-pay-page";

export function rememberPayPage(path: string) {
  try {
    window.sessionStorage.setItem(RETURN_KEY, path);
  } catch {
    // Storage blocked: the return page points to the payment email instead.
  }
}

/** The pay page this tab came from, if it is one of ours. */
export function rememberedPayPage(): string | null {
  try {
    const path = window.sessionStorage.getItem(RETURN_KEY);
    return path && /^\/pay\/[^/?#]+\/[a-z_]+$/.test(path) ? path : null;
  } catch {
    return null;
  }
}

/** Sends the owner to Paystack's checkout. Only a secure address is followed. */
export function openCheckout(url: string) {
  if (!/^https:\/\//.test(url)) throw new Error("The payment page address is not secure.");
  window.location.assign(url);
}
