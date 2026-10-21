# Prueba manual de escaneo en celular

Estado: pendiente de ejecutar con teléfonos físicos. Las pruebas automáticas no certifican enfoque ni rendimiento de la cámara.

## Preparación

1. Usá Safari en iPhone o Chrome en Android y abrí la app mediante HTTPS. Un teléfono accediendo a una IP local por HTTP no tiene el permiso de localhost de una computadora.
2. Abrí `docs/testing/barcodes.html` en una computadora o imprimila. Para regenerarla desde raíz: `npm --prefix frontend run fixtures:barcodes`.
3. Entrá como dueño y abrí **Códigos**. Seleccioná un producto A, por ejemplo una bebida de tu catálogo. Escribí o escaneá `2000000000015`, revisá el nombre y tocá **Guardar asociación**.
4. Repetí con producto B y `2000000000022`, y producto C y `2000000000039`. Dejá `2000000000046` sin asociar. Son códigos sintéticos; no identifican marcas comerciales.
5. Creá una lista **PRUEBA ESCANEO** con A y B, excluyendo C. Si querés probar bultos, configurá la equivalencia real de A en **Bultos**.
6. Cerrá sesión y entrá como encargado. Recargá la página después de cambiar asociaciones desde otra sesión: el catálogo cargado no tiene sincronización en vivo.

Las asociaciones y listas se guardan en nuestra base. FUDO continúa de solo lectura. En producción usá etiquetas temporales identificables y guardá únicamente cantidades físicas reales: los conteos alimentan el historial y futuras comparaciones. Para inventar cantidades o forzar recuentos, usá un entorno con base y catálogo de prueba aislados. Ningún paso crea asociaciones automáticamente en producción.

## Recorrido

1. En **Contar**, elegí **PRUEBA ESCANEO** y tocá **Escanear**. Permití acceso a la cámara. Debe preferir la cámara trasera y mostrar una vista dentro de la página, sin abrir video a pantalla completa en iPhone.
2. Apuntá a PRUEBA A con buena luz. Debe detener la cámara y mostrar/enfocar los campos de A. La cantidad debe seguir vacía. Si el teclado no se abre automáticamente, tocá el campo.
3. Cargá las cantidades reales. Ejemplo de aritmética sin guardar: con pack de 6, 2 packs y 3 sueltas muestra 15 u. Antes de guardar en producción, reemplazá ejemplos por conteo físico.
4. Volvé a escanear A manteniendo la imagen frente a cámara. Debe seleccionarlo una vez, sin sumar y conservando las cantidades anteriores.
5. Buscá B por nombre, luego escaneá A. Se debe limpiar el filtro para que A vuelva a verse; el orden de la lista no cambia.
6. Escaneá PRUEBA B y cargá su cantidad.
7. Escaneá PRUEBA C. Debe avisar que no pertenece a la lista, sin incorporarlo al conteo ni cambiar de lista.
8. Escaneá PRUEBA D. Debe avisar **Código no asociado** y permitir buscar por nombre. No debe asignarlo a un producto parecido.
9. Abrí cámara y tocá **Cerrar cámara** o **Buscar por nombre**. Debe desaparecer la vista y apagarse el indicador de cámara del teléfono. Los borradores se conservan.
10. Probá abrir/cerrar diez veces. Nunca debe quedar la cámara encendida después de cerrar o salir de la página.
11. Abrí cámara, bloqueá el teléfono o cambiá de pestaña y volvé. Debe pedir **Reintentar**, sin reactivar cámara por sí sola. Las cantidades permanecen.
12. Negá el permiso de cámara. Debe mostrar un mensaje entendible y ofrecer búsqueda manual. Habilitá el permiso en ajustes del navegador y tocá **Reintentar**. También probá cerrar la sección antes de responder al permiso: al concederlo tarde, no debe quedar cámara activa.
13. Repetí con un envase real: verificá primero el número impreso y asociá ese número al producto exacto como dueño. Una imagen de Google sirve solamente si su código es legible y coincide con la presentación; una foto del frente no alcanza. No hace falta descargar imágenes de Google para usar las etiquetas reproducibles.
14. Revisá nombres largos, teléfono vertical/horizontal, teclado abierto y anchos de 360/390 px: sin desplazamiento horizontal, acciones alcanzables, sin perder campos tras la barra inferior.

## Guardado y recuento

1. Guardá solo cantidades reales en producción. En entorno aislado podés preparar una diferencia conocida para forzar el recuento; no cambies FUDO para hacerlo.
2. Si pide recuento, deben verse solo los productos solicitados, con cantidades anteriores vacías. Nunca stock esperado, diferencia, costos, importes o si falta/sobra.
3. Escaneá un producto que no fue solicitado: debe rechazarlo sin alterar el alcance original.
4. Escaneá uno solicitado y volvé a contar. Deben conservarse las entradas iniciales de los productos que no requieren recuento.
5. Recargá durante el recuento y verificá borrador. Completá todos los solicitados y guardá: el encargado ve **Conteo guardado**, sin resultados numéricos del sistema.
6. Como dueño, revisá el resultado en Panel y las cantidades finales/primer conteo cuando corresponda.

## Registro de aceptación

| Dispositivo | SO | Navegador/versión | Pantalla/impreso/envase | Permisos/cierre | Lista/recuento | Resultado y tiempo aproximado |
|---|---|---|---|---|---|---|
| iPhone | Pendiente | Safari, pendiente | Pendiente | Pendiente | Pendiente | No ejecutado |
| Android | Pendiente | Chrome, pendiente | Pendiente | Pendiente | Pendiente | No ejecutado |

Para reportar un fallo: indicá el paso, modelo, SO, navegador, código usado, qué esperabas y qué ocurrió. No incluyas contraseñas ni tokens.
