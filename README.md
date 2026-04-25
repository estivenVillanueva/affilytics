# Affilytics — Shopify Affiliate & Commission Engine

## 1. Stack Tecnológico

| Capa | Implementación actual en el proyecto |
|---|---|
| Framework | React Router (`react-router` + `@shopify/shopify-app-react-router`) |
| Language | TypeScript (app server/admin) + JavaScript (extensions Shopify) |
| Frontend | React + Polaris (`@shopify/polaris`) + Shopify App Bridge (`@shopify/app-bridge-react`) + Polaris Web Components existentes en navegación |
| Database | SQLite + Prisma ORM (`prisma/schema.prisma`) |
| Extensions | Web Pixel (`extensions/affiliate-pixel`) + Theme App Extension (`extensions/affiliate-tracker`) |
| Billing | Shopify Billing API configurado en código (`app/shopify.server.ts`) con plan usage capped |
| Security | HMAC-SHA256 + timestamp freshness + `x-api-key` opcional + validación de payload + aislamiento multi-tenant por `shop` |
| CI/CD | GitHub Actions (`.github/workflows/ci.yml`) con `lint`, `typecheck`, `build` |

---

## 2. Arquitectura General

```text

 Shopify Admin (Embedded App UI)                                         
  - /app (Dashboard)                                                     
  - /app/affiliates (CRUD afiliados)                                     
  - /app/campaigns (CRUD campañas)                                       

                 authenticate.admin + loaders/actions
                
 Backend React Router (Node)                                             
  - app/routes/api.conversion.ts (endpoint público conversión)           
  - app/services/conversion.server.ts (lógica negocio + billing usage)  
  - app/services/conversion-signature.server.ts (firma/verificación)    
 - app/shopify.server.ts (SDK Shopify + billing config)                 

                 Prisma Client
                
 SQLite (Prisma)                                                         
  - Session                                                                Affiliate                                                            
 - Campaign                                                             
  - Referral                                                             
  - Shop                                                                 

                
                 POST /api/conversion (signed)

 Storefront Extensions                                                   
 1) Theme extension (affiliate-tracker.js)                               
    - Captura ?ref y ?c                                                   
    - Persiste localStorage + cookie                                      
 2) Web Pixel (checkout_completed)                                        
    - Lee ref/campaign + total                                            
  - Firma HMAC y envía reporte al backend                               

```

---

## 3. Requisitos Previos

- Node.js (según `package.json`: `>=20.19 <22 || >=22.12`)
- npm
- Shopify CLI
- Cuenta de Shopify Partner
- Tienda de desarrollo para instalar la app
- (Para billing real) acceso aprobado a scopes protegidos de Subscription APIs en Partner Dashboard

---

## 4. Instalación y Ejecución Local

```bash
# 1) Clonar e instalar
git clone <tu-repo>
cd affilytics
npm install

# 2) Migraciones / setup Prisma
npx prisma migrate deploy
# opcional
npm run setup

# 3) Desarrollo
shopify app dev
# o
npm run dev
```

### Variables de entorno (`.env`)

> No exponer valores reales en repositorio público.

- `SHOPIFY_APP_URL`  
  URL pública actual del tunnel (Shopify CLI/Cloudflare).
- `CONVERSION_API_KEY`  
  API key opcional para endpoint `/api/conversion` (header `x-api-key`).
- `CONVERSION_WEBHOOK_SECRET`  
  Secreto compartido para HMAC del pixel/conversion endpoint.
- `SHOPIFY_SKIP_BILLING`  
  `true` para omitir `billing.require` en desarrollo.
- `SHOPIFY_REQUIRE_BILLING`  
  `true` para forzar billing en dev (si no se está omitiendo).
- `SHOPIFY_BILLING_TEST`  
  `true` para generar cargos de prueba.

Además, el runtime Shopify requiere variables típicas de OAuth/SDK (inyectadas por CLI o entorno):  
`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES` (ver `app/shopify.server.ts`).

### Instalar app en tienda dev

1. Ejecuta `shopify app dev`.
2. Abre la URL del admin que entrega CLI.
3. Instala la app embebida en la tienda de desarrollo.

---

## 5. ⚠️ Configuración del Web Pixel (LEER ANTES DE PROBAR)

### Por qué se rompe tras reiniciar `shopify app dev`

