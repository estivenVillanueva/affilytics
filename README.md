# Affilytics — Shopify Affiliate & Commission MVP

Esta app implementa el MVP descrito en la prueba técnica Converxity: **afiliados** con código único, **campañas** (slug + afiliado + enlaces `?ref=` + `&c=`), tracking en storefront, **Web Pixel** en `checkout_completed` con **reporte JSON** (totales, moneda, líneas resumidas), registro en backend, facturación por **usage** (5% sobre venta referida) con plan **capped** al abrir el Admin, y dashboard de métricas.

### Instalación y ejecución local

1. Clonar el repositorio e instalar dependencias: `npm install`
2. Copiar variables de entorno: `SHOPIFY_*`, `SHOPIFY_APP_URL`, `CONVERSION_WEBHOOK_SECRET`, opcional `CONVERSION_API_KEY`, `SHOPIFY_BILLING_TEST=true`. Si usas `SCOPES` en `.env`, debe ser **coherente** con `shopify.app.toml` (el CLI suele sincronizar desde el TOML).
3. Aplicar migraciones: `npx prisma migrate deploy` (o `npm run setup`)
4. Ejecutar: `npm run dev` / `shopify app dev`
5. Instalar la app en una tienda de desarrollo. Al abrir `/app`, Shopify solicitará el **plan de uso con tope** (100 USD / periodo en `app/shopify.server.ts`), **salvo** que actives `SHOPIFY_SKIP_BILLING=true` (ver siguiente sección).

### Facturación (scopes protegidos de Shopify)

Los scopes `read_own_subscription_contracts` y `write_own_subscription_contracts` son **protegidos**: si los pones en `shopify.app.toml` **antes** de que Partner Dashboard apruebe el acceso (tarjeta *Subscription APIs* en **API access**), `shopify app dev` falla con *Error updating dev preview* / `app_access`.

