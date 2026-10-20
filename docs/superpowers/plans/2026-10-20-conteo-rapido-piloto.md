# Conteo rápido para el piloto (drugstore) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el conteo diario de 30–50 artículos de alto riesgo lleve menos de 10 minutos: carga por bultos, lista en orden de góndola con progreso, recuento automático a ciegas, y un deploy separado para el drugstore.

**Architecture:** Se extiende lo que ya existe (conteo a ciegas, listas de conteo, panel). Los bultos viven en nuestra base (`product_packs`) y se agregan al producto que ve la pantalla de conteo; el backend sigue recibiendo y guardando solo unidades totales, así que `reconcile.ts` no cambia. El recuento es un paso previo al guardado (`POST /api/counts/check`) que devuelve solo ids a recontar, nunca cifras.

**Tech Stack:** Express + TypeScript + PostgreSQL 15 (Jest + supertest), React 19 + Vite + Tailwind 4 + shadcn/ui (Vitest + Testing Library).

**Spec:** `docs/specs/2026-10-20-app-conteo-stock.md` (idea de Evaristo). Alcance acordado en el análisis: secciones 6.2 (bultos), 6.3 (guía por góndola), 6.4 (recuento) y deploy por cliente (sección 9, "multi-cliente"). Fuera de este plan: escaneo con cámara (6.1), dos personas (6.5), offline completo (6.6), aviso de conteo no hecho, rotativo, ingreso de mercadería (6.8), escritura en FUDO.

## Global Constraints

- FUDO es **solo lectura**. Nada de este plan escribe en FUDO.
- **Conteo a ciegas:** un `counter` nunca recibe stock del sistema, esperado, diferencia ni dirección (sobra/falta). Ninguna respuesta nueva para `counter` incluye números del sistema.
- El backend guarda **unidades totales** en `count_lines.counted`. Bultos y sueltas son solo forma de carga.
- Migraciones nuevas en `backend/src/db/migrations/NNN_description.sql`, idempotentes (`IF NOT EXISTS`), como `002_count_lists.sql`.
- Ids de producto FUDO: `^\d{1,10}$` (mismo regex que `routes/counts.ts`).
- Texto de UI en español rioplatense ("Contá", "Volvé a contar"), como el resto de la app.
- Mensajes de error del servidor nunca se muestran: el frontend usa `errorMessage()` de `lib/api.ts`.
- Antes de cerrar cada task: `npm run lint`, `npm run format:check`, `npm run test`, `npm run ai:check` (AGENTS.md).
- Tests: leer `.ai/global/skills/nodejs-react-starter-testing/SKILL.md` (casos requeridos por ruta: input inválido, 401, 403, 404, happy path al final).

## Review Focus

1. **Bulto mal cargado o borrado a mitad de un conteo** (borrador con bultos guardado, el dueño saca el bulto): el borrador no debe perder ni inventar unidades. Test en Task 3 (`ignores pack counts when the product has no pack anymore`… se suman solo las sueltas y se marca inválido si había bultos).
2. **Sondeo del recuento:** un cajero puede llamar `/counts/check` repetido con números distintos para adivinar el esperado. Límite de 3 checks por usuario cada 30 min y cada check queda guardado. Test en Task 6 (`answers 429 after 3 checks`).
3. **Recarga del celular en medio del recuento:** el estado de recuento (`checkId` + ids) debe sobrevivir la recarga, igual que el borrador. Test en Task 7.
4. **Producto en la lista que FUDO desactivó:** el orden de góndola no debe romperse ni mostrar huecos. Test en Task 4 (repo/servicio ya filtra; test de orden con id filtrado).
5. **"No hay ninguno" en producto con bulto:** debe dejar bultos vacíos y sueltas en `0`, total 0, no "sin contar". Test en Task 5.

---

### Task 1: Bultos por producto (backend)