El tunnel (Cloudflare/CLI) cambia de dominio al reiniciar.  
El Web Pixel guarda `conversionApiUrl` en su configuración; si esa URL queda vieja, el `fetch` del pixel fallará.

### Qué hacer cada vez que cambia la URL

Actualizar settings del pixel en Admin GraphQL (GraphiQL app).

### a) Crear pixel por primera vez (`webPixelCreate`)

```graphql
mutation webPixelCreate($settings: JSON!) {
  webPixelCreate(webPixel: { settings: $settings }) {
    userErrors {
      field
      message
    }
    webPixel {
      id
      settings
    }
  }
}
```

Variables:

```json
{
  "settings": {
    "conversionApiUrl": "https://<TU_TUNNEL_ACTUAL>/api/conversion",
    "conversionSharedSecret": "<CONVERSION_WEBHOOK_SECRET>",
    "conversionApiKey": "<CONVERSION_API_KEY_OPCIONAL>"
  }
}
```

### b) Actualizar pixel en cada restart (`webPixelUpdate`)

Primero obtén el `id`:

```graphql
query {
  webPixel {
    id
    settings
  }
}
```

Luego actualiza:

```graphql
mutation webPixelUpdate($id: ID!, $settings: JSON!) {
  webPixelUpdate(id: $id, webPixel: { settings: $settings }) {
    userErrors {
      field
      message
    }
    webPixel {
      id
      settings
    }
  }
}
```

Variables:

```json
{
  "id": "gid://shopify/WebPixel/<ID>",
  "settings": {
    "conversionApiUrl": "https://<TU_TUNNEL_ACTUAL>/api/conversion",
    "conversionSharedSecret": "<CONVERSION_WEBHOOK_SECRET>",
    "conversionApiKey": "<CONVERSION_API_KEY_OPCIONAL>"
  }
}
```

> Los nombres de settings están definidos en `extensions/affiliate-pixel/shopify.extension.toml`:  
> `conversionApiUrl`, `conversionSharedSecret`, `conversionApiKey`.

---

## 6. Activar Theme App Extension

La extensión de tema está en `extensions/affiliate-tracker` y su bloque apunta a `target: "body"` (`blocks/Affiliate Tracker`).

Pasos:

1. En Shopify Admin, abre **Online Store > Themes > Customize**.
2. Ir a **App embeds / Incrustaciones de apps**.
3. Activar **Affiliate Tracker**.
4. Guardar cambios del tema.
5. Verificar en storefront que al abrir URL con `?ref=...` se persistan:
   - `localStorage["affiliate_ref"]`
   - cookie `affiliate_ref`
   - y opcional campaña (`affiliate_campaign`) si llega `?c=`/`?campaign=`/`?camp=`.

---

## 7. Probar el Flujo Completo

1. Crear afiliado en `/app/affiliates` (ej. `TESTAFF`, comisión `%`).
2. (Opcional) Crear campaña en `/app/campaigns` asociada al afiliado (slug).
3. Abrir storefront con:
   - `?ref=TESTAFF`
   - o `?ref=TESTAFF&c=slug-campaña`
4. En DevTools validar persistencia:
   - `localStorage`: `affiliate_ref`, `affiliate_campaign`
   - cookies equivalentes
5. Realizar compra de prueba con **Bogus Gateway** (tarjeta `1`).
6. En Network validar POST a `.../api/conversion` con **200 OK**.
7. Verificar dashboard `/app`:
   - Ventas referidas
   - Tarifa App (5%)
   - A pagar afiliados
8. Probar idempotencia enviando mismo `orderId` dos veces:
   - segunda vez debe devolver `Already processed`
   - no debe duplicar cobro ni referral.

---

## 8. Decisiones de Arquitectura

- **¿Por qué React Router?**  
  Es el stack base del template Shopify usado en el proyecto (`@shopify/shopify-app-react-router`) y centraliza loaders/actions por ruta (`app/routes/*`).

- **¿Por qué Web Pixel y no ScriptTags?**  
  El tracking de conversión usa extensión `web_pixel_extension` y evento estándar `checkout_completed` (`extensions/affiliate-pixel/src/index.js`), alineado con enfoque moderno de Shopify (sin ScriptTag legacy para checkout).

- **Idempotencia**  
  Se garantiza en DB por `@@unique([shop, orderId])` en `Referral` (`prisma/schema.prisma`) + chequeo previo en servicio (`createReferralFromConversion`) y manejo `P2002`.

