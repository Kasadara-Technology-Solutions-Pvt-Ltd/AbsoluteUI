# Chat

> Package: `@absoluteui/components/chat` | Styles: `@absoluteui/components/button/style.css`, `@absoluteui/components/avatar/style.css`, `@absoluteui/components/prompt-input/style.css`, and `@absoluteui/components/chat/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

A conversation view for an AI assistant or for people. It shows user, assistant, system, and tool messages with avatars and timestamps; day separators read "Today", "Yesterday", a weekday, or a date, and name holidays and non-working days from a business calendar. Assistant replies stream from a host-supplied `AsyncIterable<string>` or `ReadableStream<string>`, with Stop (an `AbortSignal` for the request) and Retry. It has a typing indicator, per-message errors, attachments as file chips, suggestion chips, copy and thumbs up/down actions, and auto-scroll that pauses while the user reads earlier messages, with a "Jump to latest" button. Text renders as plain text or as a safe Markdown subset; model output is never parsed as HTML. The composer is a Prompt Input.

## 2. Anatomy

```text
<div class="aui-chat">
  <div class="aui-chat__viewport">
    <div class="aui-chat__log" role="log" aria-live="off" aria-label="Conversation" tabindex="0">
      <button class="aui-chat__earlier">Show earlier messages (240)</button>             (over maxRenderedMessages)
      <p class="aui-chat__empty">No messages yet.</p>                                  (no messages)
      <div class="aui-chat__messages">
        <div class="aui-chat__day"><span>Today</span></div>
        <article class="aui-chat__message aui-chat__message--assistant" aria-labelledby="m1">
          <div class="aui-chat__avatar">...</div>
          <div class="aui-chat__body">
            <div class="aui-chat__meta" id="m1"><span class="aui-chat__author">Assistant</span> <time>10:42</time></div>
            <div class="aui-chat__content aui-chat__bubble aui-chat__content--markdown">...</div>
            <ul class="aui-chat__attachments"><li><button class="aui-chat__attachment">policy.pdf 80 kB</button></li></ul>
            <div class="aui-chat__error">Something went wrong...</div>                       (status error)
            <div class="aui-chat__actions" role="group" aria-label="Message actions">copy, thumbs up, thumbs down, Retry</div>
          </div>
        </article>
      </div>
      <div class="aui-chat__typing">... Grace is typing</div>                          (typing)
    </div>
    <button class="aui-chat__jump">Jump to latest</button>                              (scrolled up)
  </div>
  <div class="aui-chat__suggestions" role="group" aria-label="Suggestions">buttons</div>
  <div class="aui-chat__composer">Prompt Input</div>
</div>
```

## 3. When to use

- An assistant or copilot panel that streams answers from a language model.
- Support or team conversations between people.
- A read-only transcript (`composer: false`).

## 4. When not to use

- A single question and answer: a form with Prompt Input or Textarea is simpler.
- Notifications or activity feeds: use a list or Toast.
- Threaded comments on records: Chat is linear.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `messages` | `readonly ChatMessage[]` | Messages in order (frozen copies). |
| `streaming` | `boolean` | Whether a reply is streaming. |
| `following` | `boolean` | Whether the log follows new content. |
| `prompt` | `PromptInput \| null` | The composer. |
| `options` | `Readonly<ChatOptions>` | Current options. |

Options (`ChatOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Accessible name of the log. |
| `messages` | `readonly ChatMessage[]` | `[]` | No | `{ id, role, text, format?, timestamp?, author?, attachments?, status?, error?, feedback? }`. |
| `authors` | `Partial<Record<ChatRole, ChatAuthor>>` | You, Assistant, System, Tool | No | `{ name, avatar?, icon? }` per role. |
| `suggestions` | `readonly ChatSuggestion[]` | `[]` | No | `{ id, label, text? }` chips (hidden while streaming). |
| `typing` | `string \| null` | `null` | No | Name of someone typing. |
| `composer` | `boolean` | `true` | No | Show the Prompt Input. |
| `prompt` | `Partial<PromptInputOptions>` | - | No | Composer options (placeholder, attachments, triggers, counter, submit key). |
| `emptyText` | `string` | "No messages yet." | No | Text while empty. |
| `copyable` | `boolean` | `true` | No | Copy actions. |
| `feedback` | `boolean` | `true` | No | Thumbs up and down on finished assistant replies. |
| `businessCalendar` | `BusinessCalendarEngine \| null` | `null` | No | Names holidays and non-working days in day separators. |
| `today` | `PlainDate` | today in `timezone` | No | Reference day for Today and Yesterday. |
| `icons` | `Partial<ChatIcons>` | - | No | Icon overrides. |
| `assistantFormat` | `'markdown' \| 'text'` | `'markdown'` | Yes | Format of assistant and tool messages without `format`. |
| `showTimestamps` | `boolean` | `true` | Yes | Times and day separators. |
| `showAvatars` | `boolean` | `true` | Yes | Avatars. |
| `maxRenderedMessages` | `number` | `200` | Yes | Most messages in the DOM (20..2000). |
| `headingLevel` | `number` | `3` | Yes | Level of a Markdown `#` heading (2..6). |
| `timezone` | `string` | common `timezone` | Yes (inherited) | Zone of times and days. |
| `locale` | `string` | common `locale` | Yes (inherited) | Labels, times, and dates. |

