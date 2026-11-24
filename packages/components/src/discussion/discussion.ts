/**
 * Discussion (R20-25). A threaded comments and forum control: a comment box, replies nested to any
 * depth, @mentions in every composer (Mention Input), a configurable character count, delete with an
 * inline confirmation, edit of own comments, and the author, avatar, and a relative timestamp on
 * every comment and reply (absolute date and time on hover and focus, in a `<time datetime>`).
 *
 * Structure: nested lists. Each comment is an `<li>` holding an `<article>` (named "Comment by Ada,
 * 5 minutes ago" or "Reply by Grace to Ada, ...") and a nested `<ul>` of its replies, so the nesting
 * is semantic at every depth. Visual indentation stops at `maxIndent`; deeper replies show
 * "Replying to <name>" instead. Every action is a native button in the Tab order; Page Down and
 * Page Up move between comments (articles are focus targets, not tab stops).
 *
 * The host owns persistence: posting, replying, editing, and deleting emit cancelable events and,
 * unless prevented, update the model optimistically. Large threads keep the DOM bounded: top-level
 * comments and replies are paged ("Show more"), and threads below `collapseDepth` start collapsed
 * and are not rendered until expanded. Replies can be loaded lazily through `loadReplies`.
 * Text is never parsed as HTML: mentions render as text chips and only http(s) links become links.
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
} from '@absoluteui/core';
import { daysBetween, formatRelative } from '@absoluteui/helpers/date';
import type { IconRef } from '@absoluteui/icons';
import { editIcon } from '@absoluteui/icons/set/edit';
import { messageIcon } from '@absoluteui/icons/set/message';
import { replyIcon } from '@absoluteui/icons/set/reply';
import { announce } from '@absoluteui/utilities';
import { Avatar } from '../avatar/avatar.js';
import type { BusinessCalendarEngine } from '../business-calendar/engine.js';
import { Button } from '../button/button.js';
import { EmptyState } from '../empty-state/empty-state.js';
import { isBusinessCalendar } from '../internal/business-days.js';
import { isSafeHref } from '../internal/href.js';
import { MentionInput, type MentionInputOptions, type MentionProvider, type MentionSuggestion, type MentionToken, type MentionTrigger } from '../mention-input/mention-input.js';
import { Spinner } from '../spinner/spinner.js';
import { ToggleGroup, type ToggleGroupChangeDetail } from '../toggle-group/toggle-group.js';

export type DiscussionSort = 'oldest' | 'newest';
export type DiscussionStatus = 'ready' | 'loading' | 'error';

export interface DiscussionConfig {
  /** Order of top-level comments. Replies are always oldest first (conversation order). */
  sort: DiscussionSort;
  /** Nesting levels that indent; deeper replies stop indenting and show "Replying to <name>". */
  maxIndent: number;
  /** Replies of comments at this depth or deeper start collapsed (top-level comments are depth 0). */
  collapseDepth: number;
  /** Top-level comments shown at first and added per "Show more comments". */
  pageSize: number;
  /** Replies shown per comment at first and added per "Show more replies". */
  repliesPageSize: number;
  showAvatars: boolean;
  /** Heading level of the discussion title. */
  headingLevel: number;
  /** Where the new-comment box sits. */
  composerPosition: 'top' | 'bottom';
}

type Inherited = 'locale' | 'timezone';

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    discussion: DiscussionConfig & { locale: string; timezone: string };
  }
}

export const discussionConfig = defineComponentConfig<DiscussionConfig, Inherited>(
  'discussion',
  {
    sort: { default: 'oldest', expected: '"oldest" | "newest"', validate: validators.oneOf(['oldest', 'newest'] as const) },
    maxIndent: { default: 4, expected: 'integer 1..10', validate: validators.integerInRange(1, 10) },
    collapseDepth: { default: 3, expected: 'integer 1..50', validate: validators.integerInRange(1, 50) },
    pageSize: { default: 20, expected: 'integer 1..500', validate: validators.integerInRange(1, 500) },
    repliesPageSize: { default: 5, expected: 'integer 1..200', validate: validators.integerInRange(1, 200) },
    showAvatars: { default: true, expected: 'boolean', validate: validators.isBoolean },
    headingLevel: { default: 3, expected: 'integer 2..6', validate: validators.integerInRange(2, 6) },
    composerPosition: { default: 'top', expected: '"top" | "bottom"', validate: validators.oneOf(['top', 'bottom'] as const) },
  },
  ['locale', 'timezone'],
);

registerMessages('discussion', 'en', {
  count: '{count} comments',
  countOne: '1 comment',
  sort: 'Sort comments',
  oldest: 'Oldest',
  newest: 'Newest',
  composer: 'Add a comment',
  placeholder: 'Write a comment. Type @ to mention someone.',
  replyComposer: 'Reply to {name}',
  editComposer: 'Edit comment',
  post: 'Comment',
  postReply: 'Reply',
  save: 'Save',
  cancel: 'Cancel',
  reply: 'Reply',
  replyTo: 'Reply to {name}',
  edit: 'Edit',
  editLabel: 'Edit comment by {name}',
  delete: 'Delete',
  deleteLabel: 'Delete comment by {name}',
  actions: 'Comment actions',
  confirmDelete: 'Delete this comment?',
  confirmDeleteYes: 'Delete',
  commentLabel: 'Comment by {name}, {time}',
  replyLabel: 'Reply by {name} to {parent}, {time}',
  deletedLabel: 'Deleted comment, {time}',
  deleted: 'This comment was deleted.',
  replyingTo: 'Replying to {name}',
  edited: 'edited',
  editedAt: 'Edited {time}',
  justNow: 'just now',
  yesterday: 'Yesterday',
  showReplies: 'Show {count} replies',
  showRepliesOne: 'Show 1 reply',
  hideReplies: 'Hide replies',
  moreReplies: 'Show {count} more replies',
  moreRepliesOne: 'Show 1 more reply',
  moreComments: 'Show more comments ({count})',
  loadingReplies: 'Loading replies\u2026',
  repliesFailed: 'Replies could not be loaded.',
  retry: 'Retry',
  loading: 'Loading comments\u2026',
  failed: 'Comments could not be loaded.',
  emptyTitle: 'No comments yet',
  emptyDescription: 'Start the discussion.',
  emptyError: 'Write something before posting.',
  posted: 'Comment posted',
  replied: 'Reply posted',
  saved: 'Comment updated',
  removed: 'Comment deleted',
  newComment: 'New comment from {name}',
  newReply: 'New reply from {name} to {parent}',
  dayHoliday: '{day} ({holiday})',
  dayNonWorking: '{day} (non-working day)',
});

export interface DiscussionIcons {
  reply: IconRef;
  edit: IconRef;
  delete: IconRef;
  expand: IconRef;
  collapse: IconRef;
  empty: IconRef;
}

/** Who wrote a comment. */
export interface DiscussionAuthor {
  /** Stable id, compared with `currentUser.id` (own comments). */
  id: string;
  name: string;
  /** Avatar image (http(s), relative, blob:, or a raster data: URL). */
  avatar?: string | null;
}

export interface DiscussionComment {
  /** Unique id (stable across updates). */
  id: string;
  /** The comment this one replies to, or null for a top-level comment. */
  parentId: string | null;
  author: DiscussionAuthor;
  /** Plain text (never HTML). */
  text: string;
  /** Mentions inside `text`, in the Mention Input value shape. */
  mentions?: readonly MentionToken[];
  createdAt: Instant;
  editedAt?: Instant | null;
  /** A deleted comment with replies stays as a placeholder; without replies it is not shown. */
  deleted?: boolean;
  /** Number of direct replies on the server when not all are loaded (lazy loading with `loadReplies`). */
  replyCount?: number;
}

/** Context passed to `loadReplies`. */
export interface DiscussionLoadContext {
  /** Aborted when the thread is collapsed, the component destroyed, or a newer load starts. */
  readonly signal: AbortSignal;
  /** Replies of the comment already loaded (an offset for paged loading). */
  readonly loaded: number;
}

export interface DiscussionOptions extends Partial<DiscussionConfig> {
  /** Accessible name of the discussion and its visible title, such as "Comments". */
  label: string;
  comments?: readonly DiscussionComment[];
  /** The signed-in user (author of new comments). null: read-only (no composer, no reply). */
  currentUser?: DiscussionAuthor | null;
  /** Maximum characters per comment; longer text is blocked from posting (not truncated). */
  maxLength?: number;
  /** Show the character counter on every composer. Default true when `maxLength` is set; requires it. */
  showCounter?: boolean;
  /** Mention triggers. Default: `@` suggesting the people in the discussion. */
  triggers?: readonly MentionTrigger[];
  /** Allow replies. Default true. */
  allowReplies?: boolean;
  /** Whether the current user may edit a comment. Default: own comments that are not deleted. */
  canEdit?: ((comment: DiscussionComment) => boolean) | null;
  /** Whether the current user may delete a comment. Default: own comments that are not deleted. */
  canDelete?: ((comment: DiscussionComment) => boolean) | null;
  /** Loads the replies of a comment whose `replyCount` exceeds its loaded replies. */
  loadReplies?: ((comment: DiscussionComment, context: DiscussionLoadContext) => Promise<readonly DiscussionComment[]>) | null;
  /** `loading` shows a spinner instead of the thread, `error` a message with Retry (`aui-retry`). */
  status?: DiscussionStatus;
  /** Message shown with status `error`. */
  errorText?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  placeholder?: string;
  /** Rows of the composers. Default 3. */
  rows?: number;
  /** Names holidays and non-working days in the absolute dates. */
  businessCalendar?: BusinessCalendarEngine | null;
  /** Reference time for relative timestamps. Default: now, refreshed every minute. */
  now?: Instant;
  timezone?: string;
  locale?: string;
  icons?: Partial<DiscussionIcons>;
}

