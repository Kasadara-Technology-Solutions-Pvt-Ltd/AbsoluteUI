// R20 P9 page: Masked Input, bundled against the built packages.
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { MaskedInput, MASK_PRESETS, type MaskedInputValueDetail } from '@absoluteui/components/masked-input';
import { Stack } from '@absoluteui/components/layout';

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default' });
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

Stack.apply(byId('main'), { gap: 6 });

const phone = MaskedInput.create(byId('masked-phone'), { label: 'Mobile phone', name: 'phone', required: true, ...MASK_PRESETS.phoneUs });
phone.host.addEventListener('aui-input', (e) => {
  const d = (e as CustomEvent<MaskedInputValueDetail>).detail;
  byId('masked-output').textContent = `${d.value} ${d.formattedValue} ${d.complete ? 'complete' : 'incomplete'}`;
});
MaskedInput.create(byId('masked-iban'), { label: 'IBAN', name: 'iban', submit: 'formatted', ...MASK_PRESETS.iban });
MaskedInput.create(byId('masked-zip'), { label: 'ZIP code', name: 'zip', ...MASK_PRESETS.zipUs4 });
MaskedInput.create(byId('masked-readonly'), { label: 'Employee number', mask: 'aa-9999', readOnly: true, value: 'HR1042' });
MaskedInput.create(byId('masked-disabled'), { label: 'Fax', mask: '(999) 999-9999', disabled: true });
MaskedInput.create(byId('masked-invalid'), { label: 'Sort code', mask: '99-99-99', value: '12', validationTiming: 'input' }).reportValidity();

Object.assign(window, { __auiReady: true });
