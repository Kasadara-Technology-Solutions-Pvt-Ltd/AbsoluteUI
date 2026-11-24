// R20-25 page: Discussion, bundled against the built packages.
import { configureAbsoluteUI, instant } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { Discussion, type DiscussionComment } from '@absoluteui/components/discussion';
import { Stack } from '@absoluteui/components/layout';

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default', direction: params.get('dir') === 'rtl' ? 'rtl' : 'ltr' });
if (params.get('dir') === 'rtl') document.documentElement.dir = 'rtl';
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

Stack.apply(byId('main'), { gap: 6 });

const ada = { id: 'ada', name: 'Ada Lovelace' };
const grace = { id: 'grace', name: 'Grace Hopper' };
const alan = { id: 'alan', name: 'Alan Turing' };
const kat = { id: 'kat', name: 'Katherine Johnson' };
const now = Date.now();
const ago = (minutes: number) => instant(now - minutes * 60_000);

// A thread six levels deep (deeper than maxIndent 4), a deleted comment with replies, mentions, and a link.
const comments: DiscussionComment[] = [
  { id: 'c1', parentId: null, author: grace, text: 'Draft of the onboarding checklist is ready. See https://example.com/checklist.', createdAt: ago(60 * 26) },
  { id: 'c2', parentId: 'c1', author: ada, text: 'Thanks @Grace Hopper, two notes on the laptop step.', mentions: [{ id: 'grace', label: 'Grace Hopper', trigger: '@', start: 7, end: 20 }], createdAt: ago(60 * 25) },
  { id: 'c3', parentId: 'c2', author: grace, text: 'Go ahead.', createdAt: ago(60 * 24) },
  { id: 'c4', parentId: 'c3', author: ada, text: 'IT needs two days of notice.', createdAt: ago(120), editedAt: ago(90) },
  { id: 'c5', parentId: 'c4', author: alan, text: 'Three days in December.', createdAt: ago(60) },
  { id: 'c6', parentId: 'c5', author: ada, text: 'Noted, I will add that.', createdAt: ago(30) },
  { id: 'c7', parentId: null, author: kat, text: '', deleted: true, createdAt: ago(50) },
  { id: 'c8', parentId: 'c7', author: grace, text: 'This reply keeps the deleted comment as a placeholder.', createdAt: ago(40) },
  { id: 'c9', parentId: null, author: alan, text: 'Can we add the payroll form?', createdAt: ago(5) },
];

const log = byId('discussion-log');
const record = (name: string) => (): void => {
  log.textContent = name;
};

const thread = Discussion.create(byId('discussion-thread'), {
  label: 'Onboarding checklist',
  currentUser: ada,
  comments,
  maxLength: 120,
  collapseDepth: 10,
  maxIndent: 4,
  timezone: 'Europe/London',
});
for (const name of ['aui-post', 'aui-reply', 'aui-edit', 'aui-delete', 'aui-expand', 'aui-sort', 'aui-mention']) thread.host.addEventListener(name, record(name));

// Lazy replies (read-only: no current user).
Discussion.create(byId('discussion-lazy'), {
  label: 'Announcement comments',
  comments: [{ id: 'l1', parentId: null, author: grace, text: 'Office closed on Friday.', createdAt: ago(300), replyCount: 2 }],
  loadReplies: (comment) => Promise.resolve([
    { id: 'l2', parentId: comment.id, author: alan, text: 'Thanks for the heads-up.', createdAt: ago(200) },
    { id: 'l3', parentId: comment.id, author: kat, text: 'Is the parking open?', createdAt: ago(100) },
  ]),
  collapseDepth: 1,
});

Discussion.create(byId('discussion-empty'), { label: 'Empty discussion', currentUser: ada, maxLength: 50 });
Discussion.create(byId('discussion-error'), { label: 'Failed discussion', status: 'error' });

Object.assign(window, { __auiReady: true, __discussion: thread });
