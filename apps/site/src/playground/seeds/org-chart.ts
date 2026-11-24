import { OrgChart, type OrgChartOptions } from '@absoluteui/components/org-chart';
import { host, seed } from '../seed.js';

export default seed<OrgChartOptions>({
  options: {
    label: 'Organization',
    nodes: [
      { id: 'ceo', parentId: null, label: 'Ada Lovelace', title: 'Chief Executive' },
      { id: 'cto', parentId: 'ceo', label: 'Chen Wei', title: 'Chief Technology Officer' },
      { id: 'cfo', parentId: 'ceo', label: 'Farah Haddad', title: 'Chief Financial Officer' },
      { id: 'coo', parentId: 'ceo', label: 'Bruno Silva', title: 'Chief Operating Officer' },
      { id: 'platform', parentId: 'cto', label: 'Divya Nair', title: 'Head of Platform' },
      { id: 'web', parentId: 'cto', label: 'Emeka Obi', title: 'Head of Web' },
      { id: 'tax', parentId: 'cfo', label: 'Inés García', title: 'Head of Tax' },
      { id: 'people', parentId: 'coo', label: 'Jonas Berg', title: 'Head of People' },
    ],
    expandDepth: 2,
    orientation: 'vertical',
    editable: true,
  },
  call: 'OrgChart.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    h.style.setProperty('block-size', '420px');
    const c = OrgChart.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
