import { afterEach, describe, expect, it, vi } from 'vitest';
import { AbsoluteUIError, configureAbsoluteUI, instant, plainDate, resetAbsoluteUIConfig } from '@absoluteui/core';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import {
  Discussion,
  type DiscussionComment,
  type DiscussionDeleteDetail,
  type DiscussionEditDetail,
  type DiscussionExpandDetail,
  type DiscussionLoadContext,
  type DiscussionOptions,
  type DiscussionPostDetail,
  type DiscussionReplyDetail,
  type DiscussionSortDetail,
} from '@absoluteui/components/discussion';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const NOW = Date.UTC(2026, 10, 23, 12, 0);
const ago = (minutes: number): ReturnType<typeof instant> => instant(NOW - minutes * 60_000);
const ada = { id: 'ada', name: 'Ada Lovelace' };
const grace = { id: 'grace', name: 'Grace Hopper' };
const alan = { id: 'alan', name: 'Alan Turing' };

/** A chain c1 -> c2 -> ... -> c<depth> plus a second top-level comment. */
function chain(depth: number): DiscussionComment[] {
  const out: DiscussionComment[] = [];
  for (let i = 1; i <= depth; i++) out.push({ id: `c${String(i)}`, parentId: i === 1 ? null : `c${String(i - 1)}`, author: i % 2 === 0 ? ada : grace, text: `Level ${String(i)}`, createdAt: ago(100 - i) });
  out.push({ id: 'top2', parentId: null, author: alan, text: 'Second topic', createdAt: ago(10) });
  return out;
}

function mount(options: Partial<DiscussionOptions> = {}): Discussion {
  const host = document.createElement('div');
  document.body.append(host);
  return Discussion.create(host, { label: 'Comments', currentUser: ada, now: instant(NOW), timezone: 'UTC', locale: 'en-US', collapseDepth: 50, ...options });
}

const article = (d: Discussion, id: string): HTMLElement => d.host.querySelector<HTMLElement>(`article[data-id="${id}"]`)!;
const action = (d: Discussion, id: string, kind: 'reply' | 'edit' | 'delete'): HTMLButtonElement | null => article(d, id).querySelector<HTMLButtonElement>(`.aui-discussion__action--${kind}`) ?? null;
const type = (input: HTMLTextAreaElement, text: string): void => {
  input.value = text;
  input.setSelectionRange(text.length, text.length);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const ctrlEnter = (el: HTMLElement): void => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
};

