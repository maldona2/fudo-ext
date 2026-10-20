# fudo-ext

Herramientas propias sobre la API de FUDO (catálogo maestro, conteo de stock, alertas).
Ver `docs/analisis-api.md` para lo que permite la API según el spec.

## Configuración

Las credenciales **nunca** se commitean.

- Local: `cp .env.example .env` y completar `FUDO_API_KEY` y `FUDO_API_SECRET`.
- Sesiones en la nube de Claude Code: cargarlas como variables de entorno del environment
  (`FUDO_API_KEY`, `FUDO_API_SECRET`).

## Prueba técnica (solo lectura)

```bash
python3 scripts/smoke_test.py 2026-10-18
```

Requiere Python 3.9+, sin dependencias externas.

## Resumen diario (solo lectura)

```bash
python3 scripts/daily_summary.py                 # ayer, hora Argentina
python3 scripts/daily_summary.py 2026-10-18 --nombre "Los Hornos Belgrano"
python3 scripts/daily_summary.py 2026-10-18 --json
```

Genera un mensaje listo para WhatsApp con: ventas y medios de pago, efectivo neto de la caja
(ventas en efectivo − gastos pagados en efectivo desde la caja, sin fondo inicial),
cancelaciones y descuentos por cajero, más vendidos, mercadería recibida, otros gastos
y productos con stock a revisar (negativo, bajo el mínimo, o en 0 con ventas en el día).

Limitaciones: el stock es el **actual** (la API no da el stock histórico) y el contado del
arqueo no está en la API.

## Fotos de stock y conciliación (solo lectura)

```bash
python3 scripts/stock_snapshot.py --dir data/stock      # foto de hoy (no pisa la primera del día)
python3 scripts/stock_reconcile.py 2026-10-20 --dir data/stock [--telegram]
```

La API solo da el stock actual. Cada mañana se guarda una foto (`<fecha>.csv`) y la
conciliación de un día compara su foto con la del día siguiente:
`inicial + compras − ventas = final`. Ventas y compras se toman con la hora exacta de cada foto.
Lo que no cierra es un ajuste manual de stock, una compra cargada sin ítems o un producto
cuyo stock FUDO no descuenta.

## Envío automático (GitHub Actions)

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
