import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, instant, plainDate, resetAbsoluteUIConfig } from '@absoluteui/core';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import { Timeline, type TimelineActionDetail, type TimelineItem, type TimelineLoadMoreDetail, type TimelineOptions, type TimelineToggleDetail } from '@absoluteui/components/timeline';

// Fixed instants (testing convention 2): Monday 23 November 2026, 15:00 UTC.
const NOW = Date.UTC(2026, 10, 23, 15);
const H = 3_600_000;

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const items: TimelineItem[] = [
  { id: 'a4', title: 'Policy approved', tone: 'success', time: instant(NOW - H), actions: [{ id: 'open', label: 'Open' }] },
  { id: 'a3', title: 'Review requested', tone: 'info', time: instant(NOW - 5 * H), href: '/reviews/3' },
  { id: 'a2', title: 'Comment added', time: instant(NOW - 26 * H), avatar: { name: 'Ada Lovelace' }, description: 'Looks good.' },
  { id: 'a1', title: 'Draft uploaded', tone: 'warning', status: 'Virus scan pending', time: instant(NOW - 75 * H) },
];

function mount(options: Partial<TimelineOptions> = {}): Timeline {
  const host = document.createElement('div');
  document.body.append(host);
  return Timeline.create(host, { label: 'Document activity', items, now: instant(NOW), timezone: 'UTC', locale: 'en-GB', ...options });
}

