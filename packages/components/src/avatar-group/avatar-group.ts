/**
 * Avatar Group (R13-9). A row of overlapping avatars for the people on a record,
 * with the overflow collapsed into "+N". The host is a named group; each avatar is
 * named by its person, and the overflow chip is announced as "N more". Size and
 * shape follow Avatar's configuration unless set here.
 */
import { configurationError, defineComponentConfig, formatNumber, getMessage, registerMessages, validators, DisposableGroup } from '@absoluteui/core';
import type { IconRef } from '@absoluteui/icons';
import { Avatar, avatarConfig, type AvatarShape, type AvatarSize, type AvatarStatus } from '../avatar/avatar.js';
import { subscribeWhileHosted } from '../internal/weak.js';

export interface AvatarGroupConfig {
  max: number;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    avatarGroup: AvatarGroupConfig & { locale: string };
  }
}

export const avatarGroupConfig = defineComponentConfig<AvatarGroupConfig, 'locale'>(
  'avatarGroup',
  {
    max: { default: 4, expected: 'integer from 1 to 50', validate: validators.integerInRange(1, 50) },
  },
  ['locale'],
);

registerMessages('avatarGroup', 'en', {
  more: '{count} more',
});

export interface AvatarGroupItem {
  name: string;
  src?: string | null;
  icon?: IconRef | null;
  status?: AvatarStatus | null;
}

export interface AvatarGroupOptions extends Partial<AvatarGroupConfig> {
  /** Accessible name of the group, such as "Project members". */
  label: string;
  items: readonly AvatarGroupItem[];
  size?: AvatarSize;
  shape?: AvatarShape;
  locale?: string;
}

const MAX_ITEMS = 10_000;

export class AvatarGroup {
  readonly host: HTMLElement;
  #options: AvatarGroupOptions;
  readonly #doc: Document;
  #avatars: Avatar[] = [];
  readonly #group = new DisposableGroup();

  /** Render into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: AvatarGroupOptions): AvatarGroup {
    return new AvatarGroup(host, options);
  }

  private constructor(host: HTMLElement, options: AvatarGroupOptions) {
    AvatarGroup.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options, items: [...options.items] };
    // Render first: invalid options (including config) throw before anything is attached to the host.
    const nodes = this.#build();
    host.classList.add('aui-avatar-group');
    host.setAttribute('role', 'group');
    host.setAttribute('aria-label', this.#options.label);
    host.replaceChildren(...nodes);
    // Weakly held: safe in renderers that discard nodes without destroy() (table cells).
    const subscribe = (listener: () => void): (() => void) => {
      const offGroup = avatarGroupConfig.subscribe(listener);
      const offAvatar = avatarConfig.subscribe(listener);
      return () => {
        offGroup();
        offAvatar();
      };
    };
    this.#group.add(subscribeWhileHosted(host, this, subscribe, (group) => {
      group.#apply();
    }));
  }

  get options(): Readonly<AvatarGroupOptions> {
    return this.#options;
  }

  /** Number of avatars hidden behind the overflow chip. */
  get overflow(): number {
    return Math.max(0, this.#options.items.length - this.#avatars.length);
  }

  update(options: Partial<AvatarGroupOptions>): void {
    const next = { ...this.#options, ...options };
    AvatarGroup.#assert(next);
    this.#options = { ...next, items: [...next.items] };
    this.#apply();
  }

  destroy(): void {
    this.#group.dispose();
    for (const a of this.#avatars) a.destroy();
    this.#avatars = [];
    this.host.replaceChildren();
    this.host.removeAttribute('role');
    this.host.removeAttribute('aria-label');
    this.host.classList.remove('aui-avatar-group');
  }

  static #assert(options: AvatarGroupOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('AVATAR_GROUP_OPTIONS', 'Invalid avatar group options.', { component: 'avatarGroup', property: `avatarGroup.${property}`, expected });
    };
    const label: unknown = options.label;
    if (typeof label !== 'string' || label.trim() === '') fail('label', 'non-empty string');
    const items: unknown = options.items;
    if (!Array.isArray(items) || items.length > MAX_ITEMS) fail('items', `array of { name, src?, icon?, status? } (at most ${String(MAX_ITEMS)})`);
  }

  #apply(): void {
    const nodes = this.#build();
    this.host.setAttribute('aria-label', this.#options.label);
    this.host.replaceChildren(...nodes);
  }

  /** Create the avatars and the overflow chip off-document; previous avatars are destroyed only on success. */
  #build(): Node[] {
    const o = this.#options;
    const { max, locale } = avatarGroupConfig.resolve({
      ...(o.max === undefined ? {} : { max: o.max }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
    const { size, shape } = avatarConfig.resolve({
      ...(o.size === undefined ? {} : { size: o.size }),
      ...(o.shape === undefined ? {} : { shape: o.shape }),
    });
    const shown = o.items.length > max ? o.items.slice(0, max) : o.items;
    const created: Avatar[] = [];
    const nodes: Node[] = [];
    try {
      for (const item of shown) {
        const host = this.#doc.createElement('span');
        created.push(Avatar.create(host, { ...item, size, shape, ...(o.locale === undefined ? {} : { locale: o.locale }) }));
        nodes.push(host);
      }
    } catch (error) {
      for (const a of created) a.destroy();
      throw error;
    }
    const hidden = o.items.length - shown.length;
    if (hidden > 0) {
      const more = this.#doc.createElement('span');
      more.className = `aui-avatar aui-avatar--${size} aui-avatar--${shape} aui-avatar-group__more`;
      more.setAttribute('role', 'img');
      more.setAttribute('aria-label', getMessage('avatarGroup', 'more', { count: formatNumber(hidden, {}, locale) }, locale));
      const visual = this.#doc.createElement('span');
      visual.className = 'aui-avatar__visual';
      visual.setAttribute('aria-hidden', 'true');
      visual.textContent = `+${formatNumber(hidden, {}, locale)}`;
      more.append(visual);
      nodes.push(more);
    }
    for (const a of this.#avatars) a.destroy();
    this.#avatars = created;
    return nodes;
  }
}
