# Tag Group

> Package: `@absoluteui/components/tag-group` | Styles: `@absoluteui/components/tag-group/style.css` | Since 0.9.0 | Status: R13

## 1. Purpose

Interactive tags such as applied filters, recipients, or labels on a record: removable, selectable (single or multiple), or both. The tags form a grid with one row per tag, as in the React Aria TagGroup: one tag is in the tab sequence, the arrow keys move between tags, Space selects, and Delete or Backspace removes. Static labels are Badge.

## 2. Anatomy

```text
<div class="aui-tag-group aui-tag-group--{size}" role="grid" aria-label="Applied filters" [aria-multiselectable]>
  <div class="aui-tag-group__tag [--selected]" role="row" tabindex="0|-1" [aria-selected] [aria-disabled]>
    <div class="aui-tag-group__cell" role="gridcell">
      <span class="aui-tag-group__label">London</span>
      <button class="aui-tag-group__remove" tabindex="-1" aria-label="Remove London">icon</button>   (removable)
    </div>
  </div>
  ...
</div>
```

## 3. When to use

- Applied filters the user can remove one by one.
- A short set of labels the user selects to filter or categorize.
- Recipients or assignees shown as removable chips.

## 4. When not to use

- Static status or category labels: use Badge.
- Choosing values in a form field: use Multi Select; its chips are part of the field.
- Navigation: use Tabs or links.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element (`role="grid"` while it has tags). |
| `items` | `readonly TagGroupItem[]` | The tags shown, after removals. |
| `value` | `readonly string[]` | Selected values, in tag order. |
| `options` | `Readonly<TagGroupOptions>` | Current options. |

