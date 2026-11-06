// Build do Home Tender: copia app/ para dist/ e carimba a versão (import map, service worker).
import {cpSync, rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

rmSync('dist', {recursive: true, force: true});
cpSync('app', 'dist', {recursive: true});
execFileSync(process.execPath, ['tools/version-drinks.mjs', 'dist'], {stdio: 'inherit'});