## 6. Methods

| Method | Description |
|---|---|
| `Chat.create(host, options)` | Render into `host` (children are replaced). |
| `addMessage(message)` | Append, or replace the message with the same id; messages from others are announced. |
| `updateMessage(id, patch)` / `removeMessage(id)` / `clear()` | Change the conversation. |
| `stream(source, init?)` | Stream a reply. `source` is an async iterable or a `ReadableStream` of text, or a function that receives the Stop `AbortSignal` and returns one. `init.id` of an existing message restarts it (Retry). Resolves with the final message: `complete`, `stopped`, or `error`. |
| `stop()` | Stop the streaming reply; emits `aui-stop`. |
| `scrollToLatest()` | Scroll down and follow new content again. |
| `focus()` | Focus the composer. |
| `update(options)` | Merge and apply options. |
| `destroy()` | Abort streaming; remove rendering and listeners. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-send` | `{ text, attachments }` | The user sent a message or chose a suggestion. Cancelable: prevent it to keep the text and add no message. |
| `aui-stop` | `{ id }` | A streaming reply was stopped. |
| `aui-retry` | `{ id, prompt }` | Retry on a failed or stopped reply; `prompt` is the user message before it. |
| `aui-feedback` | `{ id, value }` | The user rated a reply (`'up'`, `'down'`, or `null` when withdrawn). |
| `aui-suggestion` | `{ suggestion }` | A suggestion chip was chosen. Cancelable: prevent it to handle it yourself. |
| `aui-attachment-open` | `{ messageId, attachment }` | An attachment chip was activated. |

The composer's own `aui-input` and `aui-attachment-change` events bubble through the host; its `aui-send` and `aui-stop` are replaced by the chat's events above.

## 8. Slots/content areas

`messages[].text`: plain text or the Markdown subset. Supported Markdown: `#` headings, paragraphs (line breaks kept), bullet and numbered lists (nested by indentation), block quotes, horizontal rules, fenced code blocks (shown as text with a copy button), inline code, bold, italic, strikethrough, links, autolinks, and bare http(s) URLs.

## 9. CSS parts/hooks