/** `aui-post` detail (cancelable: prevent it to add nothing; the composer keeps the text). */
export interface DiscussionPostDetail {
  comment: DiscussionComment;
}

/** `aui-reply` detail (cancelable). */
export interface DiscussionReplyDetail {
  comment: DiscussionComment;
  parent: DiscussionComment;
}

/** `aui-edit` detail (cancelable: prevent it to keep the previous text). */
export interface DiscussionEditDetail {
  id: string;
  text: string;
  mentions: readonly MentionToken[];
  previous: DiscussionComment;
}

/** `aui-delete` detail (cancelable). `placeholder`: the comment has replies and stays as "deleted". */
export interface DiscussionDeleteDetail {
  comment: DiscussionComment;
  placeholder: boolean;
}

/** `aui-expand` detail. */
export interface DiscussionExpandDetail {
  id: string;
  expanded: boolean;
}

/** `aui-sort` detail. */
export interface DiscussionSortDetail {
  sort: DiscussionSort;
}

const MAX_COMMENTS = 50_000;
const MAX_TEXT = 100_000;
const REFRESH_MS = 60_000;
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi;
const TRAILING = /[.,;:!?)\]}]+$/;

const DEFAULT_ICONS: DiscussionIcons = {
  reply: replyIcon,
  edit: editIcon,
  delete: 'trash',
  expand: 'chevron-down',
  collapse: 'chevron-up',
  empty: messageIcon,
};

type Config = Readonly<DiscussionConfig & { locale: string; timezone: string }>;

interface CommentView {
  readonly li: HTMLLIElement;
  readonly slot: HTMLDivElement;
  readonly toggleEl: HTMLButtonElement;
  readonly toggle: Button;
  readonly replies: HTMLUListElement;
  article: HTMLElement;
  time: HTMLTimeElement | null;
  text: HTMLElement | null;
  group: DisposableGroup;
  buttons: Button[];
  avatar: Avatar | null;
  signature: string;
  /** "More replies", loading, and error rows of the replies list. */
  extra: { el: HTMLLIElement; button: Button | null; key: string } | null;
}

interface Panel {
  kind: 'reply' | 'edit' | 'confirm';
  id: string;
  el: HTMLDivElement;
  group: DisposableGroup;
  buttons: Button[];
  input: MentionInput | null;
}

/** Listens for a component (`aui-*`) event, removed when `group` is disposed. */
function listenCustom(group: DisposableGroup, target: EventTarget, type: `aui-${string}`, handler: (event: Event) => void): void {
  target.addEventListener(type, handler);
  group.add(() => {
    target.removeEventListener(type, handler);
  });
}

function isInstant(value: unknown): value is Instant {
  return validators.isRecord(value) && value.kind === 'Instant' && typeof value.epochMilliseconds === 'number' && Number.isFinite(value.epochMilliseconds);
}

/** Replaces `parent`'s children with `desired`, moving only nodes that are out of place (focus stays in unmoved nodes). */
function syncChildren(parent: Element, desired: readonly Node[]): void {
  const keep = new Set(desired);
  for (const child of Array.from(parent.childNodes)) if (!keep.has(child)) child.remove();
  desired.forEach((node, i) => {
    const current = parent.childNodes[i];
    if (current !== node) parent.insertBefore(node, current ?? null);
  });
}

export class Discussion {
  readonly host: HTMLElement;
  #options: DiscussionOptions;
  /** Comments in insertion order (the tie-breaker for equal timestamps). */
  #comments: DiscussionComment[] = [];
  #byId = new Map<string, DiscussionComment>();
  #children = new Map<string | null, DiscussionComment[]>();
  readonly #doc: Document;
  readonly #group = new DisposableGroup();
  readonly #header: HTMLDivElement;
  readonly #title: HTMLDivElement;
  #heading: HTMLElement;
  readonly #count: HTMLSpanElement;
  readonly #sortHost: HTMLDivElement;
  #sort: ToggleGroup | null = null;
  readonly #composerEl: HTMLDivElement;
  readonly #composerHost: HTMLDivElement;
  #composer: MentionInput | null = null;
  #composerButton: Button | null = null;
  readonly #status: HTMLDivElement;
  #spinner: Spinner | null = null;
  #statusButton: Button | null = null;
  readonly #emptyHost: HTMLDivElement;
  #empty: EmptyState | null = null;
  readonly #thread: HTMLUListElement;
  readonly #moreEl: HTMLButtonElement;
  readonly #more: Button;
  #views = new Map<string, CommentView>();
  #expanded = new Map<string, boolean>();
  #shownReplies = new Map<string, number>();
  #shownTop = 0;
  #loads = new Map<string, AbortController>();
  #loadErrors = new Set<string>();
  #panel: Panel | null = null;
  #drafts = new Map<string, { text: string; mentions: readonly MentionToken[] }>();
  #timer: ReturnType<typeof setInterval> | undefined;
  #sortValue: DiscussionSort | null = null;
  /** Per-model caches, cleared on every model or option change. */
  #memoReplies = new Map<string, DiscussionComment[]>();
  #memoVisible = new Map<string, boolean>();
  #memoDescendants = new Map<string, number>();

