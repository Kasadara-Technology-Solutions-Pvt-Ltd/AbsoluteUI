import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { root, packageNames } from './lib.mjs';

for (const name of packageNames) {
  rmSync(join(root, 'packages', name, 'dist'), { recursive: true, force: true });
}
rmSync(join(root, '.cache'), { recursive: true, force: true });
rmSync(join(root, '.private-sourcemaps'), { recursive: true, force: true });
console.log('clean: ok');