- **Procesamiento asíncrono**  
  El endpoint recibe evento, valida y ejecuta flujo secuencial: persistir referral + crear usage record. No hay cola aún; sí hay tolerancia de fallos con estado `billingStatus` y reintentos GraphQL.

- **Verificación HMAC-SHA256**  
  Firma canónica: `shop|orderId|amount|timestamp|affiliateCode|campaignSlug` en `conversion-signature.server.ts`; comparación con `timingSafeEqual`; validación de frescura de timestamp (10 min).

- **Multi-tenancy**  
  Todas las consultas y constraints críticas incluyen `shop`:
  - `Affiliate @@unique([shop, code])`
  - `Campaign @@unique([shop, slug])`
  - `Referral @@unique([shop, orderId])`
  - filtros por `session.shop` en loaders/actions y por `shop` en endpoint público.

- **Retry de billing**  
  `graphqlWithRetry` (`conversion.server.ts`) con:
  - `BILLING_MAX_RETRIES = 3`
  - backoff exponencial desde `300ms`
  - logging contextual (`shop`, `orderId`, operación).

### Alternativas consideradas y descartadas

- **Remix vs React Router**: Remix fue considerado pero Shopify migró su 
  template oficial a React Router v7 en 2025-2026. Usar el template oficial 
  garantiza soporte, actualizaciones y mejor integración con el CLI.

- **Webhooks vs Web Pixel para tracking**: Los webhooks de Shopify para 
  orders/created fueron considerados pero presentan dos problemas: (1) no 
  tienen acceso al dato del afiliado capturado client-side, y (2) requieren 
  verificación de HMAC del lado del servidor de manera diferente. El Web Pixel 
  accede directamente al localStorage donde está affiliate_ref, lo que lo hace 
  la solución correcta.

- **ScriptTags vs Web Pixel**: ScriptTags es legacy y Shopify lo deprecará. 
  No tiene acceso al checkout moderno. Web Pixel es el estándar 2026.

- **MongoDB vs SQLite/PostgreSQL**: MongoDB fue considerado para almacenar 
  los reportes JSON de conversión, pero Prisma con SQLite/PostgreSQL permite 
  usar campos JSON nativos en PostgreSQL mientras mantiene constraints 
  relacionales críticos como @@unique([shop, orderId]) para idempotencia.

### Manejo de asincronía en facturación

El procesamiento de billing es intencionalmente tolerante a fallos:

1. El Referral se crea primero con billingStatus="FAILED"
2. Se intenta appUsageRecordCreate de forma asíncrona con await
3. Si tiene éxito, se actualiza billingStatus="SUCCESS"  
4. Si falla tras 3 reintentos, el Referral queda guardado con 
   billingStatus="FAILED" para reconciliación posterior
5. El endpoint siempre responde 200 OK al pixel aunque el billing falle,
   evitando reintentos innecesarios del pixel

Esta separación garantiza que nunca se pierda una conversión por un fallo 
temporal de la Billing API de Shopify.

En producción, esto evolucionaría a una cola (BullMQ/SQS) donde:
- El endpoint encola el evento y responde 202 Accepted inmediatamente
- Workers independientes procesan el billing con reintentos ilimitados
- Dead letter queue para eventos que fallan repetidamente

### Adaptación para alta concurrencia (Black Friday)

Ver sección 12 para el plan completo. Los cambios arquitectónicos clave son:
1. PostgreSQL con particionamiento por fecha reemplaza SQLite
2. Cola de mensajes desacopla el billing del request HTTP
3. Múltiples instancias stateless detrás de load balancer
4. El constraint @@unique([shop, orderId]) garantiza idempotencia 
   incluso con múltiples instancias procesando simultáneamente

---

## 9. Sustentación de Base de Datos

### Esquema actual (Prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:dev.sqlite"
}

model Session {
  id            String    @id
  shop          String
  state         String
  isOnline      Boolean   @default(false)
  scope         String?
  expires       DateTime?
  accessToken   String
  userId        BigInt?
  firstName     String?
  lastName      String?
  email         String?
  accountOwner  Boolean   @default(false)
  locale        String?
  collaborator  Boolean?  @default(false)
  emailVerified Boolean?  @default(false)
  refreshToken        String?
  refreshTokenExpires DateTime?
}