`aui-chat`, `--streaming`, `--no-avatars`, `aui-chat__viewport`, `__log`, `__earlier`, `__empty`, `__messages`, `__day`, `__message` (`--user`, `--assistant`, `--system`, `--tool`, `--error`, `--streaming`), `__avatar`, `__avatar--icon`, `__body`, `__meta`, `__author`, `__time`, `__bubble`, `__content`, `__content--markdown`, `__bubble--typing`, `__dots`, `__md-heading`, `__md-code`, `__md-link`, `__code`, `__code-head`, `__code-language`, `__code-copy`, `__code-body`, `__attachments`, `__attachment`, `__attachment-name`, `__attachment-size`, `__error`, `__stopped`, `__actions`, `__action`, `__copy`, `__helpful`, `__unhelpful`, `__retry`, `__typing`, `__jump`, `__suggestions`, `__suggestion`, `__composer`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/chat/tokens.json` (verified in CI). Component tokens: `--aui-chat-user-bg` and `--aui-chat-user-fg` (selected roles), `--aui-chat-assistant-bg` and `--aui-chat-assistant-fg` (sunken surface and text), `--aui-chat-code-bg` (surface), `--aui-chat-bubble-radius` (`radius-lg`). Every text pair is in the contrast gate.

## 11. States

Empty; messages; streaming (typing dots, then text); stopped; error with Retry; someone typing; following new content; reading earlier messages (Jump to latest shown); earlier messages collapsed; composer off.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| idle | composer send or suggestion | `aui-send`; a user message unless prevented |
| idle | `stream(source)` | streaming: dots, then text; the composer shows Stop |
| streaming | source ends | complete; the reply is announced |
| streaming | Stop / `stop()` | stopped; `aui-stop`; Retry shown |
| streaming | source throws | error; Retry shown |
| error or stopped | Retry | `aui-retry` (the host calls `stream(source, { id })`) |
| following | the user scrolls up | Jump to latest shown; no auto-scroll |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab | Chat | Show earlier, the log, links and code blocks, attachment chips, message actions, Jump to latest, suggestions, composer. |
| Arrow keys / Page Up / Page Down / Home / End | Log focused | Scroll. |
| Enter / Space | Buttons | Activate. |
| Enter / Shift+Enter | Composer | Send / new line (configurable). |

## 14. ARIA contract

- Log: `role="log"`, `aria-label`, `aria-live="off"` (finished messages are announced through the shared polite live region instead).
- Message: `<article>` named by its author and time (`aria-labelledby`).
- Actions: a group named "Message actions"; thumbs up and down are toggle buttons (`aria-pressed`).
- Attachment chips: buttons named "Open <name>, <size>".
- Jump to latest: `aria-controls` the log.

## 15. Accessibility notes

- While a reply streams, screen readers hear "<name> is typing" once, then the finished reply (first 300 characters), or "Reply stopped" or "Reply failed"; streamed chunks are never announced one by one.
- Auto-scroll stops while the user reads earlier messages, so content never moves under the reader.
- Code blocks scroll horizontally and are focusable.
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

The chat fills the height the host gives it; the log scrolls and the composer stays at the bottom. Bubbles take at most 48rem. Actions are always shown on touch screens.

## 17. RTL behavior

User messages sit on the left; code keeps left-to-right order; Jump to latest stays centered.

## 18. Theme behavior

User and assistant bubbles use component tokens in the contrast gate; links in user bubbles inherit the bubble color and stay underlined. Forced colors outline bubbles; the typing dots stop animating for reduced motion and animation "none".

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { chat: { assistantFormat: 'text', showAvatars: false, maxRenderedMessages: 300 } } });
```

## 20. Component configuration support

Instance options override configuration; configuration changes re-render existing chats.

## 21. Timezone behavior

Times and day separators use `timezone` (common config by default, UTC unless configured), never the machine's zone. Messages carry `Instant` timestamps. With a business calendar, a separator on a holiday reads "25 Dec 2026 (Christmas Day)" and on a weekend "Saturday, Nov 21 (non-working day)".

## 22. Icon customization points

`copy`, `helpful`, `unhelpful` (icon set `copy`, `thumbs-up`, `thumbs-down`), `retry` (`refresh`), `error` (`alert-circle`), `file` (`file`), `jump` (`arrow-down`), `assistant` (icon set `sparkles`), `tool` (`code`). The composer's icons are set through `prompt.icons`.

## 23. Security behavior

Model output is untrusted. Plain text uses `textContent`; Markdown is parsed into a fixed set of elements whose text is set with `textContent`, and raw HTML in the source shows as text. Links render only for http(s) and scheme-less URLs (`isSafeHref`), open in a new tab with `rel="noopener noreferrer nofollow"`, and unsafe links keep only their label. Avatar images follow the Avatar URL policy. Errors thrown by the stream are not shown; a generic or host-supplied message is.

## 24. Data handling behavior

No persistence, network access, or telemetry. Streams are cancelled on Stop and destroy. Copy writes to the clipboard only when the user activates a copy button.

## 25. Performance characteristics

Only changed messages are rebuilt. Streamed text is stored at once and painted at most every 40 ms; Markdown is re-parsed per paint, linear in the reply length. The DOM keeps at most `maxRenderedMessages` messages.

## 26. Supported data scale

10,000 messages in the model with 200 in the DOM; replies up to 200,000 characters as Markdown (longer text renders as plain text).

## 27. Usage examples

