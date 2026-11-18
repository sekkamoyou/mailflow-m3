# MailFlow M3

MailFlow M3 is an independently maintained Material 3 web frontend derived from [MailFlow by Matthias and contributors](https://github.com/maathimself/mailflow). It was adapted from the upstream React frontend and updated for [MailFlow v4.4.0](https://github.com/maathimself/mailflow/releases/tag/v4.4.0) (`1db523a`). Changes through 2026-11-18 include the Material UI, Korean localization, appearance sync, and PWA notification changes.

Use the [MailFlow backend fork](https://github.com/sekkamoyou/mailflow/tree/mailflow-m3) for appearance synchronization, instance branding, message metadata and previews, and the push notification extensions.

## Build and run

Use Node.js 22.22.2 or later in the 22.x series, or 24.15.0 or later in the 24.x series. The test runner also uses Python 3 and `ps`.

```sh
npm ci
MAILFLOW_BACKEND_URL=http://127.0.0.1:3000 npm run dev -- --host 127.0.0.1
npm run lint
npm test
npm run build
```

The dev server listens on `http://127.0.0.1:5174`. Set the backend's `APP_URL` and `FRONTEND_URL` for your deployment as described in the backend setup guide. For a deployment, serve `dist/` and route `/api`, `/ws`, `/oauth`, `/auth/oidc`, `/carddav`, and `/.well-known/carddav` to the backend. The included Dockerfile and Nginx configuration serve the frontend and proxy those routes.

Set `VITE_FRONTEND_SOURCE_URL` and `VITE_BACKEND_SOURCE_URL` at build time to URLs for the exact deployed commits or release tags. The sign-in screen and account menu show both links. Docker and Compose accept the same values as build arguments.

## License

MailFlow M3 is distributed under the [GNU Affero General Public License v3](LICENSE), with no warranty. The [upstream commercial license text](LICENSE-COMMERCIAL) records the original author's separate licensing option for upstream MailFlow.

See [third-party notices](public/licenses/THIRD-PARTY.md) for the bundled fonts and icons.
