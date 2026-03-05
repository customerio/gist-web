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
