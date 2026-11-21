# MailFlow M3

MailFlow M3 is an independently maintained Material 3 web frontend derived from [MailFlow by Matthias and contributors](https://github.com/maathimself/mailflow). It uses the upstream React frontend as its base and supports the [MailFlow v4.5.1](https://github.com/maathimself/mailflow/releases/tag/v4.5.1) backend. It adds a Material UI, Korean localization, appearance sync, and PWA notification controls.

Use the [MailFlow M3 backend](../backend/) in this repository for appearance synchronization, instance branding, message metadata and previews, and the push notification extensions.

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

Set `VITE_FRONTEND_SOURCE_URL` and `VITE_BACKEND_SOURCE_URL` at build time to URLs for the exact deployed commits or release tags. Settings → About shows both links. Docker and Compose accept the same values as build arguments.

## Frontend releases

The frontend version shown in Settings → About comes from `package.json`. Before releasing a user-visible change, choose the next frontend version and update `package.json` and the root version entries in `package-lock.json` together. Use a patch release for fixes and a minor release for new features. After verification, create a new `vMAJOR.MINOR.PATCH` tag on the release commit, such as `v0.2.0` for version `0.2.0`. Keep published tags on their original commits.

## License

MailFlow M3 is distributed under the [GNU Affero General Public License v3](LICENSE), with no warranty. The [upstream commercial license text](LICENSE-COMMERCIAL) records the original author's separate licensing option for upstream MailFlow.

See [third-party notices](public/licenses/THIRD-PARTY.md) for the bundled fonts and icons.