**Files:**
- Create: `backend/src/db/migrations/003_product_packs.sql`
- Create: `backend/src/db/queries/productPacks.ts`
- Create: `backend/src/services/productPacks.ts`, `backend/src/services/productPacks.test.ts`
- Create: `backend/src/routes/productPacks.ts`
- Modify: `backend/src/domain/types.ts` (tipos + `Services.productPacks`, `CountProduct.pack`)
- Modify: `backend/src/services/products.ts` (dep `packs()`), `backend/src/services/products.test.ts`
- Modify: `backend/src/routes/products.ts` (serializar `pack`)
- Modify: `backend/src/app.ts` (montar `/api/product-packs`), `backend/src/index.ts` (wiring), `backend/src/app.test.ts`

**Interfaces:**
- Produces (types.ts):
  ```ts
  export interface ProductPack { productId: string; units: number; label: string }
  // CountProduct gains: pack: { units: number; label: string } | null
  Services.productPacks: {
    upsert(packs: ProductPack[]): Promise<void>;
    remove(productId: string): Promise<boolean>;
  }
  ```
- Produces (services/productPacks.ts): `interface ProductPacksRepo { all(): Promise<Map<string, { units: number; label: string }>>; upsert(packs: ProductPack[]): Promise<void>; remove(productId: string): Promise<boolean> }` and `createProductPacksService({ repo, countableProductIds })`.
- Produces (HTTP):
  - `GET /api/products` → cada producto trae `pack: { units, label } | null`.
  - `PUT /api/product-packs` (owner) body `{ packs: [{ productId, units, label }] }` → `204`.
  - `DELETE /api/product-packs/:productId` (owner) → `204` | `404`.

- [x] **Step 1: Migración**

`003_product_packs.sql`: tabla `product_packs (product_id TEXT PRIMARY KEY CHECK (product_id ~ '^[0-9]{1,10}$'), units INTEGER NOT NULL CHECK (units BETWEEN 2 AND 1000), label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 20), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`. Comentario arriba: "Units per closed pack (cajón, fardo, cartón). Lives here, not in FUDO."

Run: `cd backend && npm run db:migrate` → Expected: aplica `003_product_packs.sql` sin error.

- [x] **Step 2: Tests del servicio (fallan)**

`productPacks.test.ts`, mismo estilo que `countLists.test.ts` (repo falso en memoria, `countable = ['13','14','16']`):
```ts
it('rejects packs for products that FUDO does not offer for counting', async () => {
  await expect(service.upsert([{ productId: '999', units: 24, label: 'cajón' }]))
    .rejects.toMatchObject({ statusCode: 400 });
  expect(saved).toHaveLength(0);
});
it('saves valid packs', async () => {
  await service.upsert([{ productId: '14', units: 24, label: 'cajón' }]);
  expect(saved).toEqual([[{ productId: '14', units: 24, label: 'cajón' }]]);
});
```
Run: `cd backend && npx jest src/services/productPacks.test.ts` → FAIL (módulo no existe).

- [x] **Step 3: Implementar repo + servicio**

Repo: `upsert` en una transacción con `INSERT ... SELECT unnest($1::text[]), unnest($2::int[]), unnest($3::text[]) ON CONFLICT (product_id) DO UPDATE SET units = EXCLUDED.units, label = EXCLUDED.label, updated_at = now()`. Reusar el patrón `inTransaction` de `queries/countLists.ts` (copiar no; si hace falta en los dos, moverlo a `db/queries/tx.ts` y que ambos lo importen). Servicio: valida contra `countableProductIds()` con `HttpError(400, 'Hay productos que no se pueden contar')`, igual que `countLists.ts`.

Run: `npx jest src/services/productPacks.test.ts` → PASS.

- [x] **Step 4: `pack` en la lista de conteo**

Test en `products.test.ts`: `it('adds the pack to each product and reads packs fresh even when the product list is cached')` — dos llamadas a `listForCount()` dentro de `CACHE_MS`, el falso `packs()` devuelve `{14: {units: 24, label: 'cajón'}}` en la segunda; esperar `pack` actualizado y `pack: null` para el resto.

Implementar: nueva dep `packs(): Promise<Map<string, { units: number; label: string }>>` en `createProductsService`; el cache sigue guardando solo lo de FUDO; los packs se mezclan después del cache en cada llamada. `routes/products.ts` serializa `pack`.

Run: `npx jest src/services/products.test.ts` → PASS.

- [x] **Step 5: Rutas + tests de app**

