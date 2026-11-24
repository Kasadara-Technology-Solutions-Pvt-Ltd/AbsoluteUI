import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, plainDate, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Form, type FormInvalidDetail, type FormOptions, type FormState, type FormSubmitDetail } from '@absoluteui/components/form';
import { TextInput } from '@absoluteui/components/text-input';
import { Combobox } from '@absoluteui/components/combobox';
import { DateInput } from '@absoluteui/components/date-input';
import { FormField } from '@absoluteui/components/form-field';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function host(parent: HTMLElement): HTMLDivElement {
  const el = document.createElement('div');
  parent.append(el);
  return el;
}

interface Fixture {
  form: Form;
  el: HTMLFormElement;
  email: TextInput;
  password: TextInput;
  confirm: TextInput;
  country: Combobox;
  start: DateInput;
  submit: HTMLButtonElement;
}

function mount(options: FormOptions = {}): Fixture {
  const el = document.createElement('form');
  document.body.append(el);
  const email = TextInput.create(host(el), { label: 'Email', name: 'email', type: 'email', required: true });
  const password = TextInput.create(host(el), { label: 'Password', name: 'password', type: 'password', required: true });
  const confirm = TextInput.create(host(el), { label: 'Confirm password', name: 'confirm', type: 'password', required: true });
  const country = Combobox.create(host(el), { label: 'Country', name: 'country', required: true, options: [{ value: 'in', label: 'India' }, { value: 'jp', label: 'Japan' }] });
  const start = DateInput.create(host(el), { label: 'Start date', name: 'start' });
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Save';
  el.append(submit);
  const form = Form.create(el, options);
  return { form, el, email, password, confirm, country, start, submit };
}

async function fillValid(f: Fixture): Promise<void> {
  f.email.setValue('ada@example.com');
  f.password.setValue('correct horse');
  f.confirm.setValue('correct horse');
  f.country.setValue('in');
  f.start.setValue(plainDate(2026, 5, 1));
  await Promise.resolve();
}

const summaryLinks = (f: Fixture): string[] => Array.from(f.el.querySelectorAll('.aui-error-summary__link')).map((a) => a.textContent);

describe('Form: submission and validation', () => {
  it('blocks invalid submission, shows every error in a focused summary, and emits aui-invalid', async () => {
    const f = mount();
    const invalid = vi.fn();
    const submitted = vi.fn();
    f.el.addEventListener('aui-invalid', (e) => {
      invalid((e as CustomEvent<FormInvalidDetail>).detail);
    });
    f.el.addEventListener('aui-submit', submitted);
    await userEvent.click(f.submit);
    expect(submitted).not.toHaveBeenCalled();
    expect(invalid).toHaveBeenCalledTimes(1);
    expect(invalid.mock.calls[0]?.[0]).toMatchObject({ reason: 'constraints', errors: [{ name: 'email' }, { name: 'password' }, { name: 'confirm' }, { name: 'country' }] });
    expect(summaryLinks(f)).toEqual(['Email: This field is required.', 'Password: This field is required.', 'Confirm password: This field is required.', 'Country: Select an option.']);
    expect(document.activeElement).toBe(f.form.errorSummary!.host);
    expect(f.el.noValidate).toBe(true);
  });

  it('error summary links move focus to the invalid field', async () => {
    const f = mount();
    await userEvent.click(f.submit);
    const link = f.el.querySelectorAll<HTMLAnchorElement>('.aui-error-summary__link')[3]!;
    await userEvent.click(link);
    expect(document.activeElement).toBe(f.country.input);
  });

  it('can focus the first invalid field instead of the summary', async () => {
    const f = mount({ focusOnInvalid: 'first-field' });
    await userEvent.click(f.submit);
    expect(document.activeElement).toBe(f.email.input);
  });

  it('emits cancelable aui-submit with serialized values when valid', async () => {
    const f = mount();
    await fillValid(f);
    const plain = document.createElement('input');
    plain.name = 'note';
    plain.value = 'hello';
    f.el.append(plain);
    let detail: FormSubmitDetail | null = null;
    f.el.addEventListener('aui-submit', (e) => {
      detail = (e as CustomEvent<FormSubmitDetail>).detail;
    });
    await userEvent.click(f.submit);
    expect(detail).toEqual({ values: { email: 'ada@example.com', password: 'correct horse', confirm: 'correct horse', country: 'in', start: '2026-05-01', note: 'hello' } });
    expect(f.form.errorSummary?.isVisible ?? false).toBe(false);
  });

  it('applies cross-field rules and re-runs them live after the first submit', async () => {
    const f = mount({ rules: [{ fields: ['password', 'confirm'], validate: (v) => (v.password === v.confirm ? null : 'Passwords do not match.') }] });
    await fillValid(f);
    f.confirm.setValue('different');
    await userEvent.click(f.submit);
    expect(summaryLinks(f)).toEqual(['Confirm password: Passwords do not match.']);
    expect(f.confirm.validity.message).toBe('Passwords do not match.');
    // Fixing the *other* field re-runs the rule and clears the message.
    await userEvent.click(f.password.input);
    await userEvent.keyboard('{Control>}a{/Control}different');
    expect(f.confirm.validity.valid).toBe(true);
  });

  it('rejects rules that target an unknown field', () => {
    const f = mount({ rules: [{ fields: ['nope'], validate: () => 'x' }] });
    expect(() => f.form.validate()).toThrow(AbsoluteUIError);
  });
});

