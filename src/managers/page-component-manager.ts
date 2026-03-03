import { log } from "../utilities/log";

export const positions: readonly string[] = [
  "x-gist-top",
  "x-gist-floating-top",
  "x-gist-bottom",
  "x-gist-floating-bottom",
  "x-gist-floating-bottom-left",
  "x-gist-floating-bottom-right",
  "x-gist-floating-top-left",
  "x-gist-floating-top-right",
];

export function addPageElement(position: string): void {
  if (document.getElementById(position)) {
    return;
  }

  const element = document.createElement("div");
  element.id = position;

  switch (position) {
    case "x-gist-top":
      document.body.insertBefore(element, document.body.firstChild);
      break;
    default:
      document.body.insertAdjacentElement("beforeend", element);
      break;
  }

  log("Top & bottom elements injected into page");
}
