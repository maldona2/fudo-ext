import bwipjs from 'bwip-js';
import { mkdir, writeFile } from 'node:fs/promises';
const fixtures = [
  ['known-a', 'PRUEBA A', '2000000000015', 'Asociar al producto A de la lista.'],
  ['known-b', 'PRUEBA B', '2000000000022', 'Asociar al producto B de la lista.'],
  ['outside-list', 'PRUEBA C', '2000000000039', 'Asociar a un producto fuera de la lista.'],
  ['unknown', 'PRUEBA D', '2000000000046', 'Dejar sin asociación.'],
];
const output = new URL('../src/test/fixtures/barcodes/', import.meta.url);
const docs = new URL('../../docs/testing/', import.meta.url);
await mkdir(output, { recursive: true });
await mkdir(docs, { recursive: true });
for (const [name, , code] of fixtures) {
  const png = await bwipjs.toBuffer({ bcid: 'ean13', text: code, scale: 3, height: 25, includetext: true, paddingwidth: 12, paddingheight: 10, backgroundcolor: 'FFFFFF' });
  await writeFile(new URL(`${name}.png`, output), png);
}
const cards = fixtures.map(([name, label, code, note]) => `<article><h2>${label}</h2><img src="../../frontend/src/test/fixtures/barcodes/${name}.png" alt="Código EAN-13 ${code}"><p><strong>${code}</strong></p><p>${note}</p></article>`).join('\n');
await writeFile(new URL('barcodes.html', docs), `<!doctype html>
<html lang="es-AR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Códigos para probar el escaneo</title>
<style>body{font:18px system-ui;margin:2rem auto;padding:0 1rem;max-width:65rem;color:#111;background:white}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,24rem),1fr));gap:2rem}article{border:1px solid #aaa;padding:1.5rem;break-inside:avoid}img{display:block;max-width:100%;height:auto}p{line-height:1.5}@media print{body{margin:0}article{page-break-inside:avoid}}</style>
<h1>Prueba de escaneo desde el celular</h1><p>Etiquetas sintéticas de prueba, sin relación con marcas comerciales. Mostrá esta hoja en otra pantalla o imprimila. No guardes cantidades ficticias sobre productos reales en producción.</p><main>${cards}</main></html>\n`);
console.log('Generated four EAN-13 fixtures and docs/testing/barcodes.html');
