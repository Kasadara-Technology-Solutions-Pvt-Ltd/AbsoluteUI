# Discussion

> Package: `@absoluteui/components/discussion` | Styles: `@absoluteui/components/button/style.css`, `@absoluteui/components/avatar/style.css`, `@absoluteui/components/mention-input/style.css`, `@absoluteui/components/toggle-group/style.css`, `@absoluteui/components/empty-state/style.css`, `@absoluteui/components/spinner/style.css`, and `@absoluteui/components/discussion/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

A threaded comments and forum control. People write a comment, reply to any comment at any depth, @mention each other in every box, edit their own comments, and delete them after an inline confirmation. Every comment and reply shows the author, an avatar, and a relative timestamp ("5 minutes ago", "Yesterday") with the absolute date and time on hover and focus. A configurable character count blocks posting over the limit. Indentation stops at `maxIndent` so deep threads stay readable on phones, while the nesting stays semantic. Threads collapse and expand, replies can load lazily, and top-level comments sort oldest or newest first. The host owns persistence through cancelable events.

## 2. Anatomy

```text
<div class="aui-discussion" role="region" aria-labelledby="title">
  <div class="aui-discussion__header">
    <div class="aui-discussion__heading"><h3 class="aui-discussion__title" id="title">Comments</h3><span class="aui-discussion__count">8 comments</span></div>
    <div class="aui-discussion__sort">Toggle Group: Oldest | Newest</div>
  </div>
  <div class="aui-discussion__composer">Mention Input (counter, error) <div class="aui-discussion__composer-actions"><button>Comment</button></div></div>
  <div class="aui-discussion__status">Spinner | error text + Retry</div>                       (status loading / error)
  <div class="aui-discussion__empty">Empty State</div>                                       (no comments)
  <ul class="aui-discussion__thread" role="list">
    <li class="aui-discussion__item" data-depth="0">
      <article class="aui-discussion__comment" tabindex="-1" aria-label="Comment by Grace Hopper, Yesterday">
        <div class="aui-discussion__avatar">Avatar</div>
        <div class="aui-discussion__main">
          <div class="aui-discussion__meta">
            <span class="aui-discussion__author">Grace Hopper</span>
            <span class="aui-discussion__replying">Replying to Ada Lovelace</span>              (depth >= maxIndent)
            <time class="aui-discussion__time" datetime="..." tabindex="0"><span>Yesterday</span><span class="aui-discussion__time-absolute">Friday, 20 November 2026 at 09:30</span></time>
            <span class="aui-discussion__edited">(edited)</span>
          </div>
          <p class="aui-discussion__text">Thanks <span class="aui-discussion__mention">@Ada Lovelace</span>, see <a>https://...</a></p>
          <div class="aui-discussion__actions" role="group" aria-label="Comment actions">Reply, Edit, Delete</div>
        </div>
      </article>
      <div class="aui-discussion__slot">reply box | edit box | delete confirmation</div>
      <button class="aui-discussion__toggle" aria-expanded="true" aria-controls="r1">Hide replies</button>
      <ul class="aui-discussion__replies" id="r1" role="list"> li ... <li class="aui-discussion__extra"><button>Show 7 more replies</button></li></ul>
    </li>
  </ul>
  <button class="aui-discussion__more">Show more comments (40)</button>
