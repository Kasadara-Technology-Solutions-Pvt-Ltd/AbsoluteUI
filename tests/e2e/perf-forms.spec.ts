import { test, type Page } from '@playwright/test';
import type { TextInput } from '@absoluteui/components/text-input';
import type { Textarea } from '@absoluteui/components/textarea';
import type { NumberInput } from '@absoluteui/components/number-input';
import type { Select } from '@absoluteui/components/select';
import type { Checkbox } from '@absoluteui/components/checkbox';
import type { CheckboxGroup } from '@absoluteui/components/checkbox-group';
import type { MultiSelect } from '@absoluteui/components/multi-select';
import type { RadioGroup } from '@absoluteui/components/radio-group';
import type { Switch } from '@absoluteui/components/switch';
import type { Form } from '@absoluteui/components/form';
import { withinBudget } from './budget.js';

// R1 form performance budgets declared in metadata/*/component.json (SPEC section 15.2).
// Headless Chromium, production build, median of 5 runs.

interface Harness {
  __aui: {
    TextInput: typeof TextInput;
    Textarea: typeof Textarea;
    NumberInput: typeof NumberInput;
    Select: typeof Select;
    Checkbox: typeof Checkbox;
    CheckboxGroup: typeof CheckboxGroup;
    MultiSelect: typeof MultiSelect;
    RadioGroup: typeof RadioGroup;
    Switch: typeof Switch;
    Form: typeof Form;
  };
  __auiReady?: boolean;
}

async function open(page: Page): Promise<void> {
  await page.goto('/forms');
  await page.waitForFunction(() => (window as unknown as Harness).__auiReady === true);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

type Kind = 'TextInput' | 'Textarea' | 'NumberInput' | 'Checkbox' | 'Switch' | 'CheckboxGroup' | 'RadioGroup';

/** Average create() time per instance, in ms, for `count` instances. */
async function perInstance(page: Page, kind: Kind, count: number): Promise<number> {
  const results: number[] = [];
  for (let run = 0; run < 5; run++) {
    results.push(
      await page.evaluate(
        ([k, n]) => {
          const aui = (window as unknown as Harness).__aui;
          const hosts = Array.from({ length: n }, () => {
            const h = document.createElement('div');
            document.body.append(h);
            return h;
          });
          const opts = Array.from({ length: k === 'CheckboxGroup' ? 10 : 7 }, (_, i) => ({ value: `v${i}`, label: `Option ${i}` }));
          const start = performance.now();
          const made = hosts.map((h, i): { destroy(): void } => {
            const label = `Field ${i}`;
            switch (k) {
              case 'TextInput':
                return aui.TextInput.create(h, { label, required: true, maxLength: 50, showCounter: true });
              case 'Textarea':
                return aui.Textarea.create(h, { label, maxLength: 200, showCounter: true });
              case 'NumberInput':
                return aui.NumberInput.create(h, { label, min: 0, max: 100, value: 5 });
              case 'Checkbox':
                return aui.Checkbox.create(h, { label, required: true });
              case 'Switch':
                return aui.Switch.create(h, { label });
              case 'CheckboxGroup':
                return aui.CheckboxGroup.create(h, { label, options: opts });
              case 'RadioGroup':
                return aui.RadioGroup.create(h, { label, options: opts });
            }
          });
          const elapsed = performance.now() - start;
          for (const m of made) m.destroy();
          for (const h of hosts) h.remove();
          return elapsed / n;
        },
        [kind, count] as const,
      ),
    );
  }
  return median(results);
}

const budgets: [Kind, number, number][] = [
  ['TextInput', 1000, 1],
  ['Textarea', 1000, 1],
  ['NumberInput', 1000, 1],
  ['Checkbox', 1000, 1],
  ['Switch', 1000, 1],
  ['CheckboxGroup', 100, 2],
  ['RadioGroup', 100, 2],
];

test.describe('form performance budgets', () => {
  for (const [kind, count, budget] of budgets) {
    test(`${kind}.create: < ${budget} ms average per instance (${count} instances)`, async ({ page }) => {
      await open(page);
      const avg = await perInstance(page, kind, count);
      test.info().annotations.push({ type: 'perf', description: `${kind}.create avg: ${avg.toFixed(3)} ms` });
      withinBudget(avg, budget, 'avg');
    });
  }

  test('Select.create with 1,000 options: < 100 ms', async ({ page }) => {
    await open(page);
    const results: number[] = [];
    for (let run = 0; run < 5; run++) {
      results.push(
        await page.evaluate(() => {
          const { Select } = (window as unknown as Harness).__aui;
          const h = document.createElement('div');
          document.body.append(h);
          const options = Array.from({ length: 1000 }, (_, i) => ({ value: `v${i}`, label: `Option ${i}` }));
          const start = performance.now();
          const s = Select.create(h, { label: 'Perf', options });
          const elapsed = performance.now() - start;
          s.destroy();
          h.remove();
          return elapsed;
        }),
      );
    }
    const t = median(results);
    test.info().annotations.push({ type: 'perf', description: `Select.create(1000): ${t.toFixed(1)} ms` });
    withinBudget(t, 100, 't');
  });

  test('MultiSelect.create with 1,000 options (100 selected): < 100 ms', async ({ page }) => {
    await open(page);
    const results: number[] = [];
    for (let run = 0; run < 5; run++) {
      results.push(
        await page.evaluate(() => {
          const { MultiSelect } = (window as unknown as Harness).__aui;
          const h = document.createElement('div');
          document.body.append(h);
          const options = Array.from({ length: 1000 }, (_, i) => ({ value: `v${i}`, label: `Option ${i}` }));
          const start = performance.now();
          const m = MultiSelect.create(h, { label: 'Perf', options, value: options.slice(0, 100).map((o) => o.value), selectAll: true });
          const elapsed = performance.now() - start;
          m.destroy();
          h.remove();
          return elapsed;
        }),
      );
    }
    const t = median(results);
    test.info().annotations.push({ type: 'perf', description: `MultiSelect.create(1000): ${t.toFixed(1)} ms` });
    withinBudget(t, 100, 't');
  });

  // Includes the forced layout for rendering 200 new messages and moving focus (~25 ms is script).
  test('Form validate() over 200 invalid controls: < 150 ms', async ({ page }) => {
    await open(page);
    const results: number[] = [];
    for (let run = 0; run < 5; run++) {
      results.push(
        await page.evaluate(() => {
          const { Form, TextInput } = (window as unknown as Harness).__aui;
          const el = document.createElement('form');
          document.body.append(el);
          const inputs = Array.from({ length: 200 }, (_, i) => {
            const h = document.createElement('div');
            el.append(h);
            return TextInput.create(h, { label: `F${i}`, name: `f${i}`, required: true });
          });
          const form = Form.create(el, { errorSummary: false, focusOnInvalid: 'first-field' });
          const start = performance.now();
          form.validate();
          const elapsed = performance.now() - start;
          form.destroy();
          for (const t of inputs) t.destroy();
          el.remove();
          return elapsed;
        }),
      );
    }
    const t = median(results);
    test.info().annotations.push({ type: 'perf', description: `Form.validate(200): ${t.toFixed(1)} ms` });
    withinBudget(t, 150, 't');
  });
});