describe('Timeline', () => {
  it('renders an ordered list grouped by day with headings and nested lists', () => {
    const t = mount();
    const list = t.host.querySelector('ol.aui-timeline__list')!;
    expect(list.getAttribute('aria-label')).toBe('Document activity');
    const days = [...t.host.querySelectorAll('.aui-timeline__day')].map((d) => d.textContent);
    expect(days).toEqual(['Today', 'Yesterday', 'Friday 20 Nov']);
    const firstGroup = t.host.querySelector('.aui-timeline__group')!;
    const nested = firstGroup.querySelector('ol')!;
    expect(nested.getAttribute('aria-labelledby')).toBe(firstGroup.querySelector('h3')!.id);
    expect(nested.querySelectorAll('li.aui-timeline__item')).toHaveLength(2);
  });

  it('shows tone by icon and a status word, never color only', () => {
    const t = mount();
    const success = t.host.querySelector('[data-id="a4"]')!;
    expect(success.classList.contains('aui-timeline__item--success')).toBe(true);
    expect(success.querySelector('.aui-timeline__marker')!.getAttribute('aria-hidden')).toBe('true');
    expect(success.querySelector('.aui-timeline__marker svg')).not.toBeNull();
    expect(success.querySelector('.aui-timeline__status')!.textContent).toBe('Success');
    expect(t.host.querySelector('[data-id="a1"] .aui-timeline__status')!.textContent).toBe('Virus scan pending');
    expect(t.host.querySelector('[data-id="a2"] .aui-timeline__status')).toBeNull();
    expect(t.host.querySelector('[data-id="a2"] .aui-avatar')).not.toBeNull();
  });

  it('formats absolute and relative times with datetime and a full title, in the configured zone', () => {
    const t = mount();
    const time = t.host.querySelector<HTMLTimeElement>('[data-id="a4"] time')!;
    expect(time.dateTime).toBe('2026-11-23T14:00:00.000Z');
    expect(time.textContent).toBe('14:00');
    expect(time.title).toContain('2026');
    t.update({ timeFormat: 'relative' });
    expect(t.host.querySelector('[data-id="a4"] time')!.textContent).toBe('1 hour ago');
    t.update({ timezone: 'Asia/Kolkata', timeFormat: 'absolute' });
    expect(t.host.querySelector('[data-id="a4"] time')!.textContent).toBe('19:30');
  });

  it('all-day PlainDate items and undated items', () => {
    const t = mount({ items: [{ id: 'd', title: 'Holiday', time: plainDate(2026, 11, 23) }, { id: 'u', title: 'Someday' }] });
    expect(t.host.querySelector('[data-id="d"] time')!.textContent).toBe('All day');
    expect(t.host.querySelector<HTMLTimeElement>('[data-id="d"] time')!.dateTime).toBe('2026-11-23');
    const days = [...t.host.querySelectorAll('.aui-timeline__day')].map((d) => d.textContent);
    expect(days).toEqual(['Today', 'No date']);
  });

  it('names holidays and non-working days with a business calendar', () => {
    const calendar = createBusinessCalendar({ holidays: [{ name: 'Founders Day', date: plainDate(2026, 11, 20) }] });
    const t = mount({
      businessCalendar: calendar,
      items: [{ id: 'sat', title: 'Weekend deploy', time: instant(Date.UTC(2026, 10, 21, 10)) }, { id: 'fri', title: 'Holiday note', time: instant(Date.UTC(2026, 10, 20, 10)) }],
    });
    const days = [...t.host.querySelectorAll('.aui-timeline__day')].map((d) => d.textContent);
    expect(days).toEqual(['Saturday 21 Nov (non-working day)', 'Friday 20 Nov (Founders Day)']);
  });

  it('groupByDay false renders a flat list with full dates', () => {
    configureAbsoluteUI({ components: { timeline: { groupByDay: false } } });
    const t = mount();
    expect(t.host.querySelector('.aui-timeline__group')).toBeNull();
    expect(t.host.querySelectorAll('ol.aui-timeline__list > li.aui-timeline__item')).toHaveLength(4);
    expect(t.host.querySelector('[data-id="a4"] time')!.textContent).toContain('2026');
  });

  it('action listeners survive the render that created them and later re-renders (regression)', () => {
    const t = mount();
    const details: TimelineActionDetail[] = [];
    t.host.addEventListener('aui-action', (e) => details.push((e as CustomEvent<TimelineActionDetail>).detail));
    const action = (): HTMLButtonElement => t.host.querySelector<HTMLButtonElement>('[data-id="a4"] .aui-timeline__actions button')!;
    action().click();
    configureAbsoluteUI({ components: { timeline: { groupByDay: false } } });
    action().click();
    expect(details.map((d) => d.actionId)).toEqual(['open', 'open']);
  });

  it('actions are buttons in a group named by the item and emit aui-action', async () => {
    const t = mount();
    const details: TimelineActionDetail[] = [];
    t.host.addEventListener('aui-action', (e) => details.push((e as CustomEvent<TimelineActionDetail>).detail));
    const group = t.host.querySelector('[data-id="a4"] .aui-timeline__actions')!;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Policy approved');
    await userEvent.click(group.querySelector('button')!);
    expect(details[0]).toMatchObject({ itemId: 'a4', actionId: 'open' });
    expect(t.host.querySelector<HTMLAnchorElement>('[data-id="a3"] a.aui-timeline__title')!.getAttribute('href')).toBe('/reviews/3');
  });

  it('collapses older items behind "Show N older" and moves focus to the first revealed item', async () => {
    const t = mount({ initialVisible: 2 });
    expect(t.host.querySelectorAll('.aui-timeline__item')).toHaveLength(2);
    const toggle = t.host.querySelector<HTMLButtonElement>('.aui-timeline__toggle')!;
    expect(toggle.textContent).toContain('Show 2 older');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const toggles: boolean[] = [];
    t.host.addEventListener('aui-toggle', (e) => toggles.push((e as CustomEvent<TimelineToggleDetail>).detail.expanded));
    await userEvent.click(toggle);
    expect(t.host.querySelectorAll('.aui-timeline__item')).toHaveLength(4);
    expect(document.activeElement).toBe(t.host.querySelector('[data-id="a2"]'));
    const again = t.host.querySelector<HTMLButtonElement>('.aui-timeline__toggle')!;
    expect(again.getAttribute('aria-expanded')).toBe('true');
    await userEvent.click(again);
    expect(t.expanded).toBe(false);
    expect(document.activeElement).toBe(t.host.querySelector('.aui-timeline__toggle'));
    expect(toggles).toEqual([true, false]);
  });

  it('oldest-first collapses the start of the list', () => {
    const t = mount({ items: [...items].reverse(), order: 'oldest-first', initialVisible: 1, groupByDay: false });
    const shown = [...t.host.querySelectorAll<HTMLElement>('.aui-timeline__item')].map((li) => li.dataset.id);
    expect(shown).toEqual(['a4']);
  });

  it('loadMore appends older items, announces, and stops when empty', async () => {
    let calls = 0;
    const t = mount({
      groupByDay: false,
      loadMore: ({ oldest }) => {
        calls++;
        expect(oldest?.id).toBe(calls === 1 ? 'a1' : 'a0');
        return Promise.resolve(calls === 1 ? [{ id: 'a0', title: 'Folder created', time: instant(NOW - 100 * H) }] : []);
      },
    });
    const loaded: TimelineLoadMoreDetail[] = [];
    t.host.addEventListener('aui-load-more', (e) => loaded.push((e as CustomEvent<TimelineLoadMoreDetail>).detail));
    await t.loadOlder();
    expect(t.items.map((i) => i.id)).toEqual(['a4', 'a3', 'a2', 'a1', 'a0']);
    expect(document.activeElement).toBe(t.host.querySelector('[data-id="a0"]'));
    expect(loaded[0]!.hasMore).toBe(true);
    await t.loadOlder();
    expect(t.hasMore).toBe(false);
    expect(t.host.querySelector('.aui-timeline__load')).toBeNull();
  });

  it('a failing loadMore shows an error with Retry and emits aui-load-error', async () => {
    let fail = true;
    const t = mount({ loadMore: () => (fail ? Promise.reject(new Error('offline')) : Promise.resolve([])) });
    const errors: unknown[] = [];
    t.host.addEventListener('aui-load-error', (e) => errors.push((e as CustomEvent<{ error: unknown }>).detail.error));
    await t.loadOlder();
    expect(errors).toHaveLength(1);
    expect(t.host.querySelector('.aui-timeline__error')!.textContent).toBe('Could not load older items.');
    expect(t.host.querySelector('.aui-timeline__load')!.textContent).toContain('Retry');
    fail = false;
    await t.loadOlder();
    expect(t.host.querySelector('.aui-timeline__error')).toBeNull();
  });

  it('loadMore results are validated (regression: duplicate ids)', async () => {
    const t = mount({ loadMore: () => Promise.resolve([{ id: 'a4', title: 'Duplicate' }]) });
    const errors: unknown[] = [];
    t.host.addEventListener('aui-load-error', (e) => errors.push((e as CustomEvent<{ error: unknown }>).detail.error));
    await t.loadOlder();
    expect(errors[0]).toBeInstanceOf(AbsoluteUIError);
    expect(t.items).toHaveLength(4);
  });

  it('horizontal timelines are a focusable, labelled scroll region; alternate marks every second item', () => {
    const t = mount({ orientation: 'horizontal' });
    const scroller = t.host.querySelector<HTMLElement>('.aui-timeline__scroller')!;
    expect(scroller.getAttribute('role')).toBe('region');
    expect(scroller.getAttribute('aria-label')).toBe('Document activity');
    expect(scroller.tabIndex).toBe(0);
    t.update({ orientation: 'vertical', layout: 'alternate' });
    expect(scroller.hasAttribute('role')).toBe(false);
    expect(t.host.classList.contains('aui-timeline--alternate')).toBe(true);
    const ends = [...t.host.querySelectorAll<HTMLElement>('.aui-timeline__item--end')].map((li) => li.dataset.id);
    expect(ends).toEqual(['a3', 'a1']);
  });

  it('shows the empty text when there are no items', () => {
    const t = mount({ items: [], empty: 'Nothing yet' });
    const empty = t.host.querySelector<HTMLElement>('.aui-timeline__empty')!;
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toBe('Nothing yet');
  });

  it('validates options before touching the host, and a failed update keeps the previous state', () => {
    const host = document.createElement('div');
    host.textContent = 'keep';
    const bad = (o: Partial<TimelineOptions>): (() => void) => () => Timeline.create(host, { label: 'x', items: [], ...o });
    expect(bad({ label: ' ' })).toThrow(AbsoluteUIError);
    expect(bad({ items: [{ id: '', title: 'x' }] })).toThrow(/TIMELINE_OPTIONS|Invalid timeline/);
    expect(bad({ items: [{ id: 'a', title: 'x' }, { id: 'a', title: 'y' }] })).toThrow(AbsoluteUIError);
    expect(bad({ items: [{ id: 'a', title: 'x', href: 'javascript:alert(1)' }] })).toThrow(AbsoluteUIError);
    expect(bad({ items: [{ id: 'a', title: 'x', avatar: { name: 'A', src: 'data:text/html,x' } }] })).toThrow(AbsoluteUIError);
    expect(bad({ initialVisible: 0 })).toThrow(AbsoluteUIError);
    expect(host.textContent).toBe('keep');
    const t = mount();
    expect(() => {
      t.update({ headingLevel: 9 as 2 });
    }).toThrow(AbsoluteUIError);
    expect(t.host.querySelectorAll('.aui-timeline__item')).toHaveLength(4);
  });

  it('destroy aborts a pending load and cleans up', async () => {
    let signal: AbortSignal | null = null;
    const t = mount({ loadMore: (ctx) => { signal = ctx.signal; return new Promise(() => undefined); } });
    void t.loadOlder();
    await Promise.resolve();
    t.destroy();
    expect((signal as AbortSignal | null)?.aborted).toBe(true);
    expect(t.host.childNodes).toHaveLength(0);
    expect(t.host.classList.contains('aui-timeline')).toBe(false);
  });
});