</div>
```

## 3. When to use

- Comments on a record: an announcement, a leave request, a document, a ticket.
- Forum or Q&A threads where people reply to replies.
- Review discussions where people mention each other.

## 4. When not to use

- A linear conversation or an assistant: use Chat.
- An activity history without replies: use Timeline.
- A single free-text note: use Textarea or Mention Input.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `comments` | `readonly DiscussionComment[]` | Every comment in the model (frozen copies), including deleted placeholders. |
| `composer` | `MentionInput \| null` | The new-comment box (null when read-only). |
| `options` | `Readonly<DiscussionOptions>` | Current options. |

Options (`DiscussionOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Title and accessible name. |
| `comments` | `readonly DiscussionComment[]` | `[]` | No | `{ id, parentId, author: { id, name, avatar? }, text, mentions?, createdAt, editedAt?, deleted?, replyCount? }`. |
| `currentUser` | `DiscussionAuthor \| null` | `null` | No | The signed-in user; null is read-only. |
| `maxLength` | `number` | - | No | Character limit (1..100000); over it, posting is blocked. |
| `showCounter` | `boolean` | `true` with `maxLength` | No | Counter on every composer; requires `maxLength`. |
| `triggers` | `readonly MentionTrigger[]` | `@` with the people in the discussion | No | Mention triggers and providers. |
| `allowReplies` | `boolean` | `true` | No | Show Reply. |
| `canEdit` / `canDelete` | `(comment) => boolean` | own comments | No | Who may edit or delete (UI only; enforce on the server). |
| `loadReplies` | `(comment, { signal, loaded }) => Promise<DiscussionComment[]>` | - | No | Loads replies when `replyCount` exceeds the loaded ones. |
| `status` | `'ready' \| 'loading' \| 'error'` | `'ready'` | No | Spinner or error with Retry. |
| `errorText` | `string` | "Comments could not be loaded." | No | Error message. |
| `emptyTitle` / `emptyDescription` | `string` | "No comments yet" / "Start the discussion." | No | Empty state. |
| `placeholder` | `string` | "Write a comment. Type @ to mention someone." | No | New-comment placeholder. |
| `rows` | `number` | `3` | No | Rows of each composer (1..20). |
| `businessCalendar` | `BusinessCalendarEngine \| null` | `null` | No | Names holidays and non-working days in absolute dates. |
| `now` | `Instant` | now (refreshed every minute) | No | Reference time of relative timestamps. |
| `icons` | `Partial<DiscussionIcons>` | - | No | Icon overrides. |
| `sort` | `'oldest' \| 'newest'` | `'oldest'` | Yes | Top-level order (replies are oldest first). |
| `maxIndent` | `number` | `4` | Yes | Levels that indent (1..10). |
| `collapseDepth` | `number` | `3` | Yes | Replies of comments at this depth or deeper start collapsed (1..50). |
| `pageSize` | `number` | `20` | Yes | Top-level comments per page (1..500). |
| `repliesPageSize` | `number` | `5` | Yes | Replies per page in a thread (1..200). |
| `showAvatars` | `boolean` | `true` | Yes | Avatars. |
| `headingLevel` | `number` | `3` | Yes | Title heading level (2..6). |
| `composerPosition` | `'top' \| 'bottom'` | `'top'` | Yes | Where the new-comment box sits. |
| `timezone` | `string` | common `timezone` | Yes (inherited) | Zone of timestamps. |
| `locale` | `string` | common `locale` | Yes (inherited) | Labels, numbers, and dates. |

Character count: two options, `maxLength` and `showCounter`, the same pair as Mention Input, Textarea, and Text Input, so the counter and its validation behave like every other field.

## 6. Methods

