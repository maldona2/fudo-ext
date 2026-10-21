# Mobile Barcode Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir identificar un producto con la cámara del celular, cargar su cantidad y completar el conteo/recuento a ciegas; entregar códigos reproducibles para el testeo manual.

**Architecture:** La cámara decodifica localmente con ZXing y resuelve el código contra el catálogo autenticado. Las asociaciones entre códigos y productos se guardan en PostgreSQL de esta aplicación, administradas por el dueño; nunca se deducen del código interno de FUDO. El escaneo selecciona un producto y reutiliza los campos y borradores existentes, sin alterar cantidades automáticamente.

**Tech Stack:** React 19, TypeScript 5.7, Vite 6, Tailwind 4, shadcn/ui, Express 4, PostgreSQL 15, Node 24, Vitest/Testing Library, Jest/Supertest; añadir `@zxing/browser` y su dependencia compatible `@zxing/library` con versiones exactas y lockfile. Fixtures generadas con `bwip-js` como dependencia de desarrollo.

**Spec:** `docs/specs/2026-10-20-app-conteo-stock.md`, secciones 6.1, 6.2, 6.4, 7 y 10. Este plan concreta una entrega parcial de esa visión: cámara + identificación + carga existente + pruebas móviles. Las decisiones y exclusiones siguientes delimitan esta entrega, pendientes de revisión del usuario.

## Global Constraints

- FUDO es READ-ONLY: nunca POST/PATCH/DELETE contra la cuenta productiva. Las asociaciones se almacenan en nuestra base.
- “El cajero nunca ve el stock esperado ni la diferencia en números.” Mantener también ocultos costos, importes, sentido de la diferencia y primer conteo durante el recuento.
- Español de Argentina en la interfaz; código y comentarios en inglés.
- Trabajar desde el checkout que contiene los cambios de bultos/recuentos; base observada: `claude/stock-count-bulk-units-d2b551`. Verificar estado al ejecutar, sin sobrescribir cambios ajenos.
- Mantener rutas, autenticación con cookies httpOnly, borradores, orden de listas, conversión de bultos y alcance original del recuento.
- Cámara solo tras acción del usuario, por HTTPS (o localhost en desarrollo), audio deshabilitado; no subir ni conservar frames/fotos.
- Objetivos de aceptación: Safari de iPhone y Chrome de Android en dispositivos reales. No afirmar compatibilidad por pruebas simuladas solamente.
- El repositorio actual modela una cuenta FUDO por despliegue. Este plan sigue ese alcance; no introduce ni afirma aislamiento multicliente. Si el modelo cambia antes de implementar, revisar unicidad y autorización por comercio.
- No incluir rediseño general de Claude Design, fotos de productos, alta de desconocidos con foto, importación masiva de códigos, códigos de cajas con multiplicador, modo de escanear cada unidad, extras fuera de lista, PWA offline, PIN ni ajustes de stock en FUDO. Estas partes de la visión original siguen pendientes.

## Review Focus

- UPC-A y su EAN-13 equivalente con cero inicial: resolver al mismo producto, sin perder ceros ni asignarlo a otro (tareas 1 y 5).
- Cierre del escáner antes de que se conceda el permiso: liberar también el stream que llega tarde y no emitir resultados (tarea 3).
- Muchos frames del mismo código: seleccionar una sola vez y no sumar ni sobrescribir cantidades (tareas 3 y 5).
- Producto válido fuera de la lista o del recuento: avisar sin ampliar el alcance ni revelar cifras (tarea 5).
- Asociación duplicada o catálogo desactualizado: conflicto explícito, nunca tomar el primer producto coincidente ni trasladar una asociación silenciosamente (tareas 2, 4 y 5).

---

## Decisiones de producto y alternativas

Se recomienda ZXing para una única ruta de lectura en los dos navegadores objetivo. `BarcodeDetector` nativo reduce dependencias, pero tiene disponibilidad limitada; un diseño con detector nativo y fallback suma dos caminos de prueba innecesarios para esta entrega. La búsqueda manual continúa disponible.

