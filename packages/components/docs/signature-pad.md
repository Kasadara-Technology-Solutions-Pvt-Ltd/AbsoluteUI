# Signature Pad

> Package: `@absoluteui/components/signature-pad` | Styles: `@absoluteui/components/signature-pad/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

Captures a handwritten signature with a mouse, pen, or touch on a high-DPI canvas. Strokes are smoothed (quadratic curves through point midpoints) and vary in width with pen pressure, or with speed for mouse and touch. Undo removes the last stroke, Clear removes everything, and the signature exports as a PNG or SVG data URL. Because drawing is pointer-only, a typed-name mode is always offered for keyboard and screen-reader users: the name is rendered on the pad as the signature. `SignaturePad` is a Form control; native forms receive the signature as a data URL.

## 2. Anatomy

```text
<div class="aui-field aui-signature-pad">
  <label class="aui-field__label">Signature</label>
  <div class="aui-field__description">help</div>
  <div class="aui-signature-pad__box" role="group" aria-labelledby="label">
    <div class="aui-signature-pad__toolbar">
      <div class="aui-signature-pad__modes" role="group" aria-label="Signature method">
        <button aria-pressed="true">Draw</button><button aria-pressed="false">Type</button>
      </div>
      <div class="aui-signature-pad__actions"><button aria-label="Undo last stroke"/><button aria-label="Clear signature"/></div>
    </div>
    <div class="aui-signature-pad__pad">
      <canvas role="img" aria-label="Signature pad, empty"></canvas>
      <span class="aui-signature-pad__baseline"/><span class="aui-signature-pad__placeholder">Sign here</span>
    </div>
    <div class="aui-signature-pad__typed" hidden><label>Type your full name</label><input type="text"></div>
  </div>
  <div class="aui-field__error">error</div>
  <input type="hidden" name="signature">
</div>
```

## 3. When to use

- Acknowledging documents: offer letters, policies, timesheets, delivery receipts.
- Anywhere a person signs in the browser, with a typed alternative.

## 4. When not to use

- Legally qualified electronic signatures (certificates, identity proofing): use a signing service.
- Free drawing or annotation.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `value` | `SignaturePadValue` | `{ mode: 'draw', strokes }`, `{ mode: 'type', text }`, or `null`. |
| `isEmpty` | `boolean` | Nothing drawn or typed in the current mode. |
| `mode` | `'draw' \| 'type'` | Current mode. |
| `validity` | `FieldValidity` | Current validity. |
| `options` | `Readonly<SignaturePadOptions>` | Current options. |

Options (`SignaturePadOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Visible label (accessible name of the group). |
| `hideLabel` | `boolean` | `false` | No | Visually hide the label. |
| `description` | `string` | - | No | Help text. |
| `value` | `SignaturePadValue` | `null` | No | Strokes or a typed name. |
| `penColor` | `string` | `--aui-signature-pad-ink` | No | Pen color (validated CSS color). |
| `height` | `string` | `'10rem'` | No | Pad height (validated CSS length). |
| `typedFont` | `string` | a cursive family | No | Font family of typed signatures. |
| `mode` | `'draw' \| 'type'` | `'draw'` | No | Initial mode. |
| `submit` | `'png' \| 'svg'` | `'png'` | No | Hidden input format. |
| `required` | `boolean` | `false` | No | A signature must be given. |
| `disabled` | `boolean` | `false` | No | Disable the control. |
| `readOnly` | `boolean` | `false` | No | Show the signature without editing controls. |
| `name` | `string` | - | No | Form field name. |
| `validate` | `(value) => string \| null` | - | No | Consumer validation. |
| `icons` | `Partial<SignaturePadIcons>` | undo, trash, alert-circle | No | Icons. |
| `penWidth` | `number` | `2.5` | Yes | Base stroke width in CSS pixels (0.5 to 20). |
| `validationTiming` | `ValidationTiming` | `'blur'` | Yes | When messages appear. |
| `locale` | `string` | common `locale` | Yes (inherited) | Messages. |

## 6. Methods

