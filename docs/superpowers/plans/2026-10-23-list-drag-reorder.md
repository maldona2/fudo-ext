# List Drag Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir ordenar productos arrastrándolos en Nueva lista y Editar lista.

**Architecture:** Extraer el bloque Orden de recorrido a un componente controlado que recibe y devuelve identificadores ordenados. Usar los sensores de dnd-kit y conservar el estado y la persistencia en ListEditor; confirmar cambios únicamente al terminar un movimiento válido.

**Tech Stack:** React 19, TypeScript 5.7, Vitest, Testing Library, Tailwind CSS 4 y los paquetes @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities.

**Spec:** `docs/superpowers/specs/2026-10-23-list-drag-reorder.md` (propuesta pendiente de revisión del usuario).

## Global Constraints

- React 19, TypeScript 5.7, Vite 6; conservar los componentes y estilos actuales.
- Texto visible y anuncios accesibles en español (Argentina).
- Sin cambios de API, base de datos ni escrituras a FUDO.
- Agregar únicamente @dnd-kit/core, @dnd-kit/sortable y @dnd-kit/utilities como dependencias de ejecución para esta interacción.
- Antes de implementar leer las skills locales de TDD, testing, workflow, responsive-design, shadcn-ui y vitest; seguir sus instrucciones y las reglas del repositorio.

## Review Focus

- Cancelación o destino inválido: conserva exactamente los identificadores anteriores (tarea 1).
- Dedo sobre texto frente a agarre: permite desplazar la página sin reordenar accidentalmente (tarea 2, navegador real).
- Guardado pendiente o rechazado: no permite mutaciones durante el envío y conserva el orden al fallar (tarea 2).
- Productos desmarcados o ausentes del catálogo: no duplica ni descarta silenciosamente identificadores (tareas 1 y 2).
- Lista larga y nombres extensos en móvil: destino alcanzable y sin desborde horizontal (tarea 2, navegador real).

---

## File Structure

- Crear `frontend/src/components/WalkingOrder.tsx`: sección controlada, contexto de arrastre y fila sortable privada; mantener la fila en este archivo por ser exclusiva de la sección.
- Crear `frontend/src/components/WalkingOrder.test.tsx`: interacción accesible y límites del reordenamiento.
- Crear `frontend/src/lib/reorderProducts.ts` y `.test.ts`: movimiento puro por identificadores; sin dependencia de React.
- Modificar `frontend/src/pages/ListsPage.tsx`: reemplazar sección actual, conservar selección y envío, bloquear edición mientras guarda.
- Modificar `frontend/src/pages/ListsPage.test.tsx`: integración con creación, edición, cancelación y errores.
- Modificar `frontend/package.json` y `frontend/package-lock.json`: dependencias y resolución reproducible.

### Task 1: Reordenamiento controlado accesible

**Interfaces:**
- Consume `CountProduct` desde `frontend/src/types/api.ts`.
- Produce `reorderProducts(order: string[], activeId: string, overId: string | null): string[]` en `frontend/src/lib/reorderProducts.ts`.
- Produce `WalkingOrder({ products, order, onOrderChange, onDraggingChange, disabled = false }: WalkingOrderProps): React.JSX.Element | null`; props: `products: CountProduct[]`, `order: string[]`, `onOrderChange: (next: string[]) => void`, `disabled?: boolean`, `onDraggingChange: (dragging: boolean) => void`.

- [ ] **1. Escribir pruebas fallidas del movimiento puro** en `reorderProducts.test.ts`: `moves across multiple positions in both directions`, `ignores cancelled same and unknown targets`, `preserves unavailable product ids` y `does not mutate input`. Afirmaciones exactas:

```ts
expect(reorderProducts(['14', '16', '30'], '30', '14')).toEqual(['30', '14', '16']);
expect(reorderProducts(['14', '16', '30'], '14', '30')).toEqual(['16', '30', '14']);
// Cada destino null, '14' y 'missing', con activeId '14': conserva el original.
expect(reorderProducts(['14', 'unknown', '30'], '30', '14')).toEqual(['30', '14', 'unknown']);
// activeId desconocido, array vacío y único elemento: conserva el original.
// Comparar el array de entrada con una copia previa y comprobar que no se modifica.
```

