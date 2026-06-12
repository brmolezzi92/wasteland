// Copia web/src/engine/tilemap.ts → server/src/shared/tilemap.ts
// tilemap.ts es lógica pura (sin Pixi) y es la fuente de verdad del mundo.
// Correr tras editar el tilemap del cliente: npm run sync:tilemap
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../web/src/engine/tilemap.ts');
const dst = resolve(here, '../src/shared/tilemap.ts');

const header = `// ⚠ ARCHIVO GENERADO — NO EDITAR A MANO.
// Espejo de web/src/engine/tilemap.ts. Regenerar con: npm run sync:tilemap
`;

const body = readFileSync(src, 'utf8');
mkdirSync(dirname(dst), { recursive: true });
writeFileSync(dst, header + body, 'utf8');
console.log(`✓ tilemap sincronizado → ${dst}`);