| Method | Description |
|---|---|
| `Discussion.create(host, options)` | Render into `host` (children are replaced). |
| `addComment(comment)` | Add, or replace the comment with the same id; comments by others are announced. |
| `updateComment(id, patch)` | Merge fields (not `id` or `parentId`). |
| `removeComment(id)` | Remove without an event: a placeholder when it has replies, otherwise removed with deleted ancestors left without replies. |
| `expand(id)` / `collapse(id)` | Show or hide a thread (expanding loads lazy replies). |
| `reply(id)` | Open and focus the reply box of a comment. |
| `focusComment(id)` | Reveal (expand, page in) and focus a comment. |
| `focus()` | Focus the new-comment box. |
| `update(options)` | Merge and apply options. |
| `destroy()` | Abort loads; remove rendering, listeners, timers, and subscriptions. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-post` | `{ comment }` | A top-level comment was posted. Cancelable: prevent it to add nothing and keep the text (then `addComment` and `composer.reset()` when the server answers). |
| `aui-reply` | `{ comment, parent }` | A reply was posted. Cancelable. |
| `aui-edit` | `{ id, text, mentions, previous }` | An edit was saved. Cancelable: prevent it to keep the previous text. |
| `aui-delete` | `{ comment, placeholder }` | A delete was confirmed; `placeholder` is true when replies keep it as "This comment was deleted". Cancelable. |
| `aui-expand` | `{ id, expanded }` | A thread was expanded or collapsed. |
| `aui-sort` | `{ sort }` | The user changed the sort order. |
| `aui-retry` | `{}` | Retry in the error state. |

New comments get a generated id and `createdAt` now; the host may replace them (`addComment` with the server's version, after `removeComment` of the temporary id). The composers' `aui-mention`, `aui-input`, and `aui-change` events (Mention Input) bubble through the host; the sort Toggle Group's `aui-change` is replaced by `aui-sort`.

## 8. Slots/content areas

`comments[].text`: plain text. Line breaks are kept; `mentions` (Mention Input tokens `{ id, label, trigger, start, end }`) render as chips; http(s) URLs become links. Nothing is parsed as HTML.

## 9. CSS parts/hooks

`aui-discussion`, `--no-avatars`, `--composer-bottom`, `__header`, `__heading`, `__title`, `__count`, `__sort`, `__composer`, `__field`, `__composer-actions`, `__post`, `__status`, `__status--error`, `__status-text`, `__retry`, `__empty`, `__more`, `__thread`, `__replies`, `__replies--flat`, `__item`, `__item--deep`, `__comment`, `__comment--deleted`, `__comment--own`, `__avatar`, `__avatar--deleted`, `__main`, `__meta`, `__author`, `__replying`, `__time`, `__time-relative`, `__time-absolute`, `__time--dismissed`, `__edited`, `__text`, `__text--deleted`, `__mention`, `__link`, `__actions`, `__action`, `__action--reply`, `--edit`, `--delete`, `__slot`, `__inline`, `__inline--reply`, `--edit`, `__cancel`, `__submit`, `__confirm`, `__confirm-text`, `__confirm-delete`, `__confirm-cancel`, `__toggle`, `__extra`, `__extra-error`, `__more-replies`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/discussion/tokens.json` (verified in CI). Component tokens: `--aui-discussion-indent` (`space-5`, one reply level), `--aui-discussion-thread-line` (`color-border`, the guide line along replies), `--aui-discussion-mention-bg` and `--aui-discussion-mention-fg` (selected roles, mention chips; in the contrast gate).

## 11. States

Empty; loading; error with Retry; comments; thread collapsed or expanded; replies loading; replies failed with Retry; more replies or comments behind Show more; replying; editing; confirming delete; deleted placeholder; composer invalid (empty or over the limit); read-only.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| composer | Comment / Ctrl+Enter, valid | `aui-post`; the comment is added, the box cleared, unless prevented |
| composer | empty or over the limit | error shown and announced; nothing is posted |
| comment | Reply | reply box under it (focused) |
| reply box | Reply / Ctrl+Enter | `aui-reply`; reply added and focused |
| reply box | Cancel / Escape | closed; the text stays as a draft; focus on Reply |
| own comment | Edit, then Save | `aui-edit`; text replaced, "(edited)" shown |
| own comment | Delete, then Delete | `aui-delete`; placeholder (with replies) or removed |
| thread | Show / Hide replies | expanded (lazy load if needed) / collapsed; `aui-expand` |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Discussion | Sort, the new-comment box and its button, then per comment: timestamp, links, Reply, Edit, Delete, Show or Hide replies, Show more. |
| Page Down / Page Up | A comment or its controls | Next or previous visible comment. |
| Ctrl+Enter / Cmd+Enter | Composer | Post, reply, or save. |
| Escape | Reply or edit box | Cancel (after closing open suggestions first). |
| Escape | Delete confirmation | Cancel. |
| Escape | Focused timestamp | Hide the tooltip. |
| Arrow keys, Enter, Tab, Escape | Mention suggestions | Move, insert, close. |
| Enter / Space | Buttons | Activate. |

## 14. ARIA contract

- Host: `role="region"`, named by the title.
- Thread and replies: nested `<ul role="list">`, one level per reply depth.
- Comment: `<article>` named "Comment by <name>, <time>", "Reply by <name> to <parent>, <time>", or "Deleted comment, <time>".
- Actions: a group "Comment actions"; Reply, Edit, and Delete are named with the author ("Delete comment by Ada Lovelace").
- Thread toggle: `aria-expanded` and `aria-controls` the replies list.
- Delete confirmation: a group named "Delete this comment?".
- Error state: `role="alert"`; loading replies: `role="status"`.

