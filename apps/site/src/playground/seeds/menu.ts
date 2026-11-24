import { Button } from '@absoluteui/components/button';
import { Menu, type MenuOptions } from '@absoluteui/components/menu';
import { seed } from '../seed.js';

/** One target for the playground log: `aui-select` fires on the trigger, `aui-open`/`aui-close` on the menu. */
function both(a: EventTarget, b: EventTarget): EventTarget {
  return {
    addEventListener: (type, listener, options) => { a.addEventListener(type, listener, options); b.addEventListener(type, listener, options); },
    removeEventListener: (type, listener, options) => { a.removeEventListener(type, listener, options); b.removeEventListener(type, listener, options); },
    dispatchEvent: (event) => a.dispatchEvent(event),
  };
}

export default seed<MenuOptions>({
  options: {
    label: 'Employee actions',
    items: [
      { id: 'edit', label: 'Edit profile', shortcut: 'E' },
      { id: 'assign', label: 'Assign to', items: [{ id: 'team-eng', label: 'Engineering' }, { id: 'team-fin', label: 'Finance' }] },
      { type: 'checkbox', id: 'remote', label: 'Works remotely', checked: true },
      { type: 'separator' },
      { id: 'offboard', label: 'Start offboarding', tone: 'danger' },
    ],
  },
  call: "const trigger = Button.create({ text: 'Actions' }).element;\nMenu.create(trigger, $)",
  note: 'Press Actions to open the menu.',
  mount(stage, options) {
    const trigger = Button.create({ text: 'Actions' }, document);
    stage.append(trigger.element);
    const menu = Menu.create(trigger.element, options);
    return {
      events: both(trigger.element, menu.element),
      update: (p) => { menu.update(p); },
      destroy: () => { menu.destroy(); trigger.destroy(); trigger.element.remove(); },
    };
  },
});
