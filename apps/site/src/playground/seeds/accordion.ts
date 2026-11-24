import { Accordion, type AccordionOptions } from '@absoluteui/components/accordion';
import { host, seed } from '../seed.js';

export default seed<AccordionOptions>({
  options: {
    items: [
      { id: 'leave', title: 'How do I request leave?', content: 'Open Time off, choose the dates, and submit. Your manager is notified at once.' },
      { id: 'payslip', title: 'Where is my payslip?', content: 'Payslips are under Pay > Documents on the last working day of each month.' },
      { id: 'benefits', title: 'When can I change my benefits?', content: 'During open enrolment in November, or within 30 days of a life event.' },
      { id: 'archive', title: 'Archived policies', content: 'Policies retired before 2024.', disabled: true },
    ],
    value: ['leave'],
    collapsible: true,
    headingLevel: 3,
  },
  call: 'Accordion.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Accordion.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
