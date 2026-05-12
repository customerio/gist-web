export function findElement(selector: string): HTMLElement | null {
  try {
    const element = document.getElementById(selector) ?? document.querySelector(selector);
    return (element as HTMLElement) || null;
  } catch {
    return null;
  }
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
