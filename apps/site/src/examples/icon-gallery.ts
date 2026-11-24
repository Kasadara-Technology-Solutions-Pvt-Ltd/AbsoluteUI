// Built-in icon gallery (docs/PLAN-R7.md D5): every icon of @absoluteui/icons with its name,
// rendered live in an example frame on the Icons API page. Styles use the CSSOM (allowed
// under the frame's CSP); icons are decorative and each name is visible text.
import { builtInIcons, renderIcon } from '@absoluteui/icons';

const host = document.getElementById('icon-gallery');
if (host) {
  const list = document.createElement('ul');
  list.setAttribute('aria-label', `${String(Object.keys(builtInIcons).length)} built-in icons`);
  Object.assign(list.style, { listStyle: 'none', margin: '0', padding: '0', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(9rem, 1fr))', gap: '0.5rem' });
  for (const name of Object.keys(builtInIcons).sort()) {
    const item = document.createElement('li');
    Object.assign(item.style, { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', border: '1px solid currentColor', borderRadius: '0.375rem', fontSize: '0.875rem' });
    const icon = renderIcon(name);
    if (icon instanceof SVGElement || icon instanceof HTMLElement) Object.assign(icon.style, { fontSize: '1.25rem', flex: 'none' });
    const label = document.createElement('code');
    label.textContent = name;
    item.append(icon, label);
    list.append(item);
  }
  host.append(list);
}
