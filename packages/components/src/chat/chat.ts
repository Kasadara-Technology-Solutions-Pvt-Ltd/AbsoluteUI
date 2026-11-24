/**
 * Chat (R20 P5). A conversation view for an AI assistant or for people: a message log with
 * user, assistant, system, and tool messages, avatars and timestamps (day separators name
 * holidays and non-working days from a business calendar), assistant replies streamed from a
 * host-supplied `AsyncIterable<string>` or `ReadableStream<string>` with Stop and Retry, a
 * typing indicator, per-message errors, attachments as file chips, suggestion chips, copy and
 * feedback actions, and auto-scroll that pauses while the user reads earlier messages.
 *
 * Message text is rendered as plain text or as a safe Markdown subset (`./markdown.ts`): model
 * output is never parsed as HTML. The log is `role="log"`; announcements go through a polite
 * live region once per finished message (never per streamed chunk), so screen readers are not
 * flooded while a reply streams. Long conversations keep at most `maxRenderedMessages` in the
 * DOM, with a button that shows earlier ones.
 */
import {
  configurationError,
  createId,
  defineComponentConfig,
  DisposableGroup,
  emit,
  formatInstant,
  formatNumber,
  formatPlainDate,
  getMessage,
  instant,
  instantToString,
  registerMessages,
  toPlainDateTime,
  validators,
  type Instant,
  type PlainDate,
} from '@absoluteui/core';
import { daysBetween, formatRelativeDate, isPlainDate } from '@absoluteui/helpers/date';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { copyIcon } from '@absoluteui/icons/set/copy';
import { sparklesIcon } from '@absoluteui/icons/set/sparkles';
import { thumbsDownIcon } from '@absoluteui/icons/set/thumbs-down';
import { thumbsUpIcon } from '@absoluteui/icons/set/thumbs-up';
import { announce } from '@absoluteui/utilities';
import { Avatar } from '../avatar/avatar.js';
import type { BusinessCalendarEngine } from '../business-calendar/engine.js';
import { Button } from '../button/button.js';
import { isBusinessCalendar } from '../internal/business-days.js';
import { formatFileSize } from '../internal/files.js';
import { PromptInput, type PromptInputOptions, type PromptInputSendDetail } from '../prompt-input/prompt-input.js';
import { renderMarkdown } from './markdown.js';

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';
export type ChatMessageStatus = 'complete' | 'streaming' | 'error' | 'stopped';
export type ChatFeedback = 'up' | 'down';
export type ChatFormat = 'text' | 'markdown';

export interface ChatConfig {
  /** Format of assistant and tool messages that do not set `format`. */
  assistantFormat: ChatFormat;
  showTimestamps: boolean;
  showAvatars: boolean;
  /** Most messages kept in the DOM; earlier ones are behind "Show earlier messages". */
  maxRenderedMessages: number;
  /** Heading level of a Markdown `#` heading inside messages. */
  headingLevel: number;
}

type Inherited = 'locale' | 'timezone';

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    chat: ChatConfig & { locale: string; timezone: string };
  }
}

export const chatConfig = defineComponentConfig<ChatConfig, Inherited>(
  'chat',
  {
    assistantFormat: { default: 'markdown', expected: '"markdown" | "text"', validate: validators.oneOf(['markdown', 'text'] as const) },
    showTimestamps: { default: true, expected: 'boolean', validate: validators.isBoolean },
    showAvatars: { default: true, expected: 'boolean', validate: validators.isBoolean },
    maxRenderedMessages: { default: 200, expected: 'integer 20..2000', validate: validators.integerInRange(20, 2000) },
    headingLevel: { default: 3, expected: 'integer 2..6', validate: validators.integerInRange(2, 6) },
  },
  ['locale', 'timezone'],
);

registerMessages('chat', 'en', {
  you: 'You',
  assistant: 'Assistant',
  system: 'System',
  tool: 'Tool',
  composer: 'Message',
  placeholder: 'Write a message',
  empty: 'No messages yet.',
  typing: '{name} is typing',
  replied: '{name}: {text}',
  stopped: 'Stopped.',
  stoppedAnnounce: 'Reply stopped.',
  error: 'Something went wrong. The reply could not be completed.',
  errorAnnounce: 'Reply failed: {message}',
  actions: 'Message actions',
  copy: 'Copy message',
  copyCode: 'Copy code',
  copied: 'Copied',
  copyFailed: 'Could not copy',
  helpful: 'Good response',
  unhelpful: 'Bad response',
  retry: 'Retry',
  attachments: 'Attachments',
  openAttachment: 'Open {name}',
  suggestions: 'Suggestions',
  jump: 'Jump to latest',
  newMessages: 'New messages below',
  earlier: 'Show earlier messages ({count})',
  code: 'Code',
  dayHoliday: '{day} ({holiday})',
  dayNonWorking: '{day} (non-working day)',
});

export interface ChatIcons {
  copy: IconRef;
  helpful: IconRef;
  unhelpful: IconRef;
  retry: IconRef;
  error: IconRef;
  file: IconRef;
  jump: IconRef;
  assistant: IconRef;
  tool: IconRef;
}

/** Who wrote a message: shown next to it and used for its accessible name. */
export interface ChatAuthor {
  name: string;
  /** Avatar image (http(s), relative, blob:, or a raster data: URL). */
  avatar?: string | null;
  /** Icon shown instead of initials when there is no image (assistants, tools). */
  icon?: IconRef | null;
}

/** A file shown on a message as a chip; activating it emits `aui-attachment-open`. */
export interface ChatAttachment {
  id: string;
  name: string;
  /** Size in bytes, shown next to the name. */
  size?: number;
  /** MIME type. */
  type?: string;
  /** The file itself, when the attachment came from the composer. */
  file?: File;
}

export interface ChatMessage {
  /** Unique id (stable across updates). */
  id: string;
  role: ChatRole;
  /** Message text: plain text or Markdown (never HTML). */
  text: string;
  /** Default: `assistantFormat` for assistant and tool messages, `text` otherwise. */
  format?: ChatFormat;
  timestamp?: Instant;
  /** Overrides the role's author (`authors`). */
  author?: ChatAuthor;
  attachments?: readonly ChatAttachment[];
  /** Default `complete`. */
  status?: ChatMessageStatus;
  /** Shown with status `error` (text only). */
  error?: string;
  /** The user's rating of an assistant message. */
  feedback?: ChatFeedback | null;
}

/** A suggested prompt shown as a chip; activating it emits `aui-suggestion` and sends its text. */
export interface ChatSuggestion {
  id: string;
  label: string;
  /** Text sent when chosen. Default `label`. */
  text?: string;
}