describe('Form: async validation', () => {
  it('runs the async validator, applies returned errors, and prevents double submission', async () => {
    let resolve: ((v: Record<string, string>) => void) | undefined;
    const validate = vi.fn(() => new Promise<Record<string, string>>((r) => (resolve = r)));
    const f = mount({ validate });
    await fillValid(f);
    const states: FormState[] = [];
    f.el.addEventListener('aui-state-change', (e) => states.push((e as CustomEvent<FormState>).detail));
    f.form.submit();
    f.form.submit();
    expect(validate).toHaveBeenCalledTimes(1);
    expect(f.el.getAttribute('aria-busy')).toBe('true');
    expect(f.form.state.submitting).toBe(true);
    resolve?.({ email: 'This email is already registered.' });
    await vi.waitFor(() => {
      expect(f.email.validity.message).toBe('This email is already registered.');
    });
    expect(f.el.hasAttribute('aria-busy')).toBe(false);
    expect(summaryLinks(f)).toEqual(['Email: This email is already registered.']);
    expect(states.some((s) => s.submitting)).toBe(true);
  });

  it('reports a failed or timed-out async validator without submitting', async () => {
    const f = mount({ asyncTimeoutMs: 100, validate: (_values, signal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => {
        reject(new Error('aborted'));
      });
    }) });
    await fillValid(f);
    const invalid = vi.fn();
    const submitted = vi.fn();
    f.el.addEventListener('aui-invalid', (e) => {
      invalid((e as CustomEvent<FormInvalidDetail>).detail.reason);
    });
    f.el.addEventListener('aui-submit', submitted);
    f.form.submit();
    await vi.waitFor(() => {
      expect(invalid).toHaveBeenCalledWith('async-failed');
    });
    expect(submitted).not.toHaveBeenCalled();
    expect(f.form.errorSummary!.host.textContent).toContain('Your answers could not be checked. Try again.');
  });

  it('reset during async validation discards the result (regression)', async () => {
    let resolve: ((v: Record<string, string>) => void) | undefined;
    const f = mount({ validate: () => new Promise((r) => (resolve = r)) });
    await fillValid(f);
    const submitted = vi.fn();
    f.el.addEventListener('aui-submit', submitted);
    f.form.submit();
    f.form.reset();
    resolve?.({});
    await new Promise((r) => setTimeout(r, 0));
    expect(submitted).not.toHaveBeenCalled();
    expect(f.form.state.submitting).toBe(false);
  });
});

