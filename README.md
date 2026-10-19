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
