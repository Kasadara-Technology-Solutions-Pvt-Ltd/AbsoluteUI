// Gallery preview for Button (docs/PLAN-R4.md C7): its rendering docs examples show an
// icon-only button, which makes a poor preview. This frame shows the variants and states.
import { Button } from '@absoluteui/components/button';
import './runtime.js';

const host = document.getElementById('buttons');
if (host) {
  const row = (...buttons: Button[]): HTMLDivElement => {
    const div = document.createElement('div');
    div.className = 'row';
    div.append(...buttons.map((b) => b.element));
    return div;
  };
  host.append(
    row(Button.create({ text: 'Save changes', variant: 'primary' }), Button.create({ text: 'Cancel', variant: 'secondary' }), Button.create({ text: 'Learn more', variant: 'ghost' })),
    row(Button.create({ text: 'Upload', variant: 'secondary', icon: 'upload' }), Button.create({ text: 'Saving', variant: 'primary', loading: true }), Button.create({ text: 'Delete', variant: 'danger', icon: 'trash' })),
  );
}