describe('Form: server errors, state, reset', () => {
  it('setErrors shows server-side errors, including ones without a matching field', async () => {
    const f = mount();
    await fillValid(f);
    f.form.setErrors({ email: 'Blocked domain.', unknown: 'The service is busy.' });
    expect(summaryLinks(f)).toEqual(['Email: Blocked domain.']);
    expect(f.form.errorSummary!.host.textContent).toContain('The service is busy.');
    f.form.clearErrors();
    expect(f.email.validity.valid).toBe(true);
  });

  it('tracks dirty and touched state and resets controls and plain elements', async () => {
    const f = mount();
    const plain = document.createElement('input');
    plain.name = 'note';
    plain.defaultValue = 'initial';
    f.el.append(plain);
    expect(f.form.state).toMatchObject({ dirty: false, touched: false, submitCount: 0 });
    await userEvent.click(f.email.input);
    await userEvent.keyboard('x');
    await userEvent.tab();
    plain.value = 'changed';
    expect(f.form.state).toMatchObject({ dirty: true, touched: true });
    const seen: string[] = [];
    f.el.addEventListener('submit', () => seen.push('submit'), true);
    f.submit.addEventListener('click', () => seen.push('click'));
    await userEvent.click(f.submit);
    expect(seen).toEqual(['click', 'submit']);
    expect(f.form.state.submitCount).toBe(1);
    const reset = document.createElement('button');
    reset.type = 'reset';
    reset.textContent = 'Reset';
    f.el.append(reset);
    await userEvent.click(reset);
    expect(f.email.value).toBe('');
    expect(plain.value).toBe('initial');
    expect(f.form.state).toMatchObject({ dirty: false, touched: false, submitCount: 0 });
    expect(f.form.errorSummary!.isVisible).toBe(false);
    expect(f.email.input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('skips disabled controls and supports Form Field-wrapped native controls', async () => {
    const f = mount();
    await fillValid(f);
    f.email.update({ disabled: true, value: '' });
    const native = document.createElement('input');
    native.name = 'zip';
    native.required = true;
    const field = FormField.create(host(f.el), { label: 'ZIP', control: native });
    await userEvent.click(f.submit);
    expect(summaryLinks(f)).toEqual(['ZIP: This field is required.']);
    expect(f.form.errorSummary!.items[0]?.target).toBe(field.host);
  });

  it('honours global configuration (Mode B)', async () => {
    configureAbsoluteUI({ components: { form: { errorSummary: false } } });
    const f = mount();
    await userEvent.click(f.submit);
    expect(f.form.errorSummary).toBeNull();
    expect(document.activeElement).toBe(f.email.input);
  });

  it('validates options and host before touching the form', () => {
    const el = document.createElement('form');
    expect(() => Form.create(document.createElement('div') as unknown as HTMLFormElement)).toThrow(/native <form>/);
    expect(() => Form.create(el, { rules: [{ fields: [], validate: () => null }] })).toThrow(AbsoluteUIError);
    expect(el.noValidate).toBe(false);
  });

  it('re-runs rules on a control whose server error the user already fixed (regression)', async () => {
    const f = mount({ rules: [{ fields: ['password', 'confirm'], validate: (v) => (v.password === v.confirm ? null : 'Passwords do not match.') }] });
    await fillValid(f);
    await userEvent.click(f.submit);
    f.form.setErrors({ confirm: 'Server rejected this value.' });
    await userEvent.click(f.confirm.input);
    await userEvent.keyboard('x');
    expect(f.confirm.validity.message).toBe('Passwords do not match.');
  });

  it('skips unknown rule targets during live re-checks instead of throwing from a listener (regression)', async () => {
    const f = mount({ rules: [{ fields: ['email'], target: 'later', validate: () => 'x' }] });
    expect(() => f.form.validate()).toThrow(AbsoluteUIError);
    await userEvent.click(f.email.input);
    await expect(userEvent.keyboard('a')).resolves.toBeUndefined();
  });

  it('serializes like FormData: plain elements in a disabled fieldset are excluded (regression)', () => {
    const f = mount();
    const fs = document.createElement('fieldset');
    fs.disabled = true;
    const plain = document.createElement('input');
    plain.name = 'hidden-by-fieldset';
    plain.value = 'x';
    fs.append(plain);
    f.el.append(fs);
    expect(Object.hasOwn(f.form.getValues(), 'hidden-by-fieldset')).toBe(false);
  });

  it('lists server errors for disabled controls as text (regression)', () => {
    const f = mount();
    f.email.update({ disabled: true });
    f.form.setErrors({ email: 'Locked account.' });
    expect(f.form.errorSummary!.host.textContent).toContain('Locked account.');
  });

  it('destroy restores the original noValidate value (regression)', () => {
    const el = document.createElement('form');
    el.noValidate = true;
    document.body.append(el);
    Form.create(el).destroy();
    expect(el.noValidate).toBe(true);
  });

  it('destroy restores native validation and removes the summary it created', async () => {
    const f = mount();
    await userEvent.click(f.submit);
    const summary = f.form.errorSummary!.host;
    f.form.destroy();
    expect(summary.isConnected).toBe(false);
    expect(f.el.noValidate).toBe(false);
  });
});