  /** Render into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: DiscussionOptions): Discussion {
    return new Discussion(host, options);
  }

  private constructor(host: HTMLElement, options: DiscussionOptions) {
    Discussion.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#setComments(options.comments ?? []);
    const doc = this.#doc;

    this.#header = doc.createElement('div');
    this.#header.className = 'aui-discussion__header';
    this.#title = doc.createElement('div');
    this.#title.className = 'aui-discussion__heading';
    this.#heading = doc.createElement('h3');
    this.#heading.className = 'aui-discussion__title';
    this.#heading.id = createId('aui-discussion-title');
    this.#count = doc.createElement('span');
    this.#count.className = 'aui-discussion__count';
    this.#title.append(this.#heading, this.#count);
    this.#sortHost = doc.createElement('div');
    this.#sortHost.className = 'aui-discussion__sort';
    this.#header.append(this.#title, this.#sortHost);

    this.#composerEl = doc.createElement('div');
    this.#composerEl.className = 'aui-discussion__composer';
    this.#composerHost = doc.createElement('div');
    this.#composerHost.className = 'aui-discussion__field';
    this.#composerEl.append(this.#composerHost);

    this.#status = doc.createElement('div');
    this.#status.className = 'aui-discussion__status';
    this.#emptyHost = doc.createElement('div');
    this.#emptyHost.className = 'aui-discussion__empty';
    this.#thread = doc.createElement('ul');
    this.#thread.className = 'aui-discussion__thread';
    this.#thread.setAttribute('role', 'list');
    this.#moreEl = doc.createElement('button');
    this.#moreEl.type = 'button';
    this.#moreEl.className = 'aui-discussion__more';
    this.#moreEl.textContent = 'Show more comments';
    this.#more = Button.enhance(this.#moreEl, { variant: 'outline', size: 'sm' });

    try {
      // Render first: invalid options (config, messages, icons) throw before the host is touched.
      this.#shownTop = this.#config().pageSize;
      this.#render();
    } catch (error) {
      this.#disposeViews();
      this.#more.destroy();
      throw error;
    }
    host.classList.add('aui-discussion');
    host.setAttribute('role', 'region');
    host.setAttribute('aria-labelledby', this.#heading.id);
    this.#place();
    this.#bind();
    this.#group.add(discussionConfig.subscribe(() => {
      this.#render();
    }));
    this.#startTimer();
  }

  get options(): Readonly<DiscussionOptions> {
    return this.#options;
  }

  /** Every comment in the model (frozen copies, insertion order), including deleted placeholders. */
  get comments(): readonly DiscussionComment[] {
    return [...this.#comments];
  }

  /** The new-comment composer, or null without a current user. */
  get composer(): MentionInput | null {
    return this.#composer;
  }

  /** Add a comment (or replace the comment with the same id). Comments by others are announced. */
  addComment(comment: DiscussionComment): void {
    Discussion.#assertComment(comment, 'comment');
    if (comment.parentId !== null && !this.#byId.has(comment.parentId)) throw Discussion.#error('comment.parentId', 'id of a loaded comment or null');
    const frozen = Discussion.#freeze(comment);
    const exists = this.#byId.has(comment.id);
    if (!exists && this.#comments.length >= MAX_COMMENTS) throw Discussion.#error('comments', `at most ${String(MAX_COMMENTS)} comments`);
    this.#setComments(exists ? this.#comments.map((c) => (c.id === comment.id ? frozen : c)) : [...this.#comments, frozen]);
    if (!exists && comment.parentId !== null) this.#reveal(comment.id);
    this.#render();
    if (!exists && comment.author.id !== this.#options.currentUser?.id) {
      const parent = comment.parentId === null ? undefined : this.#byId.get(comment.parentId);
      announce(parent ? this.#m('newReply', { name: comment.author.name, parent: parent.author.name }) : this.#m('newComment', { name: comment.author.name }), 'polite', this.#doc);
    }
  }

  /** Merge fields into a comment (no-op for an unknown id). */
  updateComment(id: string, patch: Partial<Omit<DiscussionComment, 'id' | 'parentId'>>): void {
    const current = this.#byId.get(id);
    if (!current) return;
    const next = { ...current, ...patch, id, parentId: current.parentId };
    Discussion.#assertComment(next, 'comment');
    this.#setComments(this.#comments.map((c) => (c.id === id ? Discussion.#freeze(next) : c)));
    this.#render();
  }

  /**
   * Remove a comment (no event). A comment with replies stays as a "deleted" placeholder; without
   * replies it is removed, together with deleted ancestors that no longer have replies.
   */
  removeComment(id: string): void {
    if (!this.#byId.has(id)) return;
    this.#applyRemove(id);
    this.#render();
  }

  /** Show the replies of a comment (loads them through `loadReplies` when needed). */
  expand(id: string): void {
    this.#setExpanded(id, true, false);
  }

  collapse(id: string): void {
    this.#setExpanded(id, false, false);
  }

  /** Open the reply box under a comment and focus it. */
  reply(id: string): void {
    const comment = this.#byId.get(id);
    if (!comment || !this.#canReply(comment)) return;
    this.#reveal(id);
    this.#render();
    this.#openPanel('reply', id);
  }

  /** Move focus to a comment (revealing it when it is collapsed or paged out). */
  focusComment(id: string): void {
    if (!this.#byId.has(id)) return;
    this.#reveal(id);
    this.#render();
    this.#views.get(id)?.article.focus();
  }

  /** Focus the new-comment box (or the first comment when read-only). */
  focus(): void {
    if (this.#composer) this.#composer.focus();
    else this.#thread.querySelector<HTMLElement>('article')?.focus();
  }

  update(options: Partial<DiscussionOptions>): void {
    const next = { ...this.#options, ...options };
    Discussion.#assert(next);
    const previous = { options: this.#options, comments: this.#comments };
    this.#options = next;
    this.#clearMemo();
    if (options.comments !== undefined) this.#setComments(options.comments);
    if (options.sort !== undefined) this.#sortValue = null;
    try {
      this.#render();
    } catch (error) {
      this.#options = previous.options;
      this.#setComments(previous.comments);
      this.#render();
      throw error;
    }
    this.#place();
    this.#startTimer();
  }

  destroy(): void {
    clearInterval(this.#timer);
    for (const c of this.#loads.values()) c.abort();
    this.#loads.clear();
    this.#closePanel(false);
    this.#group.dispose();
    this.#disposeViews();
    this.#composer?.destroy();
    this.#composerButton?.destroy();
    this.#sort?.destroy();
    this.#spinner?.destroy();
    this.#statusButton?.destroy();
    this.#empty?.destroy();
    this.#more.destroy();
    this.host.replaceChildren();
    this.host.classList.remove('aui-discussion', 'aui-discussion--no-avatars', 'aui-discussion--composer-bottom');
    this.host.removeAttribute('role');
    this.host.removeAttribute('aria-labelledby');
  }

  // ---------------------------------------------------------------- validation

  static #error(property: string, expected: string): Error {
    return configurationError('DISCUSSION_OPTIONS', 'Invalid discussion options.', { component: 'discussion', property: `discussion.${property}`, expected });
  }

  static #assertAuthor(value: unknown, property: string): void {
    if (!validators.isRecord(value) || typeof value.id !== 'string' || value.id === '' || typeof value.name !== 'string' || value.name.trim() === '') throw Discussion.#error(property, '{ id: non-empty string; name: non-empty string; avatar? }');
    const avatar = value.avatar;
    if (avatar != null && typeof avatar !== 'string') throw Discussion.#error(`${property}.avatar`, 'string or null');
  }

  static #assertComment(c: DiscussionComment, property: string): void {
    const value: unknown = c;
    if (!validators.isRecord(value)) throw Discussion.#error(property, 'DiscussionComment object');
    if (typeof c.id !== 'string' || c.id === '') throw Discussion.#error(`${property}.id`, 'non-empty string');
    const parentId: unknown = c.parentId;
    if (parentId !== null && (typeof parentId !== 'string' || parentId === '')) throw Discussion.#error(`${property}.parentId`, 'non-empty string or null');
    if (parentId === c.id) throw Discussion.#error(`${property}.parentId`, 'another comment');
    Discussion.#assertAuthor(c.author, `${property}.author`);
    if (typeof c.text !== 'string' || c.text.length > MAX_TEXT) throw Discussion.#error(`${property}.text`, `string of at most ${String(MAX_TEXT)} characters`);
    if (!isInstant(c.createdAt)) throw Discussion.#error(`${property}.createdAt`, 'Instant');
    if (c.editedAt != null && !isInstant(c.editedAt)) throw Discussion.#error(`${property}.editedAt`, 'Instant or null');
    const deleted: unknown = c.deleted;
    if (deleted !== undefined && typeof deleted !== 'boolean') throw Discussion.#error(`${property}.deleted`, 'boolean');
    if (c.replyCount !== undefined && !validators.integerInRange(0, 1_000_000)(c.replyCount)) throw Discussion.#error(`${property}.replyCount`, 'integer >= 0');
    const mentions: unknown = c.mentions;
    if (mentions !== undefined) {
      if (!Array.isArray(mentions)) throw Discussion.#error(`${property}.mentions`, 'MentionToken[]');
      let end = 0;
      for (const m of [...(mentions as unknown[])].sort((a, b) => (validators.isRecord(a) && validators.isRecord(b) ? Number(a.start) - Number(b.start) : 0))) {
        if (!validators.isRecord(m) || typeof m.id !== 'string' || typeof m.label !== 'string' || typeof m.trigger !== 'string' || !Number.isInteger(m.start) || !Number.isInteger(m.end)) throw Discussion.#error(`${property}.mentions`, '{ id, label, trigger, start, end }');
        const start = m.start as number;
        const stop = m.end as number;
        if (start < end || stop <= start || stop > c.text.length || c.text.slice(start, stop) !== m.trigger + m.label) throw Discussion.#error(`${property}.mentions`, 'non-overlapping tokens with text.slice(start, end) === trigger + label');
        end = stop;
      }
    }
  }

  static #assert(options: DiscussionOptions): void {
    const label: unknown = options.label;
    if (typeof label !== 'string' || label.trim() === '') throw Discussion.#error('label', 'non-empty string');
    const comments: unknown = options.comments;
    if (comments !== undefined) {
      if (!Array.isArray(comments) || comments.length > MAX_COMMENTS) throw Discussion.#error('comments', `DiscussionComment[] (at most ${String(MAX_COMMENTS)})`);
      const list = options.comments ?? [];
      const ids = new Set<string>();
      for (const [i, c] of list.entries()) {
        Discussion.#assertComment(c, `comments[${String(i)}]`);
        if (ids.has(c.id)) throw Discussion.#error(`comments[${String(i)}].id`, 'unique id');
        ids.add(c.id);
      }
      const parents = new Map(list.map((c) => [c.id, c.parentId]));
      for (const [i, c] of list.entries()) {
        if (c.parentId !== null && !ids.has(c.parentId)) throw Discussion.#error(`comments[${String(i)}].parentId`, 'id of another comment in comments, or null');
        // Every chain must end at a top-level comment (no cycles).
        let steps = 0;
        let cursor: string | null = c.parentId;
        while (cursor !== null) {
          if (++steps > list.length) throw Discussion.#error(`comments[${String(i)}].parentId`, 'a reply chain that ends at a top-level comment (no cycles)');
          cursor = parents.get(cursor) ?? null;
        }
      }
    }
    if (options.currentUser != null) Discussion.#assertAuthor(options.currentUser, 'currentUser');
    const isLength = validators.integerInRange(1, MAX_TEXT);
    if (options.maxLength !== undefined && !isLength(options.maxLength)) throw Discussion.#error('maxLength', `integer 1..${String(MAX_TEXT)}`);
    if (options.showCounter === true && options.maxLength === undefined) throw Discussion.#error('showCounter', 'maxLength to be set');
    if (options.rows !== undefined && !validators.integerInRange(1, 20)(options.rows)) throw Discussion.#error('rows', 'integer 1..20');
    const triggers: unknown = options.triggers;
    if (triggers !== undefined && (!Array.isArray(triggers) || triggers.length === 0)) throw Discussion.#error('triggers', 'non-empty MentionTrigger[]');
    for (const key of ['canEdit', 'canDelete', 'loadReplies'] as const) {
      const v: unknown = options[key];
      if (v != null && typeof v !== 'function') throw Discussion.#error(key, 'function or null');
    }
    for (const key of ['allowReplies', 'showCounter'] as const) {
      const v: unknown = options[key];
      if (v !== undefined && typeof v !== 'boolean') throw Discussion.#error(key, 'boolean');
    }
    const status: unknown = options.status;
    if (status !== undefined && status !== 'ready' && status !== 'loading' && status !== 'error') throw Discussion.#error('status', '"ready" | "loading" | "error"');
    for (const key of ['errorText', 'emptyTitle', 'emptyDescription', 'placeholder'] as const) {
      const v: unknown = options[key];
      if (v !== undefined && typeof v !== 'string') throw Discussion.#error(key, 'string');
    }
    if (options.businessCalendar != null && !isBusinessCalendar(options.businessCalendar)) throw Discussion.#error('businessCalendar', 'BusinessCalendarEngine (createBusinessCalendar) or null');
    if (options.now !== undefined && !isInstant(options.now)) throw Discussion.#error('now', 'Instant');
  }

  static #freeze(c: DiscussionComment): DiscussionComment {
    return Object.freeze({ ...c, author: Object.freeze({ ...c.author }), ...(c.mentions ? { mentions: Object.freeze(c.mentions.map((m) => Object.freeze({ ...m }))) } : {}) });
  }

  // ---------------------------------------------------------------- model

  #setComments(list: readonly DiscussionComment[]): void {
    this.#comments = list.map((c) => (Object.isFrozen(c) ? c : Discussion.#freeze(c)));
    this.#byId = new Map(this.#comments.map((c) => [c.id, c]));
    const children = new Map<string | null, DiscussionComment[]>();
    for (const c of this.#comments) {
      const key = c.parentId !== null && this.#byId.has(c.parentId) ? c.parentId : null;
      const bucket = children.get(key);
      if (bucket) bucket.push(c);
      else children.set(key, [c]);
    }
    this.#children = children;
    this.#clearMemo();
    for (const id of [...this.#views.keys()]) {
      if (!this.#byId.has(id)) {
        const view = this.#views.get(id);
        if (view) this.#disposeView(view);
        this.#views.delete(id);
      }
    }
    if (this.#panel && !this.#byId.has(this.#panel.id)) this.#closePanel(false);
  }

  #clearMemo(): void {
    this.#memoReplies.clear();
    this.#memoVisible.clear();
    this.#memoDescendants.clear();
  }

  #config(): Config {
    const o = this.#options;
    return discussionConfig.resolve({
      ...(o.sort === undefined ? {} : { sort: o.sort }),
      ...(o.maxIndent === undefined ? {} : { maxIndent: o.maxIndent }),
      ...(o.collapseDepth === undefined ? {} : { collapseDepth: o.collapseDepth }),
      ...(o.pageSize === undefined ? {} : { pageSize: o.pageSize }),
      ...(o.repliesPageSize === undefined ? {} : { repliesPageSize: o.repliesPageSize }),
      ...(o.showAvatars === undefined ? {} : { showAvatars: o.showAvatars }),
      ...(o.headingLevel === undefined ? {} : { headingLevel: o.headingLevel }),
      ...(o.composerPosition === undefined ? {} : { composerPosition: o.composerPosition }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.timezone === undefined ? {} : { timezone: o.timezone }),
    });
  }

  #m(id: string, params: Record<string, string> = {}): string {
    return getMessage('discussion', id, params, this.#config().locale);
  }

  #icons(): DiscussionIcons {
    return { ...DEFAULT_ICONS, ...this.#options.icons };
  }

  #sortOrder(): DiscussionSort {
    return this.#sortValue ?? this.#config().sort;
  }

  #own(c: DiscussionComment): boolean {
    const user = this.#options.currentUser;
    return user?.id === c.author.id;
  }

  #canReply(c: DiscussionComment): boolean {
    return this.#options.currentUser != null && this.#options.allowReplies !== false && c.deleted !== true;
  }

  #canEdit(c: DiscussionComment): boolean {
    if (c.deleted === true || this.#options.currentUser == null) return false;
    const hook = this.#options.canEdit;
    return hook ? hook(c) : this.#own(c);
  }

  #canDelete(c: DiscussionComment): boolean {
    if (c.deleted === true || this.#options.currentUser == null) return false;
    const hook = this.#options.canDelete;
    return hook ? hook(c) : this.#own(c);
  }

  /** Replies in conversation order (oldest first, then insertion order). */
  #replies(id: string): DiscussionComment[] {
    const cached = this.#memoReplies.get(id);
    if (cached) return cached;
    const list = (this.#children.get(id) ?? []).filter((c) => this.#visible(c)).sort((a, b) => a.createdAt.epochMilliseconds - b.createdAt.epochMilliseconds);
    this.#memoReplies.set(id, list);
    return list;
  }

  /** Server replies not loaded yet. */
  #unloaded(c: DiscussionComment): number {
    if (c.replyCount === undefined || !this.#options.loadReplies) return 0;
    return Math.max(0, c.replyCount - (this.#children.get(c.id)?.length ?? 0));
  }

  /** Deleted comments are shown only while they have visible replies (or unloaded ones). */
  #visible(c: DiscussionComment): boolean {
    if (c.deleted !== true || this.#unloaded(c) > 0) return true;
    const cached = this.#memoVisible.get(c.id);
    if (cached !== undefined) return cached;
    // Reply chains are acyclic (validated), so the recursion ends.
    const visible = (this.#children.get(c.id) ?? []).some((r) => this.#visible(r));
    this.#memoVisible.set(c.id, visible);
    return visible;
  }

  /** Visible descendants (loaded) plus unloaded direct replies. */
  #descendants(c: DiscussionComment): number {
    const cached = this.#memoDescendants.get(c.id);
    if (cached !== undefined) return cached;
    let n = this.#unloaded(c);
    for (const r of this.#replies(c.id)) n += 1 + this.#descendants(r);
    this.#memoDescendants.set(c.id, n);
    return n;
  }

  #depth(c: DiscussionComment): number {
    let depth = 0;
    let cursor = c.parentId;
    while (cursor !== null && depth <= this.#comments.length) {
      depth++;
      cursor = this.#byId.get(cursor)?.parentId ?? null;
    }
    return depth;
  }

  #isExpanded(c: DiscussionComment, depth: number): boolean {
    // Threads whose replies are all still on the server start collapsed: expanding loads them.
    return this.#expanded.get(c.id) ?? (depth < this.#config().collapseDepth && this.#replies(c.id).length > 0);
  }

  #topLevel(): DiscussionComment[] {
    const order = this.#sortOrder();
    const index = new Map(this.#comments.map((c, i) => [c.id, i]));
    return (this.#children.get(null) ?? []).filter((c) => this.#visible(c)).sort((a, b) => {
      const d = a.createdAt.epochMilliseconds - b.createdAt.epochMilliseconds;
      const t = d !== 0 ? d : (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0);
      return order === 'oldest' ? t : -t;
    });
  }

  /** Expands ancestors and pages so a comment is rendered. */
  #reveal(id: string): void {
    const config = this.#config();
    let child = this.#byId.get(id);
    while (child) {
      const parentId = child.parentId;
      if (parentId === null) {
        const position = this.#topLevel().findIndex((c) => c.id === child?.id);
        if (position >= this.#shownTop) this.#shownTop = position + 1;
        break;
      }
      this.#expanded.set(parentId, true);
      const position = this.#replies(parentId).findIndex((c) => c.id === child?.id);
      if (position >= (this.#shownReplies.get(parentId) ?? config.repliesPageSize)) this.#shownReplies.set(parentId, position + 1);
      child = this.#byId.get(parentId);
    }
  }

  #applyRemove(id: string): void {
    const comment = this.#byId.get(id);
    if (!comment) return;
    const hasReplies = this.#replies(id).length > 0 || this.#unloaded(comment) > 0;
    if (hasReplies) {
      this.#setComments(this.#comments.map((c) => (c.id === id ? Discussion.#freeze({ ...c, text: '', mentions: [], deleted: true }) : c)));
      return;
    }
    // Remove the comment, then deleted ancestors left without replies.
    const remove = new Set<string>([id]);
    let parentId = comment.parentId;
    while (parentId !== null) {
      const parent = this.#byId.get(parentId);
      if (parent?.deleted !== true || this.#unloaded(parent) > 0) break;
      const others = (this.#children.get(parentId) ?? []).filter((c) => !remove.has(c.id) && this.#visible(c));
      if (others.length > 0) break;
      remove.add(parentId);
      parentId = parent.parentId;
    }
    this.#setComments(this.#comments.filter((c) => !remove.has(c.id)));
  }

  // ---------------------------------------------------------------- time

  #now(): number {
    return this.#options.now?.epochMilliseconds ?? Date.now();
  }

  #relative(at: Instant, config: Config): string {
    const now = this.#now();
    const diff = now - at.epochMilliseconds;
    const locale = config.locale;
    if (diff < 45_000 && diff > -60_000) return getMessage('discussion', 'justNow', {}, locale);
    if (diff < 0) return formatRelative(at.epochMilliseconds, now, { locale });
    const today = toPlainDateTime(instant(now), config.timezone).date;
    const date = toPlainDateTime(at, config.timezone).date;
    const days = daysBetween(today, date);
    if (days === 0 || diff < 3_600_000) return formatRelative(at.epochMilliseconds, now, { locale });
    if (days === -1) return getMessage('discussion', 'yesterday', {}, locale);
    if (days > -7) return formatPlainDate(date, { weekday: 'long' }, locale);
    const sameYear = date.year === today.year;
    return formatPlainDate(date, sameYear ? { month: 'short', day: 'numeric' } : { dateStyle: 'medium' }, locale);
  }

  #absolute(at: Instant, config: Config): string {
    const text = formatInstant(at, { dateStyle: 'full', timeStyle: 'short' }, config.timezone, config.locale);
    const calendar = this.#options.businessCalendar;
    if (!calendar) return text;
    const info = calendar.day(toPlainDateTime(at, config.timezone).date);
    if (info.holiday) return getMessage('discussion', 'dayHoliday', { day: text, holiday: info.holiday }, config.locale);
    if (!info.working) return getMessage('discussion', 'dayNonWorking', { day: text }, config.locale);
    return text;
  }

  #startTimer(): void {
    clearInterval(this.#timer);
    this.#timer = undefined;
    if (this.#options.now !== undefined) return;
    this.#timer = setInterval(() => {
      if (this.#group.disposed) return;
      const config = this.#config();
      for (const [id, view] of this.#views) {
        const c = this.#byId.get(id);
        if (c && view.li.isConnected) this.#paintTime(view, c, config);
      }
    }, REFRESH_MS);
  }

  // ---------------------------------------------------------------- events

  #bind(): void {
    const g = this.#group;
    g.listen(this.#moreEl, 'click', () => {
      const before = this.#topLevel().length;
      const first = Math.min(this.#shownTop, before);
      this.#shownTop += this.#config().pageSize;
      this.#render();
      // Focus the first newly shown comment.
      const next = this.#topLevel()[first];
      if (next) this.#views.get(next.id)?.article.focus();
    });
    g.listen(this.#thread, 'keydown', (event) => {
      this.#onThreadKey(event);
    });
    listenCustom(g, this.#sortHost, 'aui-change', (event) => {
      event.stopPropagation();
      const value = (event as CustomEvent<ToggleGroupChangeDetail>).detail.value[0];
      if (value !== 'oldest' && value !== 'newest') return;
      this.#sortValue = value;
      this.#render();
      emit(this.host, 'aui-sort', { sort: value } satisfies DiscussionSortDetail);
    });
  }

