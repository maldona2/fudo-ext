# Arrastrar productos para ordenar listas

## Pedido

«Esto se podrá hacer que se pueda acomodar agarrando el ítem y subiéndolo para arriba? En vez de ir haciendo click en la flechita».

## Alcance propuesto para revisión

En Nueva lista y Editar lista, dentro de Orden de recorrido, permitir mover un producto a cualquier posición arrastrando un agarre visible. El pedido se interpreta como ordenar productos dentro de una lista: es el único lugar de ListsPage que actualmente tiene flechas.

- Funciona con mouse, dedo y teclado; las flechas siguen disponibles como alternativa.
- El agarre mide 48 × 48 px y se llama `Mover {nombre}` para tecnologías asistivas. Ayuda visible: `Arrastrá desde el agarre para cambiar el orden.`
- Sólo el agarre inicia el arrastre. Deslizar sobre el nombre sigue desplazando la página.
- Se ve el elemento en movimiento y su destino; las posiciones se renumeran al soltar.
- El orden se confirma localmente al soltar sobre una fila válida. Escape, cancelación, destino inexistente y soltar en la posición original no modifican el orden.
- Guardar lista persiste el orden mediante el contrato actual `productIds`. Arrastrar no realiza solicitudes. Cancelar descarta cambios; un error al guardar conserva el orden para reintentar.
- Desmarcar quita un producto; volver a marcarlo lo agrega al final. Nunca se pierden ni duplican identificadores por un arrastre.
- Durante el guardado se bloquean nombre, selección, reordenamiento y cancelación para evitar cambios posteriores al envío.
- Listas largas permiten desplazamiento automático durante el arrastre; el pie fijo no tapa la última posición. A 320 px de ancho, nombres largos no generan desplazamiento horizontal.
- Una lista vacía no muestra controles de orden; un único producto no permite moverlo.

## Restricciones

- React 19, TypeScript 5.7, Vite 6; conservar los componentes y estilos actuales.
- Texto visible y anuncios accesibles en español (Argentina).
- Sin cambios de API, base de datos ni escrituras a FUDO.
- Agregar únicamente @dnd-kit/core, @dnd-kit/sortable y @dnd-kit/utilities como dependencias de ejecución para esta interacción.

Se propone dnd-kit por sus sensores, teclado y desplazamiento automático: implementar manualmente esas capacidades con eventos nativos ampliaría el mantenimiento. Se usa explícitamente la API documentada de estos paquetes, denominada Legacy por el proveedor, sin mezclarla con @dnd-kit/react. Referencias: https://dndkit.com/legacy/presets/sortable/overview/ y https://dndkit.com/legacy/api-documentation/sensors/pointer/.