En `app.test.ts`, bloque `describe('PUT /api/product-packs')` con los casos de la skill de testing:
- `401` sin cookie; `403` con counter.
- `400` para: `units: 1`, `units: 1001`, `units: 2.5`, `label: ''`, `label` de 21 chars, `productId: 'abc'`, `packs: []`, más de 2000 items, `productId` duplicado, campo extra (schema `.strict()`).
- happy path: `204` y el falso recibió los packs.
- `DELETE /api/product-packs/14`: `401`, `403`, `400` para `abc`, `404` cuando `remove` devuelve false, `204`.

Schema zod: `{ packs: z.array(z.object({ productId: /^\d{1,10}$/, units: z.number().int().min(2).max(1000), label: z.string().trim().min(1).max(20) }).strict()).min(1).max(2000) }` con refine de duplicados igual que `countLists.ts`.

Run: `cd backend && npm run test` → PASS.

- [x] **Step 6: Commit**

```bash
git add backend/src
git commit -m "feat(backend): units per pack for each product"
```

---

### Task 2: Pantalla de bultos para el dueño (con pegado de planilla)

**Files:**
- Create: `frontend/src/lib/packCsv.ts`, `frontend/src/lib/packCsv.test.ts`
- Create: `frontend/src/pages/PacksPage.tsx`, `frontend/src/pages/PacksPage.test.tsx`
- Modify: `frontend/src/types/api.ts` (`CountProduct.pack`), `frontend/src/lib/api.ts` (`productPacks`)
- Modify: `frontend/src/App.tsx` (ruta `/bultos`, rol owner, igual que `/listas`), `frontend/src/components/Layout.tsx` (link "Bultos" para owner)

**Interfaces:**
- Consumes: HTTP de Task 1.
- Produces:
  ```ts
  // types/api.ts
  CountProduct.pack: { units: number; label: string } | null
  // lib/api.ts
  export const productPacks = {
    save: (packs: { productId: string; units: number; label: string }[]) => Promise<void>,
    remove: (productId: string) => Promise<void>,
  };
  // lib/packCsv.ts
  export function parsePackCsv(text: string, products: CountProduct[]):
    { packs: { productId: string; units: number; label: string }[];
      errors: { line: number; text: string }[] };
  ```

- [x] **Step 1: Tests de `parsePackCsv` (fallan)**

Formato: una fila por línea, `producto;unidades;etiqueta` (también `,` o tab como separador). `producto` = código FUDO exacto o nombre (sin tildes ni mayúsculas, igual que `normalize` de `CountPage.tsx`). Etiqueta opcional, default `'bulto'`.
```ts
it('matches by code or by name ignoring accents and case', ...)
  // 'Coca 354;24;cajón' y '7\t6\tfardo' → dos packs
it('skips a header row and blank lines', ...)
  // 'producto;unidades;etiqueta' no cuenta como error
it('reports unknown products, units outside 2..1000 and ambiguous names with their line number', ...)
  // 'Inexistente;10' → error línea 1; 'Coca 354;1' → error; dos productos con el mismo nombre → error
```
Run: `cd frontend && npx vitest run src/lib/packCsv.test.ts` → FAIL.

- [x] **Step 2: Implementar `parsePackCsv`**

Mover `normalize` de `CountPage.tsx` a `lib/format.ts` (exportada) y usarla en los dos lados.

Run: mismo comando → PASS.

- [x] **Step 3: Tests de `PacksPage` (fallan)**

Mock de `@/lib/api` como `CountPage.test.tsx`.
- `it('saves the units typed for a product')`: escribir `24` en el campo "Unidades por bulto" de "Coca 354", etiqueta `cajón`, Guardar → `productPacks.save` con `[{productId:'30', units:24, label:'cajón'}]`.
- `it('imports a pasted sheet and lists the rows it could not read')`: pegar dos filas válidas y una inválida → muestra "Línea 3: …" y botón "Importar 2 bultos" → `save` con las dos.
- `it('removes a pack')` → `productPacks.remove('30')`.

- [x] **Step 4: Implementar `PacksPage`**