Se admiten EAN-13, EAN-8 y UPC-A con dígito verificador válido. UPC-A se canonicaliza agregando un cero inicial, por lo que equivale al EAN-13 correspondiente. EAN-8 conserva sus ocho caracteres. No se aceptan QR, UPC-E, Code 128 ni textos arbitrarios en esta entrega.

Un producto puede tener varios códigos de unidad. Un código canónico identifica un solo producto por despliegue. Escanear un código no implica contar una unidad ni un pack: solamente lleva a sus campos de cantidad. Los códigos de caja quedan fuera de alcance.

El dueño administra asociaciones desde una nueva pantalla “Códigos de barras”. Puede escribir o escanear el código, revisar el producto elegido y guardarlo. No hay asociación automática a partir de `CountProduct.code`.

El cajero abre “Escanear”, apunta, obtiene una coincidencia y vuelve al formulario con el producto visible y enfocado. La cámara se detiene. Si no se reconoce: “Código no asociado. Buscá el producto por nombre o avisale al dueño.” Si está fuera de lista: “Este producto no pertenece a esta lista.” En recuento: “Este producto no está entre los que tenés que volver a contar.” No ofrecer incorporarlo como extra en esta entrega.

## Estructura de archivos

- Backend: `domain/barcodes.ts` valida/canonicaliza; `db/queries/productBarcodes.ts` persiste; `services/productBarcodes.ts` valida producto y conflicto; `routes/productBarcodes.ts` autentica/autoriza/serializa.
- Nueva migración `backend/src/db/migrations/006_product_barcodes.sql` (usar el siguiente número libre si cambió el repo).
- Integración backend: `domain/types.ts`, `index.ts`, `app.ts`, `services/products.ts`, `routes/products.ts`.
- Frontend: `lib/barcodes.ts` valida/canonicaliza/resuelve; `lib/barcodeScanner.ts` administra ZXing y stream; `components/BarcodeScanner.tsx` presenta cámara/errores; `pages/BarcodesPage.tsx` administra asociaciones.
- Integración frontend: `types/api.ts`, `lib/api.ts`, `App.tsx`, `components/Layout.tsx`, `pages/CountPage.tsx`.
- Pruebas junto a cada módulo; integración HTTP en `backend/src/app.test.ts`, persistencia en `backend/src/db/queries/productBarcodes.integration.test.ts`.
- Material de prueba: `frontend/scripts/generate-barcode-fixtures.mjs`, `frontend/src/test/fixtures/barcodes/`, `docs/testing/mobile-barcode-scanning.md` y `docs/testing/barcodes.html`.

## Task 1: Contrato y validación de códigos

**Files:** Create `backend/src/domain/barcodes.ts`, `backend/src/domain/barcodes.test.ts`, `frontend/src/lib/barcodes.ts`, `frontend/src/lib/barcodes.test.ts`. Modify `backend/src/domain/types.ts`, `frontend/src/types/api.ts` y fixtures de catálogo existentes.

**Interfaces:** En backend y frontend: `normalizeBarcode(raw: string): string | null`. Añadir `ProductBarcode = { productId: string; barcode: string }` y `CountProduct.barcodes: string[]`. La frontera cliente tolera `barcodes` ausente como `[]` durante el despliegue, pero el contrato del servidor nuevo siempre lo emite.

- [ ] **Step 1:** Escribir tests con estas aserciones en ambos módulos; el mismo conjunto fija el contrato entre paquetes sin crear un workspace compartido para una función pequeña.

```ts
expect(normalizeBarcode(' 2000000000015 ')).toBe('2000000000015');
expect(normalizeBarcode('036000291452')).toBe('0036000291452');
expect(normalizeBarcode('0036000291452')).toBe('0036000291452');
expect(normalizeBarcode('96385074')).toBe('96385074');
expect(normalizeBarcode('2000000000016')).toBeNull();
expect(normalizeBarcode('200 0000000015')).toBeNull();
expect(normalizeBarcode('https://example.com')).toBeNull();
expect(normalizeBarcode('')).toBeNull();
```

