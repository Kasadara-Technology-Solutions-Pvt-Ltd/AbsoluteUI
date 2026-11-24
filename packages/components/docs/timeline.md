# Timeline

> Package: `@absoluteui/components/timeline` | Styles: `@absoluteui/components/button/style.css`, `@absoluteui/components/avatar/style.css` (item avatars), and `@absoluteui/components/timeline/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

Shows an activity or event history. Each item has a time (an exact `Instant`, or a `PlainDate` for all-day items), a title, an optional description, an icon or avatar, a status tone shown by the marker icon and a status word, and optional action buttons. Timelines are vertical or horizontal, with items on one side or alternating, grouped by day in the configured timezone ("Today", "Yesterday", weekday names, dates; holidays and non-working days named from a business calendar). Times are absolute or relative. Older items collapse behind "Show N older", and a host-supplied `loadMore` fetches more with loading, error, and retry states.

## 2. Anatomy

```text
<div class="aui-timeline aui-timeline--vertical aui-timeline--grouped">
  <div class="aui-timeline__scroller">                      (role="region" tabindex="0" when horizontal)
    <ol class="aui-timeline__list" aria-label="Document activity">
      <li class="aui-timeline__group">
        <h3 class="aui-timeline__day" id="...">Today</h3>
        <ol class="aui-timeline__items" aria-labelledby="...">
          <li class="aui-timeline__item aui-timeline__item--success">
            <span class="aui-timeline__marker" aria-hidden="true"><svg class="aui-icon">...</svg></span>
            <div class="aui-timeline__content">
              <div class="aui-timeline__header">
                <a class="aui-timeline__title" href="/docs/42">Policy approved</a>
                <span class="aui-timeline__status">Success</span>
                <time class="aui-timeline__time" datetime="2026-11-23T14:05:00.000Z" title="Monday, 23 November 2026 at 14:05">14:05</time>
              </div>
              <p class="aui-timeline__description">Approved by Ada Lovelace.</p>
              <div class="aui-timeline__actions" role="group" aria-label="Policy approved"><button class="aui-button">Open</button></div>
            </div>
          </li>
        </ol>
      </li>
    </ol>
  </div>
  <p class="aui-timeline__empty" hidden>No activity yet.</p>
  <div class="aui-timeline__footer">
    <button class="aui-button aui-timeline__toggle" aria-expanded="false" aria-controls="...">Show 12 older</button>
    <button class="aui-button aui-timeline__load">Load older</button>
  </div>
</div>
```

## 3. When to use

- Activity history of a record: document changes, approvals, employee profile events.
- Order or case tracking with a status per event.
- A horizontal milestone overview, such as an onboarding plan.

## 4. When not to use

- Task flows the user moves through step by step: use Stepper.
- Durations and overlaps on a time axis: use Gantt or Scheduler.
- Conversations: use Chat.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `options` | `Readonly<TimelineOptions>` | Current options. |
| `items` | `TimelineItem[]` | Every item in display order, including items added by `loadMore`. |
| `expanded` | `boolean` | Older items are shown. |
| `hasMore` | `boolean` | More items can be loaded. |
| `loading` | `boolean` | `loadMore` is running. |

Options (`TimelineOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Accessible name of the list (and of the scroll region when horizontal). |
| `items` | `readonly TimelineItem[]` | - (required) | No | Items in display order. |
| `order` | `'newest-first' \| 'oldest-first'` | `'newest-first'` | No | Where the older end is (collapse and load happen there). |
| `initialVisible` | `number \| null` | `null` | No | Show this many items; the older rest is behind "Show N older". |
| `loadMore` | `((context) => Promise<readonly TimelineItem[]>) \| null` | `null` | No | Fetch older items; `context` has `signal` and `oldest`. |
| `hasMore` | `boolean` | `true` with `loadMore` | No | More items can be loaded; an empty result sets it to `false`. |
| `businessCalendar` | `BusinessCalendarEngine \| null` | `null` | No | Names holidays and non-working days in day headings. |
| `headingLevel` | `2 \| 3 \| 4 \| 5 \| 6` | `3` | No | Level of day headings. |
| `now` | `Instant` | now | No | Reference for relative times and "Today". |
| `empty` | `string` | "No activity yet." | No | Text when there are no items. |
| `icons` | `Partial<TimelineIcons>` | - | No | Tone markers, "Show older", retry. |
| `orientation` | `'vertical' \| 'horizontal'` | `'vertical'` | Yes | Direction of the line. |
| `layout` | `'start' \| 'alternate'` | `'start'` | Yes | One side, or alternating sides (vertical only). |
| `timeFormat` | `'relative' \| 'absolute'` | `'absolute'` | Yes | "3 hours ago" or a formatted time. |
| `groupByDay` | `boolean` | `true` | Yes | Group consecutive items of a day under a heading. |
| `locale` | `string` | common config | Yes | Locale of dates, numbers, and messages. |
| `timezone` | `string` | common config | Yes | IANA timezone for grouping and formatting instants. |

