# Análisis de la especificación OpenAPI de FUDO (v1alpha1)

Fuente: `spec/openapi.yml`, descargado el 19/10/2026 de https://api.fu.do/v1alpha1/openapi.yml.
Cierra el paso 1 de "Próximos pasos" del documento de traspaso (revisar `/products`, `/sales` y caja).

## Resumen de cambios respecto del documento (rev. 2)

| Tema | Doc rev. 2 | Según el spec | Impacto |
|---|---|---|---|
| Escritura de **productos** | ❓ | ✅ `POST /products` (requiere `name`, `price`) y `PATCH /products/{id}` con `code`, `cost`, `price`, `stock`, `minStock`, `stockControl`, `active`, `description`, `productCategory` | **Riesgo 3 resuelto.** El catálogo se puede cargar y los precios actualizar por API; el Excel queda como plan B. La app de conteo puede escribir `stock` en productos, no solo en ingredientes. |
| Buscar producto por **código de barras** | — | ⚠️ `GET /products` **no** filtra por `code` (filtros: `id`, `name`, `productCategoryId`, `stock`, `stockControl`, `active`, `stockLots`) | Hay que sincronizar el catálogo completo en la base propia e indexar `EAN → productId` localmente. |
| Gasto con **ítems** (ingreso de mercadería) | ✅ "crear gasto con ítems" | ❌ `POST /expenses` acepta `amount`, `date`, `useInCashCount`, `receiptNumber`, `description`, `paymentDate`, `dueDate` y relaciones `expenseCategory`, `paymentMethod`, `provider`, `cashRegister`, `receiptType`, `commercialDocument`. **`expenseItems` solo se lee**, no se puede crear. Sí admite carga en lote (`bulk:data`) | La compra por API no sumaría stock sola. Plan: crear el gasto (monto/proveedor) + `PATCH stock` en cada producto (`stock += cantidad`), o cargar la compra con ítems a mano en FUDO. **A verificar** con FUDO si hay otra vía. |
| **Ventas** | lectura | `GET /sales` + `PATCH /sales/{id}` (solo `comment`, `people`, `customerName`, `saleState`, `saleType`, mesa/identificador). No hay `POST /sales` | Lectura alcanza para sincronizar. |
| Filtros de ventas | — | `createdAt`, `closedAt`, `saleType`, `saleState`, `userId`, `shiftId`, `paymentMethodId`, `tableId`, `origin`, `notInvoiced`… | `shiftId` (turno) es prometedor para armar el resumen por turno/caja. |
| **Cajas / arqueos** | ⚠️ sin recurso | Confirmado: no hay `/cash-registers` ni `/shifts`. `cashRegister` aparece como relación en ventas, gastos, pagos y usuarios (`tablesCashRegister`, `takeAwayCashRegister`, `deliveryCashRegister`). Existe el filtro `shiftId` en ventas, pero no un recurso de turno | **Riesgo 2 sigue abierto.** Se puede calcular el esperado por caja/turno (pagos + gastos con `useInCashCount`), pero no el monto contado por el cajero. Consultar a FUDO. |
| Pagos | lectura | `GET /payments` filtra por `createdAt`, `paidAt`, `paymentMethod`, `canceled`, `receivedBy`, `sales`, `expenseId`. `POST /payments` es solo para pagos de **gastos** | El filtro por caja **no** está en pagos: hay que pasar por `include=cashRegister` en ventas. |
| Ítems | lectura/escritura | `GET /items` **no tiene `filter`** (solo `page`, `sort`, `fields`, `include`) | Para el detector de cancelaciones conviene traer ítems vía `GET /sales?include=items,items.createdBy` filtrando ventas por fecha. |
| Webhooks | no hay | Confirmado: no hay | Polling. |
| Rate limit | 429 + `Retry-After` | Confirmado, body en texto plano | Implementado en `fudo/client.py`. |

## Endpoints disponibles

GET/POST/PATCH en: customers (+DELETE), discounts, expenses, expense-categories (+DELETE),
items, kitchens (+DELETE), product-categories, product-modifiers, products, providers (+DELETE),
roles, rooms, tables, users. Solo GET/PATCH: ingredients, sales. Solo GET: payment-methods.
`POST /payments` (pagos de gastos) y `POST /subitems`.

