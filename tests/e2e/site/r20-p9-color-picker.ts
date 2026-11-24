// R20 P9 page: Color Picker, bundled against the built packages.
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { ColorPicker, type ColorPickerValueDetail } from '@absoluteui/components/color-picker';
import { Stack } from '@absoluteui/components/layout';

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default', direction: params.get('dir') === 'rtl' ? 'rtl' : 'ltr' });
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

Stack.apply(byId('main'), { gap: 6 });

const presets = [
  { value: '#2563eb', label: 'Blue' },
  { value: '#16a34a', label: 'Green' },
  { value: '#dc2626', label: 'Red' },
  { value: '#f59e0b', label: 'Amber' },
];

const popup = ColorPicker.create(byId('cp-popup'), { label: 'Brand color', name: 'brand', value: '#2563eb', required: true, presets, recent: ['#0f172a'], contrastWith: '#ffffff', description: 'Used for buttons and links.' });
ColorPicker.create(byId('cp-inline'), { label: 'Overlay', mode: 'inline', alpha: true, value: '#0f172acc', presets });
ColorPicker.create(byId('cp-readonly'), { label: 'Read-only color', mode: 'inline', readOnly: true, value: '#16a34a' });
ColorPicker.create(byId('cp-disabled'), { label: 'Disabled color', disabled: true, value: '#dc2626' });

document.addEventListener('aui-change', (e) => {
  const detail = (e as CustomEvent<ColorPickerValueDetail>).detail;
  byId('cp-log').textContent = String(detail.value);
});

Object.assign(window, { __auiReady: true, __colorPicker: popup });
