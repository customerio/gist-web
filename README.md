# Gist for Web

## Testing

- Clone repo
- Run `npm start`
- Navigate to: `http://127.0.0.1:8081/examples/`

## Build Locally

- `npm run build:prod`

## Releases

### Feature release process

- Merge PR into develop
- Head over to the repo's feature release [action page](https://github.com/customerio/gist-web/actions/workflows/release_version.yml).
- Select **Run Workflow**
- Choose between:
    - *patch* - Bug fixes / hotfixes
    - *minor* - New features
    - *major* - New / replaced APIs (usually breaking)

### Hotfix release process

- Merge PR into master
- Head over to the repo's hotfix release [action page](https://github.com/customerio/gist-web/actions/workflows/release_hotfix.yml).
- Select **Run Workflow**

### Update Cloudflare

The above processes push the changes to NPM and GitHub. However, customers using our Track SDK fetch the latest version automatically; we accomplish this by routing through Cloudflare page rules.

- Head over to [Cloudflare](https://dash.cloudflare.com/) Page Rules section for the `gist.build` domain.
- Update `https://code.gist.build/web/latest/gist.min.js` for latest version
- Update `https://code.gist.build/web/beta/gist.min.js` for beta testing