`TimelineItem`: `{ id, title, time?, description?, tone?, status?, icon?, avatar?, href?, actions? }`, where `tone` is `'neutral' | 'info' | 'success' | 'warning' | 'error'`, `avatar` is `{ name, src? }`, and `actions` are `{ id, label, icon? }`.

## 6. Methods

| Method | Description |
|---|---|
| `Timeline.create(host, options)` | Render into `host` (children are replaced). |
| `update(options)` | Merge and apply options; new `items` replace items added by `loadMore`. |
| `setExpanded(expanded)` | Show or collapse older items (no event). |
| `loadOlder()` | Run `loadMore` as the "Load older" button does; resolves when it settles. |
| `destroy()` | Abort loading and remove rendering, buttons, avatars, and listeners. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-action` | `{ itemId, actionId, item }` | An item action button was activated. |
| `aui-toggle` | `{ expanded }` | "Show older" or "Show fewer" was activated. |
| `aui-load-more` | `{ items, hasMore }` | `loadMore` resolved; the items were appended at the older end. |
| `aui-load-error` | `{ error }` | `loadMore` rejected or returned invalid items; a Retry button is shown. |

## 8. Slots/content areas

None. Items are data; titles and descriptions are text.

## 9. CSS parts/hooks

`aui-timeline`, `aui-timeline--vertical`, `aui-timeline--horizontal`, `aui-timeline--alternate`, `aui-timeline--grouped`, `aui-timeline__scroller`, `aui-timeline__list`, `aui-timeline__group`, `aui-timeline__day`, `aui-timeline__items`, `aui-timeline__item` (with `--neutral`, `--info`, `--success`, `--warning`, `--error`, and `--end` in the alternate layout), `aui-timeline__marker`, `aui-timeline__content`, `aui-timeline__header`, `aui-timeline__title`, `aui-timeline__status`, `aui-timeline__time`, `aui-timeline__description`, `aui-timeline__actions`, `aui-timeline__footer`, `aui-timeline__toggle`, `aui-timeline__load`, `aui-timeline__error`, `aui-timeline__empty`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/timeline/tokens.json` (verified in CI). Component tokens:

- `--aui-timeline-line-color` (`color-border-strong`): the connector line.
- `--aui-timeline-marker-size` (`icon-size-md`): the marker icon size; the marker box adds `space-3`.
- `--aui-timeline-marker-neutral` (`color-text-muted`), `--aui-timeline-marker-info` (`color-info-fg`), `--aui-timeline-marker-success` (`color-success-fg`), `--aui-timeline-marker-warning` (`color-warning-fg`), `--aui-timeline-marker-error` (`color-error-fg`): marker colors per tone, each 3:1 against `color-surface` in the contrast gate.

Action buttons use the Button tokens; avatars the Avatar tokens.

## 11. States

Vertical, horizontal, alternate; grouped or ungrouped; relative or absolute times; older items collapsed or expanded; loading more; load error; no more items; empty; tones neutral, info, success, warning, error.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| collapsed | "Show N older" | expanded; focus on the first shown item; `aui-toggle` |
| expanded | "Show fewer" | collapsed; focus stays on the button; `aui-toggle` |
| idle | "Load older" or `loadOlder()` | loading (button busy, announced) |
| loading | `loadMore` resolves | idle; items appended, focus on the first new item; `aui-load-more` |
| loading | `loadMore` resolves `[]` | no more items; the button is removed |
| loading | `loadMore` rejects | error message and Retry; `aui-load-error` |
| any | `update(options)` | re-rendered; new `items` drop loaded items |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab | Timeline | Item links and action buttons in order, then "Show older" or "Load older". |
| Enter / Space | Action or footer button | Activate (Enter for links). |
| Arrow keys / Home / End | Horizontal scroll region (focused) | Scroll the timeline. |