Añadir longitudes 7/9/11/14, letras y entrada de más de 64 caracteres: inválidas. Solo quitar espacios externos; nunca convertir todo el código a Number.
- [ ] **Step 2:** Ejecutar `npm --prefix backend run test -- --runInBand --runTestsByPath src/domain/barcodes.test.ts` y `npm --prefix frontend run test -- src/lib/barcodes.test.ts`; esperar fallo por función ausente.
- [ ] **Step 3:** Implementar validación del dígito de control, canonicalización y tipos. Actualizar fixtures de productos con `barcodes: []`.
- [ ] **Step 4:** Repetir ambos comandos; esperar PASS.
- [ ] **Step 5:** Commit `feat: define retail barcode contract` con los archivos de esta tarea.

## Task 2: Asociaciones persistentes y API protegida

**Files:** Create migración y módulos backend indicados en Estructura; `services/productBarcodes.test.ts`, `db/queries/productBarcodes.integration.test.ts`. Modify `domain/types.ts`, `index.ts`, `app.ts`, `services/products.ts`, `services/products.test.ts`, `routes/products.ts`, `app.test.ts`.

**Interfaces:**
- `ProductBarcodesRepo.all(): Promise<Map<string, string[]>>`; `add(value: ProductBarcode): Promise<'created' | 'exists' | 'conflict'>`; `remove(value: ProductBarcode): Promise<boolean>`.
- `createProductBarcodesService({repo, countableProductIds})` expone `add(value): Promise<void>` y `remove(value): Promise<void>`. `countableProductIds(): Promise<Set<string>>` usa la fuente existente.
- `PUT /api/product-barcodes` body estricto `{productId, barcode}` -> 204. Id regex `^\d{1,10}$`; código bruto string máximo 64, canonicalizado antes de guardar. Producto no contable -> 400; código de otro producto -> 409.
- `DELETE /api/product-barcodes/:productId/:barcode` -> 204; asociación inexistente -> 404. Requieren dueño; sin sesión -> 401, cajero -> 403.
- `GET /api/products` sigue autenticado y agrega únicamente `barcodes: string[]` al DTO ciego.

