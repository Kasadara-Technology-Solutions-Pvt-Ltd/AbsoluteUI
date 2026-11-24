import { ContextMenu, type ContextMenuOptions } from '@absoluteui/components/context-menu';
import { seed } from '../seed.js';

/** One target for the playground log: `aui-select` fires on the target, `aui-open`/`aui-close` on the menu. */
function both(a: EventTarget, b: EventTarget): EventTarget {
  return {
    addEventListener: (type, listener, options) => { a.addEventListener(type, listener, options); b.addEventListener(type, listener, options); },
    removeEventListener: (type, listener, options) => { a.removeEventListener(type, listener, options); b.removeEventListener(type, listener, options); },
    dispatchEvent: (event) => a.dispatchEvent(event),
  };
}

export default seed<ContextMenuOptions>({
  options: {
    label: 'Document actions',
    items: [
      { id: 'open', label: 'Open' },
      { id: 'rename', label: 'Rename', shortcut: 'F2' },
      { id: 'share', label: 'Share with', items: [{ id: 'share-manager', label: 'Manager' }, { id: 'share-hr', label: 'HR partner' }] },
      { type: 'separator' },
      { id: 'delete', label: 'Delete', tone: 'danger' },
    ],
  },
  call: 'ContextMenu.create(target, $)',
  note: 'Right-click or press Shift+F10 on the card.',
  mount(stage, options) {
    const card = document.createElement('div');
    card.tabIndex = 0;
    card.textContent = 'Employment contract - Ada Lovelace.pdf';
    card.style.cssText = 'padding:24px;border:1px dashed currentColor;border-radius:8px;max-width:360px';
    stage.append(card);
    const menu = ContextMenu.create(card, options);
    return {
      events: both(card, menu.element),
      update: (p) => { menu.update(p); },
      destroy: () => { menu.destroy(); card.remove(); },
    };
  },
});
