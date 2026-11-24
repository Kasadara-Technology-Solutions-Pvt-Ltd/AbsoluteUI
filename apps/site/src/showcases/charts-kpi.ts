// KPI charts showcase: targets for a quarter with a gauge, bullet charts, a radar comparison
// (per-series style), a treemap with drill-down, and a recruitment funnel with conversion
// rates. Style and animation are switchable; point clicks are logged.
import { BulletChart } from '@absoluteui/components/bullet-chart';
import { FunnelChart } from '@absoluteui/components/funnel-chart';
import { Gauge } from '@absoluteui/components/gauge';
import { RadarChart } from '@absoluteui/components/radar-chart';
import { Treemap } from '@absoluteui/components/treemap';
import { chartControls, chartLook, createShowcase, hostIn, section, toggle } from './kit.js';
import { NumberInput } from '@absoluteui/components/number-input';

const sc = createShowcase({
  title: 'Quarter targets',
  description: 'Change the gauge value, drill into the treemap with Enter, and compare teams on the radar.',
});

const grid = hostIn(sc.stage);
grid.className = 'sc-grid';
const gaugeSection = section(sc, 'Customer satisfaction', ['gauge']);
const bulletSection = section(sc, 'Revenue against target', ['bullet-chart']);
grid.append(gaugeSection, bulletSection);
const gauge = Gauge.create(hostIn(gaugeSection), {
  label: 'Customer satisfaction',
  value: 78,
  min: 0,
  max: 100,
  target: 85,
  bands: [
    { to: 60, label: 'Poor', color: 2 },
    { to: 80, label: 'Fair', color: 4 },
    { to: 100, label: 'Good', color: 3 },
  ],
});
const bullet = BulletChart.create(hostIn(bulletSection), {
  label: 'Revenue against target',
  measures: [
    { id: 'emea', label: 'EMEA', value: 410, target: 450, ranges: [300, 400, 500] },
    { id: 'apac', label: 'APAC', value: 380, target: 350, ranges: [250, 350, 450] },
    { id: 'amer', label: 'Americas', value: 520, target: 560, ranges: [400, 500, 600] },
  ],
  valueFormat: { style: 'currency', currency: 'EUR', notation: 'compact' },
  height: 220,
});
const valueInput = NumberInput.create(hostIn(gaugeSection), { label: 'Satisfaction score', value: 78, min: 0, max: 100, step: 1 });
valueInput.host.addEventListener('aui-change', (e) => {
  const v = (e as CustomEvent<{ value: number | null }>).detail.value;
  gauge.update({ value: v });
  sc.log('gauge value', v);
});

const compare = hostIn(sc.stage);
compare.className = 'sc-grid';
const radarSection = section(sc, 'Team skills', ['radar-chart']);
const treeSection = section(sc, 'Spending by department', ['treemap']);
compare.append(radarSection, treeSection);
const radar = RadarChart.create(hostIn(radarSection), {
  label: 'Team skills',
  axes: ['Delivery', 'Quality', 'Collaboration', 'Innovation', 'Customer focus'],
  series: [
    { id: 'platform', label: 'Platform', values: [8, 9, 7, 6, 7] },
    { id: 'web', label: 'Web', values: [9, 7, 8, 8, 9], style: { dash: 'dashed', marker: 'diamond' } },
  ],
  valueAxis: { min: 0, max: 10 },
  fill: true,
  height: 300,
});
const tree = Treemap.create(hostIn(treeSection), {
  label: 'Spending by department',
  drillDown: true,
  rootLabel: 'All departments',
  data: [
    { id: 'eng', label: 'Engineering', children: [{ id: 'cloud', label: 'Cloud', value: 420 }, { id: 'tools', label: 'Tools', value: 120 }, { id: 'hw', label: 'Hardware', value: 90 }] },
    { id: 'sales', label: 'Sales', children: [{ id: 'events', label: 'Events', value: 160 }, { id: 'travel', label: 'Travel', value: 110 }] },
    { id: 'ops', label: 'Operations', children: [{ id: 'rent', label: 'Rent', value: 300 }, { id: 'utilities', label: 'Utilities', value: 60 }] },
  ],
  valueFormat: { style: 'currency', currency: 'EUR', notation: 'compact' },
  height: 300,
});
const funnel = FunnelChart.create(hostIn(section(sc, 'Recruitment funnel', ['funnel-chart'])), {
  label: 'Recruitment funnel',
  stages: [
    { id: 'applied', label: 'Applied', value: 1240 },
    { id: 'screened', label: 'Screened', value: 610 },
    { id: 'interviewed', label: 'Interviewed', value: 220 },
    { id: 'offer', label: 'Offer', value: 48 },
    { id: 'hired', label: 'Hired', value: 37 },
  ],
  showConversion: true,
  height: 280,
});

sc.listen(tree.host, ['aui-drill', 'aui-series-toggle', 'aui-point-click'], 'treemap');
sc.listen(radar.host, ['aui-series-toggle', 'aui-point-click'], 'radar');
sc.listen(bullet.host, ['aui-point-click'], 'bullet');
sc.listen(funnel.host, ['aui-point-click'], 'funnel');

chartControls(sc, [bullet, radar, tree, funnel], ['bullet-chart', 'radar-chart', 'treemap', 'funnel-chart']);
chartLook(sc, [gauge, bullet, radar, tree, funnel]);
toggle(sc, 'Radar fill', true, (fill) => {
  radar.update({ fill });
}, ['radar-chart']);
toggle(sc, 'Funnel conversion', true, (showConversion) => {
  funnel.update({ showConversion });
}, ['funnel-chart']);
toggle(sc, 'Treemap labels', true, (tileLabels) => {
  tree.update({ tileLabels });
}, ['treemap']);