- [ ] **2. Ejecutar** `npm run test --prefix frontend -- src/lib/reorderProducts.test.ts`; esperar FAIL por módulo inexistente.
- [ ] **3. Implementar** la firma indicada: validar ambos índices, eliminar el activo e insertarlo en el índice original del destino; devolver el original si no hay movimiento válido.
- [ ] **4. Ejecutar** el mismo comando; esperar todas las pruebas PASS.
- [ ] **5. Escribir pruebas fallidas del componente**: `moves with keyboard and retains focus` (Space, ArrowUp, Space en Coca produce `['30','14','16']` con geometría determinista y dos ArrowUp), `escape does not commit` (Escape no llama onOrderChange), `keeps arrow controls` (Bajar Carne suave produce `['16','14','30']`), `disables empty single and busy lists` (vacío no renderiza sección; único y disabled bloquean agarre y flechas). Usar renderizador controlado y sensores reales; simular rectángulos y APIs DOM faltantes de jsdom localmente, sin mockear el componente ni sus callbacks de arrastre.
- [ ] **6. Ejecutar** `npm run test --prefix frontend -- src/components/WalkingOrder.test.tsx`; esperar FAIL por componente inexistente.
- [ ] **7. Instalar** desde frontend con `npm install --save-exact @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`; comprobar compatibilidad declarada con React 19 y conservar lockfile. No migrar a otra API ni usar instalación forzada.
- [ ] **8. Implementar WalkingOrder** con DndContext, SortableContext, useSortable, verticalListSortingStrategy, PointerSensor (distancia de activación 8 px), KeyboardSensor y sortableKeyboardCoordinates. Aplicar listeners sólo al Button de agarre con GripVertical, tamaño icon-lg y touch-action:none. Usar DragOverlay sin controles duplicados para listas largas, autoscroll y destino restringido al contenedor: fuera de éste se cancela. Notificar onDraggingChange(true) al iniciar y false al terminar o cancelar. Invocar reorderProducts al soltar; Escape no confirma. Mantener flechas y numeración, foco, ayuda de la spec y anuncios de inicio, movimiento, fin y cancelación en español. Respetar reduced motion. Para IDs ausentes mostrar `Producto no disponible` y conservarlos; no filtrar silenciosamente el orden.
- [ ] **9. Ejecutar** ambos archivos de pruebas; esperar PASS.
- [ ] **10. Commit** de los archivos de esta tarea, tras revisar staged scope: `feat: add accessible walking order drag controls`.

### Task 2: Integración, persistencia y validación móvil

**Files:** modificar `frontend/src/pages/ListsPage.tsx` y `frontend/src/pages/ListsPage.test.tsx`.

**Interfaces:** consume WalkingOrder de tarea 1; conserva `countLists.create(input)` y `countLists.update(id, input)`, con `input: { name: string; productIds: string[] }`.

- [ ] **1. Escribir pruebas fallidas de integración** en ListsPage.test.tsx usando el componente real: `saves dragged order on create` afirma create con `{name:'Recorrido',productIds:['30','14','16']}`; `saves dragged order on edit` mueve Carne suave antes de Pollo y afirma update con `'list-1', {name:'Diario',productIds:['14','16']}`. Antes de Guardar, ambas funciones deben no haber sido llamadas. `cancel discards dragged order` cancela y reabre Diario, comprobando Pollo primero. `save failure retains dragged order for retry` rechaza update, comprueba aviso y mismo orden en el segundo envío. `pending save locks editing` usa promesa diferida y comprueba nombre, checkboxes, agarres, flechas y Cancelar deshabilitados. Conservar el test de desmarcar/reseleccionar y añadir afirmación del orden `['14','16']` antes de volver a subir Pollo.
- [ ] **2. Ejecutar** `npm run test --prefix frontend -- src/pages/ListsPage.test.tsx`; esperar FAIL por falta de controles de arrastre/bloqueo.
- [ ] **3. Integrar** `<WalkingOrder products={products} order={order} onOrderChange={setOrder} disabled={busy} onDraggingChange={setDragging} />`, eliminar move y productsById del editor. Bloquear nombre, selección y Cancelar con busy. Agregar `const [dragging, setDragging] = useState(false)` al editor y deshabilitar Guardar con `busy || dragging` además de sus condiciones actuales; no permitir enviar un orden intermedio. Conservar payload y manejo de errores actuales.
- [ ] **4. Ejecutar** `npm run test --prefix frontend -- src/pages/ListsPage.test.tsx`; esperar PASS incluyendo regresiones existentes.
- [ ] **5. Verificar en navegador real** con entorno local según workflow: mouse y touch, mover último a primero y primero a último; Escape y soltar fuera; 30 productos, scroll automático, nombre de 120 caracteres a 320 y 390 px. Desplazar sobre texto debe hacer scroll sin cambiar orden; desde agarre debe mover sin activar checkboxes. Comprobar última fila accesible por encima del pie fijo, teclado y lector de pantalla con anuncios en español. Guardar y reabrir confirma orden. Registrar resultados y cualquier limitación del dispositivo; jsdom no prueba touch real.
- [ ] **6. Ejecutar controles finales** desde raíz: `npm run lint`, `npm run format:check`, `npm run test`, `npm run ai:check`; mostrar salida y exigir códigos 0. Ejecutar además `npm run build:frontend` para comprobar resolución y bundle de nuevas dependencias. Corregir sólo problemas del alcance y repetir checks afectados.
- [ ] **7. Commit** tras revisar staged scope: `feat: enable drag ordering in count list editor`. Informar hash y validación del mensaje.

## Self-review

Alcance cubierto: creación/edición, mouse/touch/teclado, persistencia explícita, cancelación, errores, selección y límites móviles. No requiere cambios del backend. Las comprobaciones móviles quedan explícitas porque una suite DOM no demuestra desplazamiento ni interacción táctil real.