/** What `stream()` reads: chunks of text, from an async iterable or a stream. */
export type ChatStreamSource = AsyncIterable<string> | ReadableStream<string>;

export interface ChatStreamInit {
  /** Message to stream into: an existing id restarts that message (Retry), a new id or none appends one. */
  id?: string;
  /** Default `assistant`. */
  role?: 'assistant' | 'tool';
  author?: ChatAuthor;
  format?: ChatFormat;
  /** Default: now. */
  timestamp?: Instant;
  /** Text shown when the source fails. Default: a generic message (error details are not shown). */
  errorMessage?: string;
}

export interface ChatOptions extends Partial<ChatConfig> {
  /** Accessible name of the conversation log, such as "Conversation with HR assistant". */
  label: string;
  messages?: readonly ChatMessage[];
  /** Default authors per role (names and avatars). */
  authors?: Partial<Record<ChatRole, ChatAuthor>>;
  /** Suggestion chips above the composer (hidden while a reply streams). */
  suggestions?: readonly ChatSuggestion[];
  /** Name of someone typing (people chats), or null. */
  typing?: string | null;
  /** Show the composer (Prompt Input). Default true. */
  composer?: boolean;
  /** Composer options (placeholder, attachments, triggers, counter, submit key, ...). */
  prompt?: Partial<Omit<PromptInputOptions, 'status' | 'value'>>;
  /** Text shown while there are no messages. */
  emptyText?: string;
  /** Show the copy action on user and assistant messages. Default true. */
  copyable?: boolean;
  /** Show thumbs up and down on finished assistant messages. Default true. */
  feedback?: boolean;
  /** Names holidays and non-working days in the day separators. */
  businessCalendar?: BusinessCalendarEngine | null;
  /** Reference day for "Today" and "Yesterday". Default: today in the time zone. */
  today?: PlainDate;
  timezone?: string;
  locale?: string;
  icons?: Partial<ChatIcons>;
}

/** `aui-send` detail (cancelable: prevent it to keep the text in the composer and add no message). */
export interface ChatSendDetail {
  text: string;
  attachments: File[];
}

/** `aui-stop` detail. */
export interface ChatStopDetail {
  id: string;
}

/** `aui-retry` detail: the failed or stopped message and the user message before it. */
export interface ChatRetryDetail {
  id: string;
  prompt: ChatMessage | null;
}

/** `aui-feedback` detail; `value` null means the rating was withdrawn. */
export interface ChatFeedbackDetail {
  id: string;
  value: ChatFeedback | null;
}

/** `aui-suggestion` detail (cancelable: prevent it to handle the suggestion yourself). */
export interface ChatSuggestionDetail {
  suggestion: ChatSuggestion;
}

/** `aui-attachment-open` detail. */
export interface ChatAttachmentOpenDetail {
  messageId: string;
  attachment: ChatAttachment;
}

const ROLES: readonly ChatRole[] = ['user', 'assistant', 'system', 'tool'];
const STATUSES: readonly ChatMessageStatus[] = ['complete', 'streaming', 'error', 'stopped'];
const MAX_MESSAGES = 100_000;
const MAX_ANNOUNCE = 300;
const PIN_THRESHOLD = 32;
const RENDER_DELAY = 40;

const DEFAULT_ICONS: ChatIcons = {
  copy: copyIcon,
  helpful: thumbsUpIcon,
  unhelpful: thumbsDownIcon,
  retry: 'refresh',
  error: 'alert-circle',
  file: 'file',
  jump: 'arrow-down',
  assistant: sparklesIcon,
  tool: 'code',
};

interface MessageView {
  readonly el: HTMLElement;
  readonly content: HTMLDivElement;
  readonly group: DisposableGroup;
  readonly buttons: Button[];
  avatar: Avatar | null;
  signature: string;
  text: string | null;
}

/** Rejection reason of an aborted read (an Error, so lint and stack traces stay meaningful). */
class StreamAborted extends Error {}
const ABORTED = new StreamAborted('aborted');

/** Listens for a component (`aui-*`) event, removed when `group` is disposed. */
function listenCustom(group: DisposableGroup, target: EventTarget, type: `aui-${string}`, handler: (event: Event) => void): void {
  target.addEventListener(type, handler);
  group.add(() => {
    target.removeEventListener(type, handler);
  });
}

function isReadableStream(source: ChatStreamSource): source is ReadableStream<string> {
  return typeof (source as Partial<ReadableStream<string>>).getReader === 'function';
}

