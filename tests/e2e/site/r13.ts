// R13 page: new components (docs/PLAN-R13-COMPONENTS.md), bundled against the built packages.
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { Avatar, type AvatarStatus } from '@absoluteui/components/avatar';
import { AvatarGroup } from '@absoluteui/components/avatar-group';
import { Badge, type BadgeTone } from '@absoluteui/components/badge';
import { Carousel } from '@absoluteui/components/carousel';
import { Collapsible } from '@absoluteui/components/collapsible';
import { Fieldset } from '@absoluteui/components/fieldset';
import { Kbd } from '@absoluteui/components/kbd';
import { ScrollArea } from '@absoluteui/components/scroll-area';
import { Slider } from '@absoluteui/components/slider';
import { TagGroup } from '@absoluteui/components/tag-group';
import { TextInput } from '@absoluteui/components/text-input';
import { ToggleGroup, type ToggleGroupChangeDetail } from '@absoluteui/components/toggle-group';
import { Stack } from '@absoluteui/components/layout';

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default' });
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

Stack.apply(byId('main'), { gap: 6 });

const TONES: [string, BadgeTone][] = [['Draft', 'neutral'], ['In review', 'info'], ['Active', 'success'], ['Expiring', 'warning'], ['Overdue', 'error']];
for (const [label, tone] of TONES) {
  const subtle = document.createElement('span');
  const outline = document.createElement('span');
  byId('badge-row').append(subtle, ' ');
  byId('badge-outline-row').append(outline, ' ');
  Badge.create(subtle, { label, tone, dot: true });
  Badge.create(outline, { label, tone, variant: 'outline', size: 'sm', icon: 'info' });
}

Kbd.create(byId('kbd-save'), { hotkey: 'Mod+S', platform: 'other' });
Kbd.create(byId('kbd-apple'), { hotkey: 'Mod+Shift+P', platform: 'apple' });
Kbd.create(byId('kbd-arrow'), { hotkey: 'Shift+ArrowDown', size: 'sm' });

const PEOPLE: [string, AvatarStatus | null][] = [['Ada Lovelace', 'online'], ['Grace Hopper', 'away'], ['Alan Turing', 'busy'], ['Barbara Liskov', 'offline'], ['Edsger Dijkstra', null]];
for (const [name, status] of PEOPLE) {
  const host = document.createElement('span');
  byId('avatar-row').append(host, ' ');
  Avatar.create(host, { name, status, size: 'lg' });
}
Avatar.create(byId('avatar-decorative'), { name: 'Grace Hopper', size: 'sm', decorative: true });
AvatarGroup.create(byId('avatar-group'), { label: 'Project members', items: PEOPLE.map(([name, status]) => ({ name, status })), max: 3 });

const street = TextInput.create(byId('street'), { label: 'Street' });
const city = TextInput.create(byId('city'), { label: 'City' });
const address = Fieldset.enhance(byId('address') as HTMLFieldSetElement, { legend: 'Delivery address', description: 'Where we send the order', required: true });
byId('check-address').addEventListener('click', () => {
  const missing = street.value.trim() === '' || city.value.trim() === '';
  address.update({ error: missing ? 'Enter a street and a city' : null });
  if (missing) address.focus();
});

Collapsible.create(byId('collapsible-plain'), { label: 'How is the delivery date calculated?', content: 'Orders placed before 14:00 on a business day ship the same day.' });
Collapsible.create(byId('collapsible-bordered'), { label: 'Advanced settings', content: 'Proxy and cache options.', headingLevel: 3, variant: 'bordered', open: true });

ToggleGroup.create(byId('toggle-align'), { label: 'Text alignment', required: true, attached: true, value: ['start'], items: [{ value: 'start', label: 'Align start', icon: 'align-start', iconOnly: true }, { value: 'center', label: 'Align center', icon: 'align-center', iconOnly: true }, { value: 'end', label: 'Align end', icon: 'align-end', iconOnly: true }] });
ToggleGroup.create(byId('toggle-styles'), { label: 'Text style', multiple: true, items: [{ value: 'bold', label: 'Bold' }, { value: 'italic', label: 'Italic' }] });
for (const id of ['toggle-align', 'toggle-styles']) {
  byId(id).addEventListener('aui-change', (event) => {
    byId('toggle-log').textContent = (event as CustomEvent<ToggleGroupChangeDetail>).detail.value.join(',') || 'none';
  });
}

TagGroup.create(byId('tags-filters'), { label: 'Applied filters', removable: true, items: [{ value: 'london', label: 'London' }, { value: 'remote', label: 'Remote' }, { value: 'senior', label: 'Senior' }] });
TagGroup.create(byId('tags-select'), { label: 'Categories', selection: 'multiple', value: ['design'], items: [{ value: 'design', label: 'Design' }, { value: 'sales', label: 'Sales' }] });

Slider.create(byId('slider-volume'), { label: 'Volume', value: 40, step: 10, marks: true, valueText: (v) => `${String(v)}%` });
Slider.create(byId('slider-price'), { label: 'Price', range: true, min: 0, max: 500, step: 10, value: [50, 300], format: { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }, locale: 'en-US', marks: [{ value: 0, label: 'Free' }, { value: 500, label: 'Max' }] });

for (let i = 1; i <= 30; i++) {
  const p = document.createElement('p');
  p.textContent = `Release 1.${String(i)}: improvements and fixes.`;
  byId('scroll-notes').append(p);
}
ScrollArea.enhance(byId('scroll-notes'), { label: 'Release notes', maxBlockSize: '10rem' });

Carousel.create(byId('carousel-featured'), { label: 'Featured', slides: [{ content: 'Spring sale: 20% off', label: 'Spring sale' }, { content: 'New arrivals' }, { content: 'Free delivery over 50 EUR' }] });
Carousel.create(byId('carousel-auto'), { label: 'Announcements', autoplay: 4000, loop: true, slides: [{ content: 'Office closed on Monday.' }, { content: 'Enrollment closes on the 30th.' }] });

Object.assign(window, { __auiReady: true });