  /** Page Down / Page Up move between comments when focus is not in a text field. */
  #onThreadKey(event: KeyboardEvent): void {
    if (event.key !== 'PageDown' && event.key !== 'PageUp') return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.closest('textarea, input')) return;
    const articles = Array.from(this.#thread.querySelectorAll<HTMLElement>('article.aui-discussion__comment'));
    const current = target.closest('li.aui-discussion__item')?.querySelector<HTMLElement>(':scope > article');
    const index = current ? articles.indexOf(current) : -1;
    const next = articles[event.key === 'PageDown' ? index + 1 : Math.max(0, index - 1)];
    if (!next) return;
    event.preventDefault();
    next.focus();
  }

  #setExpanded(id: string, expanded: boolean, user: boolean): void {
    const comment = this.#byId.get(id);
    if (!comment) return;
    const was = this.#isExpanded(comment, this.#depth(comment));
    this.#expanded.set(id, expanded);
    if (!expanded) {
      this.#loads.get(id)?.abort();
      this.#loads.delete(id);
      if (this.#panel && this.#panel.id !== id && this.#isInside(this.#panel.id, id)) this.#closePanel(false);
    }
    if (expanded && this.#unloaded(comment) > 0 && !this.#loads.has(id)) this.#load(comment);
    this.#render();
    if (was !== expanded) emit(this.host, 'aui-expand', { id, expanded } satisfies DiscussionExpandDetail);
    if (user && expanded) {
      const first = this.#replies(id)[0];
      if (first) this.#views.get(first.id)?.article.focus();
    }
  }

  /** Whether `id` is a descendant of `ancestor`. */
  #isInside(id: string, ancestor: string): boolean {
    let cursor = this.#byId.get(id)?.parentId ?? null;
    let steps = 0;
    while (cursor !== null && steps++ <= this.#comments.length) {
      if (cursor === ancestor) return true;
      cursor = this.#byId.get(cursor)?.parentId ?? null;
    }
    return false;
  }

  #load(comment: DiscussionComment): void {
    const loader = this.#options.loadReplies;
    if (!loader) return;
    this.#loads.get(comment.id)?.abort();
    const controller = new AbortController();
    this.#loads.set(comment.id, controller);
    this.#loadErrors.delete(comment.id);
    let result: Promise<readonly DiscussionComment[]>;
    try {
      result = loader(comment, { signal: controller.signal, loaded: this.#children.get(comment.id)?.length ?? 0 });
    } catch (error) {
      result = Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    const finish = (): boolean => {
      if (controller.signal.aborted || this.#loads.get(comment.id) !== controller || this.#group.disposed) return false;
      this.#loads.delete(comment.id);
      return true;
    };
    result.then(
      (items) => {
        if (!finish()) return;
        const added: DiscussionComment[] = [];
        try {
          const list: readonly DiscussionComment[] = Array.isArray(items) ? items : [];
          for (const [i, c] of list.entries()) {
            Discussion.#assertComment(c, `loadReplies()[${String(i)}]`);
            if (c.parentId === null || (!this.#byId.has(c.parentId) && !added.some((a) => a.id === c.parentId))) throw Discussion.#error(`loadReplies()[${String(i)}].parentId`, 'id of a loaded comment');
            added.push(Discussion.#freeze(c));
          }
        } catch {
          this.#loadErrors.add(comment.id);
          this.#render();
          announce(this.#m('repliesFailed'), 'polite', this.#doc);
          return;
        }
        const ids = new Set(added.map((c) => c.id));
        const before = this.#children.get(comment.id)?.length ?? 0;
        const merged = [...this.#comments.filter((c) => !ids.has(c.id)), ...added];
        const loaded = merged.filter((c) => c.parentId === comment.id).length;
        // A load that adds nothing means the server has no more: the count is corrected so "Show more" stops.
        this.#setComments(loaded > before ? merged : merged.map((c) => (c.id === comment.id ? Discussion.#freeze({ ...c, replyCount: loaded }) : c)));
        this.#render();
      },
      () => {
        if (!finish()) return;
        this.#loadErrors.add(comment.id);
        this.#render();
        announce(this.#m('repliesFailed'), 'polite', this.#doc);
      },
    );
  }

  // ---------------------------------------------------------------- composers

  #triggers(): readonly MentionTrigger[] {
    if (this.#options.triggers) return this.#options.triggers;
    const people: MentionProvider = (query) => {
      const q = query.toLocaleLowerCase();
      const seen = new Map<string, MentionSuggestion>();
      for (const c of this.#comments) {
        if (c.deleted === true || seen.has(c.author.id) || c.author.id === this.#options.currentUser?.id) continue;
        if (c.author.name.toLocaleLowerCase().includes(q)) seen.set(c.author.id, { id: c.author.id, label: c.author.name });
      }
      return Promise.resolve([...seen.values()]);
    };
    return [{ char: '@', provider: people }];
  }

  #composerOptions(label: string, placeholder: string, value?: { text: string; mentions: readonly MentionToken[] }): MentionInputOptions {
    const o = this.#options;
    const max = o.maxLength;
    return {
      label,
      hideLabel: true,
      placeholder,
      triggers: this.#triggers(),
      validationTiming: 'submit',
      rows: o.rows ?? 3,
      ...(max === undefined ? {} : { maxLength: max, showCounter: o.showCounter ?? true }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(value === undefined ? {} : { value }),
    };
  }

  /** Validates a composer; returns its value or null (the error is shown and announced). */
  #validate(input: MentionInput): { text: string; mentions: readonly MentionToken[] } | null {
    const value = input.value;
    if (value.text.trim() === '') {
      input.setCustomError(this.#m('emptyError'));
      input.reportValidity();
      announce(this.#m('emptyError'), 'assertive', this.#doc);
      input.focus();
      return null;
    }
    if (!input.reportValidity()) {
      announce(input.validity.message, 'assertive', this.#doc);
      input.focus();
      return null;
    }
    // Leading and trailing whitespace is dropped; mention offsets move with it.
    const lead = value.text.length - value.text.trimStart().length;
    const text = value.text.trim();
    const mentions = value.mentions.filter((m) => m.start >= lead && m.end - lead <= text.length).map((m) => Object.freeze({ ...m, start: m.start - lead, end: m.end - lead }));
    return { text, mentions };
  }

  /** Key handling shared by every composer: Ctrl/Cmd+Enter posts, Escape cancels (inline ones). */
  #bindComposerKeys(group: DisposableGroup, el: HTMLElement, submit: () => void, cancel: (() => void) | null): void {
    group.listen(el, 'keydown', (event) => {
      if (event.isComposing) return;
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        submit();
      } else if (event.key === 'Escape' && cancel && !event.defaultPrevented) {
        event.preventDefault();
        cancel();
      }
    });
  }

  #syncComposer(): void {
    const o = this.#options;
    const show = o.currentUser != null;
    this.#composerEl.hidden = !show;
    if (!show) {
      this.#composer?.destroy();
      this.#composer = null;
      this.#composerButton?.destroy();
      this.#composerButton = null;
      this.#composerEl.replaceChildren(this.#composerHost);
      return;
    }
    const options = this.#composerOptions(this.#m('composer'), o.placeholder ?? this.#m('placeholder'));
    if (this.#composer) {
      this.#composer.update(options);
      if (this.#composerButton) this.#composerButton.element.textContent = this.#m('post');
      return;
    }
    this.#composer = MentionInput.create(this.#composerHost, options);
    const actions = this.#doc.createElement('div');
    actions.className = 'aui-discussion__composer-actions';
    const buttonEl = this.#doc.createElement('button');
    buttonEl.type = 'button';
    buttonEl.className = 'aui-discussion__post';
    buttonEl.textContent = this.#m('post');
    this.#composerButton = Button.enhance(buttonEl, { variant: 'primary', size: 'sm' });
    actions.append(buttonEl);
    this.#composerEl.replaceChildren(this.#composerHost, actions);
    this.#group.listen(buttonEl, 'click', () => {
      this.#postTop();
    });
    this.#bindComposerKeys(this.#group, this.#composerHost, () => {
      this.#postTop();
    }, null);
  }

  #newComment(parentId: string | null, value: { text: string; mentions: readonly MentionToken[] }): DiscussionComment | null {
    const user = this.#options.currentUser;
    if (user == null) return null;
    return Discussion.#freeze({
      id: createId('aui-discussion-comment'),
      parentId,
      author: { id: user.id, name: user.name, ...(user.avatar ? { avatar: user.avatar } : {}) },
      text: value.text,
      mentions: value.mentions,
      createdAt: instant(Date.now()),
    });
  }

  #postTop(): void {
    const input = this.#composer;
    if (!input) return;
    const value = this.#validate(input);
    if (!value) return;
    const comment = this.#newComment(null, value);
    if (!comment) return;
    if (!emit(this.host, 'aui-post', { comment } satisfies DiscussionPostDetail, { cancelable: true })) return;
    this.#setComments([...this.#comments, comment]);
    this.#reveal(comment.id);
    input.reset();
    this.#render();
    announce(this.#m('posted'), 'polite', this.#doc);
    // Focus stays in the composer, ready for the next comment.
    input.focus();
  }

  #openPanel(kind: Panel['kind'], id: string): void {
    const comment = this.#byId.get(id);
    const view = this.#views.get(id);
    if (!comment || !view) return;
    if (this.#panel?.kind === kind && this.#panel.id === id) {
      this.#panel.input?.focus();
      return;
    }
    this.#closePanel(false);
    const doc = this.#doc;
    const el = doc.createElement('div');
    const group = new DisposableGroup();
    const panel: Panel = { kind, id, el, group, buttons: [], input: null };
    const button = (text: string, variant: 'primary' | 'ghost' | 'danger', className: string, onClick: () => void): HTMLButtonElement => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = className;
      b.textContent = text;
      panel.buttons.push(Button.enhance(b, { variant, size: 'sm' }));
      group.listen(b, 'click', onClick);
      return b;
    };
    if (kind === 'confirm') {
      el.className = 'aui-discussion__confirm';
      el.setAttribute('role', 'group');
      const question = doc.createElement('span');
      question.className = 'aui-discussion__confirm-text';
      question.id = createId('aui-discussion-confirm');
      question.textContent = this.#m('confirmDelete');
      el.setAttribute('aria-labelledby', question.id);
      const yes = button(this.#m('confirmDeleteYes'), 'danger', 'aui-discussion__confirm-delete', () => {
        this.#confirmDelete(id);
      });
      const no = button(this.#m('cancel'), 'ghost', 'aui-discussion__confirm-cancel', () => {
        this.#closePanel(true);
      });
      group.listen(el, 'keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          this.#closePanel(true);
        }
      });
      el.append(question, yes, no);
      this.#panel = panel;
      view.slot.replaceChildren(el);
      // The least destructive choice gets focus.
      no.focus();
      return;
    }
    el.className = `aui-discussion__inline aui-discussion__inline--${kind}`;
    const fieldHost = doc.createElement('div');
    fieldHost.className = 'aui-discussion__field';
    const draft = kind === 'reply' ? this.#drafts.get(id) : { text: comment.text, mentions: comment.mentions ?? [] };
    const label = kind === 'reply' ? this.#m('replyComposer', { name: comment.author.name }) : this.#m('editComposer');
    panel.input = MentionInput.create(fieldHost, this.#composerOptions(label, kind === 'reply' ? this.#m('replyComposer', { name: comment.author.name }) : '', draft));
    const actions = doc.createElement('div');
    actions.className = 'aui-discussion__composer-actions';
    const submit = (): void => {
      if (kind === 'reply') this.#postReply(id);
      else this.#saveEdit(id);
    };
    const cancel = (): void => {
      this.#closePanel(true);
    };
    actions.append(
      button(this.#m('cancel'), 'ghost', 'aui-discussion__cancel', cancel),
      button(this.#m(kind === 'reply' ? 'postReply' : 'save'), 'primary', 'aui-discussion__submit', submit),
    );
    this.#bindComposerKeys(group, el, submit, cancel);
    el.append(fieldHost, actions);
    this.#panel = panel;
    view.slot.replaceChildren(el);
    if (kind === 'edit' && view.text) view.text.hidden = true;
    const input = panel.input;
    input.focus();
    // Caret at the end of the existing text.
    const end = input.input.value.length;
    input.input.setSelectionRange(end, end);
  }

  /** Closes the reply, edit, or confirm panel; `restore` returns focus to the action that opened it. */
  #closePanel(restore: boolean): void {
    const panel = this.#panel;
    if (!panel) return;
    this.#panel = null;
    if (panel.kind === 'reply' && panel.input) {
      const value = panel.input.value;
      if (value.text.trim() === '') this.#drafts.delete(panel.id);
      else this.#drafts.set(panel.id, { text: value.text, mentions: value.mentions });
    }
    panel.group.dispose();
    for (const b of panel.buttons) b.destroy();
    panel.input?.destroy();
    panel.el.remove();
    const view = this.#views.get(panel.id);
    if (view?.text) view.text.hidden = false;
    if (restore && view) {
      const action = view.article.querySelector<HTMLElement>(`.aui-discussion__action--${panel.kind === 'confirm' ? 'delete' : panel.kind}`);
      (action ?? view.article).focus();
    }
  }

  #postReply(parentId: string): void {
    const panel = this.#panel;
    const parent = this.#byId.get(parentId);
    if (panel?.kind !== 'reply' || !panel.input || !parent) return;
    const value = this.#validate(panel.input);
    if (!value) return;
    const comment = this.#newComment(parentId, value);
    if (!comment) return;
    if (!emit(this.host, 'aui-reply', { comment, parent } satisfies DiscussionReplyDetail, { cancelable: true })) return;
    panel.input.reset();
    this.#drafts.delete(parentId);
    this.#closePanel(false);
    this.#setComments([...this.#comments, comment]);
    this.#reveal(comment.id);
    this.#render();
    announce(this.#m('replied'), 'polite', this.#doc);
    this.#views.get(comment.id)?.article.focus();
  }

  #saveEdit(id: string): void {
    const panel = this.#panel;
    const previous = this.#byId.get(id);
    if (panel?.kind !== 'edit' || !panel.input || !previous) return;
    const value = this.#validate(panel.input);
    if (!value) return;
    if (value.text === previous.text) {
      this.#closePanel(true);
      return;
    }
    if (!emit(this.host, 'aui-edit', { id, text: value.text, mentions: value.mentions, previous } satisfies DiscussionEditDetail, { cancelable: true })) return;
    this.#closePanel(false);
    this.#setComments(this.#comments.map((c) => (c.id === id ? Discussion.#freeze({ ...c, text: value.text, mentions: value.mentions, editedAt: instant(Date.now()) }) : c)));
    this.#render();
    announce(this.#m('saved'), 'polite', this.#doc);
    this.#views.get(id)?.article.focus();
  }

  #confirmDelete(id: string): void {
    const comment = this.#byId.get(id);
    if (!comment) return;
    const placeholder = this.#replies(id).length > 0 || this.#unloaded(comment) > 0;
    if (!emit(this.host, 'aui-delete', { comment, placeholder } satisfies DiscussionDeleteDetail, { cancelable: true })) {
      this.#closePanel(true);
      return;
    }
    // Where focus goes: the placeholder itself, else the next sibling, the comment before it, or the parent.
    const articles = Array.from(this.#thread.querySelectorAll<HTMLElement>('article.aui-discussion__comment'));
    const own = this.#views.get(id)?.article;
    const index = own ? articles.indexOf(own) : -1;
    const siblings = comment.parentId === null ? this.#topLevel() : this.#replies(comment.parentId);
    const position = siblings.findIndex((c) => c.id === id);
    const next = position >= 0 ? siblings[position + 1] : undefined;
    const before = index > 0 ? articles[index - 1]?.dataset.id : undefined;
    const targetId = (next && this.#views.has(next.id) ? next.id : undefined) ?? before ?? comment.parentId;
    this.#closePanel(false);
    this.#applyRemove(id);
    this.#render();
    announce(this.#m('removed'), 'polite', this.#doc);
    const focusId = this.#byId.has(id) ? id : targetId;
    const target = focusId === null ? undefined : this.#views.get(focusId)?.article;
    if (target?.isConnected) target.focus();
    else if (this.#composer) this.#composer.focus();
    else this.#thread.querySelector<HTMLElement>('article')?.focus();
  }

  // ---------------------------------------------------------------- rendering

  #place(): void {
    const bottom = this.#config().composerPosition === 'bottom';
    this.host.classList.toggle('aui-discussion--composer-bottom', bottom);
    const parts: Node[] = bottom
      ? [this.#header, this.#status, this.#emptyHost, this.#thread, this.#moreEl, this.#composerEl]
      : [this.#header, this.#composerEl, this.#status, this.#emptyHost, this.#thread, this.#moreEl];
    syncChildren(this.host, parts);
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const icons = this.#icons();
    const locale = config.locale;
    // Messages are resolved before the DOM changes, so an invalid locale throws first.
    const m = (id: string, params: Record<string, string> = {}): string => getMessage('discussion', id, params, locale);

    const level = `h${String(config.headingLevel)}`;
    if (this.#heading.localName !== level) {
      const heading = this.#doc.createElement(level);
      heading.className = this.#heading.className;
      heading.id = this.#heading.id;
      this.#heading.replaceWith(heading);
      this.#heading = heading;
    }
    this.#heading.textContent = o.label;
    const count = this.#comments.filter((c) => c.deleted !== true).length;
    this.#count.textContent = count === 1 ? m('countOne') : m('count', { count: formatNumber(count, {}, locale) });
    this.#thread.setAttribute('aria-labelledby', this.#heading.id);
    this.host.classList.toggle('aui-discussion--no-avatars', !config.showAvatars);
    this.#renderSort(m);
    this.#syncComposer();

    const status = o.status ?? 'ready';
    this.#renderStatus(status, m);
    const top = status === 'ready' ? this.#topLevel() : [];
    this.#renderEmpty(status === 'ready' && top.length === 0, m, icons);

    this.#shownTop = Math.max(this.#shownTop, config.pageSize);
    const shown = top.slice(0, this.#shownTop);
    const rendered = new Set<string>();
    syncChildren(this.#thread, shown.map((c) => this.#renderItem(c, 0, null, config, icons, rendered)));
    this.#thread.hidden = shown.length === 0;
    const rest = top.length - shown.length;
    this.#moreEl.hidden = rest <= 0;
    this.#moreEl.textContent = m('moreComments', { count: formatNumber(rest, {}, locale) });
    this.#more.update({});

    // Views of comments that are no longer rendered (collapsed or paged out) are released.
    for (const [id, view] of this.#views) {
      if (!rendered.has(id)) {
        if (this.#panel?.id === id) this.#closePanel(false);
        this.#disposeView(view);
        this.#views.delete(id);
      }
    }
    if (this.#panel) {
      const view = this.#views.get(this.#panel.id);
      if (view && this.#panel.el.parentNode !== view.slot) view.slot.replaceChildren(this.#panel.el);
    }
  }

  #renderSort(m: (id: string) => string): void {
    const sort = this.#sortOrder();
    const items = [{ value: 'oldest', label: m('oldest') }, { value: 'newest', label: m('newest') }];
    if (!this.#sort) {
      const el = this.#doc.createElement('div');
      this.#sortHost.replaceChildren(el);
      this.#sort = ToggleGroup.create(el, { label: m('sort'), items, value: [sort], required: true, attached: true, size: 'sm' });
    } else this.#sort.update({ label: m('sort'), items, value: [sort] });
  }

  #renderStatus(status: DiscussionStatus, m: (id: string) => string): void {
    this.#status.hidden = status === 'ready';
    this.#status.classList.toggle('aui-discussion__status--error', status === 'error');
    if (status !== 'loading') {
      this.#spinner?.destroy();
      this.#spinner = null;
    }
    if (status !== 'error') {
      this.#statusButton?.destroy();
      this.#statusButton = null;
    }
    if (status === 'ready') {
      this.#status.replaceChildren();
      this.#status.removeAttribute('role');
      return;
    }
    if (status === 'loading') {
      if (this.#spinner) return;
      this.#status.removeAttribute('role');
      const host = this.#doc.createElement('div');
      this.#status.replaceChildren(host);
      this.#spinner = Spinner.create(host, { label: m('loading'), showLabel: true, ...(this.#options.locale === undefined ? {} : { locale: this.#options.locale }) });
      return;
    }
    this.#status.setAttribute('role', 'alert');
    const text = this.#doc.createElement('span');
    text.className = 'aui-discussion__status-text';
    text.textContent = this.#options.errorText ?? m('failed');
    const retryEl = this.#doc.createElement('button');
    retryEl.type = 'button';
    retryEl.className = 'aui-discussion__retry';
    retryEl.textContent = m('retry');
    this.#statusButton?.destroy();
    this.#statusButton = Button.enhance(retryEl, { variant: 'outline', size: 'sm', icon: 'refresh' });
    // The element (and its listener) is replaced on the next status render.
    retryEl.addEventListener('click', () => {
      emit(this.host, 'aui-retry', {});
    });
    this.#status.replaceChildren(text, retryEl);
  }

  #renderEmpty(show: boolean, m: (id: string) => string, icons: DiscussionIcons): void {
    this.#emptyHost.hidden = !show;
    if (!show) {
      this.#empty?.destroy();
      this.#empty = null;
      this.#emptyHost.replaceChildren();
      return;
    }
    const options = {
      title: this.#options.emptyTitle ?? m('emptyTitle'),
      description: this.#options.emptyDescription ?? (this.#options.currentUser != null ? m('emptyDescription') : ''),
      icon: icons.empty,
      headingLevel: null,
      size: 'sm' as const,
    };
    if (this.#empty) this.#empty.update(options);
    else {
      const el = this.#doc.createElement('div');
      this.#emptyHost.replaceChildren(el);
      this.#empty = EmptyState.create(el, options);
    }
  }

  #signature(c: DiscussionComment, depth: number, parent: DiscussionComment | null, config: Config): string {
    return JSON.stringify([
      c.text,
      c.mentions ?? [],
      c.author,
      c.deleted === true,
      c.createdAt.epochMilliseconds,
      c.editedAt?.epochMilliseconds ?? null,
      depth >= config.maxIndent && parent ? parent.author.name : null,
      this.#canReply(c),
      this.#canEdit(c),
      this.#canDelete(c),
      config.showAvatars,
      config.locale,
      config.timezone,
      this.#options.icons ?? null,
    ]);
  }

  #renderItem(c: DiscussionComment, depth: number, parent: DiscussionComment | null, config: Config, icons: DiscussionIcons, rendered: Set<string>): HTMLLIElement {
    rendered.add(c.id);
    const view = this.#view(c);
    const signature = this.#signature(c, depth, parent, config);
    if (view.signature !== signature) this.#buildArticle(view, c, depth, parent, config, icons, signature);
    view.li.dataset.depth = String(depth);
    view.li.classList.toggle('aui-discussion__item--deep', depth >= config.maxIndent);
    this.#paintTime(view, c, config);

    // Replies and the collapse toggle.
    const replies = this.#replies(c.id);
    const total = this.#descendants(c);
    const expanded = total > 0 && this.#isExpanded(c, depth);
    view.toggleEl.hidden = total === 0;
    if (total > 0) {
      // The count is what one click shows: direct replies (loaded and not yet loaded), not every descendant.
      const direct = replies.length + this.#unloaded(c);
      const label = expanded ? this.#m('hideReplies') : direct === 1 ? this.#m('showRepliesOne') : this.#m('showReplies', { count: formatNumber(direct, {}, config.locale) });
      view.toggleEl.textContent = label;
      view.toggleEl.setAttribute('aria-expanded', String(expanded));
      view.toggle.update({ icon: expanded ? icons.collapse : icons.expand });
    }
    view.replies.classList.toggle('aui-discussion__replies--flat', depth + 1 >= config.maxIndent);
    view.replies.hidden = !expanded;
    const children: Node[] = [];
    if (expanded) {
      const limit = this.#shownReplies.get(c.id) ?? config.repliesPageSize;
      for (const r of replies.slice(0, limit)) children.push(this.#renderItem(r, depth + 1, c, config, icons, rendered));
      const more = Math.max(0, replies.length - limit);
      const extra = this.#extra(view, c, more, config);
      if (extra) children.push(extra);
    } else if (view.extra) {
      view.extra.button?.destroy();
      view.extra = null;
    }
    syncChildren(view.replies, children);
    return view.li;
  }

  /** The "more replies", loading, or error row of a replies list. */
  #extra(view: CommentView, c: DiscussionComment, more: number, config: Config): HTMLLIElement | null {
    const unloaded = this.#unloaded(c);
    const loading = this.#loads.has(c.id);
    const failed = this.#loadErrors.has(c.id);
    const key = loading ? 'loading' : failed ? 'failed' : more > 0 ? `more:${String(more)}` : unloaded > 0 ? `load:${String(unloaded)}` : '';
    if (key === '') {
      view.extra?.button?.destroy();
      view.extra = null;
      return null;
    }
    if (view.extra?.key === key) return view.extra.el;
    view.extra?.button?.destroy();
    const doc = this.#doc;
    const li = doc.createElement('li');
    li.className = 'aui-discussion__extra';
    let button: Button | null = null;
    if (loading) {
      li.setAttribute('role', 'status');
      li.textContent = this.#m('loadingReplies');
    } else {
      const el = doc.createElement('button');
      el.type = 'button';
      el.className = 'aui-discussion__more-replies';
      if (failed) {
        const text = doc.createElement('span');
        text.className = 'aui-discussion__extra-error';
        text.textContent = this.#m('repliesFailed');
        el.textContent = this.#m('retry');
        li.append(text, doc.createTextNode(' '));
        view.group.listen(el, 'click', () => {
          this.#load(c);
          this.#render();
        });
      } else {
        const n = more > 0 ? more : unloaded;
        el.textContent = n === 1 ? this.#m('moreRepliesOne') : this.#m('moreReplies', { count: formatNumber(n, {}, config.locale) });
        view.group.listen(el, 'click', () => {
          const shown = this.#shownReplies.get(c.id) ?? config.repliesPageSize;
          const first = this.#replies(c.id)[shown];
          if (more > 0) this.#shownReplies.set(c.id, shown + config.repliesPageSize);
          else this.#load(c);
          this.#render();
          if (first) this.#views.get(first.id)?.article.focus();
        });
      }
      button = Button.enhance(el, { variant: 'ghost', size: 'sm' });
      li.append(el);
    }
    view.extra = { el: li, button, key };
    return li;
  }

  #view(c: DiscussionComment): CommentView {
    const existing = this.#views.get(c.id);
    if (existing) return existing;
    const doc = this.#doc;
    const li = doc.createElement('li');
    li.className = 'aui-discussion__item';
    li.dataset.id = c.id;
    const article = doc.createElement('article');
    const slot = doc.createElement('div');
    slot.className = 'aui-discussion__slot';
    const toggleEl = doc.createElement('button');
    toggleEl.type = 'button';
    toggleEl.className = 'aui-discussion__toggle';
    toggleEl.textContent = 'Replies';
    const toggle = Button.enhance(toggleEl, { variant: 'ghost', size: 'sm', icon: this.#icons().expand });
    const replies = doc.createElement('ul');
    replies.className = 'aui-discussion__replies';
    replies.setAttribute('role', 'list');
    replies.id = createId('aui-discussion-replies');
    toggleEl.setAttribute('aria-controls', replies.id);
    li.append(article, slot, toggleEl, replies);
    const view: CommentView = { li, slot, toggleEl, toggle, replies, article, time: null, text: null, group: new DisposableGroup(), buttons: [], avatar: null, signature: '', extra: null };
    // The toggle lives for the view's lifetime; the article's own listeners are in view.group.
    toggleEl.addEventListener('click', () => {
      const comment = this.#byId.get(c.id);
      if (comment) this.#setExpanded(c.id, !this.#isExpanded(comment, this.#depth(comment)), true);
    });
    this.#views.set(c.id, view);
    return view;
  }

  #buildArticle(view: CommentView, c: DiscussionComment, depth: number, parent: DiscussionComment | null, config: Config, icons: DiscussionIcons, signature: string): void {
    const doc = this.#doc;
    const focused = view.article.contains(doc.activeElement);
    view.group.dispose();
    view.group = new DisposableGroup();
    for (const b of view.buttons) b.destroy();
    view.buttons = [];
    view.avatar?.destroy();
    view.avatar = null;
    view.signature = signature;

    const article = doc.createElement('article');
    article.className = 'aui-discussion__comment';
    article.classList.toggle('aui-discussion__comment--deleted', c.deleted === true);
    article.classList.toggle('aui-discussion__comment--own', this.#own(c));
    article.tabIndex = -1;
    article.dataset.id = c.id;

    if (config.showAvatars) {
      const avatarHost = doc.createElement('div');
      avatarHost.className = 'aui-discussion__avatar';
      if (c.deleted === true) avatarHost.classList.add('aui-discussion__avatar--deleted');
      else view.avatar = Avatar.create(avatarHost, { name: c.author.name, size: 'sm', decorative: true, ...(c.author.avatar ? { src: c.author.avatar } : {}), ...(config.locale ? { locale: config.locale } : {}) });
      article.append(avatarHost);
    }

    const main = doc.createElement('div');
    main.className = 'aui-discussion__main';
    const meta = doc.createElement('div');
    meta.className = 'aui-discussion__meta';
    if (c.deleted !== true) {
      const name = doc.createElement('span');
      name.className = 'aui-discussion__author';
      name.textContent = c.author.name;
      meta.append(name);
      if (depth >= config.maxIndent && parent) {
        const to = doc.createElement('span');
        to.className = 'aui-discussion__replying';
        to.textContent = this.#m('replyingTo', { name: parent.author.name });
        meta.append(doc.createTextNode(' '), to);
      }
    }
    const time = doc.createElement('time');
    time.className = 'aui-discussion__time';
    time.dateTime = instantToString(c.createdAt);
    // Focusable so keyboard users get the absolute date and time too: a tooltip on hover and focus,
    // dismissed with Escape (WCAG 1.4.13).
    time.tabIndex = 0;
    const relativeEl = doc.createElement('span');
    relativeEl.className = 'aui-discussion__time-relative';
    const absoluteEl = doc.createElement('span');
    absoluteEl.className = 'aui-discussion__time-absolute';
    time.append(relativeEl, absoluteEl);
    view.group.listen(time, 'keydown', (event) => {
      if (event.key === 'Escape' && !time.classList.contains('aui-discussion__time--dismissed')) {
        event.preventDefault();
        time.classList.add('aui-discussion__time--dismissed');
      }
    });
    const restore = (): void => {
      time.classList.remove('aui-discussion__time--dismissed');
    };
    view.group.listen(time, 'blur', restore);
    view.group.listen(time, 'pointerleave', restore);
    meta.append(doc.createTextNode(' '), time);
    view.time = time;
    if (c.editedAt && c.deleted !== true) {
      const edited = doc.createElement('span');
      edited.className = 'aui-discussion__edited';
      edited.textContent = `(${this.#m('edited')})`;
      edited.title = this.#m('editedAt', { time: this.#absolute(c.editedAt, config) });
      meta.append(doc.createTextNode(' '), edited);
    }
    main.append(meta);

    const text = doc.createElement('p');
    text.className = 'aui-discussion__text';
    if (c.deleted === true) {
      text.classList.add('aui-discussion__text--deleted');
      text.textContent = this.#m('deleted');
    } else this.#renderText(text, c);
    main.append(text);
    view.text = text;

    const actions = this.#renderActions(view, c, icons);
    if (actions) main.append(actions);
    article.append(main);
    view.article.replaceWith(article);
    view.article = article;
    if (this.#panel?.id === c.id && this.#panel.kind === 'edit') text.hidden = true;
    if (focused) article.focus({ preventScroll: true });
  }

  #renderActions(view: CommentView, c: DiscussionComment, icons: DiscussionIcons): HTMLElement | null {
    const doc = this.#doc;
    const group = doc.createElement('div');
    group.className = 'aui-discussion__actions';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', this.#m('actions'));
    const add = (kind: 'reply' | 'edit' | 'delete', icon: IconRef, text: string, label: string, onClick: () => void): void => {
      const el = doc.createElement('button');
      el.type = 'button';
      el.className = `aui-discussion__action aui-discussion__action--${kind}`;
      el.textContent = text;
      if (label !== text) el.setAttribute('aria-label', label);
      view.buttons.push(Button.enhance(el, { variant: 'ghost', size: 'sm', icon }));
      view.group.listen(el, 'click', onClick);
      group.append(el);
    };
    const name = c.author.name;
    if (this.#canReply(c)) add('reply', icons.reply, this.#m('reply'), this.#m('replyTo', { name }), () => {
      this.#openPanel('reply', c.id);
    });
    if (this.#canEdit(c)) add('edit', icons.edit, this.#m('edit'), this.#m('editLabel', { name }), () => {
      this.#openPanel('edit', c.id);
    });
    if (this.#canDelete(c)) add('delete', icons.delete, this.#m('delete'), this.#m('deleteLabel', { name }), () => {
      this.#openPanel('confirm', c.id);
    });
    return group.childElementCount > 0 ? group : null;
  }

  /** Text with mention chips and safe links; everything else is text nodes. */
  #renderText(el: HTMLElement, c: DiscussionComment): void {
    const doc = this.#doc;
    const nodes: Node[] = [];
    const plain = (s: string): void => {
      let last = 0;
      for (const match of s.matchAll(URL_PATTERN)) {
        const raw = match[0];
        const url = raw.replace(TRAILING, '');
        const at = match.index;
        if (at > last) nodes.push(doc.createTextNode(s.slice(last, at)));
        if (url !== '' && isSafeHref(url, doc.baseURI)) {
          const a = doc.createElement('a');
          a.className = 'aui-discussion__link';
          a.href = url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer nofollow';
          a.textContent = url;
          nodes.push(a);
        } else nodes.push(doc.createTextNode(url));
        last = at + url.length;
      }
      if (last < s.length) nodes.push(doc.createTextNode(s.slice(last)));
    };
    let cursor = 0;
    for (const m of [...(c.mentions ?? [])].sort((a, b) => a.start - b.start)) {
      if (m.start > cursor) plain(c.text.slice(cursor, m.start));
      const chip = doc.createElement('span');
      chip.className = 'aui-discussion__mention';
      chip.dataset.id = m.id;
      chip.textContent = c.text.slice(m.start, m.end);
      nodes.push(chip);
      cursor = m.end;
    }
    if (cursor < c.text.length) plain(c.text.slice(cursor));
    el.replaceChildren(...nodes);
  }

  /** Relative time text, absolute tooltip, and the article's accessible name. */
  #paintTime(view: CommentView, c: DiscussionComment, config: Config): void {
    const relative = this.#relative(c.createdAt, config);
    const absolute = this.#absolute(c.createdAt, config);
    const rel = view.time?.children[0];
    const abs = view.time?.children[1];
    if (rel && rel.textContent !== relative) rel.textContent = relative;
    if (abs && abs.textContent !== absolute) abs.textContent = absolute;
    const parent = c.parentId === null ? undefined : this.#byId.get(c.parentId);
    const label = c.deleted === true
      ? this.#m('deletedLabel', { time: relative })
      : parent
        ? this.#m('replyLabel', { name: c.author.name, parent: parent.deleted === true ? this.#m('deleted') : parent.author.name, time: relative })
        : this.#m('commentLabel', { name: c.author.name, time: relative });
    view.article.setAttribute('aria-label', label);
  }

  #disposeViews(): void {
    for (const view of this.#views.values()) this.#disposeView(view);
    this.#views.clear();
  }

  #disposeView(view: CommentView): void {
    view.group.dispose();
    for (const b of view.buttons) b.destroy();
    view.buttons = [];
    view.avatar?.destroy();
    view.toggle.destroy();
    view.extra?.button?.destroy();
    view.extra = null;
    view.li.remove();
  }
}
