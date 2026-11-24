/**
 * Password Strength Meter and Password Requirements (SPEC section 18.22). Shows a
 * requirements checklist (length, character classes, custom rules) and a
 * strength rating from a pluggable evaluator, with debounced polite
 * announcements. It can attach to a Password Input (or any <input>).
 *
 * ADVISORY ONLY. The rating is a UI hint, not a security guarantee: the default
 * evaluator counts rules, it does not detect dictionary words, personal data,
 * or breached passwords. The server must enforce the real password policy.
 * AbsoluteUI is not an authentication or security provider. The meter never
 * stores, logs, or emits the password.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, formatNumber, getMessage, registerMessages, validators } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { announce } from '@absoluteui/utilities';
import { setText } from '../internal/field.js';

export interface PasswordStrengthMeterConfig {
  /** Render the requirements checklist. */
  showRequirements: boolean;
  /** Announce the rating and requirement count politely after typing pauses. */
  announce: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    passwordStrengthMeter: PasswordStrengthMeterConfig & { locale: string };
  }
}

export const passwordStrengthMeterConfig = defineComponentConfig<PasswordStrengthMeterConfig, 'locale'>(
  'passwordStrengthMeter',
  {
    showRequirements: { default: true, expected: 'boolean', validate: validators.isBoolean },
    announce: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale'],
);

registerMessages('passwordStrengthMeter', 'en', {
  label: 'Password strength',
  requirements: 'Password requirements',
  score1: 'Weak',
  score2: 'Fair',
  score3: 'Good',
  score4: 'Strong',
  met: 'met',
  notMet: 'not met',
  minLength: 'At least {count} characters',
  lowercase: 'A lowercase letter',
  uppercase: 'An uppercase letter',
  digit: 'A number',
  symbol: 'A symbol, such as ! or #',
  announcement: '{label}: {rating}. {met} of {total} requirements met.',
  announcementNoRules: '{label}: {rating}.',
});

export type PasswordStrengthScore = 0 | 1 | 2 | 3 | 4;

export interface PasswordRequirement {
  /** Stable id (used for results and CSS hooks). */
  readonly id: string;
  /** Checklist text. A function receives the resolved locale (for localized built-ins). */
  readonly label: string | ((locale: string) => string);
  /** Must be synchronous and side-effect free; it receives the password. */
  readonly test: (value: string) => boolean;
}

export interface PasswordRequirementResult {
  readonly id: string;
  readonly label: string;
  readonly met: boolean;
}

export interface PasswordStrength {
  readonly score: PasswordStrengthScore;
  /** Rating text. Default: localized Weak / Fair / Good / Strong. */
  readonly label?: string;
}

/** Consumer scoring. Receives the password and the requirement results; must not store the password. */
export type PasswordStrengthEvaluator = (value: string, requirements: readonly PasswordRequirementResult[]) => PasswordStrength;

export interface PasswordStrengthResult {
  readonly score: PasswordStrengthScore;
  /** Localized rating text; empty when the password is empty. */
  readonly label: string;
  readonly requirements: readonly PasswordRequirementResult[];
}

const length = (value: string): number => Array.from(value).length;
const localized = (key: string, params: Record<string, string> = {}) => (locale: string): string => getMessage('passwordStrengthMeter', key, params, locale);

/** Built-in requirement rules. Character classes are Unicode-aware. */
export const passwordRequirements = {
  minLength(count: number): PasswordRequirement {
    if (!validators.integerInRange(1, 1024)(count)) {
      throw configurationError('PASSWORD_STRENGTH_METER_OPTIONS', 'Invalid password requirement.', { component: 'passwordStrengthMeter', property: 'passwordRequirements.minLength', expected: 'integer 1..1024' });
    }
    return { id: 'min-length', label: (locale) => getMessage('passwordStrengthMeter', 'minLength', { count: formatNumber(count, {}, locale) }, locale), test: (v) => length(v) >= count };
  },
  lowercase(): PasswordRequirement {
    return { id: 'lowercase', label: localized('lowercase'), test: (v) => /\p{Ll}/u.test(v) };
  },
  uppercase(): PasswordRequirement {
    return { id: 'uppercase', label: localized('uppercase'), test: (v) => /\p{Lu}/u.test(v) };
  },
  digit(): PasswordRequirement {
    return { id: 'digit', label: localized('digit'), test: (v) => /\p{Nd}/u.test(v) };
  },
  symbol(): PasswordRequirement {
    return { id: 'symbol', label: localized('symbol'), test: (v) => /[^\p{L}\p{N}\s]/u.test(v) };
  },
} as const;

/** Default checklist: at least 12 characters, lowercase, uppercase, and a number. */
export function defaultPasswordRequirements(): PasswordRequirement[] {
  return [passwordRequirements.minLength(12), passwordRequirements.lowercase(), passwordRequirements.uppercase(), passwordRequirements.digit()];
}

const DEFAULT_REQUIREMENTS: readonly PasswordRequirement[] = Object.freeze(defaultPasswordRequirements());

/**
 * Default, non-authoritative evaluator: empty = 0; fewer than half of the
 * requirements met = 1 (Weak); some unmet = 2 (Fair); all met = 3 (Good); all met
 * and at least 16 characters = 4 (Strong). A single repeated character is
 * always Weak.
 */
export const defaultPasswordEvaluator: PasswordStrengthEvaluator = (value, requirements) => {
  if (value === '') return { score: 0 };
  const chars = Array.from(value);
  if (chars.length > 1 && chars.every((c) => c === chars[0])) return { score: 1 };
  const met = requirements.filter((r) => r.met).length;
  const total = requirements.length;
  if (met < total) return { score: met * 2 < total ? 1 : 2 };
  return { score: chars.length >= 16 ? 4 : 3 };
};

export interface PasswordStrengthMeterIcons {
  met: IconRef;
  unmet: IconRef;
}

/** Anything with a native input: a Password Input or Text Input controller, or the element itself. */
export type PasswordStrengthTarget = HTMLInputElement | { readonly input: HTMLInputElement };

export interface PasswordStrengthMeterOptions extends Partial<PasswordStrengthMeterConfig> {
  /** Visible heading. Default: localized "Password strength". */
  label?: string;
  /** Input to follow: re-evaluates on its `input` events. */
  input?: PasswordStrengthTarget;
  /** Evaluate this value instead of following an input (for framework bindings). */
  value?: string;
  /** Checklist rules. Default: `defaultPasswordRequirements()`. Mirror your server policy. */
  requirements?: readonly PasswordRequirement[];
  /** Scoring function. Default: `defaultPasswordEvaluator` (advisory). */
  evaluate?: PasswordStrengthEvaluator;
  locale?: string;
  icons?: Partial<PasswordStrengthMeterIcons>;
}

/** Event detail: the rating and checklist state, never the password. */
export interface PasswordStrengthMeterChangeDetail {
  result: PasswordStrengthResult;
}

/** Not a type guard on purpose: narrowing a typed readonly array through Array.isArray yields any[]. */
const isArray = (v: unknown): boolean => Array.isArray(v);
const SCORES: readonly PasswordStrengthScore[] = [0, 1, 2, 3, 4];
const ANNOUNCE_DELAY = 1000;

function fail(property: string, expected: string): never {
  throw configurationError('PASSWORD_STRENGTH_METER_OPTIONS', 'Invalid password strength meter options.', { component: 'passwordStrengthMeter', property: `passwordStrengthMeter.${property}`, expected });
}

export class PasswordStrengthMeter {
  readonly host: HTMLElement;
  /** Id of the element to reference from the input's aria-describedby (rating and checklist). */
  readonly describedById: string;
  #options: PasswordStrengthMeterOptions;
  #result: PasswordStrengthResult;
  #target: HTMLInputElement | null = null;
  #detachTarget: (() => void) | null = null;
  #announceTimer: ReturnType<typeof setTimeout> | undefined;
  #announced = '';
  readonly #doc: Document;
  readonly #body: HTMLDivElement;
  readonly #label: HTMLSpanElement;
  readonly #rating: HTMLSpanElement;
  readonly #bar: HTMLDivElement;
  readonly #list: HTMLUListElement;
  readonly #group = new DisposableGroup();

  /** Render a strength meter into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: PasswordStrengthMeterOptions = {}): PasswordStrengthMeter {
    return new PasswordStrengthMeter(host, options);
  }

  private constructor(host: HTMLElement, options: PasswordStrengthMeterOptions) {
    PasswordStrengthMeter.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    const doc = this.#doc;
    // Resolve config before touching the host: invalid config throws with nothing rendered.
    this.#config();

    this.#body = doc.createElement('div');
    this.#body.className = 'aui-password-strength-meter__body';
    this.describedById = createId('aui-password-strength');
    this.#body.id = this.describedById;
    const header = doc.createElement('div');
    header.className = 'aui-password-strength-meter__header';
    this.#label = doc.createElement('span');
    this.#label.className = 'aui-password-strength-meter__label';
    this.#rating = doc.createElement('span');
    this.#rating.className = 'aui-password-strength-meter__rating';
    header.append(this.#label, this.#rating);
    // The segmented bar repeats the rating text visually.
    this.#bar = doc.createElement('div');
    this.#bar.className = 'aui-password-strength-meter__bar';
    this.#bar.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 4; i++) {
      const segment = doc.createElement('span');
      segment.className = 'aui-password-strength-meter__segment';
      this.#bar.append(segment);
    }
    this.#list = doc.createElement('ul');
    this.#list.className = 'aui-password-strength-meter__requirements';
    this.#body.append(header, this.#bar, this.#list);

    this.#result = this.#compute(this.#currentValue());
    host.classList.add('aui-password-strength-meter');
    host.replaceChildren(this.#body);
    this.#render();
    if (options.input) this.attach(options.input);
    this.#group.add(passwordStrengthMeterConfig.subscribe(() => {
      this.#result = this.#compute(this.#currentValue());
      this.#render();
    }));
  }

  /** The latest result (the password itself is not kept). */
  get result(): PasswordStrengthResult {
    return this.#result;
  }

  get options(): Readonly<PasswordStrengthMeterOptions> {
    return this.#options;
  }

  /** Evaluate a value and render the result (no announcement, no event). */
  evaluate(value: string): PasswordStrengthResult {
    if (typeof value !== 'string') fail('value', 'string');
    this.#result = this.#compute(value);
    this.#render();
    return this.#result;
  }

  /** Follow an input: evaluate on each `input` event. Replaces a previous target. */
  attach(target: PasswordStrengthTarget): void {
    this.detach();
    const input = target instanceof HTMLInputElement ? target : target.input;
    if (!(input instanceof HTMLInputElement)) fail('input', 'HTMLInputElement | { input: HTMLInputElement }');
    const onInput = (): void => {
      this.#onUserInput(input.value);
    };
    input.addEventListener('input', onInput);
    this.#target = input;
    this.#detachTarget = () => {
      input.removeEventListener('input', onInput);
    };
    this.#result = this.#compute(input.value);
    this.#render();
  }

  detach(): void {
    this.#detachTarget?.();
    this.#detachTarget = null;
    this.#target = null;
  }

  update(options: Partial<PasswordStrengthMeterOptions>): void {
    const next = { ...this.#options, ...options };
    PasswordStrengthMeter.#assert(next);
    this.#options = next;
    this.#config();
    if (options.input) this.attach(options.input);
    const value = this.#currentValue();
    const previous = this.#result;
    this.#result = this.#compute(value);
    this.#render();
    // A bound value changing (framework binding) is user input by another route.
    if ('value' in options && !this.#target) this.#afterChange(previous);
  }

  destroy(): void {
    this.detach();
    clearTimeout(this.#announceTimer);
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-password-strength-meter', ...SCORES.map((s) => `aui-password-strength-meter--score-${String(s)}`));
  }

  static #assert(o: PasswordStrengthMeterOptions): void {
    if (o.label !== undefined && (typeof o.label !== 'string' || o.label.trim() === '')) fail('label', 'non-empty string');
    if (o.value !== undefined && typeof o.value !== 'string') fail('value', 'string');
    if (o.evaluate !== undefined && typeof o.evaluate !== 'function') fail('evaluate', '(value, requirements) => { score: 0 | 1 | 2 | 3 | 4; label?: string }');
    if (o.input !== undefined && !(o.input instanceof HTMLInputElement) && !(typeof o.input === 'object' && o.input.input instanceof HTMLInputElement)) {
      fail('input', 'HTMLInputElement | { input: HTMLInputElement }');
    }
    if (o.requirements !== undefined) {
      if (!isArray(o.requirements)) fail('requirements', 'array of { id, label, test }');
      const ids = new Set<string>();
      for (const r of o.requirements) {
        if (typeof r.id !== 'string' || r.id === '' || ids.has(r.id)) fail('requirements', 'unique non-empty id per requirement');
        if (typeof r.label !== 'string' && typeof r.label !== 'function') fail('requirements', 'label: string | ((locale: string) => string)');
        if (typeof r.test !== 'function') fail('requirements', 'test: (value: string) => boolean');
        ids.add(r.id);
      }
    }
  }

  #config(): Readonly<PasswordStrengthMeterConfig & { locale: string }> {
    const o = this.#options;
    return passwordStrengthMeterConfig.resolve({
      ...(o.showRequirements === undefined ? {} : { showRequirements: o.showRequirements }),
      ...(o.announce === undefined ? {} : { announce: o.announce }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  #currentValue(): string {
    return this.#target?.value ?? this.#options.value ?? '';
  }

  #requirements(): readonly PasswordRequirement[] {
    return this.#options.requirements ?? DEFAULT_REQUIREMENTS;
  }

  #compute(value: string): PasswordStrengthResult {
    const locale = this.#config().locale;
    const results = this.#requirements().map((r): PasswordRequirementResult => Object.freeze({
      id: r.id,
      label: typeof r.label === 'function' ? r.label(locale) : r.label,
      met: r.test(value),
    }));
    const strength = (this.#options.evaluate ?? defaultPasswordEvaluator)(value, results);
    const score = SCORES.includes(strength.score) ? strength.score : fail('evaluate', 'result score 0 | 1 | 2 | 3 | 4');
    const label = strength.label ?? (score === 0 ? '' : getMessage('passwordStrengthMeter', `score${String(score)}`, {}, locale));
    return Object.freeze({ score, label, requirements: Object.freeze(results) });
  }

  #onUserInput(value: string): void {
    const previous = this.#result;
    this.#result = this.#compute(value);
    this.#render();
    this.#afterChange(previous);
  }

  #afterChange(previous: PasswordStrengthResult): void {
    const r = this.#result;
    const changed = previous.score !== r.score || previous.label !== r.label || previous.requirements.some((p, i) => p.met !== r.requirements[i]?.met);
    if (!changed) return;
    emit(this.host, 'aui-change', { result: r } satisfies PasswordStrengthMeterChangeDetail);
    this.#scheduleAnnouncement();
  }

  /** One polite summary after typing pauses, and only when it differs from the last one. */
  #scheduleAnnouncement(): void {
    clearTimeout(this.#announceTimer);
    const config = this.#config();
    if (!config.announce) return;
    this.#announceTimer = setTimeout(() => {
      if (this.#group.disposed) return;
      const r = this.#result;
      const locale = this.#config().locale;
      const label = this.#options.label ?? getMessage('passwordStrengthMeter', 'label', {}, locale);
      if (r.score === 0 && r.label === '') {
        this.#announced = '';
        return;
      }
      const met = r.requirements.filter((x) => x.met).length;
      const text = r.requirements.length === 0
        ? getMessage('passwordStrengthMeter', 'announcementNoRules', { label, rating: r.label }, locale)
        : getMessage('passwordStrengthMeter', 'announcement', { label, rating: r.label, met: formatNumber(met, {}, locale), total: formatNumber(r.requirements.length, {}, locale) }, locale);
      if (text === this.#announced) return;
      this.#announced = text;
      announce(text, 'polite', this.#doc);
    }, ANNOUNCE_DELAY);
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const locale = config.locale;
    const r = this.#result;
    const doc = this.#doc;
    for (const s of SCORES) this.host.classList.toggle(`aui-password-strength-meter--score-${String(s)}`, s === r.score);
    setText(this.#label, o.label ?? getMessage('passwordStrengthMeter', 'label', {}, locale));
    setText(this.#rating, r.label);
    this.#rating.hidden = r.label === '';
    Array.from(this.#bar.children).forEach((segment, i) => {
      segment.classList.toggle('aui-password-strength-meter__segment--filled', i < r.score);
    });

    this.#list.hidden = !config.showRequirements || r.requirements.length === 0;
    this.#list.setAttribute('aria-label', getMessage('passwordStrengthMeter', 'requirements', {}, locale));
    const met = getMessage('passwordStrengthMeter', 'met', {}, locale);
    const notMet = getMessage('passwordStrengthMeter', 'notMet', {}, locale);
    const items = r.requirements.map((req) => {
      const li = doc.createElement('li');
      li.className = `aui-password-strength-meter__requirement${req.met ? ' aui-password-strength-meter__requirement--met' : ''}`;
      li.dataset.requirement = req.id;
      const text = doc.createElement('span');
      text.textContent = req.label;
      // State in text (not only icon and color): "At least 12 characters, met".
      const state = doc.createElement('span');
      state.className = 'aui-visually-hidden';
      state.textContent = `, ${req.met ? met : notMet}`;
      li.append(renderIcon(req.met ? (o.icons?.met ?? 'check') : (o.icons?.unmet ?? 'close'), { className: 'aui-password-strength-meter__icon', doc }), text, state);
      return li;
    });
    this.#list.replaceChildren(...items);
  }
}
