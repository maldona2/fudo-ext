# fudo-ext

Herramientas de control sobre la API de FUDO. La pieza principal es una web app para
**conteos de stock a ciegas** y un **panel de faltantes** para el dueño.

- La encargada cuenta lo que hay (sin ver el stock del sistema) desde el celular.
- El backend calcula, por producto: `último conteo + compras − ventas` (tomadas de FUDO
  con la hora exacta) y lo compara con lo contado. El primer conteo de un producto se
  compara contra el stock que informa FUDO.
- El dueño entra cuando quiere y ve qué faltó, cuánto vale (a costo) y en qué productos se repite.
- El dueño arma **listas de conteo** (por ejemplo "Diario - alto riesgo") para contar seguido lo que más se pierde;
  la encargada elige la lista y ve solo esos productos.
- Si un conteo da faltantes, llega un aviso corto por Telegram. Si está todo bien, no llega nada.

**Solo lectura sobre FUDO:** la app nunca escribe en la cuenta (el cliente HTTP rechaza
cualquier método que no sea GET). Los conteos y resultados viven en nuestra base.

Ver `docs/analisis-api.md` para lo que permite la API de FUDO.

## Stack

Template [nodejs-react-starter](https://github.com/maldona2/nodejs-react-starter):
React 19 + Vite + Tailwind 4 + shadcn/ui, Express + TypeScript, PostgreSQL 15.
Reglas para agentes en `AGENTS.md` y `.ai/`.

```
backend/   API (Express). services/ = lógica (reconcile.ts es el cálculo), db/ = SQL
frontend/  React. pages/ = pantallas, lib/api.ts = único cliente del backend
tools/     Scripts Python de solo lectura (resumen diario, fotos de stock)
spec/      OpenAPI de FUDO
```

## Desarrollo local

```bash
npm install && npm run install:all
cp backend/env.example backend/.env       # completar FUDO_API_KEY / FUDO_API_SECRET
cp frontend/env.example frontend/.env
npm run start:dev                          # Postgres en Docker + frontend + backend
cd backend && npm run db:migrate
```

Primer usuario: definir `BOOTSTRAP_OWNER_EMAIL` y `BOOTSTRAP_OWNER_PASSWORD` en
`backend/.env`. Al arrancar con la tabla de usuarios vacía, se crea el dueño. Los demás
usuarios se crean desde la pantalla **Usuarios**.

Antes de commitear: `npm run lint`, `npm run format:check`, `npm run test`, `npm run ai:check`.

## Deploy en Railway

Un proyecto con tres servicios:

| Servicio | Root directory | Variables |
|---|---|---|
| **Postgres** | — (plantilla de Railway) | — |
| **backend** | `backend` | `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `NODE_ENV=production`, `FUDO_API_KEY`, `FUDO_API_SECRET`, `APP_URL` (URL pública del frontend), `FRONTEND_URL` (la misma), `BOOTSTRAP_OWNER_EMAIL`, `BOOTSTRAP_OWNER_PASSWORD`, `BOOTSTRAP_OWNER_NAME`, opcional `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` |
| **frontend** | `frontend` | `BACKEND_URL=http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:${{backend.PORT}}`, `PORT=3000` |

- Cada servicio tiene su `railway.json`: build con el `Dockerfile`; el backend corre las
  migraciones antes de cada deploy (`preDeployCommand`) y usa `/api/health` como healthcheck.
- En el backend definir también `PORT` (por ejemplo `5000`) para poder referenciarlo desde el frontend.
- Solo el **frontend** necesita dominio público. nginx reenvía `/api` al backend por la red
  privada, así que la cookie de sesión es del mismo dominio (no hace falta CORS ni cookies entre sitios).
- Si Postgres exige SSL con certificado propio, ver `DB_SSL_NO_VERIFY` en `backend/src/db/connect.ts`.
- Después del primer login del dueño, sacar `BOOTSTRAP_OWNER_PASSWORD` de las variables.

## Scripts de solo lectura (tools/)

### Resumen diario (solo lectura)

```bash
python3 tools/scripts/daily_summary.py                 # ayer, hora Argentina
python3 tools/scripts/daily_summary.py 2026-10-18 --nombre "Los Hornos Belgrano"
python3 tools/scripts/daily_summary.py 2026-10-18 --json
```

Genera un mensaje listo para WhatsApp con: ventas y medios de pago, efectivo neto de la caja
(ventas en efectivo − gastos pagados en efectivo desde la caja, sin fondo inicial),
cancelaciones y descuentos por cajero, más vendidos, mercadería recibida, otros gastos
y productos con stock a revisar (negativo, bajo el mínimo, o en 0 con ventas en el día).

Limitaciones: el stock es el **actual** (la API no da el stock histórico) y el contado del
arqueo no está en la API.

### Fotos de stock y conciliación (solo lectura)

```bash
python3 tools/scripts/stock_snapshot.py --dir data/stock      # foto de hoy (no pisa la primera del día)
python3 tools/scripts/stock_reconcile.py 2026-10-20 --dir data/stock [--telegram]
```

La API solo da el stock actual. Cada mañana se guarda una foto (`<fecha>.csv`) y la
conciliación de un día compara su foto con la del día siguiente:
`inicial + compras − ventas = final`. Ventas y compras se toman con la hora exacta de cada foto.
Lo que no cierra es un ajuste manual de stock, una compra cargada sin ítems o un producto
cuyo stock FUDO no descuenta.

### Envío automático (GitHub Actions)

`.github/workflows/resumen-diario.yml` corre todos los días a las 07:52 (hora Argentina):
1. Saca la foto de stock y la guarda en la rama `datos` (`stock/<fecha>.csv`).
2. Manda por Telegram el resumen del día anterior.
3. Manda la conciliación de stock del día anterior (desde el segundo día de fotos).

También se puede correr a mano desde **Actions → Resumen diario → Run workflow**,
opcionalmente con una fecha (con fecha no se saca foto).

Secretos necesarios (Settings → Secrets and variables → Actions):
`FUDO_API_KEY`, `FUDO_API_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
Variable opcional: `FUDO_LOCAL_NAME` (nombre que aparece en el título).

Nota: GitHub solo ejecuta tareas programadas desde la rama por defecto del repo.
