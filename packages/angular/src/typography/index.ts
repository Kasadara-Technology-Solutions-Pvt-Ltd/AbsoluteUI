import { afterNextRender, DestroyRef, Directive, effect, ElementRef, inject, input, numberAttribute, untracked, type InputSignal, type InputSignalWithTransform } from '@angular/core';
import { Heading, Link, setLineClamp, Text, type HeadingLevel, type HeadingOptions, type LinkEnhanceOptions, type TextEnhanceOptions, type TextSize, type TextTone, type TypographyEnhancement } from '@absoluteui/components/typography';
import { booleanInput, defined } from '../internal/bridge.js';
import { TypographyStyles } from '../internal/style-sheets.js';
import { loadStyles } from '../internal/styles.js';
import { AuiLocale } from '../services.js';

/**
 * Typography (docs/PLAN-R9-ANGULAR.md D30). Attribute directives on native elements (D2) over
 * the neutral `enhance` helpers. Heading, Text, and Line Clamp only set classes and a custom
 * property, so they also apply during server rendering; Link appends its new-tab hint, so it
 * is enhanced in the browser (add `class="aui-link"` in markup if it must be styled before hydration).
 */

/** Attribute text to a number; the range is validated by Heading.enhance. */
function heading(value: unknown): HeadingLevel | undefined {
  return value === undefined || value === null || value === '' ? undefined : (numberAttribute(value) as HeadingLevel);
}

/** `<h2 auiHeading size="4">`: the level comes from the tag, `size` (1 largest to 6) sets the visual size. */
@Directive({ selector: 'h1[auiHeading], h2[auiHeading], h3[auiHeading], h4[auiHeading], h5[auiHeading], h6[auiHeading]', exportAs: 'auiHeading' })
export class AuiHeading {
  readonly size: InputSignalWithTransform<HeadingLevel | undefined, unknown> = input<HeadingLevel | undefined, unknown>(undefined, { transform: heading });

  constructor() {
    loadStyles(TypographyStyles);
    const el: HTMLHeadingElement = inject<ElementRef<HTMLHeadingElement>>(ElementRef).nativeElement;
    let styled: TypographyEnhancement<HeadingOptions> | null = null;
    effect(() => {
      const options = defined<HeadingOptions>({ size: this.size() });
      untracked(() => {
        if (styled) styled.update(options);
        else styled = Heading.enhance(el, options);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      styled?.destroy();
    });
  }
}

/** `<p auiText tone="muted" size="sm">`, `<span auiText strong>`. */
@Directive({ selector: '[auiText]', exportAs: 'auiText' })
export class AuiText {
  readonly tone: InputSignal<TextTone | undefined> = input<TextTone>();
  readonly size: InputSignal<TextSize | undefined> = input<TextSize>();
  readonly strong: InputSignalWithTransform<boolean | undefined, unknown> = input<boolean | undefined, unknown>(undefined, { transform: booleanInput });

  constructor() {
    loadStyles(TypographyStyles);
    const el: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    let styled: TypographyEnhancement<TextEnhanceOptions> | null = null;
    effect(() => {
      const options = defined<TextEnhanceOptions>({ tone: this.tone(), size: this.size(), strong: this.strong() });
      untracked(() => {
        if (styled) styled.update(options);
        else styled = Text.enhance(el, options);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      styled?.destroy();
    });
  }
}

/**
 * `<a auiLink href="https://example.com" external>Docs</a>` or with `routerLink`. The href is
 * validated like `Link.create` (http(s) or relative); `external` opens a new tab and says so to
 * assistive technology in the scope's locale.
 */
@Directive({ selector: 'a[auiLink]', exportAs: 'auiLink' })
export class AuiLink {
  readonly external: InputSignalWithTransform<boolean | undefined, unknown> = input<boolean | undefined, unknown>(undefined, { transform: booleanInput });
  readonly muted: InputSignalWithTransform<boolean | undefined, unknown> = input<boolean | undefined, unknown>(undefined, { transform: booleanInput });

  constructor() {
    loadStyles(TypographyStyles);
    const el: HTMLAnchorElement = inject<ElementRef<HTMLAnchorElement>>(ElementRef).nativeElement;
    const locale = inject(AuiLocale);
    let styled: (TypographyEnhancement<LinkEnhanceOptions> & { check(): void }) | null = null;
    const options = (): LinkEnhanceOptions => defined<LinkEnhanceOptions>({ external: this.external(), muted: this.muted(), locale: locale.locale() });
    afterNextRender(() => {
      styled = Link.enhance(el, untracked(options));
    });
    effect(() => {
      const next = options();
      untracked(() => styled?.update(next));
    });
    inject(DestroyRef).onDestroy(() => {
      styled?.destroy();
    });
  }
}

function lines(value: unknown): number {
  return numberAttribute(value);
}

/** `<p auiText [auiLineClamp]="3">`: clamp to 1..20 lines with an ellipsis. */
@Directive({ selector: '[auiLineClamp]', exportAs: 'auiLineClamp' })
export class AuiLineClamp {
  readonly lines: InputSignalWithTransform<number, unknown> = input.required<number, unknown>({ alias: 'auiLineClamp', transform: lines });

  constructor() {
    loadStyles(TypographyStyles);
    const el: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    let dispose: (() => void) | null = null;
    effect(() => {
      const n = this.lines();
      untracked(() => {
        dispose?.();
        dispose = setLineClamp(el, n);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      dispose?.();
    });
  }
}

/** The typography directives, for `imports`. */
export const AUI_TYPOGRAPHY = [AuiHeading, AuiText, AuiLink, AuiLineClamp] as const;
