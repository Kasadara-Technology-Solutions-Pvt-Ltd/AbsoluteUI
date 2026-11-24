/**
 * Angular accessibility layer (docs/PLAN-R9-ANGULAR.md M1): directives and services over
 * the framework-neutral focus, keyboard, and live-region rules in @absoluteui/utilities.
 * Angular owns the DOM side (host elements, lifecycle, server rendering); the rules are
 * not reimplemented here. Everything is inert on the server.
 */
import {
  afterNextRender,
  booleanAttribute,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  Injectable,
  input,
  output,
  untracked,
  type InputSignal,
  type InputSignalWithTransform,
  type OutputEmitterRef,
} from '@angular/core';
import type { Direction } from '@absoluteui/core';
import {
  announce,
  createFocusRestore,
  createFocusTrap,
  createRovingTabindex,
  matchesHotkey,
  type FocusTrap,
  type Orientation,
  type Politeness,
  type RovingTabindex,
} from '@absoluteui/utilities';
import { AuiDirectionality, AuiPlatform } from '../services.js';

export type { Politeness } from '@absoluteui/utilities';

/** Screen-reader announcements through the shared live regions (inside an open modal dialog when there is one). */
@Injectable({ providedIn: 'root' })
export class AuiLiveAnnouncer {
  readonly #platform = inject(AuiPlatform);

  /** Announce a message (text only, never parsed as HTML). No-op on the server. */
  announce(message: string, politeness: Politeness = 'polite'): void {
    if (this.#platform.isBrowser) announce(message, politeness, this.#platform.document);
  }
}

/**
 * Keep keyboard focus inside the host while enabled: `<div auiFocusTrap>...</div>` or
 * `[auiFocusTrap]="editing()"`. Focus moves in on activation and returns on deactivation.
 */
@Directive({ selector: '[auiFocusTrap]', exportAs: 'auiFocusTrap' })
export class AuiFocusTrap {
  /** Whether the trap is active (default true; an empty attribute counts as true). */
  readonly enabled: InputSignalWithTransform<boolean, unknown> = input(true, { alias: 'auiFocusTrap', transform: (v: unknown) => v === '' || booleanAttribute(v) });
  /** Return focus to the previously focused element on deactivation (default true). */
  readonly restoreFocus: InputSignalWithTransform<boolean, unknown> = input(true, { transform: booleanAttribute });

  constructor() {
    const host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    let trap: FocusTrap | null = null;
    let ready = false;
    const sync = (enabled: boolean): void => {
      if (!ready) return;
      if (enabled && !trap) {
        trap = createFocusTrap(host, { restoreFocus: untracked(this.restoreFocus) });
        trap.activate();
      } else if (!enabled && trap) {
        trap.deactivate();
        trap = null;
      }
    };
    effect(() => {
      const enabled = this.enabled();
      untracked(() => {
        sync(enabled);
      });
    });
    afterNextRender(() => {
      ready = true;
      sync(untracked(this.enabled));
    });
    inject(DestroyRef).onDestroy(() => {
      trap?.deactivate();
      trap = null;
    });
  }
}

/**
 * Return focus to the element that was focused when the host appeared, when the host is
 * destroyed: `@if (editing) { <section auiFocusRestore>...</section> }`.
 */
@Directive({ selector: '[auiFocusRestore]', exportAs: 'auiFocusRestore' })
export class AuiFocusRestore {
  constructor() {
    const platform = inject(AuiPlatform);
    if (!platform.isBrowser) return;
    const point = createFocusRestore(platform.document);
    inject(DestroyRef).onDestroy(() => {
      // After Angular removes the view, so focus does not land in removed content.
      queueMicrotask(() => {
        point.restore();
      });
    });
  }
}

/**
 * Roving tabindex (WAI-ARIA APG) over the host's items: one item in the tab sequence,
 * arrow keys move between items, Home/End jump, disabled items are skipped.
 * `<div role="toolbar" auiRovingTabindex="[data-item]" orientation="horizontal">`.
 */
@Directive({ selector: '[auiRovingTabindex]', exportAs: 'auiRovingTabindex' })
export class AuiRovingTabindex {
  /** CSS selector of the items inside the host (default: direct children). */
  readonly items: InputSignal<string> = input('', { alias: 'auiRovingTabindex' });
  /** Which arrow keys move between items: 'vertical', 'horizontal', or 'both' (default 'vertical'). */
  readonly orientation: InputSignal<Orientation> = input<Orientation>('vertical');
  /** Wrap from the last item to the first and back (default true). */
  readonly loop: InputSignalWithTransform<boolean, unknown> = input(true, { transform: booleanAttribute });
  /** Typing characters moves to the next item whose text starts with them (default false). */
  readonly typeahead: InputSignalWithTransform<boolean, unknown> = input(false, { transform: booleanAttribute });
  /** Overrides the configured direction (RTL mirrors horizontal arrows). */
  readonly direction: InputSignal<Direction | undefined> = input<Direction>();
  /** An item became active through the keyboard. */
  readonly activated: OutputEmitterRef<{ item: HTMLElement; index: number }> = output<{ item: HTMLElement; index: number }>();
  #roving: RovingTabindex | null = null;

