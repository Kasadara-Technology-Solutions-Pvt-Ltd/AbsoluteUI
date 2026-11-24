import { instant } from '@absoluteui/core';
import { Button } from '@absoluteui/components/button';
import { SessionWarningDialog, type SessionWarningDialogOptions } from '@absoluteui/components/session-warning-dialog';
import { seed } from '../seed.js';

const TWO_MINUTES = 2 * 60_000;

export default seed<SessionWarningDialogOptions>({
  options: {
    expiresAt: instant(Date.now() + TWO_MINUTES),
    title: 'Your session is about to expire',
    message: 'For your security, you will be signed out of the HR portal soon.',
    extendLabel: 'Stay signed in',
    signOutLabel: 'Sign out now',
  },
  codeValues: { expiresAt: 'instant(Date.now() + 2 * 60_000)' },
  call: 'const warning = SessionWarningDialog.create($);\nwarning.open()',
  note: 'Press Open warning to see the dialog; each press sets the session to expire two minutes from now.',
  mount(stage, options) {
    const dialog = SessionWarningDialog.create({ ...options, expiresAt: instant(Date.now() + TWO_MINUTES) }, document);
    const open = Button.create({ text: 'Open warning' }, document);
    open.element.addEventListener('click', () => {
      dialog.update({ expiresAt: instant(Date.now() + TWO_MINUTES) });
      dialog.open();
    });
    stage.append(open.element);
    return {
      events: dialog.element,
      update: (p) => { dialog.update(p); },
      destroy: () => { dialog.destroy(); open.destroy(); open.element.remove(); },
    };
  },
});