Why lists and not a tree or feed: comments contain buttons, links, and text fields; tree items must not contain interactive content, and nested lists announce the level and count of each reply list natively.

## 15. Accessibility notes

- Polite announcements: "Comment posted", "Reply posted", "Comment updated", "Comment deleted", and comments from others added with `addComment`.
- Empty or over-limit posts show the error under the box and announce it assertively; the counter announces itself near the limit.
- The absolute date is a tooltip on hover and keyboard focus of the timestamp, dismissible with Escape (WCAG 1.4.13).
- Focus: a new reply or saved edit is focused; a top-level post keeps focus in the cleared box; a delete focuses the placeholder, or the next sibling, the comment before, or the parent; Cancel returns focus to the action that opened it; the delete confirmation focuses Cancel.
- The e2e axe run covers three themes and right-to-left; manual screen-reader verification is pending.

## 16. Responsive behavior

Fluid width. Each level indents by `--aui-discussion-indent` (half below 30rem) until `maxIndent`; deeper replies stop indenting and show "Replying to <name>". Header and actions wrap.

## 17. RTL behavior

Logical properties throughout: indentation, the guide line, and the timestamp tooltip mirror; the reply icon mirrors.

## 18. Theme behavior

Mention chips use component tokens in the contrast gate; text, links, and errors use global tokens. Forced colors outline mention chips and keep the guide line visible.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { discussion: { sort: 'newest', maxIndent: 5, collapseDepth: 4, pageSize: 30 } } });
```

## 20. Component configuration support

Instance options override configuration; configuration changes re-render existing discussions.

## 21. Timezone behavior

Comments carry `Instant` timestamps shown in `timezone` (common config by default), never the machine's zone. Relative text: "just now" (under 45 seconds), minutes, hours (today), "Yesterday", a weekday within a week, then a date. The absolute text uses the full date and short time; with a business calendar it reads "Friday, 25 December 2026 at 10:00 (Christmas Day)" or "(non-working day)".

## 22. Icon customization points

`reply` (icon set `reply`), `edit` (icon set `edit`), `delete` (`trash`), `expand` (`chevron-down`), `collapse` (`chevron-up`), `empty` (icon set `message`). Composer icons are Mention Input's.

## 23. Security behavior

Comment text is untrusted: it is rendered as text nodes, mentions as text chips, and only http(s) and scheme-less URLs (`isSafeHref`) become links (`rel="noopener noreferrer nofollow"`, new tab); other URLs stay text. Avatar images follow the Avatar URL policy. `canEdit` and `canDelete` only hide actions: the server must enforce who may edit or delete.

## 24. Data handling behavior

No persistence, network access, or telemetry. The host stores comments through the events and methods. `loadReplies` runs only when a thread is expanded or "Show more replies" is chosen, and is aborted on collapse and destroy.

## 25. Performance characteristics

Only comments whose content changed are rebuilt; relative times refresh in place every minute. Collapsed threads and comments beyond the shown pages are not in the DOM. Reply counts and visibility are cached per model change.

## 26. Supported data scale

50,000 comments in the model. The DOM holds the shown top-level page (20 by default), the first 5 replies of each expanded thread, and nothing below `collapseDepth` until expanded.

## 27. Usage examples

```ts
import { instant } from '@absoluteui/core';
import { Discussion, type DiscussionPostDetail } from '@absoluteui/components/discussion';