| Method | Description |
|---|---|
| `SignaturePad.create(host, options)` | Render into `host` (children are replaced). |
| `setValue(value)` | Set the value (no event). |
| `undo()` | Remove the last stroke. |
| `clear()` | Remove the signature. |
| `toDataURL(format?)` | `'png'` (device pixel ratio, transparent background) or `'svg'` data URL. |
| `toSVG()` | SVG markup (paths, or a text element for typed names). |
| `getFormValue()` | The submitted data URL, or `null`. |
| `setCustomError(message)` | Show or clear an external error. |
| `reportValidity()` | Show messages now and return validity. |
| `focus()` | Focus the mode buttons (draw) or the name field (type). |
| `reset()` | Restore the initial value and clear the validation state. |
| `update(options)` | Merge and apply options; invalid options leave the previous state. |
| `destroy()` | Remove rendering, listeners, and the form registration. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-change` | `{ value: SignaturePadValue, validity }` | A stroke ended, the typed name was committed, undo, clear, or a mode switch changed the value. |

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

`aui-signature-pad`, `aui-signature-pad--type|readonly|disabled|invalid`, `aui-signature-pad__box`, `__toolbar`, `__modes`, `__mode`, `__actions`, `__action`, `__pad`, `__pad--drawable`, `__canvas`, `__baseline`, `__placeholder`, `__typed`, `__typed-label`, `__typed-input`, plus the shared field chrome. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/signature-pad/tokens.json` (verified in CI). Component tokens: `--aui-signature-pad-ink` (default pen color; `color-text`), `--aui-signature-pad-bg` (pad; `color-surface`), and `--aui-signature-pad-guide` (boundary and baseline; `color-border-strong`). Ink and guide are 3:1 against the pad in the contrast gate.

## 11. States

Empty; drawing; drawn; typed; draw mode; type mode; read-only; disabled; required; invalid.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| draw mode | pointer down, move, up | a new stroke; `aui-change` |
| drawing | pointer cancel | the stroke is discarded |
| drawn | Undo | the last stroke removed; announced; `aui-change` |
| any | Clear | empty; announced; `aui-change` |
| draw mode | Type | type mode; focus moves to the name field |
| type mode | typing, then leaving the field | typed signature; `aui-change` |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Control | Moves through Draw, Type, the name field, Undo, and Clear. |
| Enter / Space | Draw or Type | Switch mode; Type focuses the name field. |
| Enter / Space | Undo or Clear | Remove the last stroke or the signature. |
| Typing | Name field | The name is drawn on the pad. |

## 14. ARIA contract

- The box is `role="group"` named by the label and described by help and error.
- Draw and Type are toggle buttons (`aria-pressed`) in a group named "Signature method".
- The canvas is `role="img"` named by its content: "Signature pad, empty", "... drawn with 3 strokes", or "... typed signature: Ana Ruiz".
- Undo and Clear are icon buttons with `aria-label`; the name field is a native labelled input with `aria-invalid` and `aria-describedby`.

## 15. Accessibility notes

- Drawing cannot be done with a keyboard, so the typed mode is always offered (WCAG 2.1.1, 2.5.7).
- Undo and Clear are announced through the polite live region.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

The pad fills the container width at a fixed height. Points are stored relative to the pad, so the signature rescales when the width changes.

## 17. RTL behavior

The toolbar mirrors and the placeholder starts at the right; strokes are geometry and are not mirrored.

## 18. Theme behavior

The default ink is read from `--aui-signature-pad-ink` when the pad draws. Forced colors draw the boundary and default ink in `CanvasText` and the pressed mode in `Highlight`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { signaturePad: { penWidth: 3 } } });
```

## 20. Component configuration support

Instance `penWidth`, `validationTiming`, and `locale` override configuration; configuration changes re-render existing pads.

## 21. Timezone behavior

Not applicable. Point times are milliseconds relative to the start of a stroke.

## 22. Icon customization points

`icons.undo` (default `undo`), `icons.clear` (default `trash`), and `icons.error` (default `alert-circle`).

## 23. Security behavior

No HTML is rendered. The typed name is drawn on the canvas and escaped in SVG export. `penColor` and `height` are checked with `CSS.supports`, `typedFont` rejects markup characters, and strokes passed as `value` are validated (finite numbers, at most 20,000 points). Positions use the CSSOM (CSP-safe).

## 24. Data handling behavior

No persistence, network access, or telemetry. A signature is personal data: send it only over HTTPS and store it as your privacy policy states.

## 25. Performance characteristics

Each pointer move redraws the canvas from the stored strokes (coalesced events are used for smooth fast strokes). A 2,000-point signature redraws in a few milliseconds.

## 26. Supported data scale

Up to 20,000 points per signature; points beyond that are dropped.

## 27. Usage examples

```ts
import { SignaturePad, type SignaturePadValueDetail } from '@absoluteui/components/signature-pad';

