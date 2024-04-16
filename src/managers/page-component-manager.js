import { log } from "../utilities/log";

export var positions = ["x-gist-top", "x-gist-floating-top", "x-gist-bottom", "x-gist-floating-bottom", "x-gist-floating-bottom-left", "x-gist-floating-bottom-right", "x-gist-floating-top-left", "x-gist-floating-top-right"];

export function addPageElement(position) {
  const element = document.createElement("div");
  element.id = position

  switch (position) {
    case "x-gist-top":
      document.body.insertBefore(element, document.body.firstChild);
      break;
    default:
      document.body.insertAdjacentElement("afterbegin", element);
      break;
  }

  log('Top & bottom elements injected into page');
}