- [ ] **Step 1:** Tests de servicio/HTTP: entrada inválida o claves extra ->400; acceso anónimo->401; cajero->403; producto no contable->400; asignación repetida al mismo producto->204; mismo código a otro producto->409; eliminar inexistente->404. Para el conflicto UPC/EAN, guardar `036000291452` en A y rechazar `0036000291452` en B. Fallo de DB/FUDO debe conservar error genérico sin filtrar datos internos. GET no contiene stock, costo ni diferencias.
- [ ] **Step 2:** Ejecutar `npm --prefix backend run test -- --runInBand`; los tests nuevos deben fallar por contratos ausentes.
- [ ] **Step 3:** Crear tabla con `barcode TEXT PRIMARY KEY`, `product_id TEXT NOT NULL` con regex de id, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` e índice por producto. CHECK de código canónico de 8 o 13 dígitos. SQL parametrizado. INSERT con conflicto que nunca actualiza el dueño del código; resolver resultado con una lectura posterior. DELETE exige ambos valores. Integrar servicio/rutas y leer asociaciones en cada GET de catálogo, fuera del cache de FUDO de cinco minutos. No devolver asociaciones de productos ya no contables.
- [ ] **Step 4:** Prueba real de PostgreSQL con `BARCODE_TEST_DATABASE_URL` apuntando exclusivamente a DB de pruebas y schema aleatorio, siguiendo el aislamiento del test de conteos: dos asignaciones concurrentes a distintos productos dejan un solo dueño; la otra devuelve conflicto. Verificar idempotencia, eliminación específica y migración en DB vacía/con datos existentes. No usar `DATABASE_URL` productivo. Tests omitidos por falta de DB deben reportarse como pendientes, no aprobados.
- [ ] **Step 5:** Repetir suite backend y test de integración con DB aislada; esperar PASS. Commit `feat: persist protected product barcode mappings`.

## Task 3: Escáner de cámara reutilizable

**Files:** Create `frontend/src/lib/barcodeScanner.ts`, `frontend/src/lib/barcodeScanner.test.ts`, `frontend/src/components/BarcodeScanner.tsx`, `frontend/src/components/BarcodeScanner.test.tsx`. Modify `frontend/package.json`, `frontend/package-lock.json`.

**Interfaces:**
- `startBarcodeScanner(options: {video: HTMLVideoElement; signal: AbortSignal; onCode: (raw: string) => void; onError: (error: ScannerError) => void}): Promise<{stop(): void}>`.
- `ScannerError = 'permission' | 'unavailable' | 'insecure' | 'failure'`.
- `<BarcodeScanner onDetected={(raw: string) => void} onClose={() => void} />`. Montado únicamente al pulsar Escanear; cerrar desmonta. Un resultado por apertura.

- [ ] **Step 1:** Tests con streams simulados: permiso rechazado ofrece búsqueda manual; cámara ausente/HTTP inseguro tienen aviso; cerrar/desmontar libera todos los tracks; cancelar antes de resolverse getUserMedia libera el stream tardío; detecciones repetidas emiten un único resultado; document hidden/pagehide detienen cámara y requieren “Reintentar” al volver. Ningún callback posterior al cierre cambia la UI.
- [ ] **Step 2:** `npm --prefix frontend run test -- src/lib/barcodeScanner.test.ts src/components/BarcodeScanner.test.tsx`; esperar FAIL por módulos ausentes.
- [ ] **Step 3:** Instalar versiones exactas compatibles de ZXing y registrar el lockfile. Justificación de dependencia: la API nativa no tiene disponibilidad suficiente para los dos navegadores objetivo. Cargar decoder con import dinámico. Obtener stream con `audio:false` y `video:{facingMode:{ideal:'environment'}}`, pasarlo al lector limitado a EAN_13/EAN_8/UPC_A. Usar video `muted`, `autoPlay`, `playsInline`. Detener lectura y tracks al primer resultado, abortar, ocultar o desmontar. No tratar frames sin código como error fatal. Ignorar resultados tardíos mediante estado cancelado/generación de sesión.
- [ ] **Step 4:** Implementar interfaz accesible con marco de cámara, instrucciones, “Cerrar”, “Reintentar” y salida a búsqueda manual; controles de al menos 44 px. Mensajes propios en español, nunca errores crudos del navegador. Si se monta como modal, usar primitivas accesibles existentes con restauración de foco.
- [ ] **Step 5:** Repetir tests; esperar PASS. Commit `feat: add cancellable mobile barcode scanner`.

## Task 4: Configuración del dueño

**Files:** Create `frontend/src/pages/BarcodesPage.tsx`, `frontend/src/pages/BarcodesPage.test.tsx`. Modify `frontend/src/lib/api.ts`, `frontend/src/App.tsx`, `frontend/src/components/Layout.tsx`.

**Interfaces:** `productBarcodes.save(value: ProductBarcode): Promise<void>` y `productBarcodes.remove(value: ProductBarcode): Promise<void>` a través del cliente compartido. Ruta `/codigos` protegida por owner. Consume catálogo de tarea 2 y escáner de tarea 3.

- [ ] **Step 1:** Tests: buscar producto, ingresar/escanear un código, revisar nombre/código y guardar; refrescar muestra asociación; borrar elimina solo esa asociación; conflicto409 muestra “Este código ya está asociado a otro producto.”; inválido no envía petición; cajero no tiene enlace ni acceso. Un error deja valores disponibles para corregir/reintentar.
- [ ] **Step 2:** `npm --prefix frontend run test -- src/pages/BarcodesPage.test.tsx`; esperar FAIL.
- [ ] **Step 3:** Implementar pantalla “Códigos de barras” con búsqueda, selección explícita de producto, asociaciones actuales y campo manual/escaneo. Guardado requiere confirmación visual del nombre y código; no asignar al detectar automáticamente. Recargar catálogo después de mutaciones. Resolver409 específicamente en este flujo, sin reutilizar el mensaje actual “Ya existe un usuario con ese email.”
- [ ] **Step 4:** Repetir tests; esperar PASS. Commit `feat: manage barcode associations as owner`.

## Task 5: Escaneo dentro del conteo y recuento

**Files:** Modify `frontend/src/lib/barcodes.ts`, `frontend/src/lib/barcodes.test.ts`, `frontend/src/pages/CountPage.tsx`, `frontend/src/pages/CountPage.test.tsx`.

**Interfaces:** `resolveBarcode(raw: string, products: CountProduct[], allowedIds: ReadonlySet<string> | null): {kind:'match'; productId:string} | {kind:'invalid'|'unknown'|'ambiguous'|'out-of-scope'}`. Buscar coincidencias en todo el catálogo antes de comprobar alcance; nunca resolver por `code` interno ni nombre. Normalizar cada asociación de forma defensiva; cero coincidencias unknown, varias ambiguous. `allowedIds` es lista seleccionada o `recount.ids`; null permite catálogo completo.

- [ ] **Step 1:** Tests unitarios con códigos A/B: match exacto, UPC/EAN equivalentes, desconocido, duplicado ambiguo, fuera de lista y fuera de recuento. Tests de pantalla: escaneo repetido no aumenta cantidades; formulario existente conserva packs/sueltas; búsqueda previa no oculta el producto detectado; cancelar conserva borrador; escanear fuera de alcance no modifica entries/listId/checkId. Producto válido desplaza y enfoca su cantidad; no necesita abrir teclado automáticamente en iOS para aprobar.
- [ ] **Step 2:** `npm --prefix frontend run test -- src/lib/barcodes.test.ts src/pages/CountPage.test.tsx`; esperar FAIL en casos nuevos.
- [ ] **Step 3:** Añadir “Escanear” cuando catálogo está cargado y no se está guardando. Al match cerrar cámara, limpiar búsqueda, resaltar brevemente el producto y enfocar cantidad (sueltas si tiene pack). No ordenar de nuevo ni sumar. Todos los campos siguen manejados por el borrador existente. En unknown/ambiguous/out-of-scope mostrar mensaje neutral y permitir volver a escanear o buscar; no cambiar lista automáticamente. Si una asociación fue editada desde otra sesión, recargar la página para obtener el catálogo nuevo; no prometer sincronización en vivo.
- [ ] **Step 4:** Prueba de regresión del flujo completo: primer conteo solicita recuento, campos requeridos quedan vacíos, se escanea cada producto permitido, se completa y se guarda manteniendo las entradas originales no recuentadas. Assert ausencia de stock esperado/diferencias/primer conteo en toda la UI del cajero y payload ciego del servidor.
- [ ] **Step 5:** Repetir tests frontend y `npm --prefix backend run test -- --runInBand`; esperar PASS. Commit `feat: scan products during blind stock counts`.

## Task 6: Códigos reproducibles y aceptación en teléfonos

**Files:** Create `frontend/scripts/generate-barcode-fixtures.mjs`, `frontend/src/test/fixtures/barcodes/{known-a,known-b,outside-list,unknown}.png`, `frontend/src/lib/barcodeFixtures.test.ts`, `docs/testing/barcodes.html`, `docs/testing/mobile-barcode-scanning.md`. Modify `frontend/package.json`, `frontend/package-lock.json`.

**Interfaces:** Script `npm --prefix frontend run fixtures:barcodes` genera PNG y hoja HTML estática desde el mismo manifiesto de cuatro códigos EAN-13: A=`2000000000015`, B=`2000000000022`, fuera de lista=`2000000000039`, desconocido=`2000000000046`. Son etiquetas sintéticas “PRUEBA A/B/C/D”, no códigos comerciales de Coca-Cola u otra marca. La hoja es local/documental, no una ruta pública productiva.

- [ ] **Step 1:** Test de decodificación real: cargar cada PNG como luminancia con `pngjs` (dependencia dev junto con `@types/pngjs`) y usar `@zxing/library` sin simular decoder; resultado debe igualar exactamente su código del manifiesto. Una imagen blanca debe producir “no encontrado”. Declarar dependencias dev necesarias con versiones exactas. `normalizeBarcode` también debe aceptar las cuatro fixtures.
- [ ] **Step 2:** `npm --prefix frontend run test -- src/lib/barcodeFixtures.test.ts`; esperar FAIL por fixtures ausentes.
- [ ] **Step 3:** Añadir `bwip-js` dev y script; generar EAN-13 con margen blanco, alto contraste, número legible y etiquetas de prueba. HTML imprime/muestra las cuatro imágenes sin llamadas externas. Repetir generación no modifica el resultado. No usar generación de imágenes por IA para las barras.
- [ ] **Step 4:** Repetir test con decoder real; esperar PASS. Documentar cómo asociar A/B/C manualmente en entorno de pruebas a tres productos, incluir A/B en una lista y dejar D sin asociación. Los números de ejemplo pueden usarse hasta antes de guardar en producción; para guardar con cantidades ficticias usar DB y catálogo de prueba aislados. En producción guardar solo conteos físicos reales, porque alimentan el historial.
- [ ] **Step 5:** Documentar prueba manual en Safari/iPhone y Chrome/Android: permiso inicial/rechazado/reintento; A/B desde pantalla y etiqueta impresa; envase real con código verificado y asociado; C fuera de lista; D desconocido; cancelar durante permiso; mantener código en cámara sin duplicar; bloquear/desbloquear; reabrir diez veces; recuento a ciegas; teclado, orientación y controles en 360/390 px. Registrar modelo, SO, navegador, resultado y tiempo aproximado. Imágenes de Google son opcionales únicamente tras verificar que el código impreso coincide; una foto de producto no identifica automáticamente su código.
- [ ] **Step 6:** Ejecutar `npm run lint`, `npm run format:check`, `npm run test`, `npm run ai:check`, `npm run build:frontend`, `npm run build:backend` desde raíz. Esperar exit0, registrar warnings y tests omitidos. Completar pruebas DB aisladas antes de liberar. Commit `test: add barcode fixtures and mobile acceptance guide`.

## Entrega y despliegue

La ejecución del plan produce código revisado y material para el testeo. No ejecutar migraciones ni crear asociaciones de prueba en producción durante el desarrollo. Para el despliegue posterior, comprobar el estado de Railway y la autorización vigente; desplegar backend primero (migración aditiva + DTO con códigos) y frontend después. La app antigua tolera el campo nuevo; la app nueva trata campos ausentes como lista vacía. Si falla frontend, conservar backend y asociaciones, sin revertir destructivamente la migración.

El resultado solo se considera validado en ambos teléfonos tras registrar pruebas reales. Los mocks verifican manejo de errores y estado; las fixtures verifican decodificación, pero ninguno garantiza enfoque/lectura en hardware real. No bloquear la entrega de código por un teléfono no disponible: informarlo como aceptación pendiente.

## Referencias técnicas

- ZXing browser: https://github.com/zxing-js/browser — lectura desde stream y control de parada.
- BarcodeDetector: https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector — disponibilidad limitada; no es la única base de esta entrega.
- getUserMedia: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia — contexto seguro, permisos y ciclo de vida del stream.

## Autorrevisión del plan

- [x] Contratos de datos, nombres y responsabilidades definidos entre tareas.
- [x] Cada riesgo de Review Focus tiene pruebas asignadas.
- [x] Conteo y recuento conservan cantidad, privacidad y alcance; escanear no suma.
- [x] Diferenciado lo incluido del resto de la visión original, en especial fotos, extras y modo por unidad.
- [x] Material de prueba no depende de códigos comerciales encontrados en Google.
- [x] No se confunden tests simulados con aceptación en teléfonos físicos.
- [ ] Revisión del usuario antes de implementación; método previo de ejecución por subagentes conservado.
