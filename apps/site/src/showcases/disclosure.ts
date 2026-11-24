// Disclosure showcase: an FAQ accordion, collapsible settings sections, a scroll area for long
// content, and a carousel of announcements with optional autoplay and its pause control.
import { Accordion } from '@absoluteui/components/accordion';
import { Carousel } from '@absoluteui/components/carousel';
import { Collapsible } from '@absoluteui/components/collapsible';
import { ScrollArea } from '@absoluteui/components/scroll-area';
import { choice, createShowcase, hostIn, section, toggle } from './kit.js';

const sc = createShowcase({
  title: 'Help center',
  description: 'Expand questions, open settings sections, scroll the release notes, and browse announcements.',
});

const faq = section(sc, 'Frequently asked questions', ['accordion']);
const accordion = Accordion.create(hostIn(faq), {
  headingLevel: 3,
  collapsible: true,
  value: ['leave'],
  items: [
    { id: 'leave', title: 'How do I request leave?', content: 'Open Time off, choose your dates, and submit. Your manager is notified right away.' },
    { id: 'payslip', title: 'Where is my payslip?', content: 'Payslips appear under Payroll on the last working day of each month.' },
    { id: 'password', title: 'How do I reset my password?', content: 'Use "Forgot password" on the sign-in page. Links expire after 30 minutes.' },
    { id: 'archived', title: 'Can I restore an archived team?', content: 'Only administrators can restore teams.', disabled: true },
  ],
});
sc.listen(accordion.host, ['aui-change'], 'accordion');

const settings = section(sc, 'Settings', ['collapsible']);
const sections = [
  Collapsible.create(hostIn(settings), { label: 'Notifications', content: 'Email for approvals and mentions; a weekly digest every Monday.', open: true, variant: 'bordered', headingLevel: 3 }),
  Collapsible.create(hostIn(settings), { label: 'Privacy', content: 'Your profile is visible to your organization only.', variant: 'bordered', headingLevel: 3 }),
];
for (const c of sections) sc.listen(c.host, ['aui-change'], 'collapsible');

const notes = section(sc, 'Release notes', ['scroll-area']);
const list = document.createElement('ol');
list.className = 'sc-notes';
for (let v = 24; v >= 1; v--) {
  const li = document.createElement('li');
  li.textContent = `Version 0.${String(v)}: improvements to keyboard support, performance, and accessibility.`;
  list.append(li);
}
notes.append(list);
const scroll = ScrollArea.enhance(list, { label: 'Release notes', maxBlockSize: '12rem', shadows: true });

const news = section(sc, 'Announcements', ['carousel']);
const carousel = Carousel.create(hostIn(news), {
  label: 'Announcements',
  loop: true,
  slides: [
    { label: 'Office move', content: 'We move to the new building on Monday. Desks are assigned by team.' },
    { label: 'Benefits', content: 'Benefits enrollment closes on the 30th.' },
    { label: 'Town hall', content: 'Join the quarterly town hall on Thursday at 16:00.' },
  ],
});
sc.listen(carousel.host, ['aui-change'], 'carousel');

toggle(sc, 'Several FAQ open', false, (multiple) => {
  accordion.update({ multiple });
}, ['accordion']);
choice(
  sc,
  'Carousel autoplay',
  [
    { value: 'off', label: 'Off' },
    { value: '5000', label: 'Every 5 s' },
  ],
  'off',
  (v) => {
    carousel.update({ autoplay: v === 'off' ? null : Number(v) });
  },
  ['carousel'],
);
toggle(sc, 'Scroll shadows', true, (shadows) => {
  scroll.update({ shadows });
}, ['scroll-area']);
toggle(sc, 'Disable privacy section', false, (disabled) => {
  sections[1]?.update({ disabled });
}, ['collapsible']);
