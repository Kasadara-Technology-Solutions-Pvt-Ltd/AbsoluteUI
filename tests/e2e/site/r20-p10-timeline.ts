// R20 P10 page: Timeline (docs/PLAN-R20.md), bundled against the built packages.
import { configureAbsoluteUI, instant, plainDate } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import { Stack } from '@absoluteui/components/layout';
import { Timeline, type TimelineActionDetail, type TimelineItem, type TimelineLoadMoreDetail, type TimelineToggleDetail } from '@absoluteui/components/timeline';

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default', timezone: 'UTC', locale: 'en-GB' });
if (params.get('dir') === 'rtl') document.documentElement.dir = 'rtl';
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

Stack.apply(byId('main'), { gap: 6 });

// Fixed reference instant: Monday 23 November 2026, 15:00 UTC.
const NOW = Date.UTC(2026, 10, 23, 15);
const H = 3_600_000;
const calendar = createBusinessCalendar({ holidays: [{ name: 'Founders Day', date: plainDate(2026, 11, 20) }] });

const activity: TimelineItem[] = [
  { id: 'approved', title: 'Policy approved', tone: 'success', time: instant(NOW - H), avatar: { name: 'Ada Lovelace' }, actions: [{ id: 'open', label: 'Open', icon: 'file' }, { id: 'download', label: 'Download', icon: 'download' }] },
  { id: 'review', title: 'Review requested', tone: 'info', time: instant(NOW - 4 * H), href: '#review' },
  { id: 'scan', title: 'Virus scan failed', tone: 'error', status: 'Blocked', time: instant(NOW - 6 * H), description: 'The upload was quarantined.' },
  { id: 'comment', title: 'Comment added', time: instant(NOW - 27 * H), description: 'Please shorten section 3.' },
  { id: 'weekend', title: 'Weekend sync', tone: 'warning', time: instant(NOW - 50 * H) },
  { id: 'draft', title: 'Draft uploaded', time: instant(NOW - 75 * H) },
];

const log = byId('tl-log');
let page = 0;
const host = byId('tl-activity');
const timeline = Timeline.create(host, {
  label: 'Document activity',
  items: activity,
  now: instant(NOW),
  businessCalendar: calendar,
  initialVisible: 3,
  loadMore: async () => {
    await new Promise((r) => setTimeout(r, 150));
    page++;
    if (page > 2) return [];
    return Array.from({ length: 3 }, (_, i) => ({ id: `older-${String(page)}-${String(i)}`, title: `Older event ${String(page)}.${String(i + 1)}`, time: instant(NOW - (100 + page * 24 + i) * H) }));
  },
});
host.addEventListener('aui-action', (e) => {
  const d = (e as CustomEvent<TimelineActionDetail>).detail;
  log.textContent = `Action ${d.actionId} on ${d.itemId}`;
});
host.addEventListener('aui-toggle', (e) => {
  log.textContent = `Expanded: ${String((e as CustomEvent<TimelineToggleDetail>).detail.expanded)}`;
});
host.addEventListener('aui-load-more', (e) => {
  const d = (e as CustomEvent<TimelineLoadMoreDetail>).detail;
  log.textContent = `Loaded ${String(d.items.length)}, more: ${String(d.hasMore)}`;
});

Timeline.create(byId('tl-alternate'), { label: 'Hiring process', layout: 'alternate', groupByDay: false, now: instant(NOW), items: activity.slice(0, 4) });

Timeline.create(byId('tl-horizontal'), {
  label: 'Onboarding plan',
  orientation: 'horizontal',
  order: 'oldest-first',
  businessCalendar: calendar,
  now: instant(NOW),
  items: [
    { id: 'offer', title: 'Offer signed', tone: 'success', time: plainDate(2026, 11, 2) },
    { id: 'founders', title: 'Office closed', tone: 'warning', time: plainDate(2026, 11, 20) },
    { id: 'laptop', title: 'Laptop shipped', tone: 'info', time: plainDate(2026, 11, 23) },
    { id: 'start', title: 'First day', time: plainDate(2026, 12, 1) },
    { id: 'buddy', title: 'Buddy check-in', time: plainDate(2026, 12, 8) },
    { id: 'review', title: '30-day review', time: plainDate(2026, 12, 31) },
  ],
});

Timeline.create(byId('tl-failing'), {
  label: 'Audit log',
  now: instant(NOW),
  timeFormat: 'relative',
  items: [{ id: 'login', title: 'Signed in', time: instant(NOW - 600_000) }],
  loadMore: () => Promise.reject(new Error('Network error')),
});

Object.assign(window, { __auiReady: true, __timeline: timeline });