describe('Discussion', () => {
  it('is a named region with nested lists of articles named by author, parent, and time', () => {
    const d = mount({ comments: chain(2) });
    expect(d.host.getAttribute('role')).toBe('region');
    const title = document.getElementById(d.host.getAttribute('aria-labelledby')!)!;
    expect(title.textContent).toBe('Comments');
    expect(title.localName).toBe('h3');
    expect(d.host.querySelector('.aui-discussion__count')!.textContent).toBe('3 comments');
    const thread = d.host.querySelector('ul.aui-discussion__thread')!;
    expect(thread.getAttribute('role')).toBe('list');
    expect(article(d, 'c1').getAttribute('aria-label')).toBe('Comment by Grace Hopper, 2 hours ago');
    expect(article(d, 'c2').getAttribute('aria-label')).toBe('Reply by Ada Lovelace to Grace Hopper, 2 hours ago');
    // The reply is inside the parent's nested list.
    expect(article(d, 'c2').closest('ul.aui-discussion__replies')!.closest('li')!.dataset.id).toBe('c1');
  });

  it('shows author, avatar, a relative time, and the absolute time in a <time datetime>', () => {
    const d = mount({ comments: [{ id: 'a', parentId: null, author: grace, text: 'Hi', createdAt: ago(5), editedAt: ago(2) }] });
    const a = article(d, 'a');
    expect(a.querySelector('.aui-discussion__author')!.textContent).toBe('Grace Hopper');
    expect(a.querySelector('.aui-avatar')).not.toBeNull();
    const time = a.querySelector('time')!;
    expect(time.dateTime).toContain('2026-11-23T11:55');
    expect(time.querySelector('.aui-discussion__time-relative')!.textContent).toBe('5 minutes ago');
    expect(time.querySelector('.aui-discussion__time-absolute')!.textContent).toMatch(/Monday, November 23, 2026 at 11:55\sAM/);
    expect(time.tabIndex).toBe(0);
    expect(a.querySelector('.aui-discussion__edited')!.textContent).toBe('(edited)');
  });

  it('describes times as just now, minutes, Yesterday, a weekday, then a date', () => {
    const d = mount({
      comments: [
        { id: 'now', parentId: null, author: grace, text: 'a', createdAt: instant(NOW - 10_000) },
        { id: 'y', parentId: null, author: grace, text: 'b', createdAt: instant(Date.UTC(2026, 10, 22, 9)) },
        { id: 'w', parentId: null, author: grace, text: 'c', createdAt: instant(Date.UTC(2026, 10, 19, 9)) },
        { id: 'old', parentId: null, author: grace, text: 'd', createdAt: instant(Date.UTC(2026, 8, 1, 9)) },
      ],
    });
    const rel = (id: string): string => article(d, id).querySelector('.aui-discussion__time-relative')!.textContent;
    expect(rel('now')).toBe('just now');
    expect(rel('y')).toBe('Yesterday');
    expect(rel('w')).toBe('Thursday');
    expect(rel('old')).toBe('Sep 1');
  });

  it('names holidays in the absolute time with a business calendar', () => {
    const d = mount({
      businessCalendar: createBusinessCalendar({ holidays: [{ date: plainDate(2026, 11, 20), name: 'Founders Day' }] }),
      comments: [{ id: 'h', parentId: null, author: grace, text: 'x', createdAt: instant(Date.UTC(2026, 10, 20, 9)) }],
    });
    expect(article(d, 'h').querySelector('.aui-discussion__time-absolute')!.textContent).toContain('(Founders Day)');
  });

  it('nests replies to any depth and stops indenting at maxIndent with "Replying to"', () => {
    const d = mount({ comments: chain(8), maxIndent: 3 });
    expect(article(d, 'c8')).not.toBeNull();
    const depth = (id: string): number => Number(article(d, id).closest('li')!.dataset.depth);
    expect(depth('c8')).toBe(7);
    expect(article(d, 'c3').querySelector('.aui-discussion__replying')).toBeNull();
    expect(article(d, 'c4').querySelector('.aui-discussion__replying')!.textContent).toBe('Replying to Grace Hopper');
    expect(article(d, 'c3').closest('li')!.querySelector(':scope > ul')!.classList.contains('aui-discussion__replies--flat')).toBe(true);
    expect(article(d, 'c2').closest('li')!.querySelector(':scope > ul')!.classList.contains('aui-discussion__replies--flat')).toBe(false);
  });

  it('collapses deep threads by default and expands them with a disclosure button', () => {
    const d = mount({ comments: chain(5), collapseDepth: 2 });
    const expanded: DiscussionExpandDetail[] = [];
    d.host.addEventListener('aui-expand', (e) => expanded.push((e as CustomEvent<DiscussionExpandDetail>).detail));
    expect(article(d, 'c3')).not.toBeNull();
    expect(article(d, 'c4')).toBeNull();
    const toggle = article(d, 'c3').closest('li')!.querySelector<HTMLButtonElement>(':scope > .aui-discussion__toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    // The count is what one click reveals: c3's direct reply only (c5 stays behind c4's toggle) (regression).
    expect(toggle.textContent).toBe('Show 1 reply');
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).not.toBeNull();
    toggle.click();
    expect(article(d, 'c4')).not.toBeNull();
    // collapseDepth applies per level: c4 (depth 3) keeps its own replies collapsed until expanded.
    expect(article(d, 'c5')).toBeNull();
    const inner = article(d, 'c4').closest('li')!.querySelector<HTMLButtonElement>(':scope > .aui-discussion__toggle')!;
    expect(inner.getAttribute('aria-expanded')).toBe('false');
    expect(inner.textContent).toBe('Show 1 reply');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toBe('Hide replies');
    expect(document.activeElement).toBe(article(d, 'c4'));
    expect(expanded).toEqual([{ id: 'c3', expanded: true }]);
    inner.click();
    expect(article(d, 'c5')).not.toBeNull();
    expect(document.activeElement).toBe(article(d, 'c5'));
    expect(expanded).toEqual([{ id: 'c3', expanded: true }, { id: 'c4', expanded: true }]);
  });

  it('pages top-level comments and replies with Show more', () => {
    const comments: DiscussionComment[] = [];
    for (let i = 0; i < 7; i++) comments.push({ id: `t${String(i)}`, parentId: null, author: grace, text: `T${String(i)}`, createdAt: ago(100 - i) });
    for (let i = 0; i < 4; i++) comments.push({ id: `r${String(i)}`, parentId: 't0', author: alan, text: `R${String(i)}`, createdAt: ago(50 - i) });
    const d = mount({ comments, pageSize: 5, repliesPageSize: 2 });
    expect(d.host.querySelectorAll('.aui-discussion__thread > li')).toHaveLength(5);
    const more = d.host.querySelector<HTMLButtonElement>('.aui-discussion__more')!;
    expect(more.textContent).toBe('Show more comments (2)');
    more.click();
    expect(d.host.querySelectorAll('.aui-discussion__thread > li')).toHaveLength(7);
    expect(more.hidden).toBe(true);
    const moreReplies = d.host.querySelector<HTMLButtonElement>('.aui-discussion__more-replies')!;
    expect(moreReplies.textContent).toBe('Show 2 more replies');
    moreReplies.click();
    expect(article(d, 'r3')).not.toBeNull();
    expect(document.activeElement).toBe(article(d, 'r2'));
  });

  it('sorts top-level comments oldest or newest first and keeps replies in order', () => {
    const d = mount({ comments: chain(3) });
    const first = (): string => d.host.querySelector<HTMLElement>('.aui-discussion__thread > li')!.dataset.id!;
    expect(first()).toBe('c1');
    const sorts: string[] = [];
    d.host.addEventListener('aui-sort', (e) => sorts.push((e as CustomEvent<DiscussionSortDetail>).detail.sort));
    const newest = [...d.host.querySelectorAll<HTMLButtonElement>('.aui-discussion__sort button')].find((b) => b.textContent === 'Newest')!;
    newest.click();
    expect(first()).toBe('top2');
    expect(sorts).toEqual(['newest']);
    d.update({ sort: 'oldest' });
    expect(first()).toBe('c1');
  });

  it('posts a top-level comment with mentions on Ctrl+Enter and keeps focus in the box', () => {
    const d = mount({ comments: chain(1) });
    const posts: DiscussionPostDetail[] = [];
    d.host.addEventListener('aui-post', (e) => posts.push((e as CustomEvent<DiscussionPostDetail>).detail));
    const box = d.composer!.input as HTMLTextAreaElement;
    box.focus();
    d.composer!.setValue({ text: 'Hi @Grace Hopper ', mentions: [{ id: 'grace', label: 'Grace Hopper', trigger: '@', start: 3, end: 16 }] });
    ctrlEnter(box);
    expect(posts).toHaveLength(1);
    const posted = posts[0]!.comment;
    expect(posted).toMatchObject({ parentId: null, author: { id: 'ada', name: 'Ada Lovelace' }, text: 'Hi @Grace Hopper' });
    expect(posted.mentions).toEqual([{ id: 'grace', label: 'Grace Hopper', trigger: '@', start: 3, end: 16 }]);
    expect(d.comments.some((c) => c.id === posted.id)).toBe(true);
    expect(article(d, posted.id).querySelector('.aui-discussion__mention')!.textContent).toBe('@Grace Hopper');
    expect(box.value).toBe('');
    expect(document.activeElement).toBe(box);
  });

  it('a prevented aui-post adds nothing and keeps the text', () => {
    const d = mount();
    d.host.addEventListener('aui-post', (e) => {
      e.preventDefault();
    });
    const box = d.composer!.input as HTMLTextAreaElement;
    type(box, 'Pending');
    d.host.querySelector<HTMLButtonElement>('.aui-discussion__post')!.click();
    expect(d.comments).toHaveLength(0);
    expect(box.value).toBe('Pending');
  });

  it('blocks empty and over-limit posts, shows the error, and shows the counter on every composer', () => {
    const d = mount({ comments: chain(1), maxLength: 10 });
    const posts: unknown[] = [];
    d.host.addEventListener('aui-post', (e) => posts.push(e));
    const box = d.composer!.input as HTMLTextAreaElement;
    const error = (): string => d.host.querySelector('.aui-discussion__composer .aui-field__error')!.textContent;
    d.host.querySelector<HTMLButtonElement>('.aui-discussion__post')!.click();
    expect(error()).toBe('Write something before posting.');
    type(box, 'This is far too long');
    d.host.querySelector<HTMLButtonElement>('.aui-discussion__post')!.click();
    expect(error()).toBe('Enter 10 characters or fewer.');
    expect(box.getAttribute('aria-invalid')).toBe('true');
    expect(posts).toHaveLength(0);
    expect(d.host.querySelector('.aui-discussion__composer .aui-field__counter')!.textContent).toBe('10 characters too many');
    action(d, 'c1', 'reply')!.click();
    expect(d.host.querySelector('.aui-discussion__inline .aui-field__counter')!.textContent).toBe('10 characters remaining');
  });

  it('replies at any depth: Escape cancels and keeps a draft, Ctrl+Enter posts and focuses the reply', () => {
    const d = mount({ comments: chain(6) });
    const replies: DiscussionReplyDetail[] = [];
    d.host.addEventListener('aui-reply', (e) => replies.push((e as CustomEvent<DiscussionReplyDetail>).detail));
    action(d, 'c6', 'reply')!.click();
    let box = d.host.querySelector<HTMLTextAreaElement>('.aui-discussion__inline--reply textarea')!;
    expect(document.activeElement).toBe(box);
    expect(d.host.querySelector('.aui-discussion__inline--reply label')!.textContent).toContain('Reply to Ada Lovelace');
    type(box, 'Draft');
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(d.host.querySelector('.aui-discussion__inline')).toBeNull();
    expect(document.activeElement).toBe(action(d, 'c6', 'reply'));
    action(d, 'c6', 'reply')!.click();
    box = d.host.querySelector<HTMLTextAreaElement>('.aui-discussion__inline--reply textarea')!;
    expect(box.value).toBe('Draft');
    type(box, 'Deep reply');
    ctrlEnter(box);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.parent.id).toBe('c6');
    const id = replies[0]!.comment.id;
    expect(Number(article(d, id).closest('li')!.dataset.depth)).toBe(6);
    expect(document.activeElement).toBe(article(d, id));
  });

  it('edits own comments in the same composer and marks them edited', () => {
    const d = mount({ comments: chain(2) });
    expect(action(d, 'c1', 'edit')).toBeNull();
    const edits: DiscussionEditDetail[] = [];
    d.host.addEventListener('aui-edit', (e) => edits.push((e as CustomEvent<DiscussionEditDetail>).detail));
    action(d, 'c2', 'edit')!.click();
    const box = d.host.querySelector<HTMLTextAreaElement>('.aui-discussion__inline--edit textarea')!;
    expect(box.value).toBe('Level 2');
    expect(article(d, 'c2').querySelector<HTMLElement>('.aui-discussion__text')!.hidden).toBe(true);
    type(box, 'Level 2, revised');
    d.host.querySelector<HTMLButtonElement>('.aui-discussion__inline--edit .aui-discussion__submit')!.click();
    expect(edits[0]).toMatchObject({ id: 'c2', text: 'Level 2, revised' });
    expect(article(d, 'c2').querySelector('.aui-discussion__text')!.textContent).toBe('Level 2, revised');
    expect(article(d, 'c2').querySelector('.aui-discussion__edited')).not.toBeNull();
    expect(document.activeElement).toBe(article(d, 'c2'));
  });

  it('deletes after an inline confirmation: a placeholder with replies, removal without', () => {
    const comments: DiscussionComment[] = [
      { id: 'p', parentId: null, author: ada, text: 'Parent', createdAt: ago(30) },
      { id: 'r', parentId: 'p', author: grace, text: 'Reply', createdAt: ago(20) },
      { id: 'mine', parentId: null, author: ada, text: 'Mine', createdAt: ago(10) },
    ];
    const d = mount({ comments });
    const deletes: DiscussionDeleteDetail[] = [];
    d.host.addEventListener('aui-delete', (e) => deletes.push((e as CustomEvent<DiscussionDeleteDetail>).detail));
    expect(action(d, 'r', 'delete')).toBeNull();
    action(d, 'p', 'delete')!.click();
    const confirm = d.host.querySelector<HTMLElement>('.aui-discussion__confirm')!;
    expect(confirm.getAttribute('role')).toBe('group');
    expect(document.getElementById(confirm.getAttribute('aria-labelledby')!)!.textContent).toBe('Delete this comment?');
    expect(document.activeElement).toBe(d.host.querySelector('.aui-discussion__confirm-cancel'));
    d.host.querySelector<HTMLButtonElement>('.aui-discussion__confirm-delete')!.click();
    expect(deletes[0]).toMatchObject({ comment: { id: 'p' }, placeholder: true });
    expect(article(d, 'p').querySelector('.aui-discussion__text')!.textContent).toBe('This comment was deleted.');
    expect(article(d, 'p').getAttribute('aria-label')).toBe('Deleted comment, 30 minutes ago');
    expect(document.activeElement).toBe(article(d, 'p'));
    action(d, 'mine', 'delete')!.click();
    d.host.querySelector<HTMLButtonElement>('.aui-discussion__confirm-delete')!.click();
    expect(article(d, 'mine')).toBeNull();
    expect(deletes[1]).toMatchObject({ placeholder: false });
  });

  it('Escape or a prevented aui-delete keeps the comment', () => {
    const d = mount({ comments: [{ id: 'm', parentId: null, author: ada, text: 'Mine', createdAt: ago(1) }] });
    action(d, 'm', 'delete')!.click();
    d.host.querySelector('.aui-discussion__confirm')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(d.host.querySelector('.aui-discussion__confirm')).toBeNull();
    expect(document.activeElement).toBe(action(d, 'm', 'delete'));
    d.host.addEventListener('aui-delete', (e) => {
      e.preventDefault();
    });
    action(d, 'm', 'delete')!.click();
    d.host.querySelector<HTMLButtonElement>('.aui-discussion__confirm-delete')!.click();
    expect(article(d, 'm')).not.toBeNull();
  });

  it('removeComment removes deleted ancestors left without replies', () => {
    const d = mount({
      comments: [
        { id: 'gone', parentId: null, author: grace, text: '', deleted: true, createdAt: ago(30) },
        { id: 'only', parentId: 'gone', author: alan, text: 'Only reply', createdAt: ago(20) },
      ],
    });
    expect(article(d, 'gone')).not.toBeNull();
    d.removeComment('only');
    expect(d.comments).toHaveLength(0);
    expect(d.host.querySelector('.aui-empty-state')).not.toBeNull();
  });

  it('hides deleted comments without replies', () => {
    const d = mount({ comments: [{ id: 'x', parentId: null, author: grace, text: '', deleted: true, createdAt: ago(5) }] });
    expect(article(d, 'x')).toBeNull();
  });

  it('honors canEdit and canDelete hooks, and is read-only without a current user', () => {
    const d = mount({ comments: chain(1), canDelete: () => true, canEdit: () => false });
    expect(action(d, 'c1', 'delete')).not.toBeNull();
    expect(action(d, 'c1', 'edit')).toBeNull();
    d.update({ currentUser: null });
    expect(action(d, 'c1', 'reply')).toBeNull();
    expect(action(d, 'c1', 'delete')).toBeNull();
    expect(d.composer).toBeNull();
    expect(d.host.querySelector<HTMLElement>('.aui-discussion__composer')!.hidden).toBe(true);
  });

  it('renders text safely: mention chips, http(s) links only, no HTML', () => {
    const d = mount({ comments: [{ id: 's', parentId: null, author: grace, text: '<img src=x onerror=alert(1)> see https://example.com/a. and javascript:alert(1)', createdAt: ago(1) }] });
    const text = article(d, 's').querySelector('.aui-discussion__text')!;
    expect(text.querySelector('img')).toBeNull();
    const links = text.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute('href')).toBe('https://example.com/a');
    expect(links[0]!.rel).toBe('noopener noreferrer nofollow');
    expect(text.textContent).toContain('javascript:alert(1)');
  });

  it('loads lazy replies when a collapsed thread is expanded', async () => {
    const loader = vi.fn<(comment: DiscussionComment, context: DiscussionLoadContext) => Promise<DiscussionComment[]>>((comment) => Promise.resolve([{ id: 'l1', parentId: comment.id, author: alan, text: 'Loaded', createdAt: ago(1) }]));
    const d = mount({ comments: [{ id: 't', parentId: null, author: grace, text: 'Thread', createdAt: ago(9), replyCount: 1 }], loadReplies: loader });
    const toggle = article(d, 't').closest('li')!.querySelector<HTMLButtonElement>(':scope > .aui-discussion__toggle')!;
    expect(toggle.textContent).toBe('Show 1 reply');
    toggle.click();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader.mock.calls[0]![1]).toMatchObject({ loaded: 0 });
    expect(d.host.querySelector('.aui-discussion__extra')!.textContent).toBe('Loading replies\u2026');
    await vi.waitFor(() => {
      expect(article(d, 'l1')).not.toBeNull();
    });
  });

  it('shows a load error with Retry', async () => {
    const loader = vi.fn(() => Promise.reject(new Error('down')));
    const d = mount({ comments: [{ id: 't', parentId: null, author: grace, text: 'Thread', createdAt: ago(9), replyCount: 3 }], loadReplies: loader });
    d.expand('t');
    await vi.waitFor(() => {
      expect(d.host.querySelector('.aui-discussion__extra-error')!.textContent).toBe('Replies could not be loaded.');
    });
    d.host.querySelector<HTMLButtonElement>('.aui-discussion__more-replies')!.click();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('shows empty, loading, and error states', () => {
    const d = mount();
    expect(d.host.querySelector('.aui-empty-state')!.textContent).toContain('No comments yet');
    d.update({ status: 'loading' });
    expect(d.host.querySelector('.aui-discussion__status')!.textContent).toContain('Loading comments');
    const retries: unknown[] = [];
    d.host.addEventListener('aui-retry', (e) => retries.push(e));
    d.update({ status: 'error', errorText: 'Offline.' });
    expect(d.host.querySelector('.aui-discussion__status')!.getAttribute('role')).toBe('alert');
    d.host.querySelector<HTMLButtonElement>('.aui-discussion__retry')!.click();
    expect(retries).toHaveLength(1);
  });

  it('addComment and updateComment change the model; others are announced', () => {
    const d = mount({ comments: chain(1) });
    d.addComment({ id: 'n', parentId: 'c1', author: grace, text: 'New', createdAt: ago(0) });
    expect(article(d, 'n')).not.toBeNull();
    d.updateComment('n', { text: 'Changed', editedAt: ago(0) });
    expect(article(d, 'n').querySelector('.aui-discussion__text')!.textContent).toBe('Changed');
    expect(() => {
      d.addComment({ id: 'z', parentId: 'missing', author: grace, text: 'x', createdAt: ago(0) });
    }).toThrow(AbsoluteUIError);
  });

  it('focusComment reveals collapsed and paged-out comments', () => {
    const d = mount({ comments: chain(6), collapseDepth: 1 });
    expect(article(d, 'c6')).toBeNull();
    d.focusComment('c6');
    expect(document.activeElement).toBe(article(d, 'c6'));
  });

  it('Page Down and Page Up move between comments', () => {
    const d = mount({ comments: chain(2) });
    article(d, 'c1').focus();
    article(d, 'c1').dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(article(d, 'c2'));
    article(d, 'c2').dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(article(d, 'c1'));
  });

  it('validates options before touching the host and keeps state on an invalid update', () => {
    const host = document.createElement('div');
    host.textContent = 'keep';
    const bad: unknown[] = [
      { label: '' },
      { label: 'x', comments: [{ id: 'a', parentId: 'b', author: ada, text: '', createdAt: ago(1) }] },
      { label: 'x', comments: [{ id: 'a', parentId: 'b', author: ada, text: '', createdAt: ago(1) }, { id: 'b', parentId: 'a', author: ada, text: '', createdAt: ago(1) }] },
      { label: 'x', comments: [{ id: 'a', parentId: null, author: ada, text: 'hi', mentions: [{ id: 'u', label: 'Bob', trigger: '@', start: 0, end: 4 }], createdAt: ago(1) }] },
      { label: 'x', showCounter: true },
      { label: 'x', comments: [{ id: 'a', parentId: null, author: { id: '', name: 'A' }, text: '', createdAt: ago(1) }] },
    ];
    for (const options of bad) {
      expect(() => Discussion.create(host, options as DiscussionOptions)).toThrow(AbsoluteUIError);
      expect(host.textContent).toBe('keep');
    }
    const d = mount({ comments: chain(1) });
    expect(() => {
      d.update({ maxIndent: 0 });
    }).toThrow();
    expect(article(d, 'c1')).not.toBeNull();
  });

  it('follows global configuration', () => {
    configureAbsoluteUI({ components: { discussion: { sort: 'newest', headingLevel: 2, showAvatars: false } } });
    const d = mount({ comments: chain(1) });
    expect(d.host.querySelector('.aui-discussion__title')!.localName).toBe('h2');
    expect(d.host.querySelector<HTMLElement>('.aui-discussion__thread > li')!.dataset.id).toBe('top2');
    expect(d.host.querySelector('.aui-avatar')).toBeNull();
  });

  it('destroy removes everything', () => {
    const d = mount({ comments: chain(2) });
    d.destroy();
    expect(d.host.childElementCount).toBe(0);
    expect(d.host.classList.contains('aui-discussion')).toBe(false);
    expect(d.host.hasAttribute('role')).toBe(false);
  });
});
