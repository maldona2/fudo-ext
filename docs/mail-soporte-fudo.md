**Para:** soporte@fu.do
**Asunto:** Consultas sobre la API pública (v1alpha1) — cuenta loshornosbelgrano

Hola, ¿cómo están?

Les escribo por la cuenta **loshornosbelgrano**. Estamos usando la API pública
(v1alpha1) con un usuario exclusivo para integraciones (rol "Integraciones") y
tenemos algunas consultas:

**1. Arqueos de caja**
En los permisos de rol aparecen `list_cash_counts`, `reconcile_cash_count`,
`view_cash_reconciliation` y `show_estimated_on_closed_cash_counts`, pero en la
especificación OpenAPI no encontramos ningún endpoint de arqueos, cajas ni turnos.
`CashRegister` solo figura como relación (en ventas, gastos y usuarios) y llega
sin atributos, y las ventas admiten el filtro `shiftId`, pero no hay un recurso
de turnos.
- ¿Hay alguna forma de obtener por API los arqueos cerrados (monto esperado,
  monto contado, diferencia, usuario, fecha de apertura y cierre)?
- Si hoy no existe, ¿está previsto agregarlo?
- ¿Cómo se pueden obtener los turnos (`shiftId`) y los datos de cada caja?

**2. Compras de mercadería con ítems**
`POST /expenses` no acepta `expenseItems`.
- ¿Hay alguna forma de registrar por API una compra con ítems (producto,
  cantidad, costo) que sume stock, como se hace desde el sistema?
- Si no, ¿es correcto ajustar el stock con `PATCH /products/{id}` (`stock`)?
  ¿Ese cambio queda registrado como movimiento de stock?

**3. Implementadores**
Estamos armando un servicio de implementación de Fudo para otros comercios.
- ¿Tienen un programa de partners o implementadores?
- ¿Hay alguna condición para que operemos por API en las cuentas de nuestros
  clientes, con un usuario API creado en cada cuenta?

Muchas gracias.

Saludos,
[Nombre]
[Teléfono]
