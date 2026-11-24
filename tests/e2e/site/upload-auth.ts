// R2 upload and authentication UI page, bundled against the built packages.
import { configureAbsoluteUI, instant } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { Button } from '@absoluteui/components/button';
import { FileUpload, type FileUploadChangeDetail } from '@absoluteui/components/file-upload';
import { UploadQueue, type UploadContext } from '@absoluteui/components/upload-queue';
import { PasswordInput } from '@absoluteui/components/password-input';
import { PasswordStrengthMeter } from '@absoluteui/components/password-strength-meter';
import { OtpInput } from '@absoluteui/components/otp-input';
import { SessionWarningDialog } from '@absoluteui/components/session-warning-dialog';

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default' });
startThemeRuntime();
if (params.get('dir') === 'rtl') document.documentElement.dir = 'rtl';

function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`missing #${id}`);
  return el;
}

// A test-controlled transport: the spec reports progress and settles each upload
// by file name, so states are deterministic. No network access.
interface Pending {
  ctx: UploadContext;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}
const pending = new Map<string, Pending>();
const harness = {
  progress(name: string, loaded: number): void {
    pending.get(name)?.ctx.onProgress(loaded);
  },
  resolve(name: string): void {
    pending.get(name)?.resolve({ ok: true });
    pending.delete(name);
  },
  reject(name: string): void {
    pending.get(name)?.reject(new Error('HTTP 500 at storage-3.internal'));
    pending.delete(name);
  },
  aborted(name: string): boolean {
    return pending.get(name)?.ctx.signal.aborted ?? false;
  },
};

const upload = FileUpload.create(byId('upload', HTMLDivElement), {
  label: 'Attachments',
  name: 'attachments',
  multiple: true,
  description: 'Files upload as soon as you add them.',
  acceptExtensions: ['.txt', '.pdf', '.png'],
  maxFileSize: 1_000_000,
  maxFiles: 5,
});
const queue = UploadQueue.create(byId('queue', HTMLDivElement), {
  label: 'Uploads',
  preview: true,
  concurrency: 2,
  upload: (file, ctx) =>
    new Promise((resolve, reject) => {
      pending.set(file.name, { ctx, resolve, reject });
    }),
});
upload.host.addEventListener('aui-change', (e) => {
  const { added } = (e as CustomEvent<FileUploadChangeDetail>).detail;
  if (added.length === 0) return;
  queue.add(added);
  upload.setValue([]);
});

const password = PasswordInput.create(byId('password', HTMLDivElement), { label: 'Password', name: 'password', required: true });
const code = OtpInput.create(byId('code', HTMLDivElement), { label: 'Verification code', name: 'code', required: true, description: 'Enter the 6-digit code from your authenticator app.' });
const signIn = byId('sign-in', HTMLFormElement);
signIn.noValidate = true;
Button.enhance(byId('sign-in-submit', HTMLButtonElement), { variant: 'primary' });
signIn.addEventListener('submit', (e) => {
  e.preventDefault();
  const valid = [password.reportValidity(), code.reportValidity()].every(Boolean);
  byId('sign-in-result', HTMLOutputElement).textContent = valid ? 'submitted' : 'invalid';
  if (!valid) (password.validity.valid ? code : password).focus();
});

const newPassword = PasswordInput.create(byId('new-password', HTMLDivElement), { label: 'New password', autocomplete: 'new-password', description: 'Use 12 or more characters.' });
const meter = PasswordStrengthMeter.create(byId('strength', HTMLDivElement), { input: newPassword });
newPassword.update({ describedBy: [meter.describedById] });

const session = SessionWarningDialog.create({ expiresAt: instant(Date.now() + 125_000) });
const sessionResult = byId('session-result', HTMLOutputElement);
session.element.addEventListener('aui-extend', () => {
  sessionResult.textContent = 'extended';
  session.update({ expiresAt: instant(Date.now() + 125_000) });
});
session.element.addEventListener('aui-sign-out', () => {
  sessionResult.textContent = 'signed out';
});
const openSession = byId('open-session', HTMLButtonElement);
Button.enhance(openSession);
openSession.addEventListener('click', () => {
  session.update({ expiresAt: instant(Date.now() + 125_000) });
  session.open();
});

// Exposed for the specs only (harness code, not library API).
Object.assign(window, { __auiReady: true, __harness: harness, __aui: { FileUpload, UploadQueue, PasswordInput, PasswordStrengthMeter, OtpInput, SessionWarningDialog, instant } });