## 14. ARIA contract

- The list is an `ol` named by `label`; day groups are `li` elements with an `h2` to `h6` heading and a nested `ol` named by the heading.
- Markers are `aria-hidden`; the tone is also a visible status word.
- Times are `<time datetime>` elements with the full date in `title`.
- Action buttons sit in a `role="group"` named by the item title.
- "Show older" has `aria-expanded` and `aria-controls`.
- A horizontal timeline's scroller is `role="region"` with the label and `tabindex="0"`.

## 15. Accessibility notes

- Tone is never color only: each tone has its own marker icon and a status word (override it with `status`, such as "Approved").
- Loading, loaded counts, and "No older items" are announced politely, errors assertively.
- After revealing or loading items, focus moves to the first new item so keyboard users continue reading there.
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

Vertical timelines are fluid and wrap long titles; alternate timelines keep two equal columns; horizontal timelines scroll inside their region with items of 14rem.

## 17. RTL behavior

The line, markers, and alternate sides mirror with the writing direction; horizontal timelines start at the right.

## 18. Theme behavior

Marker colors come from the tone tokens in every theme; text uses `color-text` and `color-text-muted` (contrast gate). Forced colors render markers and the line in `CanvasText` on `Canvas`. There is no animation, so reduced-motion settings need no special case.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { timeline: { timeFormat: 'relative', groupByDay: false } } });
```

## 20. Component configuration support

Instance `orientation`, `layout`, `timeFormat`, `groupByDay`, `locale`, and `timezone` override configuration.

## 21. Timezone behavior

Instants are grouped into days and formatted in the configured timezone (`timezone` option or common configuration). `PlainDate` items are all-day: they never shift between zones and show "All day" when grouped. "Today" is computed from `now` in that zone. With `businessCalendar`, day headings name holidays ("Fri, 25 Dec (Christmas Day)") and non-working days.

## 22. Icon customization points

`icons.neutral`, `icons.info`, `icons.success`, `icons.warning`, `icons.error` (tone markers; defaults circle from the icon set, `info`, `check-circle`, `alert-triangle`, `alert-circle`), `icons.showOlder` (`chevron-down`), and `icons.retry` (`refresh`). Per item, `icon` overrides the tone icon and `avatar` replaces it.

## 23. Security behavior

Titles, descriptions, status words, and action labels are set as text. Item `href` values are limited to http(s) and relative URLs, and avatar `src` values to safe image URLs; anything else throws `TIMELINE_OPTIONS`. Items returned by `loadMore` are validated the same way (an invalid result is reported as a load error).

## 24. Data handling behavior

No persistence, network access, or telemetry. `loadMore` is host code; it receives an `AbortSignal` that aborts when the timeline is destroyed.

## 25. Performance characteristics

Rendering is one pass over the shown items; collapsed older items are not in the DOM. `update()` re-renders the list. The timeline is not virtualized: keep it to a few hundred rendered items with `initialVisible` or `loadMore`.

## 26. Supported data scale

Up to 10,000 items in memory; 1,000 rendered items within the declared budget.

## 27. Usage examples

```ts
import { instant } from '@absoluteui/core';
import { Timeline, type TimelineLoadMoreDetail } from '@absoluteui/components/timeline';