const host = document.querySelector<HTMLElement>('#sign');
if (host) {
  const pad = SignaturePad.create(host, { label: 'Signature', required: true });
  host.addEventListener('aui-change', (event) => {
    const { value } = (event as CustomEvent<SignaturePadValueDetail>).detail;
    if (value !== null) console.log(pad.toDataURL('png').length);
  });
}
```

More examples, type-checked in CI: `metadata/signature-pad/examples.json`.

## 28. Edge cases

- A tap without movement draws a dot.
- Switching mode keeps the other mode's content; the value follows the current mode.
- A pointer cancel (for example a scroll gesture taking over) discards the stroke in progress.
- `penColor` applies to new strokes; strokes without a color use the current theme ink.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `SIGNATURE_PAD_OPTIONS` | configuration | Blank label, unknown `mode` or `submit`, an invalid `penColor`, `height`, or `typedFont`, malformed `value`, or a non-function `validate`. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid configuration (for example `penWidth` outside 0.5 to 20). |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact.

## 30. Known limitations

- After a theme change, the default ink updates on the next redraw (resize, stroke, or `update()`).
- Exported PNGs have a transparent background.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Erasing parts of a stroke.
- Biometric signature verification.

## 32. TypeScript definitions

```ts
type SignatureFormat = 'png' | 'svg';
interface SignaturePoint { readonly x: number; readonly y: number; readonly pressure: number; readonly t: number }
interface SignatureStroke { readonly points: readonly SignaturePoint[]; readonly color?: string }
type SignaturePadValue = { readonly mode: 'draw'; readonly strokes: readonly SignatureStroke[] } | { readonly mode: 'type'; readonly text: string } | null;
interface SignaturePadConfig { validationTiming: ValidationTiming; penWidth: number }
interface SignaturePadIcons { undo: IconRef; clear: IconRef; error: IconRef }
interface SignaturePadOptions extends Partial<SignaturePadConfig> {
  label: string;
  hideLabel?: boolean;
  description?: string;
  value?: SignaturePadValue;
  penColor?: string;
  height?: string;
  typedFont?: string;
  mode?: 'draw' | 'type';
  submit?: SignatureFormat;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  name?: string;
  validate?: (value: SignaturePadValue) => string | null;
  locale?: string;
  icons?: Partial<SignaturePadIcons>;
}
interface SignaturePadValueDetail { value: SignaturePadValue; validity: FieldValidity }
```

## 33. Vanilla JS example

```ts
import { SignaturePad } from '@absoluteui/components/signature-pad';
import '@absoluteui/components/signature-pad/style.css';

const host = document.querySelector<HTMLElement>('#receipt');
if (host) SignaturePad.create(host, { label: 'Recipient signature', name: 'signature', required: true });
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import type { SignaturePadValue } from '@absoluteui/components/signature-pad';
import { AuiSignaturePad } from '@absoluteui/angular/signature-pad';

@Component({
  selector: 'app-offer-signature',
  imports: [AuiSignaturePad],
  template: `<aui-signature-pad label="Signature" [required]="true" [(value)]="signature"></aui-signature-pad>`,
})
export class OfferSignatureComponent {
  signature: SignaturePadValue = null;
}
```

## 35. React example

```tsx
import { useState } from 'react';
import { AuiSignaturePad } from '@absoluteui/react/signature-pad';
import type { SignaturePadValue } from '@absoluteui/components/signature-pad';

export function Example() {
  const [signature, setSignature] = useState<SignaturePadValue>(null);
  return <AuiSignaturePad label="Signature" value={signature} onValueChange={setSignature} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { AuiSignaturePad } from '@absoluteui/vue/signature-pad';
import type { SignaturePadValue } from '@absoluteui/components/signature-pad';

const signature = ref<SignaturePadValue>(null);
</script>

<template>
  <AuiSignaturePad v-model="signature" label="Signature" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