Options (`TagGroupOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Accessible name of the group. |
| `items` | `readonly TagGroupItem[]` | - (required) | No | `{ value, label, disabled? }`; unique values, at most 1,000. |
| `removable` | `boolean` | `false` | No | Remove button per tag; Delete and Backspace remove the focused tag. |
| `selection` | `'none' \| 'single' \| 'multiple'` | `'none'` | No | Selection mode. |
| `value` | `readonly string[]` | `[]` | No | Selected values. |
| `size` | `'sm' \| 'md'` | `'md'` | Yes | Tag size. |
| `icons` | `Partial<TagGroupIcons>` | - | No | Icon slot overrides. |
| `locale` | `string` | common `locale` | Yes (inherited) | Locale of the remove label and the announcement. |

## 6. Methods

| Method | Description |
|---|---|
| `TagGroup.create(host, options)` | Render into `host` (children are replaced). |
| `setValue(value)` | Set the selected values (no event). |
| `focus()` | Focus the tag in the tab sequence. |
| `update(options)` | Merge and apply options; focus stays on the same tag. |
| `destroy()` | Remove rendering, attributes, and listeners. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-change` | `{ value: string[] }` | The user changed the selection, or removed a selected tag. |
| `aui-remove` | `{ value: string; item: TagGroupItem }` | The user removes a tag (Delete, Backspace, or the remove button). Cancelable: prevent it to keep the tag, for example to confirm first. |

## 8. Slots/content areas

None. Tags are text.

## 9. CSS parts/hooks

`aui-tag-group`, `aui-tag-group--sm|md`, `aui-tag-group__tag`, `aui-tag-group__tag--selected`, `aui-tag-group__cell`, `aui-tag-group__label`, `aui-tag-group__remove`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/tag-group/tokens.json` (verified in CI). Component tokens: `--aui-tag-group-bg` (falls back to `color-surface`), `--aui-tag-group-border-color` (`color-border-strong`), `--aui-tag-group-radius` (`radius-pill`). Selected tags use `color-selected`, `color-selected-text`, and `color-selected-indicator`.

## 11. States

Removable; selection none, single, or multiple; selected; disabled tag; sizes sm and md; empty.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| tag shown | Delete, Backspace, or the remove button | `aui-remove`; unless prevented, the tag is removed, focus moves on, and "{label} removed" is announced |
| unselected | Space, Enter, or click (selection enabled) | selected; `aui-change` |
| selected | Space, Enter, or click | unselected; `aui-change` |
| single, A selected | select B | B selected, A unselected |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab | Group | Moves into the group (to the last focused tag) and out of it. |
| Arrow keys | Tag | Next or previous enabled tag, in reading direction. |
| Home / End | Tag | First or last enabled tag. |
| Space / Enter | Tag, selection enabled | Select or deselect. |
| Delete / Backspace | Tag, removable | Remove; focus moves to the next tag, or the previous one at the end. |

## 14. ARIA contract

- Host: `role="grid"` while it has tags, `aria-label`, `aria-multiselectable="true"` for multiple selection.
- Each tag: `role="row"` with one `role="gridcell"`; `aria-selected` when selection is enabled; `aria-disabled` for disabled tags.
- Remove buttons: native buttons with `tabindex="-1"` and `aria-label` "Remove {label}"; the keyboard removes with Delete or Backspace.

## 15. Accessibility notes

- Removals are announced through the polite live region.
- When the last tag is removed, focus has nowhere to go inside the group: move it in an `aui-remove` handler.
- Selected tags differ in more than hue.
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

Tags wrap onto several lines; long labels are truncated with an ellipsis.

## 17. RTL behavior

Arrow keys follow the reading direction; the remove button sits at the inline end.

## 18. Theme behavior

The tag tokens and the selection colors are in the contrast gate. Forced colors draw selected tags in `Highlight`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { tagGroup: { size: 'sm' } } });
```

## 20. Component configuration support

Instance `size` and `locale` override configuration; configuration changes re-render existing groups.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.remove` (default `close`).

## 23. Security behavior

Labels use `textContent`; they are never parsed as HTML.

## 24. Data handling behavior

No persistence, network access, or telemetry. A removal changes only the displayed tags; update your own data from `aui-remove`.

## 25. Performance characteristics

Each change re-creates the tag elements and restores focus to the same tag.

## 26. Supported data scale

Up to 1,000 tags; intended for tens.

## 27. Usage examples

```ts
import { TagGroup, type TagGroupRemoveDetail } from '@absoluteui/components/tag-group';

const host = document.querySelector<HTMLElement>('#recipients');
if (host) {
  const recipients = TagGroup.create(host, { label: 'Recipients', removable: true, items: [{ value: 'ada', label: 'Ada Lovelace' }, { value: 'grace', label: 'Grace Hopper' }] });
  host.addEventListener('aui-remove', (event) => {
    const { value } = (event as CustomEvent<TagGroupRemoveDetail>).detail;
    if (recipients.items.length === 1) event.preventDefault(); // keep at least one recipient
    else console.info(`removed ${value}`);
  });
}
```

More examples, type-checked in CI: `metadata/tag-group/examples.json`.

## 28. Edge cases

- `update({ items })` keeps focus on the same tag when it still exists.
- A disabled tag cannot be selected or removed; the arrow keys skip it.
- An empty group has no `grid` role and no `aria-label` (a grid needs rows, and a name needs a role).

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `TAG_GROUP_OPTIONS` | configuration | Blank label, items that are not an array (or more than 1,000), duplicate or blank values, a blank tag label, an unknown selection mode, or several values with `single`. |
| `ICON_UNKNOWN` | configuration | Unknown remove icon. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid size, locale, or unknown configuration. |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact.

## 30. Known limitations

- Removing the last tag leaves focus on the page body.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Editing a tag in place.
- Rich content in tags.

## 32. TypeScript definitions

```ts
type TagGroupSelection = 'none' | 'single' | 'multiple';
type TagGroupSize = 'sm' | 'md';
interface TagGroupConfig { size: TagGroupSize }
interface TagGroupItem { value: string; label: string; disabled?: boolean }
interface TagGroupIcons { remove: IconRef }
interface TagGroupOptions extends Partial<TagGroupConfig> {
  label: string;
  items: readonly TagGroupItem[];
  removable?: boolean;
  selection?: TagGroupSelection;
  value?: readonly string[];
  locale?: string;
  icons?: Partial<TagGroupIcons>;
}
interface TagGroupChangeDetail { value: string[] }
interface TagGroupRemoveDetail { value: string; item: TagGroupItem }
```

## 33. Vanilla JS example

```ts
import { TagGroup } from '@absoluteui/components/tag-group';
import '@absoluteui/components/tag-group/style.css';

const host = document.querySelector<HTMLElement>('#labels');
if (host) TagGroup.create(host, { label: 'Labels', items: [{ value: 'bug', label: 'Bug' }, { value: 'ui', label: 'UI' }], removable: true });
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import type { TagGroupItem, TagGroupRemoveDetail } from '@absoluteui/components/tag-group';
import { AuiTagGroup } from '@absoluteui/angular/tag-group';

@Component({
  selector: 'app-filters',
  imports: [AuiTagGroup],
  template: `<aui-tag-group label="Applied filters" [items]="filters" [removable]="true" (removed)="remove($event)"></aui-tag-group>`,
})
export class FiltersComponent {
  filters: TagGroupItem[] = [{ value: 'london', label: 'London' }, { value: 'remote', label: 'Remote' }];

  remove({ value }: TagGroupRemoveDetail): void {
    this.filters = this.filters.filter((f) => f.value !== value);
  }
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
