// Discussion showcase: comments on a company announcement, answered by a simulated server.
// A seeded thread six levels deep (deeper than the indentation cap), mentions with a people
// directory, a deleted comment kept as a placeholder because it has replies, replies loaded lazily,
// a character limit, and every post, reply, edit, and delete saved with a realistic delay. The
// server can be told to reject the next save; the comment is then rolled back. Nothing leaves the page.
import { instant, plainDate } from '@absoluteui/core';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import {
  Discussion,
  type DiscussionComment,
  type DiscussionDeleteDetail,
  type DiscussionEditDetail,
  type DiscussionPostDetail,
  type DiscussionReplyDetail,
} from '@absoluteui/components/discussion';
import type { MentionSuggestion } from '@absoluteui/components/mention-input';
import { action, choice, createShowcase, hostIn, toggle, wait } from './kit.js';

const sc = createShowcase({
  title: 'Discussion',
  description: 'Comments on a company announcement. Reply at any depth, type @ to mention someone, edit or delete your own comments (Ada Lovelace), and watch the character counter. Saves go to a simulated server.',
  simulated: true,
});

const people = {
  ada: { id: 'ada', name: 'Ada Lovelace' },
  grace: { id: 'grace', name: 'Grace Hopper' },
  alan: { id: 'alan', name: 'Alan Turing' },
  kat: { id: 'kat', name: 'Katherine Johnson' },
  linus: { id: 'linus', name: 'Linus Pauling' },
  rosalind: { id: 'rosalind', name: 'Rosalind Franklin' },
};
const DIRECTORY: readonly MentionSuggestion[] = Object.values(people).map((p) => ({ id: p.id, label: p.name, description: p.id === 'ada' ? 'You' : 'People team' }));

const now = Date.now();
const ago = (minutes: number): ReturnType<typeof instant> => instant(now - minutes * 60_000);
const mention = (text: string, person: { id: string; name: string }) => {
  const start = text.indexOf(`@${person.name}`);
  return { id: person.id, label: person.name, trigger: '@', start, end: start + person.name.length + 1 };
};

const t2 = 'Thanks @Grace Hopper. Does the new desk booking apply to part-time staff?';
const seeded: DiscussionComment[] = [
  { id: 'c1', parentId: null, author: people.grace, text: 'The office moves to the new building on 4 January. Desk booking opens next week: https://example.com/desks', createdAt: ago(60 * 30) },
  { id: 'c2', parentId: 'c1', author: people.ada, text: t2, mentions: [mention(t2, people.grace)], createdAt: ago(60 * 29) },
  { id: 'c3', parentId: 'c2', author: people.grace, text: 'Yes, booking works per day.', createdAt: ago(60 * 28) },
  { id: 'c4', parentId: 'c3', author: people.alan, text: 'Can we book a whole week at once?', createdAt: ago(60 * 5), editedAt: ago(60 * 4) },
  { id: 'c5', parentId: 'c4', author: people.grace, text: 'Not yet, it is on the roadmap.', createdAt: ago(90) },
  { id: 'c6', parentId: 'c5', author: people.ada, text: 'A recurring booking would help the finance team too.', createdAt: ago(45) },
  { id: 'c7', parentId: 'c6', author: people.kat, text: 'Agreed. Every Tuesday and Thursday for us.', createdAt: ago(20) },
  { id: 'c8', parentId: null, author: people.linus, text: '', deleted: true, createdAt: ago(60 * 26) },
  { id: 'c9', parentId: 'c8', author: people.rosalind, text: 'The comment above was removed, but this answer keeps its place in the thread.', createdAt: ago(60 * 25) },
  { id: 'c10', parentId: null, author: people.kat, text: 'Is there parking at the new building?', createdAt: ago(60 * 3), replyCount: 3 },
  { id: 'c11', parentId: null, author: people.ada, text: 'I will collect questions for the Friday Q&A. Reply here.', createdAt: ago(8) },
];

/** The simulated server: the comments it has stored. */
const server = new Map(seeded.map((c) => [c.id, c]));
let failNext = false;
const LAZY: readonly DiscussionComment[] = [
  { id: 'p1', parentId: 'c10', author: people.grace, text: 'Yes, 40 spaces on level -1.', createdAt: ago(150) },
  { id: 'p2', parentId: 'c10', author: people.alan, text: 'Are there chargers for electric cars?', createdAt: ago(120) },
  { id: 'p3', parentId: 'c10', author: people.grace, text: 'Six chargers, bookable like desks.', createdAt: ago(100) },
];

async function save(kind: string): Promise<void> {
  await wait(500 + Math.random() * 400);
  if (failNext) {
    failNext = false;
    throw new Error(`${kind} rejected`);
  }
}

