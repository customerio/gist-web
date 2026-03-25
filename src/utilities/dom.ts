export function findElement(selector: string): HTMLElement | null {
  try {
    const element = document.getElementById(selector) ?? document.querySelector(selector);
    return (element as HTMLElement) || null;
  } catch {
    return null;
  }
}
