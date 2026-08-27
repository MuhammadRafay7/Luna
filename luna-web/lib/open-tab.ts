/**
 * Opening a tab whose URL isn't known yet.
 *
 * `window.open(url, "_blank", "noopener")` returns null — noopener severs the
 * handle by design. That's fine when the URL is ready, but useless when we
 * need to open inside the click and navigate after an async lookup.
 *
 * So the placeholder is opened *without* noopener to keep the handle, and
 * `opener` is nulled immediately after navigating, which gives the same
 * protection without losing the reference.
 */

export type PendingTab = {
  /** Point the tab at its real destination. */
  settle: (url: string) => void;
  /** Give up and close the placeholder. */
  cancel: () => void;
  /** False when the popup blocker refused — caller should fall back to a chip. */
  ok: boolean;
};

export function openPendingTab(): PendingTab {
  let tab: Window | null = null;
  try {
    tab = window.open("about:blank", "_blank");
  } catch {
    tab = null;
  }

  return {
    ok: Boolean(tab),
    settle: (url: string) => {
      if (!tab || tab.closed) {
        // Placeholder is gone; try a direct open as a last resort.
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      try {
        tab.location.replace(url);
        tab.opener = null;
      } catch {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    },
    cancel: () => {
      try {
        if (tab && !tab.closed) tab.close();
      } catch {
        // Nothing to clean up.
      }
    },
  };
}
