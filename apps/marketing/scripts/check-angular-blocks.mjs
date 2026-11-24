// Compile the Angular block code with ngc in strict template mode (MR-2), so the code the Blocks
// page shows is known to compile against the published @absoluteui/angular API.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { appDir, cacheDir, root } from './lib/shared.mjs';

const ngc = join(root, 'node_modules', '@angular', 'compiler-cli', 'bundles', 'src', 'bin', 'ngc.js');
const project = join(appDir, 'frames', 'blocks', 'angular', 'tsconfig.json');
const result = spawnSync(process.execPath, [ngc, '-p', project], { cwd: cacheDir, stdio: 'inherit' });
if (result.status !== 0) {
  console.error('check-angular-blocks: ngc failed');
  process.exit(result.status ?? 1);
}
console.log('check-angular-blocks: Angular block code compiles (strict templates)');
