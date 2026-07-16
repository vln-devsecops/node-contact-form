// esbuild bundle configuration for lambda-src.
//
// Each handler is bundled into a single self-contained CommonJS file at
// dist/<handler>/handler.js - the paths terraform-modules' contact_form
// module's archive_file/aws_lambda_function.handler will expect (matching
// node-vlinder-auth's lambda-src convention). Bundling:
//   - inlines dist/shared/* into each bundle so there are no sibling
//     dependencies left in the deployed zip
//   - keeps AWS SDK v3 dependencies bundled in (not external) so deployed
//     versions are controlled by package.json, not Lambda's managed runtime
//
// Format is CommonJS: Node treats .js as CJS unconditionally when a
// package.json with "type": "commonjs" is present in the same directory. We
// write dist/package.json ourselves so the CJS bundles load correctly even
// though this source package has "type": "module".
import * as esbuild from 'esbuild';
import { rmSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

rmSync(resolve(__dirname, 'dist'), { recursive: true, force: true });

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  minify: false,
  logLevel: 'info',
};

const handlers = [
  { in: 'src/submit/handler.ts', out: 'dist/submit/handler' },
  { in: 'src/admin/handler.ts', out: 'dist/admin/handler' },
];

for (const { in: entryPoint, out: outfile } of handlers) {
  await esbuild.build({
    ...shared,
    entryPoints: [resolve(__dirname, entryPoint)],
    outfile: resolve(__dirname, `${outfile}.js`),
  });
}

writeFileSync(
  resolve(__dirname, 'dist/package.json'),
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n'
);
