import { Button } from '@absoluteui/components/button';
import { Form } from '@absoluteui/components/form';
import { OtpInput } from '@absoluteui/components/otp-input';
import { PasswordInput } from '@absoluteui/components/password-input';
import { TextInput } from '@absoluteui/components/text-input';

const signIn = document.querySelector<HTMLFormElement>('#sign-in');
const verify = document.querySelector<HTMLFormElement>('#verify');

if (signIn && verify) {
  const field = (form: HTMLFormElement): HTMLDivElement => {
    const host = document.createElement('div');
    form.append(host);
    return host;
  };

  // Step 1: email and password.
  TextInput.create(field(signIn), { label: 'Work email', name: 'email', type: 'email', required: true, autocomplete: 'username' });
  PasswordInput.create(field(signIn), { label: 'Password', name: 'password', required: true, autocomplete: 'current-password', capsLockWarning: true });
  signIn.append(Button.create({ text: 'Continue', type: 'submit', variant: 'primary' }).element);
  Form.create(signIn, { focusOnInvalid: 'summary' });

  // Step 2: the one-time code. In this demo the server step is simulated in the page.
  const otp = OtpInput.create(field(verify), { label: 'One-time code', name: 'code', length: 6, required: true, description: 'Enter the six-digit code from your authenticator app.' });
  verify.append(Button.create({ text: 'Verify', type: 'submit', variant: 'primary' }).element);
  Form.create(verify, { focusOnInvalid: 'summary' });

  signIn.addEventListener('aui-submit', () => {
    signIn.hidden = true;
    verify.hidden = false;
    otp.focus();
  });
  otp.host.addEventListener('aui-complete', () => {
    verify.requestSubmit();
  });
}