Lista de productos agrupada por categoría (mismo agrupado que `ListsPage.tsx`), buscador, y por fila: unidades (`inputMode="numeric"`), etiqueta, guardar/quitar. Arriba, `Card` "Pegar planilla" con `<textarea>` + vista previa de `parsePackCsv` + botón "Importar N bultos". Errores con `Notice tone="error"`.

Run: `cd frontend && npm run test` → PASS.

- [x] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): owner screen to set units per pack"
```

---

### Task 3: Contar por bultos + sueltas

**Files:**
- Modify: `frontend/src/lib/countDraft.ts`, `frontend/src/lib/countDraft.test.ts`
- Modify: `frontend/src/pages/CountPage.tsx`, `frontend/src/pages/CountPage.test.tsx`

**Interfaces:**
- Consumes: `CountProduct.pack` (Task 2).
- Produces:
  ```ts
  // countDraft.ts — CountDraft keeps loose units (unchanged shape, old drafts still load)
  export type PackDraft = Record<string, string>; // closed packs typed, by product id
  export function parsePacks(text: string): number | null; // integers only, NaN otherwise
  export function draftToEntries(
    draft: CountDraft,
    packs?: PackDraft,
    unitsPerPack?: Map<string, number>
  ): { entries: { productId: string; counted: number }[]; invalid: string[] };
  ```

- [x] **Step 1: Tests (fallan)**

```ts
it('adds closed packs times units per pack to the loose units', () => {
  expect(draftToEntries({ '30': '5' }, { '30': '3' }, new Map([['30', 12]])).entries)
    .toEqual([{ productId: '30', counted: 41 }]);
});
it('counts a product with only packs typed', ...)       // packs '2', loose '' → 24
it('marks fractional or non numeric packs as invalid', ...) // '1,5' → invalid
it('ignores pack counts when the product has no pack anymore', ...)
  // packs {'30':'3'}, sin unitsPerPack → invalid ['30'] (no inventa ni pierde unidades en silencio)
```
Run: `cd frontend && npx vitest run src/lib/countDraft.test.ts` → FAIL.

- [x] **Step 2: Implementar**

Un producto está "contado" si bultos o sueltas no están vacíos. Total redondeado a 3 decimales.

Run → PASS.

- [x] **Step 3: Tests de pantalla (fallan)**

En `CountPage.test.tsx`, dar a "Coca 1.5L" `pack: { units: 6, label: 'fardo' }`:
- `it('shows packs and loose fields for products with a pack and sends the total')`: escribir `3` en "Fardos de Coca 1.5L" y `2` en "Sueltas de Coca 1.5L" → ve "= 20 u." → guardar → `create` con `{ productId: '30', counted: 20 }`.
- `it('adds one pack with the +1 button')`: click "+1 fardo" dos veces → campo bultos `2`.
- `it('keeps packs typed after a reload')`: el borrador de bultos se guarda en `localStorage` key `count-draft-packs`.

- [x] **Step 4: Implementar en `CountPage.tsx`**

Para productos con `pack`: dos `Input` (bultos con `aria-label="Fardos de {name}"` usando la etiqueta en plural simple — agregar `s` —, sueltas con `aria-label="Sueltas de {name}"`), botón `+1 {label}`, y el total `= N u.` (es lo que el cajero contó, no cifra del sistema: no rompe el conteo a ciegas). Sin `pack`, el input único de hoy. `PackDraft` persistido igual que `DRAFT_KEY`, limpiado al guardar.

Run: `cd frontend && npm run test` → PASS.

- [x] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): count closed packs plus loose units"
```

---

### Task 4: Orden de recorrido (góndola) en las listas

**Files:**
- Create: `backend/src/db/migrations/004_count_list_order.sql`
- Modify: `backend/src/db/queries/countLists.ts`
- Modify: `backend/src/services/countLists.test.ts`, `backend/src/app.test.ts`
- Modify: `frontend/src/pages/ListsPage.tsx`, `frontend/src/pages/ListsPage.test.tsx`
- Modify: `frontend/src/pages/CountPage.tsx`, `frontend/src/pages/CountPage.test.tsx`

**Interfaces:**
- Contract change (sin cambiar tipos): `CountList.productIds` pasa a estar **en orden de recorrido** (el orden en que se guardó), no ordenado por id.

