import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

await build({entryPoints: [fileURLToPath(new URL('../src/workbench-client.js', import.meta.url))],
  outfile: fileURLToPath(new URL('../../../.preview/private-client/workbench-client.js', import.meta.url)),
  bundle: true, format: 'iife', platform: 'browser', target: ['es2022'], minify: true, legalComments: 'inline'});
