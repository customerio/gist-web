export function findElement(selector: string): HTMLElement | null {
  try {
    const element = document.getElementById(selector) ?? document.querySelector(selector);
    return (element as HTMLElement) || null;
  } catch {
    return null;
  }
}

/**
 * Resolves with the element once it appears in the DOM, or null after the
 * timeout. Used for tour continuations: after a cross-page hop the queue check
 * usually beats the app rendering a tooltip/inline anchor, so a one-shot
 * lookup would fail on exactly the step that just navigated (INAPP-14575).
 */
export function waitForElement(selector: string, timeoutMs: number): Promise<HTMLElement | null> {
  const immediate = findElement(selector);
  if (immediate) {
    return Promise.resolve(immediate);
  }

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const element = findElement(selector);
      if (element) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(element);
      }
    });

    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);

    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Partial<HTMLElementTagNameMap[K]> & { [k: string]: unknown } = {}
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    (element as Record<string, unknown>)[k] = v;
  }
  return element;
}

export function injectStylesheet(id: string, css: string): void {
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

export function appendToBody(element: HTMLElement): void {
  if (document.body) {
    document.body.appendChild(element);
  } else {
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(element), {
      once: true,
    });
  }
}