- [x] **Step 1: Migración**

`004_count_list_order.sql`: `ALTER TABLE count_list_products ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;` Comentario: "Walking order inside the shop (gondola by gondola)."

Run: `cd backend && npm run db:migrate` → aplica sin error.

- [x] **Step 2: Repo guarda y lee el orden**

`replaceProducts`: `INSERT ... SELECT $1, id, ord FROM unnest($2::text[]) WITH ORDINALITY AS t(id, ord)`. `SELECT_LISTS`: `array_agg(p.product_id ORDER BY p.position, p.product_id)`.

Test en `countLists.test.ts`: `it('keeps the saved order when a product drops out of FUDO')` — repo devuelve `['16','999','13']`, countable sin `999` → `['16','13']`.

Run: `cd backend && npm run test` → PASS. Verificación manual contra la base: crear una lista con `['16','13']` por la API y leerla → `['16','13']`.

- [x] **Step 3: Editor de listas con orden (tests primero)**

`ListsPage.test.tsx`: `it('saves products in the walking order set with the arrows')` — seleccionar A, B, C; click "Bajar A" → guardar envía `[B, A, C]`.

Implementar: en `ListEditor`, sección "Orden de recorrido" con los seleccionados en orden y botones "Subir"/"Bajar" (`aria-label="Subir {name}"`). Estado `order: string[]` reemplaza a `selected: Set` (seleccionar agrega al final, des-seleccionar saca). `submit` envía `order`. Ya no se reordena por categoría al guardar.

- [x] **Step 4: Conteo en orden de recorrido (tests primero)**

`CountPage.test.tsx`: `it('lists the products of a list in walking order without category groups')` — lista `['30','16']` → los labels aparecen en ese orden.

Implementar: con lista elegida, un solo grupo con título = nombre de la lista, en el orden de `productIds`. Sin lista ("Todos los productos"), sigue por categoría.

Run: `cd frontend && npm run test` → PASS.

- [x] **Step 5: Commit**

```bash
git add backend/src frontend/src
git commit -m "feat: count lists keep the walking order of the shop"
```

---

### Task 5: Progreso y "No hay ninguno"

**Files:**
- Modify: `frontend/src/pages/CountPage.tsx`, `frontend/src/pages/CountPage.test.tsx`

- [x] **Step 1: Tests (fallan)**

- `it('shows how many products of the list are counted')`: lista de 2, contar 1 → texto `Llevás 1 de 2`.
- `it('marks a product as zero with "No hay ninguno"')`: click `No hay ninguno: Pollo` → input `0`, se envía `counted: 0`.
- `it('sets loose to 0 and clears packs for a product with a pack')` (Review Focus 5): bultos `3` → "No hay ninguno" → bultos vacío, sueltas `0`, total `0`.

- [x] **Step 2: Implementar**

En la barra fija inferior, `Llevás {contados} de {total en el alcance}` reemplaza el `plural(...)` actual cuando hay lista; sin lista queda el texto de hoy. Fila contada con tilde (`Check` de lucide). Botón chico "No hay ninguno" con `aria-label="No hay ninguno: {name}"`.

Run: `cd frontend && npm run test` → PASS.