## Qué queda para la prueba con credenciales reales (Fase 0.5)

1. ¿`PATCH /products/{id}` con `stock` funciona en la cuenta y queda registrado como ajuste de stock?
2. ¿Qué devuelve `include=cashRegister` en una venta? ¿Trae nombre de caja/turno?
3. ¿El `shiftId` se puede obtener desde alguna relación (para saber qué turnos existen)?
4. ¿El usuario API ve todas las sucursales o una cuenta por sucursal?
5. Medir el rate limit real.

## Resultados de la prueba en Los Hornos Belgrano (19/10/2026, datos del 18/10)

Usuario API: "Matias maldonado", rol **Integraciones**.

| Recurso | Resultado |
|---|---|
| Token | ✅ |
| Productos | ✅ 136 productos, 71 con código, 97 con `stockControl`. Precio, costo y stock visibles |
| Ingredientes | ✅ 0: el stock de Los Hornos vive en **productos** (riesgo 13: en la práctica se usa producto con stock propio) |
| Ventas | ✅ 36 ventas, todas `CLOSED`, total $1.138.865,05. `saleType` TAKEAWAY, con nombre/teléfono del cliente |
| Ítems (vía `include` en ventas) | ✅ precio, cantidad, `createdBy`, `canceled`, `cancellationReason`/`Comment` (1 cancelado ese día) |
| Descuentos | ✅ monto/porcentaje y `canceled` |
| Pagos | ✅ incluye pagos de ventas **y de gastos** (relación `sale` o `expense`). Medios: Efectivo, QR, Online PedidosYa, … |
| Caja | ✅ Una sola caja: id 1, "Principal" (el nombre llega solo con `fields[cashRegister]=name`) |
| Gastos | ✅ Monto, fecha, descripción, estado (`PAID`/`UNPAID`), `useInCashCount`, categoría, proveedor, caja, usuario y medio de pago. Las compras traen ítems con producto, cantidad y precio (el `price` del ítem es el **total de la línea**: 120 × Carne suave = 84.000 → 700 c/u = costo del producto) |
| Usuarios | ⚠️ `/users` devuelve solo 3; otros usuarios (p. ej. el cajero "Leandro") aparecen solo vía `include` |

**Hallazgo:** el rol tiene los permisos `create_cash_counts`, `update_cash_counts`,
`show_estimated_on_*_cash_counts`: FUDO maneja arqueos internamente, pero ningún endpoint los expone.

### Gotcha: `fields[...]` obligatorio en algunos endpoints

En `/expenses` (y en los tipos incluidos: `expenseItem`, `expenseCategory`, `cashRegister`)
la API devuelve **solo id y relaciones** si no se pide `fields[tipo]=...` explícitamente.
No es un problema de permisos. Ejemplo que funciona:

```
GET /expenses?filter[date]=and(gte.2026-10-18,lte.2026-10-18)
  &include=expenseItems,expenseItems.product,cashRegister
  &fields[expense]=amount,date,description,status,useInCashCount,expenseItems,cashRegister
  &fields[expenseItem]=price,quantity,product&fields[product]=name&fields[cashRegister]=name
```

Además, los rangos de fecha solo aceptan `gte`/`lte` (no `lt`/`gt`).

### Cuadre de efectivo del 18/10 (caja Principal)

| Concepto | Monto |
|---|---|
| Ventas en efectivo | $481.765,05 |
| Otros medios (PedidosYa $525.100, QR $52.800, tarjeta $79.200) | $657.100,00 |
| Gastos pagados en efectivo desde la caja (sueldos/Rapiboy) | −$72.200,00 |
| **Movimiento neto de efectivo** | **$409.565,05** (+ fondo inicial, que la API no expone) |

Las compras a "Los Hornos fabrica" ($343.200) quedan en cuenta corriente (`UNPAID`, sin caja), así que no afectan el efectivo.
Con esto se puede calcular el **esperado** por día; falta el **contado** del arqueo (consulta a FUDO).