const host = document.querySelector<HTMLElement>('#activity');
if (host) {
  const timeline = Timeline.create(host, {
    label: 'Case history',
    timeFormat: 'relative',
    items: [{ id: 'c1', title: 'Case opened', tone: 'info', time: instant(Date.now() - 3_600_000) }],
    loadMore: async () => [],
  });
  host.addEventListener('aui-load-more', (event) => {
    if (!(event as CustomEvent<TimelineLoadMoreDetail>).detail.hasMore) timeline.update({ empty: 'Nothing older.' });
  });
}
```

More examples, type-checked in CI: `metadata/timeline/examples.json`.

## 28. Edge cases

- Items without `time` group under "No date".
- Items of the same day that are not adjacent form separate groups (the given order wins).
- `layout: 'alternate'` is ignored when `orientation` is `horizontal`.
- With `order: 'oldest-first'`, older items collapse and load at the start of the list.
- A `loadMore` that resolves after `destroy()` is ignored.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `TIMELINE_OPTIONS` | configuration | Blank label, items that are not an array, an item without id or title, a duplicate id, an invalid time, tone, href, avatar, or action, an invalid `initialVisible`, `order`, `headingLevel`, `now`, `businessCalendar`, or a non-function `loadMore`. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |
| `ICON_UNKNOWN` | configuration | An icon that is not registered. |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact. A failing `loadMore` never throws: it shows an error with Retry and emits `aui-load-error`.

## 30. Known limitations

- Not virtualized.
- Relative times are computed at render; call `update({ now })` to refresh them.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Rich text (HTML) in titles or descriptions.
- Durations or overlapping ranges on a time axis: use Gantt.

## 32. TypeScript definitions

```ts
type TimelineTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';
type TimelineOrientation = 'vertical' | 'horizontal';
type TimelineLayout = 'start' | 'alternate';
type TimelineTimeFormat = 'relative' | 'absolute';
type TimelineOrder = 'newest-first' | 'oldest-first';
interface TimelineConfig { orientation: TimelineOrientation; layout: TimelineLayout; timeFormat: TimelineTimeFormat; groupByDay: boolean }
interface TimelineAction { id: string; label: string; icon?: IconRef }
interface TimelineAvatar { name: string; src?: string }
interface TimelineItem {
  id: string;
  title: string;
  time?: Instant | PlainDate;
  description?: string;
  tone?: TimelineTone;
  status?: string;
  icon?: IconRef;
  avatar?: TimelineAvatar;
  href?: string;
  actions?: readonly TimelineAction[];
}
interface TimelineLoadContext { readonly signal: AbortSignal; readonly oldest: TimelineItem | null }
interface TimelineOptions extends Partial<TimelineConfig> {
  label: string;
  items: readonly TimelineItem[];
  order?: TimelineOrder;
  initialVisible?: number | null;
  loadMore?: ((context: TimelineLoadContext) => Promise<readonly TimelineItem[]>) | null;
  hasMore?: boolean;
  businessCalendar?: BusinessCalendarEngine | null;
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  now?: Instant;
  empty?: string;
  locale?: string;
  timezone?: string;
  icons?: Partial<TimelineIcons>;
}
interface TimelineActionDetail { itemId: string; actionId: string; item: TimelineItem }
interface TimelineToggleDetail { expanded: boolean }
interface TimelineLoadMoreDetail { items: TimelineItem[]; hasMore: boolean }
interface TimelineLoadErrorDetail { error: unknown }
```

## 33. Vanilla JS example

```ts
import { plainDate } from '@absoluteui/core';
import { Timeline } from '@absoluteui/components/timeline';
import '@absoluteui/components/button/style.css';
import '@absoluteui/components/avatar/style.css';
import '@absoluteui/components/timeline/style.css';

const host = document.querySelector<HTMLElement>('#milestones');
if (host) {
  Timeline.create(host, {
    label: 'Project milestones',
    orientation: 'horizontal',
    order: 'oldest-first',
    items: [
      { id: 'kickoff', title: 'Kick-off', tone: 'success', time: plainDate(2026, 11, 2) },
      { id: 'beta', title: 'Beta', tone: 'info', time: plainDate(2026, 12, 7) },
    ],
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { instant } from '@absoluteui/core';
import type { TimelineActionDetail, TimelineItem } from '@absoluteui/components/timeline';
import { AuiTimeline } from '@absoluteui/angular/timeline';

@Component({
  selector: 'app-activity',
  imports: [AuiTimeline],
  template: `<aui-timeline label="Activity" [items]="items" timeFormat="relative" (action)="onAction($event)"></aui-timeline>`,
})
export class ActivityComponent {
  items: TimelineItem[] = [{ id: 'a1', title: 'Request approved', tone: 'success', time: instant(Date.now() - 600_000), actions: [{ id: 'open', label: 'Open' }] }];
  last = '';
  onAction(detail: TimelineActionDetail): void {
    this.last = detail.actionId;
  }
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
