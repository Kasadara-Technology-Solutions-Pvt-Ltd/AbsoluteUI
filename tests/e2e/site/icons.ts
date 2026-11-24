// R16 page: the AbsoluteUI icon set runtime (docs/PLAN-R16-ICONS.md M3), bundled against the built
// packages: CSS and Web Animations presets, curated morph, overlays with knockout masks, RTL mirroring.
import { animateIcon, renderIcon, type IconAnimationController } from '@absoluteui/icons';
import { arrowRightIcon, downloadIcon, fileTextIcon, lockOverlay, menuIcon, spinnerIcon } from '@absoluteui/icons/set';

declare global {
  interface Window {
    __auiReady?: boolean;
    __icons?: Readonly<Record<'spin' | 'bounce' | 'morph', IconAnimationController>>;
  }
}

const host = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
};

const spinner = renderIcon(spinnerIcon, { label: 'Saving', size: 'lg', className: 'spin' });
const download = renderIcon(downloadIcon, { variant: 'duotone', size: 'lg', className: 'bounce' });
const menu = renderIcon(menuIcon, { label: 'Menu', size: 'lg', className: 'morph' });
host('motion').append(spinner, download, menu);

host('overlays').append(
  renderIcon(fileTextIcon, { overlays: [{ icon: lockOverlay }], size: 16, className: 'locked-a' }),
  renderIcon(fileTextIcon, { overlays: [{ icon: lockOverlay }], size: 24, className: 'locked-b' }),
);
host('ltr').append(renderIcon(arrowRightIcon, { size: 'lg' }));
host('rtl').append(renderIcon(arrowRightIcon, { size: 'lg' }));

window.__icons = {
  spin: animateIcon(spinner, { preset: 'spin' }),
  bounce: animateIcon(download, { preset: 'bounce' }),
  morph: animateIcon(menu, { preset: 'morph' }),
};
Object.assign(window, { __auiReady: true });