- [x] **Step 3: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): count progress and explicit zero"
```

---

### Task 6: Recuento automático a ciegas (backend)

**Files:**
- Create: `backend/src/db/migrations/005_count_checks.sql`
- Modify: `backend/src/config/env.ts` (`recountMinDifference`)
- Modify: `backend/src/services/reconcile.ts` (`CountLine.firstCounted`), `backend/src/services/reconcile.test.ts`
- Modify: `backend/src/services/counts.ts`, `backend/src/services/counts.test.ts`
- Modify: `backend/src/db/queries/counts.ts`
- Modify: `backend/src/domain/types.ts`, `backend/src/routes/counts.ts`, `backend/src/app.test.ts`, `backend/src/index.ts`
- Modify: `backend/env.example` (documentar `RECOUNT_MIN_DIFFERENCE`)

**Interfaces:**
- Produces:
  ```ts
  // reconcile.ts
  CountLine.firstCounted: number | null   // reconcileCount always sets null
  // types.ts
  NewCount.checkId?: string
  Services.counts.check(user: User, input: NewCount):
    Promise<{ checkId: string; recount: string[] }>
  // services/counts.ts — CountsRepo gains
  insertCheck(row: { userId: string; listId: string | null;
    entries: { productId: string; counted: number }[]; recountIds: string[] }): Promise<string>;
  getCheck(id: string): Promise<{ id: string; userId: string; createdAt: Date;
    usedAt: Date | null; entries: { productId: string; counted: number }[];
    recountIds: string[] } | null>;
  // NewCountRow gains checkId: string | null (insert marks it used in the same transaction)
  ```
- HTTP: `POST /api/counts/check` (cualquier usuario logueado) body igual a `POST /api/counts` sin `checkId` → `200 { checkId, recount: string[] }`. `POST /api/counts` acepta `checkId?: uuid`. `GET /api/counts/:id` agrega `firstCounted` por línea.

- [x] **Step 1: Migración y config**

`005_count_checks.sql`: `count_checks (id UUID PK DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id), list_id UUID REFERENCES count_lists(id) ON DELETE SET NULL, entries JSONB NOT NULL, recount_ids TEXT[] NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), used_at TIMESTAMPTZ)` y `ALTER TABLE count_lines ADD COLUMN IF NOT EXISTS first_counted NUMERIC(14, 3);` Comentario: los checks quedan guardados para que el dueño pueda ver si alguien sondeó.

`env.ts`: `recountMinDifference: Number(optional('RECOUNT_MIN_DIFFERENCE') ?? 1)`; si no es número > 0, `throw new Error('RECOUNT_MIN_DIFFERENCE must be a positive number')` (fail closed, como el resto).

- [x] **Step 2: Tests del servicio (fallan)**

En `counts.test.ts` (fake repo/fudo ya existentes):
- `it('asks to recount only products whose difference reaches the threshold, in either direction')`: esperado 10; contados 10, 8, 12, 10.5 con umbral 1 → `recount` = los de 8 y 12, no el de 10.5.
- `it('check never returns figures')`: `Object.keys(result)` es `['checkId','recount']`.
- `it('stores the first count of recounted products and saves the second one as counted')`: check con 8 → create con `checkId` y 10 → línea con `counted: 10, firstCounted: 8`; productos no recontados `firstCounted: null`.
- `it('rejects a check of another user, already used or older than 2 hours')` → `HttpError 400 'El recuento venció. Volvé a empezar.'` en los tres casos.
- `it('saves without check when no checkId is sent')` (flujo actual intacto).

Run: `cd backend && npx jest src/services/counts.test.ts` → FAIL.

- [x] **Step 3: Implementar**

Extraer de `create` una función interna `computeLines(input, countedAt)` → `{ list, lines }` (todo lo que hoy va de leer la lista hasta `reconcileCount`), y usarla en `create` y en `check`. `check`: `recount = lines.filter(l => Math.abs(l.difference) >= recountMinDifference).map(l => l.productId)`; guarda con `insertCheck`. `create` con `checkId`: valida (mismo usuario, `usedAt === null`, `createdAt` ≤ 2 h), pone `firstCounted` desde `check.entries` para ids en `recountIds`, pasa `checkId` a `repo.insert`, que hace `UPDATE count_checks SET used_at = now()` dentro de su transacción. Nueva dep `recountMinDifference: number` en `createCountsService`.

Run → PASS.

- [x] **Step 4: Rutas (tests primero)**

`app.test.ts`, `POST /api/counts/check`: `401`; `400` con los mismos inputs inválidos que `POST /api/counts`; counter recibe `{ checkId, recount }` y nada más; **`429` al cuarto check del mismo usuario en 30 min** (Review Focus 2). `POST /api/counts` con `checkId: 'x'` → `400`.

Implementar: `createRateLimiter({ windowMs: 30 * 60 * 1000, max: 3 })` keyed por `req.user!.id`, solo en `/check`. `ponytail:` comment: in-memory, se resetea al reiniciar; pasar a la tabla `count_checks` si hace falta. Serializar `firstCounted` en `GET /api/counts/:id`.

Run: `cd backend && npm run test` → PASS.

- [x] **Step 5: Commit**

```bash
git add backend/src backend/env.example
git commit -m "feat(backend): blind recount of products that do not match"
```

---

### Task 7: Recuento automático a ciegas (frontend)

**Files:**
- Modify: `frontend/src/lib/api.ts` (`counts.check`, `checkId` en `create`), `frontend/src/types/api.ts` (`CountLine.firstCounted`)
- Modify: `frontend/src/pages/CountPage.tsx`, `frontend/src/pages/CountPage.test.tsx`
- Modify: `frontend/src/pages/CountDetailPage.tsx` (+ test si existe; si no, crear `CountDetailPage.test.tsx`)

**Interfaces:**
- Consumes: HTTP de Task 6.
- Produces: `counts.check(input: { entries; listId? }) => Promise<{ checkId: string; recount: string[] }>`.

- [x] **Step 1: Tests (fallan)**

- `it('asks to recount the flagged products without saying if there is more or less')`: `check` devuelve `recount: ['16']` → aparece "Volvé a contar 1 producto", solo se ve "Pollo", su campo vacío, y el texto de la pantalla no contiene "falta", "sobra" ni números del sistema.
- `it('saves with the check id after the recount')`: escribir de nuevo y guardar → `create` con `checkId` y el valor nuevo.
- `it('saves right away when nothing needs a recount')`: `recount: []` → `create` con `checkId`, sin pantalla de recuento.
- `it('resumes the recount after a reload')` (Review Focus 3): estado en `localStorage` key `count-recount` (`{ checkId, ids }`), se limpia al guardar.
- `it('shows the server message for an expired recount and lets the counter start again')`: `create` rechaza 400 → `Notice` de error y botón "Empezar de nuevo" que borra `count-recount`.

- [x] **Step 2: Implementar**

`save()`: `check` → si `recount` vacío, `create({ ..., checkId })`; si no, guarda `{ checkId, ids }`, vacía en el borrador (bultos y sueltas) solo esos ids y filtra la vista a ellos con un `Notice` "Volvé a contar N producto(s). Contalos de nuevo con calma." El confirm de "¿Guardar el conteo…?" queda antes del `check`.

`CountDetailPage.tsx` (solo dueño): si `line.firstCounted !== null`, mostrar "1er conteo: {formatUnits(firstCounted)}" junto a lo contado.

Run: `cd frontend && npm run test` → PASS.

- [x] **Step 3: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): blind recount step before saving a count"
```

