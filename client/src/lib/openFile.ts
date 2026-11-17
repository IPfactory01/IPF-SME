/**
 * Open a file in a new tab to look at it first (ET, 17 November 2026), as Drive and WhatsApp do; downloading is its own
 * button. The tab opens on the tap itself, then goes to the file once its short-lived link arrives: a tab opened only
 * after waiting is blocked as a pop-up on phones.
 */
export function openInNewTab(getUrl: () => Promise<string>) {
  const tab = typeof window !== "undefined" ? window.open("", "_blank") : null;
  if (tab) tab.opener = null;
  return getUrl()
    .then(url => {
      if (tab && !tab.closed) tab.location.href = url;
      else window.open(url, "_blank", "noopener");
    })
    .catch(error => {
      tab?.close();
      throw error;
    });
}