  constructor() {
    const host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const dir = inject(AuiDirectionality);
    const getItems = (): HTMLElement[] => {
      const selector = untracked(this.items);
      const candidates = selector ? Array.from(host.querySelectorAll(selector)) : Array.from(host.children);
      return candidates.filter((el): el is HTMLElement => el instanceof HTMLElement);
    };
    const create = (): void => {
      this.#roving?.dispose();
      this.#roving = createRovingTabindex(host, {
        getItems,
        orientation: this.orientation(),
        loop: this.loop(),
        typeahead: this.typeahead(),
        direction: this.direction() ?? dir.value(),
        onActivate: (item, index) => {
          this.activated.emit({ item, index });
        },
      });
    };
    let ready = false;
    effect(() => {
      // Re-created when its options change.
      this.orientation();
      this.loop();
      this.typeahead();
      this.direction();
      dir.value();
      if (ready) untracked(create);
    });
    afterNextRender(() => {
      ready = true;
      untracked(create);
    });
    inject(DestroyRef).onDestroy(() => {
      this.#roving?.dispose();
      this.#roving = null;
    });
  }

  /** Make an item the active one (and optionally focus it). */
  setActive(index: number, focus = false): void {
    this.#roving?.setActive(index, focus);
  }
}

/**
 * Keyboard shortcut on the host (or the document with `hotkeyScope="document"`):
 * `<div auiHotkey="Mod+K" (hotkey)="openSearch()">`. "Mod" is Meta on Apple platforms
 * and Control elsewhere. The matching keydown is prevented.
 */
@Directive({ selector: '[auiHotkey]', exportAs: 'auiHotkey' })
export class AuiHotkey {
  /** Key combination such as "Mod+K", "Shift+?", or "Escape" ("Mod" is Meta on Apple platforms, Control elsewhere). */
  readonly combination: InputSignal<string> = input.required<string>({ alias: 'auiHotkey' });
  /** Listen on the host only ('element', default) or anywhere in the document ('document'); read once when the host renders. */
  readonly scope: InputSignal<'element' | 'document'> = input<'element' | 'document'>('element', { alias: 'hotkeyScope' });
  /** The combination was pressed (its default action is prevented). */
  readonly hotkey: OutputEmitterRef<KeyboardEvent> = output<KeyboardEvent>();

  constructor() {
    const host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const target: EventTarget = untracked(this.scope) === 'document' ? host.ownerDocument : host;
      const onKey = (event: Event): void => {
        if (event instanceof KeyboardEvent && !event.defaultPrevented && matchesHotkey(event, untracked(this.combination))) {
          event.preventDefault();
          this.hotkey.emit(event);
        }
      };
      target.addEventListener('keydown', onKey);
      destroyRef.onDestroy(() => {
        target.removeEventListener('keydown', onKey);
      });
    });
  }
}
