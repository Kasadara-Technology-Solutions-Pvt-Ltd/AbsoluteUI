// R20 P9 page: Rating and Signature Pad, bundled against the built packages.
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { Rating, type RatingValueDetail } from '@absoluteui/components/rating';
import { SignaturePad, type SignaturePadValueDetail } from '@absoluteui/components/signature-pad';
import { Stack } from '@absoluteui/components/layout';

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default', direction: params.get('dir') === 'rtl' ? 'rtl' : 'ltr' });
if (params.get('dir') === 'rtl') document.documentElement.dir = 'rtl';
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

Stack.apply(byId('main'), { gap: 6 });

const review = Rating.create(byId('rating-review'), {
  label: 'Overall performance',
  allowHalf: true,
  value: 3,
  labels: ['Needs improvement', 'Developing', 'Meets expectations', 'Exceeds expectations', 'Outstanding'],
  name: 'score',
});
review.host.addEventListener('aui-change', (e) => {
  const { value } = (e as CustomEvent<RatingValueDetail>).detail;
  byId('rating-output').textContent = value === null ? 'none' : String(value);
});
Rating.create(byId('rating-required'), { label: 'Onboarding experience', required: true, validationTiming: 'input' }).reportValidity();
Rating.create(byId('rating-display'), { label: 'Customer rating', value: 4.5, allowHalf: true, display: true, size: 'sm' });
Rating.create(byId('rating-readonly'), { label: 'Last review', value: 4, readOnly: true });
Rating.create(byId('rating-disabled'), { label: 'Locked score', value: 2, disabled: true, size: 'lg' });

const pad = SignaturePad.create(byId('signature-pad'), { label: 'Signature', description: 'Draw your signature or type your full name.', required: true, name: 'signature' });
pad.host.addEventListener('aui-change', (e) => {
  const { value } = (e as CustomEvent<SignaturePadValueDetail>).detail;
  byId('signature-output').textContent = value === null ? 'empty' : value.mode === 'type' ? `typed ${value.text}` : `drawn ${String(value.strokes.length)}`;
});
SignaturePad.create(byId('signature-readonly'), { label: 'Countersignature', readOnly: true, value: { mode: 'type', text: 'Ana Ruiz' }, height: '6rem' });

Object.assign(window, { __auiReady: true });