/** Reads every chunk of `source` until it ends or `signal` aborts (an abort rejects with ABORTED). */
async function consume(source: ChatStreamSource, signal: AbortSignal, onChunk: (chunk: unknown) => void): Promise<void> {
  let rejectAbort: (reason: unknown) => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  aborted.catch(() => undefined);
  const onAbort = (): void => {
    rejectAbort(ABORTED);
  };
  if (signal.aborted) throw ABORTED;
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    if (isReadableStream(source)) {
      const reader = source.getReader();
      try {
        for (;;) {
          const result = await Promise.race([reader.read(), aborted]);
          if (result.done) return;
          onChunk(result.value);
        }
      } finally {
        // Cancelling tells the producer (for example a fetch body) to stop; errors on cancel are irrelevant here.
        reader.cancel().catch(() => undefined);
      }
    } else {
      const iterator = source[Symbol.asyncIterator]();
      let done = false;
      try {
        for (;;) {
          const result = await Promise.race([iterator.next(), aborted]);
          if (result.done === true) {
            done = true;
            return;
          }
          onChunk(result.value);
        }
      } finally {
        if (!done) {
          // Lets an async generator run its own cleanup (finally blocks, closing a connection).
          Promise.resolve(iterator.return?.()).catch(() => undefined);
        }
      }
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

export class Chat {
  readonly host: HTMLElement;
  #options: ChatOptions;
  #messages: ChatMessage[];
  readonly #doc: Document;
  readonly #group = new DisposableGroup();
  readonly #log: HTMLDivElement;
  readonly #earlier: Button;
  readonly #list: HTMLDivElement;
  readonly #typing: HTMLDivElement;
  readonly #empty: HTMLParagraphElement;
  readonly #jump: Button;
  readonly #suggestionsEl: HTMLDivElement;
  readonly #composerHost: HTMLDivElement;
  #prompt: PromptInput | null = null;
  #views = new Map<string, MessageView>();
  #suggestionButtons: Button[] = [];
  #suggestionGroup = new DisposableGroup();
  #builtSuggestions: readonly ChatSuggestion[] | null = null;
  #limit = 0;
  #pinned = true;
  #active: { id: string; controller: AbortController } | null = null;
  #pending = new Set<string>();
  #renderTimer: ReturnType<typeof setTimeout> | undefined;

  /** Render into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: ChatOptions): Chat {
    return new Chat(host, options);
  }

  private constructor(host: HTMLElement, options: ChatOptions) {
    Chat.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#messages = (options.messages ?? []).map((m) => Object.freeze({ ...m }));
    const doc = this.#doc;

    this.#log = doc.createElement('div');
    this.#log.className = 'aui-chat__log';
    this.#log.id = createId('aui-chat-log');
    this.#log.setAttribute('role', 'log');
    // Content changes stream in token by token; the component announces finished messages itself.
    this.#log.setAttribute('aria-live', 'off');
    // A scroll region keyboard users can reach (WCAG 2.1.1).
    this.#log.tabIndex = 0;
    const earlierEl = doc.createElement('button');
    earlierEl.type = 'button';
    earlierEl.className = 'aui-chat__earlier';
    this.#earlier = Button.enhance(earlierEl, { variant: 'ghost', size: 'sm' });
    this.#list = doc.createElement('div');
    this.#list.className = 'aui-chat__messages';
    this.#typing = doc.createElement('div');
    this.#typing.className = 'aui-chat__typing';
    this.#empty = doc.createElement('p');
    this.#empty.className = 'aui-chat__empty';
    this.#log.append(earlierEl, this.#empty, this.#list, this.#typing);
    const jumpEl = doc.createElement('button');
    jumpEl.type = 'button';
    jumpEl.className = 'aui-chat__jump';
    jumpEl.setAttribute('aria-controls', this.#log.id);
    // Text first: the label is replaced by the localized one in #renderJump (an icon-only button needs a name).
    jumpEl.textContent = 'Jump to latest';
    this.#jump = Button.enhance(jumpEl, { variant: 'secondary', size: 'sm', icon: DEFAULT_ICONS.jump });
    this.#suggestionsEl = doc.createElement('div');
    this.#suggestionsEl.className = 'aui-chat__suggestions';
    this.#suggestionsEl.setAttribute('role', 'group');
    this.#composerHost = doc.createElement('div');
    this.#composerHost.className = 'aui-chat__composer';

    try {
      // Render first: invalid options (config, messages, icons) throw before the host is touched.
      this.#limit = this.#config().maxRenderedMessages;
      this.#render();
    } catch (error) {
      this.#disposeViews();
      this.#earlier.destroy();
      this.#jump.destroy();
      throw error;
    }
    host.classList.add('aui-chat');
    const viewport = this.#doc.createElement('div');
    viewport.className = 'aui-chat__viewport';
    viewport.append(this.#log, jumpEl);
    host.replaceChildren(viewport, this.#suggestionsEl, this.#composerHost);
    this.#syncComposer();
    this.#bindEvents();
    this.#group.add(chatConfig.subscribe(() => {
      this.#render();
    }));
    this.#scrollToEnd();
  }

  get options(): Readonly<ChatOptions> {
    return this.#options;
  }

  /** The messages, in order (frozen copies). */
  get messages(): readonly ChatMessage[] {
    return [...this.#messages];
  }

  /** Whether a reply is streaming now. */
  get streaming(): boolean {
    return this.#active !== null;
  }

  /** The composer, or null when `composer` is false. */
  get prompt(): PromptInput | null {
    return this.#prompt;
  }

  /** Whether the log follows new content (the user has not scrolled up). */
  get following(): boolean {
    return this.#pinned;
  }

  /** Append a message, or replace the message with the same id. */
  addMessage(message: ChatMessage): void {
    Chat.#assertMessage(message, 'message');
    const frozen = Object.freeze({ ...message });
    const index = this.#messages.findIndex((m) => m.id === message.id);
    if (index === -1) {
      if (this.#messages.length >= MAX_MESSAGES) throw Chat.#error('messages', `at most ${String(MAX_MESSAGES)} messages`);
      this.#messages = [...this.#messages, frozen];
    } else this.#messages = this.#messages.map((m, i) => (i === index ? frozen : m));
    this.#render();
    if (index === -1 && message.role !== 'user' && (message.status ?? 'complete') === 'complete') this.#announceMessage(frozen);
  }

  /** Merge fields into a message (no-op for an unknown id). */
  updateMessage(id: string, patch: Partial<Omit<ChatMessage, 'id'>>): void {
    const current = this.#messages.find((m) => m.id === id);
    if (!current) return;
    const next = { ...current, ...patch, id };
    Chat.#assertMessage(next, 'message');
    this.#messages = this.#messages.map((m) => (m.id === id ? Object.freeze(next) : m));
    this.#render();
  }

  removeMessage(id: string): void {
    if (this.#active?.id === id) this.stop();
    const before = this.#messages.length;
    this.#messages = this.#messages.filter((m) => m.id !== id);
    if (this.#messages.length !== before) this.#render();
  }

  /** Remove every message (and stop a streaming reply). */
  clear(): void {
    this.stop();
    this.#messages = [];
    this.#render();
  }

  /**
   * Stream a reply into a message. `source` is an async iterable or a stream of text chunks, or a
   * function that receives an AbortSignal (aborted by Stop) and returns one, so the request that
   * produces the text can be cancelled too. Resolves with the final message: `complete`, `stopped`,
   * or `error` (the promise does not reject). Starting a new stream stops the current one.
   */
  async stream(source: ChatStreamSource | ((signal: AbortSignal) => ChatStreamSource), init: ChatStreamInit = {}): Promise<ChatMessage> {
    if (typeof source !== 'function' && (typeof source !== 'object' || (!isReadableStream(source) && typeof (source as Partial<AsyncIterable<string>>)[Symbol.asyncIterator] !== 'function'))) {
      throw Chat.#error('stream', 'AsyncIterable<string> | ReadableStream<string> | ((signal: AbortSignal) => one of them)');
    }
    if (init.id !== undefined && (typeof init.id !== 'string' || init.id === '')) throw Chat.#error('stream.id', 'non-empty string');
    const role: unknown = init.role;
    if (role !== undefined && role !== 'assistant' && role !== 'tool') throw Chat.#error('stream.role', '"assistant" | "tool"');
    if (this.#active) this.stop();
    const controller = new AbortController();
    const id = init.id ?? createId('aui-chat-message');
    const existing = this.#messages.find((m) => m.id === id);
    const start: ChatMessage = {
      id,
      role: init.role ?? (existing?.role === 'tool' ? 'tool' : 'assistant'),
      text: '',
      status: 'streaming',
      timestamp: init.timestamp ?? existing?.timestamp ?? instant(Date.now()),
      ...(init.author ? { author: init.author } : existing?.author ? { author: existing.author } : {}),
      ...(init.format ? { format: init.format } : existing?.format ? { format: existing.format } : {}),
    };
    this.#active = { id, controller };
    this.#pinned = true;
    if (existing) this.#messages = this.#messages.map((m) => (m.id === id ? Object.freeze(start) : m));
    else this.#messages = [...this.#messages, Object.freeze(start)];
    this.#render();
    this.#syncComposer();
    const name = this.#author(start).name;
    announce(this.#m('typing', { name }), 'polite', this.#doc);

    let text = '';
    let status: ChatMessageStatus = 'complete';
    let errorText: string | undefined;
    try {
      const resolved = typeof source === 'function' ? source(controller.signal) : source;
      await consume(resolved, controller.signal, (chunk) => {
        if (typeof chunk !== 'string' || chunk === '') return;
        text += chunk;
        this.#setText(id, text);
      });
      if (controller.signal.aborted) status = 'stopped';
    } catch (error) {
      if (error === ABORTED || controller.signal.aborted) status = 'stopped';
      else {
        status = 'error';
        errorText = init.errorMessage ?? this.#m('error');
      }
    }
    // A newer stream may have replaced this one; `stop()` from another call may have cleared it.
    if ((this.#active as { controller: AbortController } | null)?.controller === controller) this.#active = null;
    const final: ChatMessage = { ...start, text, status, ...(errorText === undefined ? {} : { error: errorText }) };
    if (this.#group.disposed) return Object.freeze(final);
    // The message may have been removed while streaming.
    if (this.#messages.some((m) => m.id === id)) {
      this.#messages = this.#messages.map((m) => (m.id === id ? Object.freeze(final) : m));
      this.#pending.delete(id);
      this.#render();
    }
    this.#syncComposer();
    if (status === 'complete') this.#announceMessage(final);
    else if (status === 'stopped') announce(this.#m('stoppedAnnounce'), 'polite', this.#doc);
    else announce(this.#m('errorAnnounce', { message: errorText ?? '' }), 'polite', this.#doc);
    return Object.freeze(final);
  }

  /** Stop the streaming reply (it keeps the text received so far, with status `stopped`). */
  stop(): void {
    const active = this.#active;
    if (!active) return;
    active.controller.abort();
    emit(this.host, 'aui-stop', { id: active.id } satisfies ChatStopDetail);
  }

  /** Scroll to the newest message and follow new content again. */
  scrollToLatest(): void {
    this.#pinned = true;
    this.#scrollToEnd();
    this.#renderJump();
  }

  /** Move focus to the composer (or the log without one). */
  focus(): void {
    if (this.#prompt) this.#prompt.focus();
    else this.#log.focus();
  }

  update(options: Partial<ChatOptions>): void {
    const next = { ...this.#options, ...options };
    Chat.#assert(next);
    const previous = { options: this.#options, messages: this.#messages };
    this.#options = next;
    if (options.messages !== undefined) {
      if (this.#active && !options.messages.some((m) => m.id === this.#active?.id)) this.stop();
      this.#messages = options.messages.map((m) => Object.freeze({ ...m }));
    }
    if (options.maxRenderedMessages !== undefined) this.#limit = Math.max(this.#limit, options.maxRenderedMessages);
    try {
      this.#render();
    } catch (error) {
      this.#options = previous.options;
      this.#messages = previous.messages;
      this.#render();
      throw error;
    }
    this.#syncComposer();
  }

  destroy(): void {
    this.#active?.controller.abort();
    this.#active = null;
    clearTimeout(this.#renderTimer);
    this.#group.dispose();
    this.#disposeViews();
    for (const b of this.#suggestionButtons) b.destroy();
    this.#suggestionGroup.dispose();
    this.#prompt?.destroy();
    this.#prompt = null;
    this.#earlier.destroy();
    this.#jump.destroy();
    this.host.replaceChildren();
    this.host.classList.remove('aui-chat', 'aui-chat--streaming', 'aui-chat--no-avatars');
  }

  static #error(property: string, expected: string): Error {
    return configurationError('CHAT_OPTIONS', 'Invalid chat options.', { component: 'chat', property: `chat.${property}`, expected });
  }

  static #assertAuthor(value: unknown, property: string): void {
    if (!validators.isRecord(value) || typeof value.name !== 'string' || value.name.trim() === '') throw Chat.#error(property, '{ name: non-empty string; avatar?; icon? }');
    const avatar = value.avatar;
    if (avatar != null && typeof avatar !== 'string') throw Chat.#error(`${property}.avatar`, 'string or null');
  }

  static #assertMessage(m: ChatMessage, property: string): void {
    const value: unknown = m;
    if (!validators.isRecord(value)) throw Chat.#error(property, 'ChatMessage object');
    if (typeof m.id !== 'string' || m.id === '') throw Chat.#error(`${property}.id`, 'non-empty string');
    if (!ROLES.includes(m.role)) throw Chat.#error(`${property}.role`, '"user" | "assistant" | "system" | "tool"');
    if (typeof m.text !== 'string') throw Chat.#error(`${property}.text`, 'string');
    const format: unknown = m.format;
    if (format !== undefined && format !== 'text' && format !== 'markdown') throw Chat.#error(`${property}.format`, '"text" | "markdown"');
    if (m.status !== undefined && !STATUSES.includes(m.status)) throw Chat.#error(`${property}.status`, '"complete" | "streaming" | "error" | "stopped"');
    const ts: unknown = m.timestamp;
    if (ts !== undefined && (!validators.isRecord(ts) || ts.kind !== 'Instant' || typeof ts.epochMilliseconds !== 'number')) throw Chat.#error(`${property}.timestamp`, 'Instant');
    if (m.author !== undefined) Chat.#assertAuthor(m.author, `${property}.author`);
    if (m.error !== undefined && typeof m.error !== 'string') throw Chat.#error(`${property}.error`, 'string');
    const feedback: unknown = m.feedback;
    if (feedback != null && feedback !== 'up' && feedback !== 'down') throw Chat.#error(`${property}.feedback`, '"up" | "down" | null');
    const attachments: unknown = m.attachments;
    if (attachments !== undefined) {
      if (!Array.isArray(attachments)) throw Chat.#error(`${property}.attachments`, 'ChatAttachment[]');
      for (const a of attachments as unknown[]) {
        if (!validators.isRecord(a) || typeof a.id !== 'string' || typeof a.name !== 'string' || a.name === '') throw Chat.#error(`${property}.attachments`, '{ id, name, size?, type?, file? }');
        if (a.size !== undefined && (typeof a.size !== 'number' || !Number.isFinite(a.size) || a.size < 0)) throw Chat.#error(`${property}.attachments.size`, 'bytes >= 0');
      }
    }
  }

  static #assert(options: ChatOptions): void {
    const label: unknown = options.label;
    if (typeof label !== 'string' || label.trim() === '') throw Chat.#error('label', 'non-empty string');
    const messages: unknown = options.messages;
    if (messages !== undefined) {
      if (!Array.isArray(messages) || messages.length > MAX_MESSAGES) throw Chat.#error('messages', `ChatMessage[] (at most ${String(MAX_MESSAGES)})`);
      const ids = new Set<string>();
      for (const [i, m] of (options.messages ?? []).entries()) {
        Chat.#assertMessage(m, `messages[${String(i)}]`);
        if (ids.has(m.id)) throw Chat.#error(`messages[${String(i)}].id`, 'unique id');
        ids.add(m.id);
      }
    }
    const authors: unknown = options.authors;
    if (authors !== undefined) {
      if (!validators.isRecord(authors)) throw Chat.#error('authors', 'Partial<Record<ChatRole, ChatAuthor>>');
      for (const [role, author] of Object.entries(authors)) {
        if (!ROLES.includes(role as ChatRole)) throw Chat.#error(`authors.${role}`, 'a ChatRole key');
        if (author !== undefined) Chat.#assertAuthor(author, `authors.${role}`);
      }
    }
    const suggestions: unknown = options.suggestions;
    if (suggestions !== undefined) {
      if (!Array.isArray(suggestions) || suggestions.length > 20) throw Chat.#error('suggestions', 'up to 20 { id, label, text? }');
      for (const s of suggestions as unknown[]) {
        if (!validators.isRecord(s) || typeof s.id !== 'string' || typeof s.label !== 'string' || s.label.trim() === '') throw Chat.#error('suggestions', '{ id: string; label: non-empty string; text?: string }');
        if (s.text !== undefined && typeof s.text !== 'string') throw Chat.#error('suggestions.text', 'string');
      }
    }
    const typing: unknown = options.typing;
    if (typing != null && (typeof typing !== 'string' || typing.trim() === '')) throw Chat.#error('typing', 'non-empty string or null');
    if (options.businessCalendar != null && !isBusinessCalendar(options.businessCalendar)) throw Chat.#error('businessCalendar', 'BusinessCalendarEngine (createBusinessCalendar) or null');
    if (options.today !== undefined && !isPlainDate(options.today)) throw Chat.#error('today', 'PlainDate');
    for (const key of ['composer', 'copyable', 'feedback'] as const) {
      const v: unknown = options[key];
      if (v !== undefined && typeof v !== 'boolean') throw Chat.#error(key, 'boolean');
    }
    const prompt: unknown = options.prompt;
    if (prompt !== undefined && !validators.isRecord(prompt)) throw Chat.#error('prompt', 'Partial<PromptInputOptions>');
  }

  #config(): Readonly<ChatConfig & { locale: string; timezone: string }> {
    const o = this.#options;
    return chatConfig.resolve({
      ...(o.assistantFormat === undefined ? {} : { assistantFormat: o.assistantFormat }),
      ...(o.showTimestamps === undefined ? {} : { showTimestamps: o.showTimestamps }),
      ...(o.showAvatars === undefined ? {} : { showAvatars: o.showAvatars }),
      ...(o.maxRenderedMessages === undefined ? {} : { maxRenderedMessages: o.maxRenderedMessages }),
      ...(o.headingLevel === undefined ? {} : { headingLevel: o.headingLevel }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.timezone === undefined ? {} : { timezone: o.timezone }),
    });
  }

  #m(id: string, params: Record<string, string> = {}): string {
    return getMessage('chat', id, params, this.#config().locale);
  }

  #icons(): ChatIcons {
    return { ...DEFAULT_ICONS, ...this.#options.icons };
  }

  #author(message: ChatMessage): ChatAuthor {
    if (message.author) return message.author;
    const configured = this.#options.authors?.[message.role];
    if (configured) return configured;
    const icons = this.#icons();
    const name = this.#m(message.role === 'user' ? 'you' : message.role);
    if (message.role === 'assistant') return { name, icon: icons.assistant };
    if (message.role === 'tool') return { name, icon: icons.tool };
    return { name };
  }

  #format(message: ChatMessage): ChatFormat {
    if (message.format) return message.format;
    return message.role === 'assistant' || message.role === 'tool' ? this.#config().assistantFormat : 'text';
  }

  #bindEvents(): void {
    const g = this.#group;
    g.listen(this.#log, 'scroll', () => {
      const log = this.#log;
      const pinned = log.scrollHeight - log.scrollTop - log.clientHeight <= PIN_THRESHOLD;
      if (pinned === this.#pinned) return;
      this.#pinned = pinned;
      this.#renderJump();
    });
    g.listen(this.#jump.element, 'click', () => {
      this.scrollToLatest();
      // Focus follows the reader to the newest message.
      const last = this.#list.lastElementChild;
      if (last instanceof HTMLElement) last.focus({ preventScroll: true });
    });
    g.listen(this.#earlier.element, 'click', () => {
      const log = this.#log;
      const fromEnd = log.scrollHeight - log.scrollTop;
      this.#limit += this.#config().maxRenderedMessages;
      this.#render();
      log.scrollTop = log.scrollHeight - fromEnd;
      if (this.#earlier.element.hidden) this.#log.focus();
    });
  }

  /** Creates or updates the composer to match the options and the streaming state. */
  #syncComposer(): void {
    const o = this.#options;
    if (o.composer === false) {
      this.#prompt?.destroy();
      this.#prompt = null;
      this.#composerHost.hidden = true;
      return;
    }
    this.#composerHost.hidden = false;
    const status = this.#active ? 'streaming' : 'idle';
    const promptOptions: PromptInputOptions = {
      label: this.#m('composer'),
      hideLabel: true,
      placeholder: this.#m('placeholder'),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...o.prompt,
      status,
    };
    if (this.#prompt) {
      this.#prompt.update(promptOptions);
      return;
    }
    this.#prompt = PromptInput.create(this.#composerHost, promptOptions);
    const composer = this.#composerHost;
    listenCustom(this.#group, composer, 'aui-send', (event) => {
      // The composer's event is replaced by the chat's own, so listeners on the chat see one aui-send.
      event.stopPropagation();
      const detail = (event as CustomEvent<PromptInputSendDetail>).detail;
      if (!this.#submit(detail.text, detail.attachments)) event.preventDefault();
    });
    listenCustom(this.#group, composer, 'aui-stop', (event) => {
      event.stopPropagation();
      this.stop();
    });
  }

  /** Sends text as the user: cancelable `aui-send`, then a user message. Returns false when prevented. */
  #submit(text: string, files: readonly File[]): boolean {
    const proceed = emit(this.host, 'aui-send', { text, attachments: [...files] } satisfies ChatSendDetail, { cancelable: true });
    if (!proceed) return false;
    const message: ChatMessage = {
      id: createId('aui-chat-message'),
      role: 'user',
      text,
      timestamp: instant(Date.now()),
      ...(files.length === 0 ? {} : { attachments: files.map((file) => ({ id: createId('aui-chat-file'), name: file.name, size: file.size, type: file.type, file })) }),
    };
    this.#messages = [...this.#messages, Object.freeze(message)];
    this.#pinned = true;
    this.#render();
    return true;
  }

  #announceMessage(message: ChatMessage): void {
    const text = message.text.trim();
    if (text === '') return;
    const short = Array.from(text).length > MAX_ANNOUNCE ? `${Array.from(text).slice(0, MAX_ANNOUNCE).join('')}\u2026` : text;
    announce(this.#m('replied', { name: this.#author(message).name, text: short }), 'polite', this.#doc);
  }

  /** Streaming text: stored now, painted at most every RENDER_DELAY ms. */
  #setText(id: string, text: string): void {
    this.#messages = this.#messages.map((m) => (m.id === id ? Object.freeze({ ...m, text }) : m));
    this.#pending.add(id);
    if (this.#renderTimer !== undefined) return;
    this.#renderTimer = setTimeout(() => {
      this.#renderTimer = undefined;
      if (this.#group.disposed) return;
      const config = this.#config();
      for (const pendingId of this.#pending) {
        const message = this.#messages.find((m) => m.id === pendingId);
        const view = this.#views.get(pendingId);
        if (message && view) this.#renderContent(view, message, config.headingLevel);
      }
      this.#pending.clear();
      this.#afterContentChange();
    }, RENDER_DELAY);
  }

  #afterContentChange(): void {
    if (this.#pinned) this.#scrollToEnd();
    this.#renderJump();
  }

  #scrollToEnd(): void {
    const log = this.#log;
    log.scrollTop = log.scrollHeight;
  }

  #renderJump(): void {
    const label = this.#m('jump');
    const el = this.#jump.element;
    el.textContent = label;
    this.#jump.update({ icon: this.#icons().jump });
    // Shown only while the user reads earlier messages; it never covers the composer.
    el.hidden = this.#pinned || this.#messages.length === 0;
  }

  #disposeViews(): void {
    for (const view of this.#views.values()) this.#disposeView(view);
    this.#views.clear();
  }

  #disposeView(view: MessageView): void {
    view.group.dispose();
    for (const b of view.buttons) b.destroy();
    view.avatar?.destroy();
  }

  #dayLabel(date: PlainDate, today: PlainDate, locale: string): string {
    const days = daysBetween(today, date);
    let label: string;
    if (days === 0 || days === -1) {
      const relative = formatRelativeDate(date, today, { locale });
      label = relative.charAt(0).toLocaleUpperCase(locale) + relative.slice(1);
    } else if (days < 0 && days > -7) label = formatPlainDate(date, { weekday: 'long', month: 'short', day: 'numeric' }, locale);
    else label = formatPlainDate(date, { dateStyle: 'medium' }, locale);
    const calendar = this.#options.businessCalendar;
    if (!calendar) return label;
    const info = calendar.day(date);
    if (info.holiday) return this.#m('dayHoliday', { day: label, holiday: info.holiday });
    if (!info.working) return this.#m('dayNonWorking', { day: label });
    return label;
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const icons = this.#icons();
    const locale = config.locale;
    const zone = config.timezone;
    // Messages are resolved before the DOM changes, so an invalid locale or icon throws first.
    const m = (id: string, params: Record<string, string> = {}): string => getMessage('chat', id, params, locale);
    const labels = { actions: m('actions'), empty: o.emptyText ?? m('empty'), suggestions: m('suggestions') };

    this.#log.setAttribute('aria-label', o.label);
    this.host.classList.toggle('aui-chat--no-avatars', !config.showAvatars);
    this.host.classList.toggle('aui-chat--streaming', this.#active !== null);
    this.#empty.textContent = labels.empty;
    this.#empty.hidden = this.#messages.length > 0;

    const total = this.#messages.length;
    const first = Math.max(0, total - Math.max(this.#limit, config.maxRenderedMessages));
    const visible = this.#messages.slice(first);
    this.#earlier.element.hidden = first === 0;
    this.#earlier.element.textContent = m('earlier', { count: formatNumber(first, {}, locale) });
    this.#earlier.update({});

    const today = o.today ?? toPlainDateTime(instant(Date.now()), zone).date;
    const keep = new Set(visible.map((msg) => msg.id));
    for (const [id, view] of this.#views) {
      if (!keep.has(id)) {
        this.#disposeView(view);
        this.#views.delete(id);
      }
    }
    const nodes: Node[] = [];
    let lastDay = '';
    for (const message of visible) {
      if (config.showTimestamps && message.timestamp) {
        const date = toPlainDateTime(message.timestamp, zone).date;
        const key = `${String(date.year)}-${String(date.month)}-${String(date.day)}`;
        if (key !== lastDay) {
          lastDay = key;
          const sep = this.#doc.createElement('div');
          sep.className = 'aui-chat__day';
          const text = this.#doc.createElement('span');
          text.textContent = this.#dayLabel(date, today, locale);
          sep.append(text);
          nodes.push(sep);
        }
      }
      nodes.push(this.#renderMessage(message, config, icons, labels.actions));
    }
    this.#list.replaceChildren(...nodes);

    const typing = o.typing ?? null;
    this.#typing.hidden = typing === null;
    if (typing !== null) {
      const dots = this.#dots();
      const text = this.#doc.createElement('span');
      text.textContent = m('typing', { name: typing });
      this.#typing.replaceChildren(dots, text);
    } else this.#typing.replaceChildren();

    this.#renderSuggestions(labels.suggestions);
    this.#afterContentChange();
  }

  #renderSuggestions(label: string): void {
    const list = this.#options.suggestions ?? [];
    this.#suggestionsEl.setAttribute('aria-label', label);
    this.#suggestionsEl.hidden = list.length === 0 || this.#active !== null;
    if (this.#builtSuggestions === list) return;
    for (const b of this.#suggestionButtons) b.destroy();
    this.#suggestionGroup.dispose();
    this.#suggestionGroup = new DisposableGroup();
    this.#suggestionButtons = list.map((suggestion) => {
      const el = this.#doc.createElement('button');
      el.type = 'button';
      el.className = 'aui-chat__suggestion';
      el.textContent = suggestion.label;
      this.#suggestionGroup.listen(el, 'click', () => {
        this.#chooseSuggestion(suggestion);
      });
      return Button.enhance(el, { variant: 'outline', size: 'sm' });
    });
    this.#suggestionsEl.replaceChildren(...this.#suggestionButtons.map((b) => b.element));
    this.#builtSuggestions = list;
  }

  #chooseSuggestion(suggestion: ChatSuggestion): void {
    if (this.#active) return;
    const proceed = emit(this.host, 'aui-suggestion', { suggestion } satisfies ChatSuggestionDetail, { cancelable: true });
    if (!proceed) return;
    if (this.#submit(suggestion.text ?? suggestion.label, [])) this.#prompt?.focus();
  }

  #dots(): HTMLSpanElement {
    const dots = this.#doc.createElement('span');
    dots.className = 'aui-chat__dots';
    dots.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i++) dots.append(this.#doc.createElement('span'));
    return dots;
  }

  #signature(message: ChatMessage, config: ChatConfig & { locale: string; timezone: string }): string {
    const author = this.#author(message);
    return JSON.stringify([
      message.role,
      message.status ?? 'complete',
      message.error ?? '',
      message.feedback ?? null,
      this.#format(message),
      author.name,
      author.avatar ?? null,
      typeof author.icon === 'string' ? author.icon : author.icon ? 'icon' : null,
      message.timestamp?.epochMilliseconds ?? null,
      (message.attachments ?? []).map((a) => [a.id, a.name, a.size ?? null]),
      config.locale,
      config.timezone,
      config.showTimestamps,
      config.showAvatars,
      config.headingLevel,
      this.#options.copyable ?? true,
      this.#options.feedback ?? true,
      this.#active?.id === message.id,
      this.#options.icons ?? null,
    ]);
  }

  #renderMessage(message: ChatMessage, config: ChatConfig & { locale: string; timezone: string }, icons: ChatIcons, actionsLabel: string): HTMLElement {
    const signature = this.#signature(message, config);
    const existing = this.#views.get(message.id);
    if (existing?.signature === signature) {
      if (existing.text !== message.text) this.#renderContent(existing, message, config.headingLevel);
      return existing.el;
    }
    if (existing) {
      this.#disposeView(existing);
      this.#views.delete(message.id);
    }
    const doc = this.#doc;
    const author = this.#author(message);
    const status = message.status ?? 'complete';
    const el = doc.createElement('article');
    el.className = `aui-chat__message aui-chat__message--${message.role}`;
    el.classList.toggle('aui-chat__message--error', status === 'error');
    el.classList.toggle('aui-chat__message--streaming', status === 'streaming');
    el.dataset.id = message.id;
    // The newest message is focused by "Jump to latest"; messages are not in the tab order.
    el.tabIndex = -1;
    const view: MessageView = { el, content: doc.createElement('div'), group: new DisposableGroup(), buttons: [], avatar: null, signature, text: null };

    if (config.showAvatars && message.role !== 'system') {
      const avatarHost = doc.createElement('div');
      avatarHost.className = 'aui-chat__avatar';
      if (author.icon != null && !author.avatar) {
        avatarHost.classList.add('aui-chat__avatar--icon');
        avatarHost.setAttribute('aria-hidden', 'true');
        avatarHost.append(renderIcon(author.icon, { doc }));
      } else view.avatar = Avatar.create(avatarHost, { name: author.name, size: 'sm', decorative: true, ...(author.avatar ? { src: author.avatar } : {}) });
      el.append(avatarHost);
    }

    const body = doc.createElement('div');
    body.className = 'aui-chat__body';
    const meta = doc.createElement('div');
    meta.className = 'aui-chat__meta';
    meta.id = createId('aui-chat-meta');
    const name = doc.createElement('span');
    name.className = 'aui-chat__author';
    name.textContent = author.name;
    meta.append(name);
    if (config.showTimestamps && message.timestamp) {
      const time = doc.createElement('time');
      time.className = 'aui-chat__time';
      time.dateTime = instantToString(message.timestamp);
      time.textContent = formatInstant(message.timestamp, { timeStyle: 'short' }, config.timezone, config.locale);
      time.title = formatInstant(message.timestamp, { dateStyle: 'full', timeStyle: 'short' }, config.timezone, config.locale);
      meta.append(doc.createTextNode(' '), time);
    }
    el.setAttribute('aria-labelledby', meta.id);
    if (message.role === 'system') meta.classList.add('aui-visually-hidden');

    view.content.className = 'aui-chat__content aui-chat__bubble';
    body.append(meta, view.content);
    this.#renderContent(view, message, config.headingLevel);

    const attachments = message.attachments ?? [];
    if (attachments.length > 0) {
      const list = doc.createElement('ul');
      list.className = 'aui-chat__attachments';
      list.setAttribute('aria-label', this.#m('attachments'));
      for (const attachment of attachments) {
        const li = doc.createElement('li');
        const chip = doc.createElement('button');
        chip.type = 'button';
        chip.className = 'aui-chat__attachment';
        const label = doc.createElement('span');
        label.className = 'aui-chat__attachment-name';
        label.textContent = attachment.name;
        chip.append(renderIcon(icons.file, { doc, className: 'aui-chat__attachment-icon' }), label);
        let accessible = this.#m('openAttachment', { name: attachment.name });
        if (attachment.size !== undefined) {
          const size = doc.createElement('span');
          size.className = 'aui-chat__attachment-size';
          size.textContent = formatFileSize(attachment.size, config.locale);
          chip.append(size);
          accessible = `${accessible}, ${size.textContent}`;
        }
        chip.setAttribute('aria-label', accessible);
        view.group.listen(chip, 'click', () => {
          emit(this.host, 'aui-attachment-open', { messageId: message.id, attachment } satisfies ChatAttachmentOpenDetail);
        });
        li.append(chip);
        list.append(li);
      }
      body.append(list);
    }

    if (status === 'error' || status === 'stopped') {
      const notice = doc.createElement('div');
      notice.className = status === 'error' ? 'aui-chat__error' : 'aui-chat__stopped';
      if (status === 'error') notice.append(renderIcon(icons.error, { doc, className: 'aui-chat__error-icon' }));
      const text = doc.createElement('span');
      text.textContent = status === 'error' ? (message.error ?? this.#m('error')) : this.#m('stopped');
      notice.append(text);
      body.append(notice);
    }

    const actions = this.#renderActions(view, message, icons, actionsLabel);
    if (actions) body.append(actions);
    el.append(body);
    this.#views.set(message.id, view);
    return el;
  }

  #renderActions(view: MessageView, message: ChatMessage, icons: ChatIcons, label: string): HTMLElement | null {
    const status = message.status ?? 'complete';
    if (message.role === 'system' || status === 'streaming') return null;
    const doc = this.#doc;
    const group = doc.createElement('div');
    group.className = 'aui-chat__actions';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    // Toggle buttons emit aui-change; it is reported as aui-feedback instead.
    listenCustom(view.group, group, 'aui-change', (event) => {
      event.stopPropagation();
    });
    const iconButton = (className: string, icon: IconRef, text: string, pressed?: boolean): Button => {
      const el = doc.createElement('button');
      el.type = 'button';
      el.className = `aui-chat__action ${className}`;
      el.setAttribute('aria-label', text);
      el.title = text;
      const button = Button.enhance(el, { icon, label: text, variant: 'ghost', size: 'sm', ...(pressed === undefined ? {} : { pressed }) });
      view.buttons.push(button);
      group.append(el);
      return button;
    };
    if ((this.#options.copyable ?? true) && message.text !== '' && message.role !== 'tool') {
      const copy = iconButton('aui-chat__copy', icons.copy, this.#m('copy'));
      view.group.listen(copy.element, 'click', () => {
        this.#copy(message.text);
      });
    }
    if ((this.#options.feedback ?? true) && message.role === 'assistant' && status === 'complete') {
      const up = iconButton('aui-chat__helpful', icons.helpful, this.#m('helpful'), message.feedback === 'up');
      const down = iconButton('aui-chat__unhelpful', icons.unhelpful, this.#m('unhelpful'), message.feedback === 'down');
      const rate = (value: ChatFeedback): void => {
        const current = this.#messages.find((x) => x.id === message.id)?.feedback ?? null;
        const next = current === value ? null : value;
        up.update({ pressed: next === 'up' });
        down.update({ pressed: next === 'down' });
        this.#messages = this.#messages.map((x) => (x.id === message.id ? Object.freeze({ ...x, feedback: next }) : x));
        view.signature = this.#signature(this.#messages.find((x) => x.id === message.id) ?? message, this.#config());
        emit(this.host, 'aui-feedback', { id: message.id, value: next } satisfies ChatFeedbackDetail);
      };
      // The Button toggles itself first; `rate` then sets both states from the model (mutually exclusive).
      view.group.listen(up.element, 'click', () => {
        rate('up');
      });
      view.group.listen(down.element, 'click', () => {
        rate('down');
      });
    }
    if ((status === 'error' || status === 'stopped') && (message.role === 'assistant' || message.role === 'tool')) {
      const retryEl = doc.createElement('button');
      retryEl.type = 'button';
      retryEl.className = 'aui-chat__action aui-chat__retry';
      retryEl.textContent = this.#m('retry');
      const retry = Button.enhance(retryEl, { icon: icons.retry, variant: 'outline', size: 'sm' });
      view.buttons.push(retry);
      group.append(retryEl);
      view.group.listen(retryEl, 'click', () => {
        if (this.#active) return;
        const index = this.#messages.findIndex((x) => x.id === message.id);
        let prompt: ChatMessage | null = null;
        for (let i = index - 1; i >= 0; i--) {
          const candidate = this.#messages[i];
          if (candidate?.role === 'user') {
            prompt = candidate;
            break;
          }
        }
        emit(this.host, 'aui-retry', { id: message.id, prompt } satisfies ChatRetryDetail);
      });
    }
    return group.childElementCount > 0 ? group : null;
  }

  #copy(text: string): void {
    const clipboard = (this.#doc.defaultView ?? window).navigator.clipboard as Clipboard | undefined;
    const done = (ok: boolean): void => {
      announce(this.#m(ok ? 'copied' : 'copyFailed'), 'polite', this.#doc);
    };
    if (!clipboard) {
      done(false);
      return;
    }
    clipboard.writeText(text).then(() => {
      done(true);
    }, () => {
      done(false);
    });
  }

  #codeBlock(view: MessageView, code: string, language: string): HTMLElement {
    const doc = this.#doc;
    const figure = doc.createElement('figure');
    figure.className = 'aui-chat__code';
    const head = doc.createElement('figcaption');
    head.className = 'aui-chat__code-head';
    const lang = doc.createElement('span');
    lang.className = 'aui-chat__code-language';
    lang.textContent = language === '' ? this.#m('code') : language;
    const copyEl = doc.createElement('button');
    copyEl.type = 'button';
    copyEl.className = 'aui-chat__code-copy';
    const label = this.#m('copyCode');
    copyEl.setAttribute('aria-label', label);
    copyEl.title = label;
    const copy = Button.enhance(copyEl, { icon: this.#icons().copy, label, variant: 'ghost', size: 'sm' });
    view.buttons.push(copy);
    view.group.listen(copyEl, 'click', () => {
      this.#copy(code);
    });
    head.append(lang, copyEl);
    const pre = doc.createElement('pre');
    pre.className = 'aui-chat__code-body';
    // Long lines scroll inside the block; keyboard users can scroll it too.
    pre.tabIndex = 0;
    const codeEl = doc.createElement('code');
    codeEl.textContent = code;
    pre.append(codeEl);
    figure.append(head, pre);
    return figure;
  }

  /** Paints a message's text (plain or Markdown) and the typing dots while it is empty and streaming. */
  #renderContent(view: MessageView, message: ChatMessage, headingLevel: number): void {
    const content = view.content;
    // Buttons inside earlier code blocks belong to the old content.
    const keep = view.buttons.filter((b) => !content.contains(b.element));
    for (const b of view.buttons) if (!keep.includes(b)) b.destroy();
    view.buttons.length = 0;
    view.buttons.push(...keep);
    view.text = message.text;
    const status = message.status ?? 'complete';
    if (message.text === '' && status === 'streaming') {
      const text = this.#doc.createElement('span');
      text.className = 'aui-visually-hidden';
      text.textContent = this.#m('typing', { name: this.#author(message).name });
      content.replaceChildren(this.#dots(), text);
      content.classList.add('aui-chat__bubble--typing');
      return;
    }
    content.classList.remove('aui-chat__bubble--typing');
    content.hidden = message.text === '' && status !== 'complete';
    if (this.#format(message) === 'markdown') {
      content.classList.add('aui-chat__content--markdown');
      content.replaceChildren(renderMarkdown(message.text, {
        doc: this.#doc,
        headingLevel,
        codeBlock: (code, language) => this.#codeBlock(view, code, language),
      }));
    } else {
      content.classList.remove('aui-chat__content--markdown');
      content.textContent = message.text;
    }
  }
}