- **Desarrollo sin aprobación aún:** por defecto el código **omite** el billing si `NODE_ENV` no es `production` y no pones `SHOPIFY_REQUIRE_BILLING=true`. También puedes forzar `SHOPIFY_SKIP_BILLING=true` en `.env`. La app carga el Admin sin `billing.require`; los **usage charges** no se crearán hasta que haya suscripción activa.
- **Probar billing en local** (tras aprobación Partner + scopes en el TOML): `SHOPIFY_REQUIRE_BILLING=true`, sin `SHOPIFY_SKIP_BILLING`, `NODE_ENV=development` — entonces sí se ejecuta `billing.require`.
- **Producción / prueba completa de billing:** en [Partner Dashboard](https://partners.shopify.com) → tu app → **API access** → solicita acceso a **Subscription APIs**; cuando Shopify lo permita, añade esos dos scopes a `shopify.app.toml` (y a `SCOPES` si lo usas), quita `SHOPIFY_SKIP_BILLING`, vuelve a ejecutar `shopify app dev` y **reautoriza** la app en la tienda.
6. **Web Pixel**: en el admin de la tienda, conectar la extensión `affiliate-pixel` y rellenar ajustes:
   - **Conversion API URL**: `https://<tu-app>/api/conversion`
   - **Signing secret**: el mismo valor que `CONVERSION_WEBHOOK_SECRET` en el servidor
   - **Optional API key**: si defines `CONVERSION_API_KEY` en el servidor, mismo valor aquí
7. **Theme app extension** `affiliate-tracker`: añade el bloque al tema para persistir `affiliate_ref` y opcionalmente `affiliate_campaign` (localStorage + cookie). URLs típicas: `?ref=CODIGO` y, si usas campañas en la app, `?ref=CODIGO&c=slug-campaña` (también admite `campaign` o `camp` como nombre de query).
8. **Campañas** (Admin → Campañas): crea un slug por tienda, asígnalo a un afiliado y copia el enlace sugerido. El Web Pixel envía `campaignSlug` y el backend valida que el slug exista, esté activo y pertenezca al mismo afiliado que `ref`.
9. **Firma HMAC (v2)**: el mensaje firmado incluye `shop|orderId|amount|timestamp|affiliateCode|campaignSlug` para que no se pueda alterar el cuerpo del POST sin invalidar la firma. Tras desplegar, **vuelve a guardar** los ajustes del pixel si ya lo tenías configurado.

### Arquitectura (resumen)

- **Admin (React Router + TS)**: rutas embebidas; Polaris vía **Polaris Web Components** (`s-page`, etc.) y App Bridge del template.
- **Datos (SQLite + Prisma)**: `Affiliate`, `Campaign` (slug único por tienda, afiliado, activa), `Referral` (opcional `campaignId`, JSON `conversionReport`, `@@unique([shop, orderId])`, importes 5% app vs payout afiliado).
- **Storefront**: extensión de tema guarda ref y campaña; **Web Pixel** envía `report` + firma HMAC-SHA256 al endpoint público `POST /api/conversion`.
- **Facturación**: plan de billing `USAGE` con **capped amount** (100 USD) definido en `shopifyApp({ billing })`; cargos por evento con `appUsageRecordCreate` usando la moneda de la tienda.

### Idempotencia y concurrencia

- `Referral` tiene `@@unique([shop, orderId])`. Duplicados (reintentos del pixel o carreras) se ignoran sin doble cargo.

### DevOps / entornos (sustentación breve)

- **dev**: túnel Shopify CLI + SQLite local.
- **staging/prod**: misma app en Partner Dashboard con URLs y env vars por entorno; base PostgreSQL recomendada; secretos en el proveedor (GitHub Actions OIDC, Doppler, etc.).
- **CI/CD sugerido**: `npm ci` → `npm run lint` → `npm run typecheck` → `npm run build` → `prisma migrate deploy` → deploy (Fly/Render/GCR) con healthcheck HTTP `/` o ruta dedicada.
- **Rotación de secretos**: rotar `CONVERSION_WEBHOOK_SECRET` y el valor en ajustes del pixel; ventana de solapamiento corta si se versiona el header.

### Migración de SQLite a escala

- PostgreSQL + índices por `(shop, createdAt)` para reporting; partición por mes en `Referral` si hay millones de filas; cola (SQS/BullMQ) para billing asíncrono con idempotencia por `orderId`+`shop`.

---

# Shopify App Template - React Router

This is a template for building a [Shopify app](https://shopify.dev/docs/apps/getting-started) using [React Router](https://reactrouter.com/). It was forked from the [Shopify Remix app template](https://github.com/Shopify/shopify-app-template-remix) and converted to React Router.

Rather than cloning this repo, follow the [Quick Start steps](https://github.com/Shopify/shopify-app-template-react-router#quick-start).

Visit the [`shopify.dev` documentation](https://shopify.dev/docs/api/shopify-app-react-router) for more details on the React Router app package.

## Upgrading from Remix

If you have an existing Remix app that you want to upgrade to React Router, please follow the [upgrade guide](https://github.com/Shopify/shopify-app-template-react-router/wiki/Upgrading-from-Remix). Otherwise, please follow the quick start guide below.

## Quick start

### Prerequisites

Before you begin, you'll need to [download and install the Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started) if you haven't already.

### Setup

```shell
shopify app init --template=https://github.com/Shopify/shopify-app-template-react-router
```

### Local Development

```shell
shopify app dev
```

Press P to open the URL to your app. Once you click install, you can start development.

Local development is powered by [the Shopify CLI](https://shopify.dev/docs/apps/tools/cli). It logs into your account, connects to an app, provides environment variables, updates remote config, creates a tunnel and provides commands to generate extensions.

### Authenticating and querying data

To authenticate and query data you can use the `shopify` const that is exported from `/app/shopify.server.js`:

```js
export async function loader({ request }) {
  const { admin } = await shopify.authenticate.admin(request);

  const response = await admin.graphql(`
    {
      products(first: 25) {
        nodes {
          title
          description
        }
      }
    }`);

  const {
    data: {
      products: { nodes },
    },
  } = await response.json();

  return nodes;
}
```

This template comes pre-configured with examples of:

1. Setting up your Shopify app in [/app/shopify.server.ts](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/shopify.server.ts)
2. Querying data using Graphql. Please see: [/app/routes/app.\_index.tsx](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/routes/app._index.tsx).
3. Responding to webhooks. Please see [/app/routes/webhooks.tsx](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/routes/webhooks.app.uninstalled.tsx).
4. Using metafields, metaobjects, and declarative custom data definitions. Please see [/app/routes/app.\_index.tsx](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/routes/app._index.tsx) and [shopify.app.toml](https://github.com/Shopify/shopify-app-template-react-router/blob/main/shopify.app.toml).

Please read the [documentation for @shopify/shopify-app-react-router](https://shopify.dev/docs/api/shopify-app-react-router) to see what other API's are available.

## Shopify Dev MCP

This template is configured with the Shopify Dev MCP. This instructs [Cursor](https://cursor.com/), [GitHub Copilot](https://github.com/features/copilot) and [Claude Code](https://claude.com/product/claude-code) and [Google Gemini CLI](https://github.com/google-gemini/gemini-cli) to use the Shopify Dev MCP.

For more information on the Shopify Dev MCP please read [the documentation](https://shopify.dev/docs/apps/build/devmcp).

## Deployment

### Application Storage

This template uses [Prisma](https://www.prisma.io/) to store session data, by default using an [SQLite](https://www.sqlite.org/index.html) database.
The database is defined as a Prisma schema in `prisma/schema.prisma`.

This use of SQLite works in production if your app runs as a single instance.
The database that works best for you depends on the data your app needs and how it is queried.
Here’s a short list of databases providers that provide a free tier to get started:

| Database   | Type             | Hosters                                                                                                                                                                                                                                    |
| ---------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MySQL      | SQL              | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-mysql), [Planet Scale](https://planetscale.com/), [Amazon Aurora](https://aws.amazon.com/rds/aurora/), [Google Cloud SQL](https://cloud.google.com/sql/docs/mysql) |
| PostgreSQL | SQL              | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-postgresql), [Amazon Aurora](https://aws.amazon.com/rds/aurora/), [Google Cloud SQL](https://cloud.google.com/sql/docs/postgres)                                   |
| Redis      | Key-value        | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-redis), [Amazon MemoryDB](https://aws.amazon.com/memorydb/)                                                                                                        |
| MongoDB    | NoSQL / Document | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-mongodb), [MongoDB Atlas](https://www.mongodb.com/atlas/database)                                                                                                  |

To use one of these, you can use a different [datasource provider](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference#datasource) in your `schema.prisma` file, or a different [SessionStorage adapter package](https://github.com/Shopify/shopify-api-js/blob/main/packages/shopify-api/docs/guides/session-storage.md).

### Build

Build the app by running the command below with the package manager of your choice:

Using yarn:

```shell
yarn build
```

Using npm:

```shell
npm run build
```

Using pnpm:

```shell
pnpm run build
```

## Hosting

When you're ready to set up your app in production, you can follow [our deployment documentation](https://shopify.dev/docs/apps/launch/deployment) to host it externally. From there, you have a few options:

- [Google Cloud Run](https://shopify.dev/docs/apps/launch/deployment/deploy-to-google-cloud-run): This tutorial is written specifically for this example repo, and is compatible with the extended steps included in the subsequent [**Build your app**](tutorial) in the **Getting started** docs. It is the most detailed tutorial for taking a React Router-based Shopify app and deploying it to production. It includes configuring permissions and secrets, setting up a production database, and even hosting your apps behind a load balancer across multiple regions.
- [Fly.io](https://fly.io/docs/js/shopify/): Leverages the Fly.io CLI to quickly launch Shopify apps to a single machine.
- [Render](https://render.com/docs/deploy-shopify-app): This tutorial guides you through using Docker to deploy and install apps on a Dev store.
- [Manual deployment guide](https://shopify.dev/docs/apps/launch/deployment/deploy-to-hosting-service): This resource provides general guidance on the requirements of deployment including environment variables, secrets, and persistent data.

When you reach the step for [setting up environment variables](https://shopify.dev/docs/apps/deployment/web#set-env-vars), you also need to set the variable `NODE_ENV=production`.

## Gotchas / Troubleshooting

### Database tables don't exist

If you get an error like:

```
The table `main.Session` does not exist in the current database.
```

Create the database for Prisma. Run the `setup` script in `package.json` using `npm`, `yarn` or `pnpm`.

### Navigating/redirecting breaks an embedded app

Embedded apps must maintain the user session, which can be tricky inside an iFrame. To avoid issues:

1. Use `Link` from `react-router` or `@shopify/polaris`. Do not use `<a>`.
2. Use `redirect` returned from `authenticate.admin`. Do not use `redirect` from `react-router`
3. Use `useSubmit` from `react-router`.

This only applies if your app is embedded, which it will be by default.

### Webhooks: shop-specific webhook subscriptions aren't updated

If you are registering webhooks in the `afterAuth` hook, using `shopify.registerWebhooks`, you may find that your subscriptions aren't being updated.

Instead of using the `afterAuth` hook declare app-specific webhooks in the `shopify.app.toml` file. This approach is easier since Shopify will automatically sync changes every time you run `deploy` (e.g: `npm run deploy`). Please read these guides to understand more:

1. [app-specific vs shop-specific webhooks](https://shopify.dev/docs/apps/build/webhooks/subscribe#app-specific-subscriptions)
2. [Create a subscription tutorial](https://shopify.dev/docs/apps/build/webhooks/subscribe/get-started?deliveryMethod=https)

If you do need shop-specific webhooks, keep in mind that the package calls `afterAuth` in 2 scenarios:

- After installing the app
- When an access token expires

During normal development, the app won't need to re-authenticate most of the time, so shop-specific subscriptions aren't updated. To force your app to update the subscriptions, uninstall and reinstall the app. Revisiting the app will call the `afterAuth` hook.

### Webhooks: Admin created webhook failing HMAC validation

Webhooks subscriptions created in the [Shopify admin](https://help.shopify.com/en/manual/orders/notifications/webhooks) will fail HMAC validation. This is because the webhook payload is not signed with your app's secret key.

The recommended solution is to use [app-specific webhooks](https://shopify.dev/docs/apps/build/webhooks/subscribe#app-specific-subscriptions) defined in your toml file instead. Test your webhooks by triggering events manually in the Shopify admin(e.g. Updating the product title to trigger a `PRODUCTS_UPDATE`).

### Webhooks: Admin object undefined on webhook events triggered by the CLI

When you trigger a webhook event using the Shopify CLI, the `admin` object will be `undefined`. This is because the CLI triggers an event with a valid, but non-existent, shop. The `admin` object is only available when the webhook is triggered by a shop that has installed the app. This is expected.

Webhooks triggered by the CLI are intended for initial experimentation testing of your webhook configuration. For more information on how to test your webhooks, see the [Shopify CLI documentation](https://shopify.dev/docs/apps/tools/cli/commands#webhook-trigger).

### Incorrect GraphQL Hints

By default the [graphql.vscode-graphql](https://marketplace.visualstudio.com/items?itemName=GraphQL.vscode-graphql) extension for will assume that GraphQL queries or mutations are for the [Shopify Admin API](https://shopify.dev/docs/api/admin). This is a sensible default, but it may not be true if:

1. You use another Shopify API such as the storefront API.
2. You use a third party GraphQL API.

If so, please update [.graphqlrc.ts](https://github.com/Shopify/shopify-app-template-react-router/blob/main/.graphqlrc.ts).

### Using Defer & await for streaming responses

By default the CLI uses a cloudflare tunnel. Unfortunately cloudflare tunnels wait for the Response stream to finish, then sends one chunk. This will not affect production.

To test [streaming using await](https://reactrouter.com/api/components/Await#await) during local development we recommend [localhost based development](https://shopify.dev/docs/apps/build/cli-for-apps/networking-options#localhost-based-development).

### "nbf" claim timestamp check failed

This is because a JWT token is expired. If you are consistently getting this error, it could be that the clock on your machine is not in sync with the server. To fix this ensure you have enabled "Set time and date automatically" in the "Date and Time" settings on your computer.

### Using MongoDB and Prisma

If you choose to use MongoDB with Prisma, there are some gotchas in Prisma's MongoDB support to be aware of. Please see the [Prisma SessionStorage README](https://www.npmjs.com/package/@shopify/shopify-app-session-storage-prisma#mongodb).

### Unable to require(`C:\...\query_engine-windows.dll.node`).

Unable to require(`C:\...\query_engine-windows.dll.node`).
The Prisma engines do not seem to be compatible with your system.

query_engine-windows.dll.node is not a valid Win32 application.

**Fix:** Set the environment variable:

```shell
PRISMA_CLIENT_ENGINE_TYPE=binary
```

This forces Prisma to use the binary engine mode, which runs the query engine as a separate process and can work via emulation on Windows ARM64.

## Resources

React Router:

- [React Router docs](https://reactrouter.com/home)

Shopify:

- [Intro to Shopify apps](https://shopify.dev/docs/apps/getting-started)
- [Shopify App React Router docs](https://shopify.dev/docs/api/shopify-app-react-router)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
- [Shopify App Bridge](https://shopify.dev/docs/api/app-bridge-library).
- [Polaris Web Components](https://shopify.dev/docs/api/app-home/polaris-web-components).
- [App extensions](https://shopify.dev/docs/apps/app-extensions/list)
- [Shopify Functions](https://shopify.dev/docs/api/functions)

Internationalization:

- [Internationalizing your app](https://shopify.dev/docs/apps/best-practices/internationalization/getting-started)