const host = hostIn(sc.stage);
const discussion = Discussion.create(host, {
  label: 'Comments on: Office move',
  currentUser: people.ada,
  comments: seeded,
  maxLength: 280,
  // The seeded thread is six levels deep: show all of it (deeper threads still collapse).
  collapseDepth: 10,
  timezone: 'Europe/London',
  businessCalendar: createBusinessCalendar({ holidays: [{ date: plainDate(2026, 12, 25), name: 'Christmas Day', yearly: true }, { date: plainDate(2027, 1, 1), name: "New Year's Day", yearly: true }] }),
  triggers: [{
    char: '@',
    label: '@ for people',
    provider: async (query, { signal }) => {
      await wait(150, signal);
      const q = query.toLowerCase();
      return DIRECTORY.filter((p) => p.label.toLowerCase().includes(q));
    },
  }],
  loadReplies: async (comment, { signal }) => {
    sc.log('server', `GET /comments/${comment.id}/replies`);
    await wait(700, signal);
    return LAZY.filter((c) => c.parentId === comment.id);
  },
});
sc.listen(host, ['aui-post', 'aui-reply', 'aui-edit', 'aui-delete', 'aui-expand', 'aui-sort', 'aui-mention'], 'discussion');

// Optimistic saves: the component shows the change at once; a rejected save rolls it back.
const persist = (kind: string, apply: () => void, rollback: () => void): void => {
  apply();
  save(kind).then(
    () => {
      sc.log('server', `${kind} saved`);
    },
    (error: unknown) => {
      rollback();
      sc.log('server', error instanceof Error ? error.message : String(error));
    },
  );
};
host.addEventListener('aui-post', (e) => {
  const { comment } = (e as CustomEvent<DiscussionPostDetail>).detail;
  persist('POST comment', () => server.set(comment.id, comment), () => {
    server.delete(comment.id);
    discussion.removeComment(comment.id);
  });
});
host.addEventListener('aui-reply', (e) => {
  const { comment } = (e as CustomEvent<DiscussionReplyDetail>).detail;
  persist('POST reply', () => server.set(comment.id, comment), () => {
    server.delete(comment.id);
    discussion.removeComment(comment.id);
  });
});
host.addEventListener('aui-edit', (e) => {
  const { id, text, mentions, previous } = (e as CustomEvent<DiscussionEditDetail>).detail;
  persist('PATCH comment', () => server.set(id, { ...previous, text, mentions }), () => {
    server.set(id, previous);
    discussion.updateComment(id, { text: previous.text, mentions: previous.mentions ?? [], editedAt: previous.editedAt ?? null });
  });
});
host.addEventListener('aui-delete', (e) => {
  const { comment } = (e as CustomEvent<DiscussionDeleteDetail>).detail;
  const snapshot = discussion.comments;
  persist('DELETE comment', () => server.delete(comment.id), () => {
    server.set(comment.id, comment);
    discussion.update({ comments: snapshot });
  });
});

// Option bar: every control changes the discussion live.
choice(sc, 'Character limit', [{ value: '280', label: '280' }, { value: '80', label: '80' }, { value: '1000', label: '1000' }], '280', (v) => {
  discussion.update({ maxLength: Number(v) });
});
choice(sc, 'Indentation levels', [{ value: '4', label: '4' }, { value: '2', label: '2' }, { value: '6', label: '6' }], '4', (v) => {
  discussion.update({ maxIndent: Number(v) });
});
choice(sc, 'Composer', [{ value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }], 'top', (v) => {
  discussion.update({ composerPosition: v });
});
toggle(sc, 'Avatars', true, (on) => {
  discussion.update({ showAvatars: on });
});
toggle(sc, 'Signed in', true, (on) => {
  discussion.update({ currentUser: on ? people.ada : null });
});
toggle(sc, 'Reject next save', false, (on) => {
  failNext = on;
  sc.log('server', on ? 'the next save will be rejected' : 'saves succeed');
});
action(sc, 'New comment from Grace', () => {
  const text = 'Reminder: the Q&A is on Friday at 15:00.';
  discussion.addComment({ id: `g${String(Date.now())}`, parentId: 'c11', author: people.grace, text, createdAt: instant(Date.now()) });
  sc.log('server', 'push: new reply from Grace Hopper');
});
action(sc, 'Reload', () => {
  discussion.update({ status: 'loading' });
  void wait(800).then(() => {
    discussion.update({ status: 'ready', comments: [...server.values()] });
    sc.log('server', `GET /comments (${String(server.size)})`);
  });
});
