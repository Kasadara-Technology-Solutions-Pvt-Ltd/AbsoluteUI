// Authentication showcase: sign-in with a one-time code, a password change with live strength
// requirements, and the session timeout warning. A simulated server checks the credentials.
import { duration, now } from '@absoluteui/core';
import { Button } from '@absoluteui/components/button';
import { InlineMessage } from '@absoluteui/components/inline-message';
import { OtpInput } from '@absoluteui/components/otp-input';
import { PasswordInput } from '@absoluteui/components/password-input';
import { PasswordStrengthMeter } from '@absoluteui/components/password-strength-meter';
import { SessionWarningDialog } from '@absoluteui/components/session-warning-dialog';
import { TextInput } from '@absoluteui/components/text-input';
import { createShowcase, hostIn, section, toggle, wait } from './kit.js';

const sc = createShowcase({
  title: 'Sign-in and account security',
  description: 'Sign in with the demo password, enter the code, change the password, and try the session timeout warning.',
  simulated: true,
});

const DEMO_PASSWORD = 'correct horse battery';
const DEMO_CODE = '135790';

// Sign-in.
const signIn = section(sc, 'Sign in', ['password-input', 'otp-input']);
const signInForm = document.createElement('form');
signInForm.className = 'sc-form';
signInForm.noValidate = true;
signIn.append(signInForm);
const email = TextInput.create(hostIn(signInForm), { label: 'Email', type: 'email', value: 'ada@example.com', required: true, autocomplete: 'email' });
const password = PasswordInput.create(hostIn(signInForm), { label: 'Password', required: true, autocomplete: 'current-password', revealable: true, capsLockWarning: true, description: `Demo password: ${DEMO_PASSWORD}` });
const code = OtpInput.create(hostIn(signInForm), { label: 'One-time code', length: 6, type: 'numeric', groupSize: 3, autocomplete: 'one-time-code', description: `Sent to your phone. Demo code: ${DEMO_CODE}` });
code.host.hidden = true;
const messageHost = hostIn(signInForm);
const message = InlineMessage.create(messageHost, { tone: 'info', message: 'Not signed in.', live: 'polite' });
const submit = Button.create({ text: 'Continue', variant: 'primary', type: 'submit' }, document);
signInForm.append(submit.element);

let step: 'password' | 'code' | 'done' = 'password';
signInForm.addEventListener('submit', (e) => {
  e.preventDefault();
  void (async () => {
    if (step === 'password') {
      if (!email.reportValidity() || !password.reportValidity()) return;
      submit.setLoading(true);
      await wait(500);
      submit.setLoading(false);
      if (password.input.value !== DEMO_PASSWORD) {
        password.setCustomError('The email or password is incorrect.');
        password.reportValidity();
        sc.log('sign-in rejected');
        return;
      }
      password.setCustomError(null);
      step = 'code';
      code.host.hidden = false;
      code.focus();
      message.update({ tone: 'info', message: 'Enter the 6-digit code.' });
      sc.log('password accepted');
    } else if (step === 'code') {
      await verify(code.getFormValue());
    }
  })();
});
const verify = async (value: string): Promise<void> => {
  submit.setLoading(true);
  await wait(400);
  submit.setLoading(false);
  if (value !== DEMO_CODE) {
    code.setCustomError('That code is not valid. Try again.');
    code.reportValidity();
    sc.log('code rejected');
    return;
  }
  code.setCustomError(null);
  step = 'done';
  message.update({ tone: 'success', message: 'Signed in.' });
  sc.log('signed in');
};
code.host.addEventListener('aui-complete', () => {
  if (step === 'code') void verify(code.getFormValue());
});
sc.listen(password.host, ['aui-caps-lock'], 'password');
sc.listen(code.host, ['aui-complete'], 'code');

// Password change.
const change = section(sc, 'Change password', ['password-input', 'password-strength-meter']);
const changeForm = hostIn(change);
changeForm.className = 'sc-form';
const next = PasswordInput.create(hostIn(changeForm), { label: 'New password', autocomplete: 'new-password', revealable: true, minLength: 12 });
const meter = PasswordStrengthMeter.create(hostIn(changeForm), {
  label: 'Password strength',
  input: next.input,
  showRequirements: true,
  requirements: [
    { id: 'length', label: 'At least 12 characters', test: (v) => v.length >= 12 },
    { id: 'mixed', label: 'Upper and lower case letters', test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
    { id: 'digit', label: 'A digit', test: (v) => /[0-9]/.test(v) },
    { id: 'reuse', label: 'Not your current password', test: (v) => v !== '' && v !== DEMO_PASSWORD },
  ],
});
const confirm = PasswordInput.create(hostIn(changeForm), { label: 'Confirm new password', autocomplete: 'new-password', validate: (v) => (v === next.input.value ? null : 'The passwords do not match.') });
sc.listen(meter.host, ['aui-change'], 'strength');

// Session timeout.
const session = section(sc, 'Session timeout', ['session-warning-dialog']);
const sessionIntro = document.createElement('p');
sessionIntro.textContent = 'Start a session that ends in 25 seconds: the warning dialog opens 20 seconds before the end and offers to stay signed in or sign out.';
session.append(sessionIntro);
const sessionRow = hostIn(session);
sessionRow.className = 'sc-row';
const startButton = Button.create({ text: 'Session ends in 25 s', variant: 'secondary' }, document);
sessionRow.append(startButton.element);
let dialog: SessionWarningDialog | null = null;
const startSession = (seconds: number): void => {
  dialog?.destroy();
  dialog = SessionWarningDialog.create({ expiresAt: { kind: 'Instant', epochMilliseconds: now().epochMilliseconds + seconds * 1000 }, warnBefore: duration(Math.min(seconds, 20) * 1000) });
  const d = dialog;
  for (const type of ['aui-open', 'aui-extend', 'aui-sign-out', 'aui-expire'] as const) {
    d.element.addEventListener(type, (e) => {
      sc.log(`session ${type}`, e instanceof CustomEvent ? e.detail : undefined);
      if (type === 'aui-extend') startSession(seconds);
    });
  }
};
startButton.element.addEventListener('click', () => {
  startSession(25);
  sc.log('session started (warning at 20 s left)');
});
toggle(sc, 'Mask the code', false, (mask) => {
  code.update({ mask });
}, ['otp-input']);
toggle(sc, 'Disabled', false, (disabled) => {
  for (const c of [email, password, code, next, confirm]) c.update({ disabled });
  submit.update({ disabled });
}, ['password-input', 'otp-input']);