model Affiliate {
  id             String     @id @default(cuid())
  code           String
  shop           String
  commissionRate Float
  createdAt      DateTime   @default(now())
  referrals      Referral[]
  campaigns      Campaign[]

  @@index([shop])
  @@unique([shop, code])
}

model Campaign {
  id          String    @id @default(cuid())
  shop        String
  name        String
  slug        String
  affiliateId String
  active      Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  affiliate   Affiliate @relation(fields: [affiliateId], references: [id], onDelete: Cascade)
  referrals   Referral[]

  @@unique([shop, slug])
  @@index([shop])
  @@index([affiliateId])
}

model Referral {
  id                    String    @id @default(cuid())
  affiliateId           String
  campaignId            String?
  orderId               String
  shop                  String
  orderAmount           Float
  commissionAmount      Float
  appServiceFeeAmount   Float     @default(0)
  affiliatePayoutAmount Float     @default(0)
  billingStatus         String    @default("FAILED")
  conversionReport      String?
  createdAt             DateTime  @default(now())
  affiliate             Affiliate @relation(fields: [affiliateId], references: [id], onDelete: Cascade)
  campaign              Campaign? @relation(fields: [campaignId], references: [id], onDelete: SetNull)

  @@index([affiliateId])
  @@index([shop])
  @@index([campaignId])
  @@unique([shop, orderId])
}

model Shop {
  id        String   @id
  plan      String?
  createdAt DateTime @default(now())
}
```

### Justificación por modelo

- **Session**: persistencia OAuth online/offline (token lifecycle Shopify).
- **Affiliate**: entidad de comisión por merchant (`shop` + `code` únicos).
- **Campaign**: agrupación de iniciativas por afiliado.
- **Referral**: evento de conversión con importes separados (venta, fee app, payout afiliado), estado de billing y reporte JSON.
- **Shop**: metadata mínima por tienda (plan, timestamps).

### Integridad e idempotencia bajo concurrencia

`@@unique([shop, orderId])` evita duplicados por reintentos/carreras.  
Incluso si dos requests llegan simultáneamente, una inserción gana y la otra cae en conflicto `P2002`, que el servicio captura como `already_processed`.

### Estrategia de índices para millones de filas

Actualmente: índices por `shop`, `affiliateId`, `campaignId`.  
Para escala analítica, añadiría (en PostgreSQL):
- índice compuesto `(shop, createdAt)`
- índice parcial por `billingStatus` para pendientes/fallos
- tabla de eventos crudos separada si se desea retención histórica detallada.

### Migración SQLite → PostgreSQL

1. Cambiar datasource Prisma a PostgreSQL.
2. Generar y aplicar migraciones en nuevo entorno.
3. Backfill de datos históricos (ETL o dump/restore).
4. Ajustar pool de conexiones y observabilidad SQL.
5. Mantener mismos constraints únicos para conservar idempotencia.

### Consistencia entre reporte pixel y cargo billing

Flujo actual:
1. Se crea `Referral` con `billingStatus="FAILED"` + `conversionReport`.
2. Se intenta `appUsageRecordCreate`.
3. Si éxito, update a `billingStatus="SUCCESS"`.

Esto evita perder el evento de conversión aunque falle el cobro, permitiendo re-procesamiento posterior.

---

## 10. Sustentación de DevOps

### Gestión de Entornos

- **dev**  
  - Flujo: `shopify app dev` + tunnel dinámico + SQLite (`prisma/schema.prisma` con `provider = "sqlite"`).  
  - En `.env` actual se usa `SHOPIFY_SKIP_BILLING=true`, por lo que el loader de `app/routes/app.tsx` omite `billing.require` en local.  
  - La app en Partner Dashboard debe estar en modo de desarrollo (instalada en tiendas de desarrollo).

- **staging**  
  - Recomendado: app **separada** en Partner Dashboard (ej. `Affilytics (Staging)`), con credenciales propias.  
  - URL fija de staging y base PostgreSQL gestionada.  
  - Variables independientes por entorno (`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `DATABASE_URL`, etc. específicas de staging).  
  - Permite validar billing real sin impactar producción.  
  - Mantener `SHOPIFY_BILLING_TEST=true` para cargos de prueba.

