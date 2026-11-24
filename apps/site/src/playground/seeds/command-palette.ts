import { Button } from '@absoluteui/components/button';
import { CommandPalette, type CommandPaletteOptions } from '@absoluteui/components/command-palette';
import { host, seed } from '../seed.js';

export default seed<CommandPaletteOptions>({
  options: {
    commands: [
      { id: 'go-dashboard', label: 'Go to dashboard', group: 'Navigation' },
      { id: 'go-people', label: 'Go to people', group: 'Navigation', keywords: ['employees', 'directory'] },
      { id: 'request-leave', label: 'Request leave', group: 'Actions', shortcut: 'Mod+Shift+L' },
      { id: 'export', label: 'Export report', group: 'Actions', disabled: true },
      { id: 'theme', label: 'Change theme', group: 'Actions', children: [{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }] },
    ],
    recent: ['go-people'],
    placeholder: 'Type a command or search',
    shortcut: 'Mod+K',
    recentLimit: 5,
    maxResults: 50,
  },
  call: 'const palette = CommandPalette.create(host, $);\nbutton.addEventListener(\'click\', () => palette.open())',
  note: 'Press Open command palette, or Ctrl+K (Cmd+K on a Mac) while the example has focus.',
  mount(stage, options) {
    const h = host(stage);
    const c = CommandPalette.create(h, options);
    const open = Button.create({ text: 'Open command palette', variant: 'secondary' }, document);
    open.element.addEventListener('click', () => { c.open(); });
    stage.append(open.element);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); open.destroy(); open.element.remove(); } };
  },
});
