# Avatar Group

> Package: `@absoluteui/components/avatar-group` | Styles: `@absoluteui/components/avatar/style.css` and `@absoluteui/components/avatar-group/style.css` | Since 0.9.0 | Status: R13

## 1. Purpose

A row of overlapping avatars for the people on a record, with the overflow collapsed into "+N". `AvatarGroup` is a named group: each avatar is named by its person (see Avatar), and the overflow chip is announced as "N more". Size and shape follow the Avatar configuration unless set on the group.

## 2. Anatomy

```text
<div class="aui-avatar-group" role="group" aria-label="Project members">
  <span class="aui-avatar ..." role="img" aria-label="Ada Lovelace">...</span>     (up to max)
  <span class="aui-avatar aui-avatar-group__more" role="img" aria-label="2 more">
    <span class="aui-avatar__visual" aria-hidden="true">+2</span>
  </span>
</div>
```

## 3. When to use

- Members, assignees, or viewers of a record, project, or document.
- Compact presence of several people in a header or card.

## 4. When not to use

- One person: use Avatar.
- A list the user must read in full or act on: use a list or a table.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element (`role="group"`). |
| `overflow` | `number` | Number of people behind the "+N" chip. |
| `options` | `Readonly<AvatarGroupOptions>` | Current options. |

Options (`AvatarGroupOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Accessible name of the group, such as "Project members". |
| `items` | `readonly AvatarGroupItem[]` | - (required) | No | People: `{ name, src?, icon?, status? }`, validated as Avatar options. |
| `max` | `number` | `4` | Yes | Avatars shown before the "+N" chip (1 to 50). |
| `size` | `AvatarSize` | Avatar configuration | No | Size of every avatar and the chip. |
| `shape` | `AvatarShape` | Avatar configuration | No | Shape of every avatar and the chip. |
| `locale` | `string` | common `locale` | Yes (inherited) | Locale of the count and the "N more" label. |

## 6. Methods

| Method | Description |
|---|---|
| `AvatarGroup.create(host, options)` | Render into `host` (children are replaced). |
| `update(options)` | Merge and apply options. An invalid item throws and leaves the previous rendering intact. |
| `destroy()` | Destroy the avatars and remove rendering, attributes, classes, and subscriptions. |

## 7. Events

None.

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

`aui-avatar-group`, `aui-avatar-group__more` (an `aui-avatar` sized like the others), plus the Avatar classes on each avatar. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/avatar-group/tokens.json` (verified in CI). Avatars use the Avatar component tokens; each is ringed in `color-surface`. The chip uses `color-text` on `color-surface` with a `color-border-strong` boundary.

## 11. States

Within max (every avatar shown); overflow (max avatars and the "+N" chip).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | `update({ items, max })` | avatars re-created; chip shown when items exceed max |
| any | Avatar or Avatar Group configuration change | re-rendered with the new size, shape, max, or locale |
| any | `destroy()` | host restored to empty |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| - | Any | Not focusable. Assistive technology reads it in document order. |

## 14. ARIA contract

- Host: `role="group"`, `aria-label` from `label`.
- Each avatar: `role="img"` named by its person (Avatar contract).
- Overflow chip: `role="img"`, `aria-label` "{count} more" (localized `more` message); its "+N" text is `aria-hidden`.

## 15. Accessibility notes

- The chip says how many people are not shown, not who they are. Provide the full list elsewhere (for example in a dialog opened by a nearby button) when users need the names.
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

An inline row in which avatars overlap by a quarter of their size; it does not wrap. Lower `max` for narrow containers.

## 17. RTL behavior

Order and overlap follow the inline direction.

## 18. Theme behavior

Avatar tokens apply to every avatar. Forced-colors mode removes the surface rings; each avatar draws a `CanvasText` boundary.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { avatarGroup: { max: 3 }, avatar: { size: 'sm' } } });
```

## 20. Component configuration support

Instance `max`, `size`, `shape`, and `locale` override configuration; configuration changes re-render existing groups.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

Per item `icon`, as in Avatar.

## 23. Security behavior

Every item is validated as Avatar options: unsafe image sources throw `AVATAR_OPTIONS`. Names and counts are rendered with `textContent`.

## 24. Data handling behavior

Only the avatars' image elements load their `src`, without a referrer. No persistence, other network access, or telemetry.

## 25. Performance characteristics

At most `max` avatars are created per render; the rest are counted.

## 26. Supported data scale

Up to 10,000 items are accepted; up to 50 avatars are rendered.

## 27. Usage examples

```ts
import { AvatarGroup } from '@absoluteui/components/avatar-group';

