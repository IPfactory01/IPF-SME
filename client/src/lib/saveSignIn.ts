/**
 * Offer to save the sign-in in the browser's password manager once it has worked (ET, 16 November 2026). Our sign-in is
 * two steps on one page (password, then the two-step code) with no page load between them, so Chrome cannot tell it
 * worked and never offered to save. Handing the credential to the browser's own store (the Credential Management API)
 * makes Chrome ask "Save password?". The password goes to the browser's password manager only, never to a server, and
 * nothing is stored without the person saying yes. Browsers without the API (Safari, Firefox) carry on as before.
 * Never throws and never waits more than a moment, so it cannot hold up signing in.
 */
type PasswordCredentialConstructor = new (data: { id: string; password: string; name?: string }) => Credential;

export async function offerToSaveSignIn(email: string, password: string, name?: string | null) {
  try {
    const Maker = (window as unknown as { PasswordCredential?: PasswordCredentialConstructor }).PasswordCredential;
    if (!Maker || !navigator.credentials?.store || !email.trim() || !password) return false;
    const credential = new Maker({ id: email.trim(), password, ...(name ? { name } : {}) });
    await Promise.race([navigator.credentials.store(credential), new Promise(resolve => setTimeout(resolve, 1500))]);
    return true;
  } catch {
    return false;
  }
}
