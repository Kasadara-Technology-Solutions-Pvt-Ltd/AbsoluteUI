# Avatar

> Package: `@absoluteui/components/avatar` | Styles: `@absoluteui/components/avatar/style.css` | Since 0.9.0 | Status: R13

## 1. Purpose

A picture of a person or entity with fallbacks: the image, then initials from the name, then an optional icon. `Avatar` is one image to assistive technology (`role="img"`), named after the person and, when shown, their presence status ("Ada Lovelace, Away"). Set `decorative` when the name is printed next to it. The component never fetches anything itself; only its image element loads `src`.

## 2. Anatomy

```text
<span class="aui-avatar aui-avatar--{size} aui-avatar--{shape} aui-avatar--{image|initials|icon}" role="img" aria-label="name[, status]">
  <span class="aui-avatar__visual" aria-hidden="true">
    <img class="aui-avatar__image" alt="">  |  initials  |  icon
  </span>
  <span class="aui-avatar__status" aria-hidden="true"></span>   (presence dot, optional)
</span>
```

## 3. When to use

- Identifying people in lists, comments, assignments, and headers.
- Showing presence (online, away, busy, offline) next to a person.

## 4. When not to use

- Several people on one record: use Avatar Group.
- Content images or logos that are not identities: use an `img` element.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element; receives role, label, and classes. |
| `name` | `string` | Current name. |
| `shows` | `'image' \| 'initials' \| 'icon'` | What is currently shown. |
| `options` | `Readonly<AvatarOptions>` | Current options. |

Options (`AvatarOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `name` | `string` | - (required) | No | Accessible name and source of the initials. |
| `src` | `string \| null` | - | No | Image URL: http(s), relative, `blob:`, or a base64 PNG, JPEG, GIF, WebP, or AVIF data URL. |
| `icon` | `IconRef \| null` | - | No | Shown when the name yields no initials (for example a bot or a team symbol). |
| `status` | `'online' \| 'away' \| 'busy' \| 'offline' \| null` | - | No | Presence dot; its name is part of the accessible name. |
| `decorative` | `boolean` | `false` | No | Hide from assistive technology when the name is shown next to it. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Yes | 1.5rem, 2rem, 2.5rem, 3rem, or 4rem. |
| `shape` | `'circle' \| 'square'` | `'circle'` | Yes | Avatar shape. |
| `locale` | `string` | common `locale` | Yes (inherited) | Locale of status names and initials casing. |

Also exported: `avatarInitials(name, locale?)` and `isSafeImageSrc(value)`.

## 6. Methods

| Method | Description |
|---|---|
| `Avatar.create(host, options)` | Render into `host` (children are replaced). A `<span>` host keeps it inline. |
| `update(options)` | Merge and apply options. A new `src` is loaded even after a failed one. |
| `destroy()` | Remove rendering, attributes, classes, and subscriptions. |

## 7. Events

None.

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

`aui-avatar`, `aui-avatar--xs|sm|md|lg|xl`, `aui-avatar--circle|square`, `aui-avatar--image|initials|icon`, `aui-avatar--status-online|away|busy|offline`, `aui-avatar__visual`, `aui-avatar__image`, `aui-avatar__status`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/avatar/tokens.json` (verified in CI). Component tokens: `--aui-avatar-bg` (falls back to `color-surface-sunken`), `--aui-avatar-fg` (`color-text`), `--aui-avatar-square-radius` (`radius-md`). Status dots use `color-success-fg`, `color-warning-fg`, `color-error-fg`, and `color-text-muted`, ringed in `color-surface`.

## 11. States

Shows image, initials, or icon; five sizes; circle or square; presence online, away, busy, offline; decorative.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| image | the image fails to load | initials (or icon); the same URL is not retried |
| any | `update({ src })` with a new URL | image |
| any | `update({ status })` | new dot and accessible name |
| any | `destroy()` | host restored to empty |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| - | Any | Not focusable. Assistive technology reads it in document order. |

## 14. ARIA contract

- Host: `role="img"` and `aria-label` with the name, or "name, status" (localized `withStatus` message).
- `decorative: true`: no role or label; `aria-hidden="true"`.
- The image has `alt=""`; the visual and the status dot are `aria-hidden`.

## 15. Accessibility notes

- Presence is in the accessible name and each status has its own dot shape (busy has a bar, offline is hollow), so it does not depend on color.
- Set `decorative` when the name is printed beside the avatar, so screen readers do not read it twice.
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

Fixed size per size step; initials and the dot scale with it.

## 17. RTL behavior

The status dot sits at the bottom inline-end corner, mirrored in RTL.

## 18. Theme behavior

Initials pair `--aui-avatar-fg` with `--aui-avatar-bg` (contrast gate). Forced-colors mode draws a `CanvasText` boundary and dot.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { avatar: { size: 'sm', shape: 'square' } } });
```

## 20. Component configuration support

Instance options override global and theme configuration; configuration changes re-render existing avatars.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icon`: any registered icon, shown only when the name has no letters or digits.