```ts
import { Chat, type ChatSendDetail } from '@absoluteui/components/chat';

const host = document.querySelector<HTMLElement>('#assistant');
if (host) {
  const chat = Chat.create(host, { label: 'HR assistant', suggestions: [{ id: 'leave', label: 'How do I request leave?' }] });
  host.addEventListener('aui-send', (event) => {
    const { text } = (event as CustomEvent<ChatSendDetail>).detail;
    void chat.stream(async function* () {
      yield `You asked: ${text}. `;
      yield 'Open **Leave** and choose *Request*.';
    });
  });
}
```

More examples, type-checked in CI: `metadata/chat/examples.json`.

## 28. Edge cases

- Starting a stream while another streams stops the first.
- Removing a streaming message stops it; the stream's promise still resolves.
- Non-string chunks are ignored.
- An unterminated code fence while streaming renders as a code block until it is closed.
- Messages without a timestamp get no time and no day separator.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `CHAT_OPTIONS` | configuration | Blank label; invalid or duplicate messages (id, role, text, format, status, timestamp, author, attachments, feedback); invalid authors, suggestions, typing, businessCalendar, today, composer, copyable, feedback, or prompt; an invalid stream source or init. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact. A failing stream never throws: the message gets status `error`.

## 30. Known limitations

- Not virtualized: the DOM keeps at most `maxRenderedMessages` messages, and "Show earlier messages" adds earlier ones in steps.
- The Markdown subset has no tables, images, task lists, or HTML; code is not highlighted.
- Announcements read the first 300 characters of a reply.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- HTML in messages.
- Threads and message editing (replace messages with `addMessage` or `update`).
- Opening attachments (the host handles `aui-attachment-open`).

## 32. TypeScript definitions

```ts
type ChatRole = 'user' | 'assistant' | 'system' | 'tool';
type ChatMessageStatus = 'complete' | 'streaming' | 'error' | 'stopped';
interface ChatAuthor { name: string; avatar?: string | null; icon?: IconRef | null }
interface ChatAttachment { id: string; name: string; size?: number; type?: string; file?: File }
interface ChatMessage {
  id: string; role: ChatRole; text: string; format?: 'text' | 'markdown'; timestamp?: Instant; author?: ChatAuthor;
  attachments?: readonly ChatAttachment[]; status?: ChatMessageStatus; error?: string; feedback?: 'up' | 'down' | null;
}
interface ChatSuggestion { id: string; label: string; text?: string }
type ChatStreamSource = AsyncIterable<string> | ReadableStream<string>;
interface ChatStreamInit { id?: string; role?: 'assistant' | 'tool'; author?: ChatAuthor; format?: 'text' | 'markdown'; timestamp?: Instant; errorMessage?: string }
interface ChatSendDetail { text: string; attachments: File[] }
interface ChatRetryDetail { id: string; prompt: ChatMessage | null }
interface ChatFeedbackDetail { id: string; value: 'up' | 'down' | null }
```

## 33. Vanilla JS example

```ts
import { Chat } from '@absoluteui/components/chat';
import '@absoluteui/components/button/style.css';
import '@absoluteui/components/avatar/style.css';
import '@absoluteui/components/prompt-input/style.css';
import '@absoluteui/components/chat/style.css';

const host = document.querySelector<HTMLElement>('#transcript');
if (host) Chat.create(host, { label: 'Transcript', composer: false, messages: [{ id: '1', role: 'user', text: 'Hello' }, { id: '2', role: 'assistant', text: 'Hi! How can I help?' }] });
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import type { ChatMessage } from '@absoluteui/components/chat';
import { AuiChat } from '@absoluteui/angular/chat';

@Component({
  selector: 'app-transcript',
  imports: [AuiChat],
  template: `<aui-chat label="Transcript" [messages]="messages" [composer]="false"></aui-chat>`,
})
export class TranscriptComponent {
  readonly messages: ChatMessage[] = [
    { id: '1', role: 'user', text: 'Where is the travel policy?' },
    { id: '2', role: 'assistant', text: 'It is under **Policies > Travel**.' },
  ];
}
```

## 35. React example

```tsx
import { AuiChat } from '@absoluteui/react/chat';

export function Example() {
  return <AuiChat label="Transcript" composer={false} messages={[{ id: '1', role: 'user', text: 'Hello' }]} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiChat } from '@absoluteui/vue/chat';
</script>

<template>
  <AuiChat label="Transcript" :composer="false" :messages="[{ id: '1', role: 'user', text: 'Hello' }]" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
