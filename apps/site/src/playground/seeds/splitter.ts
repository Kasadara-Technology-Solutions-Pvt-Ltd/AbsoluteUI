import { Splitter, type SplitterOptions } from '@absoluteui/components/splitter';
import { host, seed } from '../seed.js';

function pane(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'pg-pane';
  el.textContent = text;
  return el;
}

export default seed<SplitterOptions>({
  options: {
    panes: [
      { content: pane('Employees'), label: 'Employees', size: '30%', min: 120, collapsible: true },
      { content: pane('Details'), label: 'Details', min: 160 },
    ],
  },
  call: 'Splitter.create(host, $)',
  codeValues: {
    panes: "[\n  { content: list, label: 'Employees', size: '30%', min: 120, collapsible: true },\n  { content: details, label: 'Details', min: 160 },\n]",
  },
  hide: ['panes'],
  note: 'Drag a separator or focus it and use the arrow keys, Home, End, and Enter.',
  mount(stage, options) {
    const h = host(stage);
    h.style.setProperty('block-size', '16rem');
    const c = Splitter.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
