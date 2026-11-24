// Results quoted in the Icons guide (apps/site/src/content/docs/docs/guides/icons.md).
import { expect, it } from 'vitest';
import * as fa from '@fortawesome/free-solid-svg-icons';
import * as lucide from 'lucide';
import { webFontHosts } from '@absoluteui/theme';
import { builtInIcons } from '@absoluteui/icons';

it('matches the library facts quoted in the Icons guide', () => {
  // "Lucide 1.49 has 1,857 icons; Font Awesome Free 7.3 solid has 1,422" (update the guide when the dev dependencies change).
  const lucideIcons = new Set(Object.values(lucide).filter((v) => Array.isArray(v) && Array.isArray(v[0])));
  const isIcon = (v: unknown): v is fa.IconDefinition => typeof v === 'object' && v !== null && 'iconName' in v && 'icon' in v;
  const solid = new Set(Object.values(fa).flatMap((v: unknown) => (isIcon(v) ? [v.iconName] : [])));
  expect([lucideIcons.size, solid.size]).toEqual([1857, 1422]);
  // "Content-Security-Policy: style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com"
  expect(webFontHosts.google).toEqual({ styleSrc: 'https://fonts.googleapis.com', fontSrc: 'https://fonts.gstatic.com' });
  // The Lucide provider maps these built-in names.
  for (const name of ['close', 'calendar', 'search', 'chevron-down', 'chevron-left', 'chevron-right']) expect(Object.hasOwn(builtInIcons, name), name).toBe(true);
  // The Font Awesome recipe registers `bell`, which is not built in (so it adds a name).
  expect(Object.hasOwn(builtInIcons, 'bell')).toBe(false);
});
