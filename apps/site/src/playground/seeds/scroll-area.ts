import { ScrollArea, type ScrollAreaOptions } from '@absoluteui/components/scroll-area';
import { host, seed } from '../seed.js';

const ACTIVITY = [
  'Grace Hopper approved leave for Alan Turing',
  'Payroll for November was submitted',
  'Barbara Liskov joined the Platform team',
  'Ada Lovelace updated her emergency contact',
  'Expense claim #4821 was reimbursed',
  'Donald Knuth requested a laptop replacement',
  'Performance review cycle Q4 opened',
  'Katherine Johnson completed security training',
  'Office move to Building C was scheduled',
  'Margaret Hamilton was promoted to Principal Engineer',
  'Benefits enrolment closes in 5 days',
  'Linus Pauling submitted a timesheet',
];

export default seed<ScrollAreaOptions>({
  options: { label: 'Recent activity', maxBlockSize: '12rem', shadows: true },
  call: 'ScrollArea.enhance(element, $)',
  note: 'The element already holds a long list; Scroll Area makes it a labelled, keyboard-scrollable region.',
  mount(stage, options) {
    const el = host(stage);
    const list = document.createElement('ul');
    for (const text of ACTIVITY) {
      const li = document.createElement('li');
      li.textContent = text;
      list.append(li);
    }
    el.append(list);
    const area = ScrollArea.enhance(el, options);
    return { events: el, update: (p) => { area.update(p); }, destroy: () => { area.destroy(); el.remove(); } };
  },
});
