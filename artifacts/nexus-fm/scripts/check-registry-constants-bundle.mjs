import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const artifactDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const buildResult = await build({
  configFile: path.join(artifactDirectory, 'vite.config.ts'),
  root: artifactDirectory,
  build: {
    write: false,
  },
});
const outputs = Array.isArray(buildResult) ? buildResult : [buildResult];
const bundledModules = new Set(
  outputs.flatMap(({ output }) =>
    output.flatMap((item) =>
      item.type === 'chunk' ? Object.keys(item.modules) : [],
    ),
  ),
);
const normalizedModules = [...bundledModules].map((moduleId) =>
  moduleId.split(path.sep).join('/'),
);
const constantsModule = '/lib/api-zod/src/generated/constants.ts';
const schemaModule = '/lib/api-zod/src/generated/api.ts';

if (!normalizedModules.some((moduleId) => moduleId.endsWith(constantsModule))) {
  throw new Error('Registry constants module was not included in the production bundle.');
}

if (normalizedModules.some((moduleId) => moduleId.endsWith(schemaModule))) {
  throw new Error(
    'Full generated Zod schemas were included in the production bundle with registry constants.',
  );
}

console.log(
  'Production bundle includes registry constants without the generated Zod schema module.',
);