const host = document.querySelector<HTMLElement>('#comments');
if (host) {
  Discussion.create(host, {
    label: 'Comments',
    currentUser: { id: 'u1', name: 'Ana' },
    maxLength: 500,
    comments: [{ id: '1', parentId: null, author: { id: 'u2', name: 'Ben' }, text: 'Office closed on Friday.', createdAt: instant(Date.now() - 3_600_000) }],
  });
  host.addEventListener('aui-post', (event) => {
    const { comment } = (event as CustomEvent<DiscussionPostDetail>).detail;
    void fetch('/api/comments', { method: 'POST', body: JSON.stringify(comment) });
  });
}
```

More examples, type-checked in CI: `metadata/discussion/examples.json`.

## 28. Edge cases

- A deleted comment without visible replies is not shown; when its last reply is removed, it disappears too.
- A thread whose replies are all still on the server (`replyCount` without loaded replies) starts collapsed; expanding loads them. A load that adds nothing corrects `replyCount`.
- Opening another reply, edit, or delete panel closes the current one; an unsent reply is kept as a draft for that comment.
- Leading and trailing whitespace is trimmed on post; mention offsets follow.
- Deleting the comment being replied to or edited closes the panel.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `DISCUSSION_OPTIONS` | configuration | Blank label; invalid or duplicate comments (id, parentId, author, text, createdAt, editedAt, deleted, replyCount, mentions that do not match the text); a parentId that is unknown or forms a cycle; invalid currentUser, maxLength, showCounter without maxLength, rows, triggers, hooks, status, strings, businessCalendar, or now. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact. A failing `loadReplies` shows "Replies could not be loaded." with Retry.

## 30. Known limitations

- Not virtualized: the DOM grows as readers page in comments and expand threads.
- Replies are always oldest first; sort applies to top-level comments.
- One reply, edit, or delete panel at a time.
- Each timestamp is a tab stop. Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Rich text, attachments, or reactions.
- Real-time presence and typing indicators (the host can call `addComment` as comments arrive).
- Permission enforcement (server side).

## 32. TypeScript definitions

```ts
interface DiscussionAuthor { id: string; name: string; avatar?: string | null }
interface DiscussionComment {
  id: string; parentId: string | null; author: DiscussionAuthor; text: string; mentions?: readonly MentionToken[];
  createdAt: Instant; editedAt?: Instant | null; deleted?: boolean; replyCount?: number;
}
interface DiscussionLoadContext { readonly signal: AbortSignal; readonly loaded: number }
interface DiscussionPostDetail { comment: DiscussionComment }
interface DiscussionReplyDetail { comment: DiscussionComment; parent: DiscussionComment }
interface DiscussionEditDetail { id: string; text: string; mentions: readonly MentionToken[]; previous: DiscussionComment }
interface DiscussionDeleteDetail { comment: DiscussionComment; placeholder: boolean }
interface DiscussionExpandDetail { id: string; expanded: boolean }
interface DiscussionSortDetail { sort: 'oldest' | 'newest' }
```

## 33. Vanilla JS example

```ts
import { Discussion } from '@absoluteui/components/discussion';
import '@absoluteui/components/button/style.css';
import '@absoluteui/components/avatar/style.css';
import '@absoluteui/components/mention-input/style.css';
import '@absoluteui/components/toggle-group/style.css';
import '@absoluteui/components/empty-state/style.css';
import '@absoluteui/components/spinner/style.css';
import '@absoluteui/components/discussion/style.css';

const host = document.querySelector<HTMLElement>('#comments');
if (host) Discussion.create(host, { label: 'Comments', currentUser: { id: 'u1', name: 'Ana' }, maxLength: 280 });
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { instant } from '@absoluteui/core';
import type { DiscussionComment, DiscussionPostDetail } from '@absoluteui/components/discussion';
import { AuiDiscussion } from '@absoluteui/angular/discussion';

@Component({
  selector: 'app-comments',
  imports: [AuiDiscussion],
  template: `<aui-discussion label="Comments" [currentUser]="me" [comments]="comments" [maxLength]="500" (posted)="save($event)"></aui-discussion>`,
})
export class CommentsComponent {
  readonly me = { id: 'u1', name: 'Ana' };
  readonly comments: DiscussionComment[] = [
    { id: '1', parentId: null, author: { id: 'u2', name: 'Ben' }, text: 'Office closed on Friday.', createdAt: instant(Date.UTC(2026, 10, 20, 9)) },
  ];
  save(detail: DiscussionPostDetail): void {
    console.log(detail.comment.text);
  }
}
```

## 35. React example

```tsx
import { AuiDiscussion } from '@absoluteui/react/discussion';

export function Example() {
  return <AuiDiscussion label="Comments" currentUser={{ id: 'u1', name: 'Ana' }} maxLength={500} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiDiscussion } from '@absoluteui/vue/discussion';
</script>

<template>
  <AuiDiscussion label="Comments" :current-user="{ id: 'u1', name: 'Ana' }" :max-length="500" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
