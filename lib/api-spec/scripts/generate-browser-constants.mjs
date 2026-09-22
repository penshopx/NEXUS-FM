import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const generatedDirectory = path.resolve(
  scriptDirectory,
  '..',
  '..',
  'api-zod',
  'src',
  'generated',
);
const schemaPath = path.join(generatedDirectory, 'api.ts');
const constantsPath = path.join(generatedDirectory, 'constants.ts');
const source = await readFile(schemaPath, 'utf8');
const constantPattern =
  /^export const ([A-Za-z_$][\w$]*) = (-?(?:\d+(?:\.\d+)?|Infinity)|true|false|"[^"\r\n]*"|'[^'\r\n]*');$/gm;
const constants = [...source.matchAll(constantPattern)].map(
  ([statement]) => statement,
);

if (constants.length === 0) {
  throw new Error(`No primitive OpenAPI constraint constants found in ${schemaPath}`);
}

const output = `// Generated from OpenAPI constraints by lib/api-spec codegen.
// This module is browser-safe and intentionally has no schema-library imports.
${constants.join('\n')}
`;

await writeFile(constantsPath, output);