- **prod**  
  - App publicada con distribución pública en Partner Dashboard.  
  - URL fija de producción, PostgreSQL de producción y secretos en proveedor (ej. Fly secrets / GitHub OIDC).  
  - `SHOPIFY_BILLING_TEST=false` y billing real activo.

Cada entorno debe tener su propio `.env` y su propia app en Partner Dashboard.  
Nunca compartir `SHOPIFY_API_SECRET` entre entornos.

### Estado actual vs Producción objetivo

| Estado actual | Producción objetivo |
|---|---|
| Desarrollo local con `shopify app dev` y tunnel dinámico | Entornos separados (staging/prod) con URL fija y app distinta en Partner Dashboard |
| SQLite en local | PostgreSQL gestionado con estrategias de escalado |
| Billing puede omitirse en dev (`SHOPIFY_SKIP_BILLING=true`) | Billing real activo con monitoreo y reconciliación |
| Retry inline en request de conversión | Cola + workers para desacoplar procesamiento bajo alta carga |
| Sin endpoint dedicado de health checks | Endpoints `/health/live` y `/health/ready` integrados en CI/CD y orquestador |

### Pipelines de CI/CD para despliegue seguro

Actualmente existe un pipeline de verificación en `.github/workflows/ci.yml` (`lint`, `typecheck`, `build`).  
Para un despliegue seguro a producción, se recomienda extenderlo a algo como:

```yaml
name: CI/CD
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run build
      - run: npx prisma validate

  deploy:
    needs: verify
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Fly.io
        uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
      - name: Run migrations
        run: flyctl ssh console -C "npx prisma migrate deploy"
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
      - name: Health check
        run: curl --fail https://affilytics.fly.dev/health
```

Justificación por etapa:
- **lint** antes de deploy: evita deuda técnica y fallos de estilo/reglas que suelen anticipar bugs.
- **typecheck**: garantiza contrato de tipos en rutas, servicios y payloads.
- **build**: confirma que el artefacto de producción es compilable.
- **prisma validate**: detecta inconsistencias del schema antes de migrar/desplegar.
- **health check post-deploy**: verifica que el servicio quedó operativo después de publicar y migrar.

### Estrategia de Despliegue

Existe un `Dockerfile` productivo en el repositorio:

```dockerfile
FROM node:20-alpine
RUN apk add --no-cache openssl
EXPOSE 3000
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
RUN npm run build
CMD ["npm", "run", "docker-start"]
```

`docker-start` ejecuta `npm run setup && npm run start`, aplicando migraciones al iniciar.

**Fly.io (recomendado para este tipo de app)**  
- Single region para MVP, multi-region para escalar.  
- Volumen persistente para SQLite solo en dev/demo; en prod migrar a PostgreSQL.  
- Usar `fly secrets set` para variables sensibles.  
- No versionar `.env` en Git.

**Render**  
- Web Service + PostgreSQL gestionado.  
- Variables de entorno en dashboard de Render.  
- Auto-deploy desde rama `main`.

**VPS (Docker Compose ejemplo)**  

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:pass@db:5432/affilytics
    depends_on:
      - db
    secrets:
      - shopify_api_secret
      - conversion_webhook_secret
  db:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
secrets:
  shopify_api_secret:
    external: true
  conversion_webhook_secret:
    external: true
volumes:
  pgdata:
