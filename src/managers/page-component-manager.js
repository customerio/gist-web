import { log } from "../utilities/log";

export var positions = ["gist-top-banner", "gist-floating-top-banner", "gist-bottom-banner", "gist-floating-bottom-banner", "gist-floating-bottom-left-banner", "gist-floating-bottom-right-banner", "gist-floating-top-left-banner", "gist-floating-top-right-banner"];

export function addPageElement(position) {
  const element = document.createElement("div");
  element.id = position

  switch (position) {
    case "gist-top-banner":
      document.body.insertBefore(element, document.body.firstChild);
      break;
    default:
      document.body.insertAdjacentElement("beforeend", element);
      break;
  }

  log('Top & bottom elements injected into page');
}