## 23. Security behavior

`src` is validated with `isSafeImageSrc`: http(s), relative, `blob:`, or base64 data URLs of raster images. `javascript:`, SVG data URLs, and other schemes are rejected with `AVATAR_OPTIONS`. The image loads lazily with `referrerpolicy="no-referrer"`. The name is rendered with `textContent`.

## 24. Data handling behavior

Only the image element loads `src`, without a referrer. No persistence, other network access, or telemetry.

## 25. Performance characteristics

Constant work per render. Images load lazily and decode asynchronously.

## 26. Supported data scale

One avatar per row in lists of thousands of rows (with virtualization where the list itself needs it).

## 27. Usage examples

```ts
import { Avatar } from '@absoluteui/components/avatar';

const host = document.querySelector<HTMLElement>('#owner');
if (host) {
  const owner = Avatar.create(host, { name: 'Ada Lovelace', src: '/avatars/ada.webp', status: 'online' });
  owner.update({ status: 'away' });
}
```

More examples, type-checked in CI: `metadata/avatar/examples.json`.

## 28. Edge cases

- Initials take the first letter or digit of the first and last word ("Jean-Luc Picard" gives JP); a single word gives one initial.
- A name without letters or digits shows the icon, or else its first character.
- A failed image is not retried until `src` changes.
- Safe in renderers that discard nodes without calling `destroy()`, such as Data Table cells: the configuration subscription holds the instance weakly, so a discarded avatar is released.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `AVATAR_OPTIONS` | configuration | Missing or blank name, unsafe `src`, unknown status, or non-boolean `decorative`. |
| `ICON_UNKNOWN` | configuration | Unknown icon. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid size, shape, or locale configuration. |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact.

## 30. Known limitations

- Initials follow word order; names written family-name-first show those initials in that order.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Uploading or cropping images.
- Clickable avatars: wrap the avatar in a link or button that carries the name.

## 32. TypeScript definitions

```ts
type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
type AvatarShape = 'circle' | 'square';
type AvatarStatus = 'online' | 'away' | 'busy' | 'offline';
interface AvatarConfig { size: AvatarSize; shape: AvatarShape }
interface AvatarOptions extends Partial<AvatarConfig> {
  name: string;
  src?: string | null;
  icon?: IconRef | null;
  status?: AvatarStatus | null;
  decorative?: boolean;
  locale?: string;
}
function avatarInitials(name: string, locale?: string): string;
function isSafeImageSrc(value: unknown): value is string;
```

## 33. Vanilla JS example

```ts
import { Avatar } from '@absoluteui/components/avatar';
import '@absoluteui/components/avatar/style.css';

const host = document.querySelector<HTMLElement>('#me');
if (host) Avatar.create(host, { name: 'Grace Hopper', size: 'sm', status: 'busy' });
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiAvatar } from '@absoluteui/angular/avatar';

@Component({
  selector: 'app-assignee',
  imports: [AuiAvatar],
  template: `<aui-avatar [name]="name" size="sm" [status]="online ? 'online' : 'offline'"></aui-avatar>`,
})
export class AssigneeComponent {
  name = 'Ada Lovelace';
  online = true;
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