```

No usar `env_file` con secretos en producción; preferir Docker secrets o gestores dedicados (AWS Secrets Manager, HashiCorp Vault, Doppler).

### Arquitectura de DB a escala

- Migración de SQLite a PostgreSQL gestionado.
- Índices compuestos para reporting por tienda/fecha.
- Particionado temporal para alto volumen de eventos.
- Worker/cola para desacoplar billing del request HTTP.

### Rotación de secretos (`CONVERSION_WEBHOOK_SECRET`)

Estrategia recomendada:
1. Generar nuevo secreto.
2. Actualizar secreto en backend.
3. Actualizar pixel (`conversionSharedSecret`) vía Admin GraphQL.
4. Verificar tráfico firmado correcto.
5. Revocar secreto anterior.

Actualmente no existe doble ventana de secretos en código; la rotación debe coordinarse.

### Health check

**Actual:** no implementado (no existe endpoint dedicado de salud en `app/routes`).  
**Plan inmediato:** agregar endpoints:
- `/health/live` para liveness (respuesta HTTP simple)
- `/health/ready` para readiness (chequeo básico de DB/Prisma)

---

## 11. Manejo de Throttling GraphQL y Git Flow

### Manejo de Throttling (Rate Limits Shopify GraphQL)

Shopify Admin GraphQL usa el modelo de **leaky bucket**:
- Capacidad máxima aproximada: 1000 puntos
- Restauración: 50 puntos/segundo
- Cada operación consume puntos según costo

En este proyecto, `app/services/conversion.server.ts` implementa tolerancia con:
- `graphqlWithRetry` con backoff exponencial
- `BILLING_MAX_RETRIES = 3`
- Espera inicial `300ms`, luego `600ms`, luego `1200ms`
- Si tras 3 intentos falla, `billingStatus` permanece en `"FAILED"` para reconciliación posterior
- La conversión **sí** se registra; el fallo de billing no descarta el referral

Para escala alta, idealmente:
- Cola (BullMQ/SQS) con rate limiter
- Procesar máximo N requests de billing/segundo respetando bucket de Shopify
- Dead letter queue para reintentos diferidos sin límite temporal estricto

### Git Flow

Este proyecto se alinea mejor con **Trunk-based development**:
- Rama principal: `main` (siempre deployable)
- Features pequeñas: integración frecuente a `main` (opcional feature flags)
- Features grandes: ramas cortas (1-2 días) + PR + merge a `main`
- Evitar ramas largas (`develop`, `release/*`) para reducir merge conflicts

Ventajas para apps Shopify embebidas:
- Integración continua real
- Deploy frecuente y reversible
- Rollback simple con `revert` de commit

Flujo típico:

```bash
# Feature nueva
git checkout -b feat/affiliate-export
# trabajo...
git push origin feat/affiliate-export
# PR → code review → merge a main → auto-deploy
```

Conventional commits recomendados:
- `feat`: nueva funcionalidad
- `fix`: corrección de bug
- `docs`: documentación
- `refactor`: refactor sin cambio de comportamiento
- `ci`: cambios de pipeline

---

## 12. Seguridad

Medidas implementadas actualmente:

- **Verificación HMAC-SHA256**  
  `verifyConversionSignature` con payload canónico y `timingSafeEqual`.
- **Validación de timestamp fresco**  
  `isConversionTimestampFresh` con ventana de ±10 minutos.
- **`x-api-key` opcional**  
  Si `CONVERSION_API_KEY` está definido, el endpoint lo exige.
- **Validación/sanitización de inputs**  
  Tipos y reglas para `shop`, `orderId`, `amount`, `timestamp`, `signature`, `report`.
- **Aislamiento multi-tenant**  
  Todas las operaciones críticas están scopeadas por `shop`.
- **CORS**  
  `Access-Control-Allow-Origin: *`, `POST, OPTIONS`, headers permitidos `Content-Type, x-api-key`.
- **Comparación segura de firma**  
  Evita timing attacks con `timingSafeEqual`.

---

## 13. Escalabilidad Teórica

Para soportar 1,000+ tiendas y picos Black Friday:

1. **Desacoplar cobro con cola**  
   Encolar eventos de conversión (SQS/BullMQ/Kafka) y procesar billing en workers idempotentes.
2. **PostgreSQL + particionado**  
   Migrar de SQLite a PostgreSQL, particionar por fecha/tienda y usar índices compuestos.
3. **Escalado horizontal del backend**  
   Instancias stateless detrás de LB; sesiones y DB compartidas.
4. **Rate limiting y backpressure**  
   Limitar por tienda/IP en endpoint público y aplicar circuit-breaker en llamadas a Shopify.
5. **Reconciliación periódica**  
   Job que detecte `billingStatus=FAILED` y reintente usage records sin duplicar.

---

## 14. Limitaciones Conocidas en Desarrollo

1. **URL del tunnel cambia al reiniciar**  
   Debes actualizar `conversionApiUrl` del Web Pixel (GraphiQL `webPixelUpdate`) cada vez que cambie.

2. **Billing deshabilitado en dev por configuración actual**  
   En `.env` actual:
   - `SHOPIFY_SKIP_BILLING=true`
   - `SHOPIFY_REQUIRE_BILLING=false`  
   Esto evita bloqueo mientras no estén aprobados scopes protegidos, pero impide validar cobro usage end-to-end localmente.

3. **SQLite es single-instance**  
   No está diseñado para alta concurrencia horizontal ni grandes volúmenes de eventos.

