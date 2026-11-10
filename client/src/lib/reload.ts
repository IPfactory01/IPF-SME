/** Reloads the page, so every screen asks the server again (after a preview starts or ends). Its own module for tests. */
export function reloadPage() {
  window.location.reload();
}
