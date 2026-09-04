# Gist for Web

[![npm version](https://img.shields.io/npm/v/customerio-gist-web.svg?style=flat-square)](https://www.npmjs.com/package/customerio-gist-web)
[![GitHub Actions](https://img.shields.io/github/actions/workflow/status/customerio/gist-web/release_version.yml?branch=develop&style=flat-square)](https://github.com/customerio/gist-web/actions)
[![npm downloads](https://img.shields.io/npm/dm/customerio-gist-web.svg?style=flat-square)](https://www.npmjs.com/package/customerio-gist-web)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

> Build beautiful in-app flows with no code and deliver them instantly to your app/website. [Customer.io](https://customer.io)

## 🚀 Quick Start

### Installation

```bash
npm install customerio-gist-web
```

## 📌 Embedded messages

An embedded message is one the host page supplies directly, rather than one
delivered through a campaign or broadcast. The message travels in the page's own
markup, so it renders on a landing page that has no other Customer.io setup.

Declare a container and a payload block:

```html
<div data-cio-embed="emb_7Fq2xk"></div>
<script type="application/json" data-cio-embed-payload="emb_7Fq2xk">
  {
    "v": 1,
    "embedId": "emb_7Fq2xk",
    "display": { "frequency": "untilDismissed" },
    "message": {
      "messageId": "gist-html-9f2c8b",
      "properties": { "gist": { "encodedMessageHtml": "H4sIAAAA…" } }
    }
  }
</script>
```

`Gist.mountEmbeds()` renders every block on the page; `Gist.embed(payload)`
renders one programmatically. Both initialize the SDK in embed-only mode when
nothing else has set it up, and both are safe to call more than once — an embed
already rendered on the page is skipped, so a host can call them again after
injecting markup.

`frequency` decides how often the message comes back:

| Value              | Behaviour                                                                        |
| ------------------ | -------------------------------------------------------------------------------- |
| `always` (default) | Renders on every page load; closing hides it for that load only. Stores nothing. |
| `untilDismissed`   | Once closed, stays hidden — permanently, or for `reshowAfterMinutes`.            |
| `onceEver`         | Renders once per browser.                                                        |

A snooze is not a dismissal: `gist://snooze?showIn=<minutes>` hides the message
and shows it again once the time is up, whatever the frequency rule says.

Every embed's state lives in one key, `gist.web.embeds`, holding the ids that
must never render again and the ids hidden until a moment in time — so the whole
lot clears in one call:

```js
localStorage.removeItem('gist.web.embeds'); // or Gist.resetEmbed(embedId) for one
```

Any storage failure resolves to "render", so a blocked store can never leave a
hole in the customer's layout.

Embed-only mode (`Gist.setup({ embedOnly: true })`) starts none of the delivery
machinery: no user queue, SSE, guest session, inbox or preview session, and user
tokens are ignored. Leave it unset on a page that also receives in-app messages —
embeds and queue-delivered messages work side by side. `Gist.mountEmbeds()`
initializes this mode only when the page actually declares an embed, so a snippet
can call it unconditionally without disabling in-app delivery.

> **Note:** the wrapper the SDK injects around an inline message now uses
> `.gist-embed` / `.gist-embed-container` classes rather than ids, so more than
> one embed can share a page. Styles targeting `#gist-embed-container` need
> updating to the class selector.

## 🧪 Development

### Local Testing

1. Clone the repository
2. Install dependencies: `npm install`
3. Start the dev server: `npm start`
4. Navigate to: [`http://127.0.0.1:8081/examples/`](http://127.0.0.1:8081/examples/)

### Build Locally

```bash
npm run build:prod
```

### Scripts

- `npm test` - Run tests
- `npm run typecheck` - Type check the project
- `npm run lint` - Lint the codebase
- `npm run format` - Format code with Prettier

## 📦 Releases

### Feature Release Process

1. Merge PR into `develop` branch
2. Navigate to the [Feature Release Action](https://github.com/customerio/gist-web/actions/workflows/release_version.yml)
3. Click **Run Workflow**
4. Select version type:
   - **patch** - Bug fixes and minor updates
   - **minor** - New features and enhancements
   - **major** - Breaking changes or major API updates

### Hotfix Release Process

1. Merge PR into `master` branch
2. Navigate to the [Hotfix Release Action](https://github.com/customerio/gist-web/actions/workflows/release_hotfix.yml)
3. Click **Run Workflow**

---

<div align="center">
  <strong>Made with ❤️ by <a href="https://customer.io">Customer.io</a></strong>
</div>