const host = document.querySelector<HTMLElement>('#watchers');
if (host) {
  const group = AvatarGroup.create(host, { label: 'Watchers', items: [{ name: 'Ada Lovelace' }, { name: 'Grace Hopper' }], max: 3 });
  group.update({ items: [...group.options.items, { name: 'Alan Turing', status: 'online' }] });
}
```

More examples, type-checked in CI: `metadata/avatar-group/examples.json`.

## 28. Edge cases

- An empty `items` array renders an empty group.
- When items exceed `max`, exactly `max` avatars are shown, followed by the chip.
- Safe in renderers that discard nodes without calling `destroy()`, such as Data Table cells: the configuration subscription holds the instance weakly, so a discarded group is released.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `AVATAR_GROUP_OPTIONS` | configuration | Missing or blank label, or items that are not an array (or more than 10,000). |
| `AVATAR_OPTIONS` | configuration | An invalid item (blank name, unsafe `src`, unknown status). |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid max, size, shape, or locale configuration. |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous rendering intact.

## 30. Known limitations

- The people behind "+N" are not listed.
- Every update re-creates the shown avatars.

## 31. Unsupported scenarios

- Clickable avatars or chip: put a button next to the group that opens the full list.
- Wrapping onto several lines.

## 32. TypeScript definitions

```ts
interface AvatarGroupConfig { max: number }
interface AvatarGroupItem { name: string; src?: string | null; icon?: IconRef | null; status?: AvatarStatus | null }
interface AvatarGroupOptions extends Partial<AvatarGroupConfig> {
  label: string;
  items: readonly AvatarGroupItem[];
  size?: AvatarSize;
  shape?: AvatarShape;
  locale?: string;
}
```

## 33. Vanilla JS example

```ts
import { AvatarGroup } from '@absoluteui/components/avatar-group';
import '@absoluteui/components/avatar/style.css';
import '@absoluteui/components/avatar-group/style.css';

const host = document.querySelector<HTMLElement>('#reviewers');
if (host) AvatarGroup.create(host, { label: 'Reviewers', items: [{ name: 'Barbara Liskov' }, { name: 'Donald Knuth' }], size: 'sm' });
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiAvatarGroup } from '@absoluteui/angular/avatar-group';
import type { AvatarGroupItem } from '@absoluteui/components/avatar-group';

@Component({
  selector: 'app-members',
  imports: [AuiAvatarGroup],
  template: `<aui-avatar-group label="Project members" [items]="members" [max]="3"></aui-avatar-group>`,
})
export class MembersComponent {
  readonly members: AvatarGroupItem[] = [{ name: 'Ada Lovelace' }, { name: 'Grace Hopper' }, { name: 'Alan Turing' }, { name: 'Barbara Liskov' }];
}
```

## 35. React example

```tsx
import { AuiAvatarGroup } from '@absoluteui/react/avatar-group';

export function Example() {
  return <AuiAvatarGroup label="Project members" items={[{ name: 'Ada Lovelace' }, { name: 'Grace Hopper' }]} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiAvatarGroup } from '@absoluteui/vue/avatar-group';
</script>

<template>
  <AuiAvatarGroup label="Project members" :items="[{ name: 'Ada Lovelace' }, { name: 'Grace Hopper' }]" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
