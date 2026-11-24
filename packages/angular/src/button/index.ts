import { Directive, input, model, type InputSignal, type InputSignalWithTransform, type ModelSignal } from '@angular/core';
import { Button, type ButtonChangeDetail, type ButtonOptions } from '@absoluteui/components/button';
import { booleanInput, ComponentBridge, defined } from '../internal/bridge.js';
import { ButtonStyles } from '../internal/style-sheets.js';
import { loadStyles } from '../internal/styles.js';

/**
 * AbsoluteUI Button: `<button auiButton variant="primary">Save</button>`.
 * Variants `primary`, `secondary`, `outline`, `ghost`, `danger`; sizes `sm`, `md`, `lg`; `loading`;
 * `icon` + `iconPosition` or a projected icon component; `fullWidth`. Disabled is the native attribute.
 * Enhances the native button in place (native `type`, `form`, and `disabled` keep working);
 * its content, including projected icon components, stays Angular-managed.
 */
@Directive({ selector: 'button[auiButton]', exportAs: 'auiButton' })
export class AuiButton extends ComponentBridge<Button, ButtonOptions> {
  readonly variant: InputSignal<ButtonOptions['variant'] | undefined> = input<ButtonOptions['variant']>();
  readonly size: InputSignal<ButtonOptions['size'] | undefined> = input<ButtonOptions['size']>();
  readonly loading: InputSignalWithTransform<boolean | undefined, unknown> = input<boolean | undefined, unknown>(undefined, { transform: booleanInput });
  readonly icon: InputSignal<ButtonOptions['icon'] | undefined> = input<ButtonOptions['icon']>();
  readonly iconPosition: InputSignal<ButtonOptions['iconPosition'] | undefined> = input<ButtonOptions['iconPosition']>();
  /** Stretch to the full inline size of the container. */
  readonly fullWidth: InputSignalWithTransform<boolean | undefined, unknown> = input<boolean | undefined, unknown>(undefined, { transform: booleanInput });
  /** Accessible name for icon-only buttons. */
  readonly label: InputSignal<ButtonOptions['label'] | undefined> = input<ButtonOptions['label']>();
  readonly icons: InputSignal<ButtonOptions['icons'] | undefined> = input<ButtonOptions['icons']>();
  /** Toggle button: bind [(pressed)]; unset is an ordinary button. */
  readonly pressed: ModelSignal<ButtonOptions['pressed'] | undefined> = model<ButtonOptions['pressed']>();

  constructor() {
    super();
    loadStyles(ButtonStyles);
    this.init({
      create: (host, options) => {
        if (!(host instanceof HTMLButtonElement)) throw new TypeError('auiButton requires a <button> host.');
        return Button.enhance(host, options);
      },
      configKey: 'button',
      options: () =>
        defined<ButtonOptions>({
          variant: this.variant(),
          size: this.size(),
          loading: this.loading(),
          icon: this.icon(),
          iconPosition: this.iconPosition(),
          fullWidth: this.fullWidth(),
          // Buttons use the native disabled attribute (an input here would capture [disabled]).
          disabled: undefined,
          label: this.label(),
          icons: this.icons(),
          pressed: this.pressed(),
        }),
      events: {
        'aui-change': (detail) => {
          this.syncModel(this.pressed, 'pressed', (detail as ButtonChangeDetail).pressed);
        },
      },
    });
  }
}

/**
 * A link styled as a button: `<a auiButton href="/help">Help</a>` or, with the router,
 * `<a auiButton routerLink="/reports">Reports</a>` (import `RouterLink` from `@angular/router`).
 * The element stays a link: href, `target`, `rel`, `download`, modified clicks (new tab),
 * `routerLinkActive`, query params, and fragments keep working natively.
 * `disabled` sets `aria-disabled`, removes the link from the tab order, and blocks activation
 * (including `RouterLink` navigation) while keeping the href; `loading` blocks activation too.
 */
@Directive({ selector: 'a[auiButton]', exportAs: 'auiButton' })
export class AuiLinkButton extends ComponentBridge<Button<HTMLAnchorElement>, ButtonOptions> {
  readonly variant: InputSignal<ButtonOptions['variant'] | undefined> = input<ButtonOptions['variant']>();
  readonly size: InputSignal<ButtonOptions['size'] | undefined> = input<ButtonOptions['size']>();
  readonly loading: InputSignalWithTransform<boolean | undefined, unknown> = input<boolean | undefined, unknown>(undefined, { transform: booleanInput });
  /** Links have no native `disabled`: `aria-disabled`, out of the tab order, activation blocked. */
  readonly disabled: InputSignalWithTransform<boolean | undefined, unknown> = input<boolean | undefined, unknown>(undefined, { transform: booleanInput });
  readonly icon: InputSignal<ButtonOptions['icon'] | undefined> = input<ButtonOptions['icon']>();
  readonly iconPosition: InputSignal<ButtonOptions['iconPosition'] | undefined> = input<ButtonOptions['iconPosition']>();
  /** Stretch to the full inline size of the container. */
  readonly fullWidth: InputSignalWithTransform<boolean | undefined, unknown> = input<boolean | undefined, unknown>(undefined, { transform: booleanInput });
  /** Accessible name for icon-only links. */
  readonly label: InputSignal<ButtonOptions['label'] | undefined> = input<ButtonOptions['label']>();
  readonly icons: InputSignal<ButtonOptions['icons'] | undefined> = input<ButtonOptions['icons']>();

  constructor() {
    super();
    loadStyles(ButtonStyles);
    this.init({
      create: (host, options) => {
        if (!(host instanceof HTMLAnchorElement)) throw new TypeError('a[auiButton] requires an <a> host.');
        return Button.enhance(host, options);
      },
      configKey: 'button',
      options: () =>
        defined<ButtonOptions>({
          variant: this.variant(),
          size: this.size(),
          loading: this.loading(),
          disabled: this.disabled(),
          icon: this.icon(),
          iconPosition: this.iconPosition(),
          fullWidth: this.fullWidth(),
          label: this.label(),
          icons: this.icons(),
          // Links navigate; they are never toggle buttons.
          pressed: undefined,
        }),
    });
  }
}