---

### Task 8: Deploy separado para el drugstore

**Files:**
- Modify: `README.md` (sección "Otro comercio")

- [x] **Step 1: Verificar que no hay datos de un comercio en el código**

Run: `grep -rni "hornos" backend/src frontend/src --exclude=*.test.ts --exclude=*.test.tsx`
Expected: sin resultados (hoy solo aparece en tests).

- [x] **Step 2: Documentar**

En `README.md`, bajo "Deploy en Railway", sección `### Otro comercio`: un proyecto de Railway nuevo por comercio (Postgres + backend + frontend, mismas variables), con sus propias `FUDO_API_KEY`/`FUDO_API_SECRET`, `TELEGRAM_CHAT_ID` del dueño de ese comercio, `BOOTSTRAP_OWNER_*` propio y `RECOUNT_MIN_DIFFERENCE` si se quiere otro umbral. Una línea: "Multi-comercio en un solo deploy queda para cuando haya 3+ comercios o haga falta un panel del implementador."

- [x] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: one railway project per shop"
```

---

### Verificación final

- [x] Run: `npm run lint && npm run format:check && npm run test && npm run ai:check` desde la raíz → todo PASS, mostrar la salida.
- [ ] Prueba manual en el celular (dev server): lista "Alto riesgo" de 5 productos en orden de góndola, uno con bulto de 10, contar con un número mal a propósito → pide recuento sin cifras → guardar → el dueño ve "1er conteo" en el detalle.
  - Pendiente: no hay un entorno local con datos de demostración ni un dispositivo móvil conectado para recorrer este flujo sin usar credenciales o datos reales.
