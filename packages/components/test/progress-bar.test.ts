import { afterEach, describe, expect, it } from 'vitest';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { ProgressBar } from '@absoluteui/components/progress-bar';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function host(): HTMLDivElement {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
}

function liveRegion(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-aui-live-region="polite"]');
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => {
    resolve();
  }));
}

describe('ProgressBar', () => {
  it('wires role, visible label, range, value and value text', () => {
    const p = ProgressBar.create(host(), { label: 'Uploading', value: 25, description: 'report.pdf' });
    const t = p.track;
    expect(t.getAttribute('role')).toBe('progressbar');
    expect(document.getElementById(t.getAttribute('aria-labelledby')!)!.textContent).toBe('Uploading');
    expect(document.getElementById(t.getAttribute('aria-describedby')!)!.textContent).toBe('report.pdf');
    expect(t.getAttribute('aria-valuemin')).toBe('0');
    expect(t.getAttribute('aria-valuemax')).toBe('100');
    expect(t.getAttribute('aria-valuenow')).toBe('25');
    expect(t.getAttribute('aria-valuetext')).toBe('25%');
    expect(p.host.querySelector('.aui-progress-bar__value')!.textContent).toBe('25%');
    expect(p.host.querySelector<HTMLElement>('.aui-progress-bar__fill')!.style.getPropertyValue('--aui-progress')).toBe('25%');
  });

  it('is indeterminate for null: no aria-valuenow or valuetext', () => {
    const p = ProgressBar.create(host(), { label: 'Loading', value: null });
    expect(p.indeterminate).toBe(true);
    expect(p.track.hasAttribute('aria-valuenow')).toBe(false);
    expect(p.track.hasAttribute('aria-valuetext')).toBe(false);
    expect(p.host.classList.contains('aui-progress-bar--indeterminate')).toBe(true);
    p.setValue(10);
    expect(p.track.getAttribute('aria-valuenow')).toBe('10');
    expect(p.host.classList.contains('aui-progress-bar--indeterminate')).toBe(false);
  });

  it('formats the percentage for the configured locale', () => {
    configureAbsoluteUI({ locale: 'de-DE' });
    const p = ProgressBar.create(host(), { label: 'Fortschritt', value: 50 });
    expect(p.track.getAttribute('aria-valuetext')).toBe('50 %');
    p.update({ locale: 'en-US' });
    expect(p.track.getAttribute('aria-valuetext')).toBe('50%');
  });

  it('uses a custom range and valueText, and clamps out-of-range values', () => {
    const p = ProgressBar.create(host(), { label: 'Files', min: 0, max: 8, value: 3, valueText: (v, max) => `${String(v)} of ${String(max)} files` });
    expect(p.track.getAttribute('aria-valuemax')).toBe('8');
    expect(p.track.getAttribute('aria-valuetext')).toBe('3 of 8 files');
    p.setValue(20);
    expect(p.value).toBe(8);
    expect(p.track.getAttribute('aria-valuenow')).toBe('8');
  });

  it('hides the visible value when showValue is false (global and instance)', () => {
    configureAbsoluteUI({ components: { progressBar: { showValue: false } } });
    const p = ProgressBar.create(host(), { label: 'Sync', value: 40 });
    const value = p.host.querySelector<HTMLElement>('.aui-progress-bar__value')!;
    expect(value.hidden).toBe(true);
    expect(p.track.getAttribute('aria-valuetext')).toBe('40%');
    p.update({ showValue: true });
    expect(value.hidden).toBe(false);
  });

  it('adds a labelled icon for non-default tones (not color alone)', () => {
    const p = ProgressBar.create(host(), { label: 'Backup', value: 100, tone: 'success', announceComplete: false });
    const icon = p.host.querySelector('.aui-progress-bar__icon')!;
    expect(icon.getAttribute('role')).toBe('img');
    expect(icon.getAttribute('aria-label')).toBe('Success');
    p.update({ tone: 'error' });
    expect(p.host.querySelectorAll('.aui-progress-bar__icon')).toHaveLength(1);
    expect(p.host.querySelector('.aui-progress-bar__icon')!.getAttribute('aria-label')).toBe('Error');
    p.update({ tone: 'default' });
    expect(p.host.querySelector('.aui-progress-bar__icon')).toBeNull();
  });

  it('announces completion once when the value reaches max', async () => {
    const p = ProgressBar.create(host(), { label: 'Upload', value: 90 });
    p.setValue(100);
    await nextFrame();
    expect(liveRegion()!.textContent).toBe('Upload complete');
    liveRegion()!.textContent = '';
    p.setValue(100);
    p.update({ description: 'done' });
    await nextFrame();
    expect(liveRegion()!.textContent).toBe('');
  });

  it('does not announce when announceComplete is false or when created complete', async () => {
    ProgressBar.create(host(), { label: 'Already', value: 100 });
    const p = ProgressBar.create(host(), { label: 'Quiet', value: 10, announceComplete: false });
    p.setValue(100);
    await nextFrame();
    expect(liveRegion()?.textContent ?? '').toBe('');
  });

  it('rejects invalid options and leaves the host untouched', () => {
    const el = host();
    el.textContent = 'original';
    expect(() => ProgressBar.create(el, { label: ' ' })).toThrow(AbsoluteUIError);
    expect(() => ProgressBar.create(el, { label: 'x', min: 10, max: 10 })).toThrow(AbsoluteUIError);
    expect(() => ProgressBar.create(el, { label: 'x', value: Number.NaN })).toThrow(AbsoluteUIError);
    expect(el.textContent).toBe('original');
    expect(el.className).toBe('');
    const p = ProgressBar.create(el, { label: 'ok', value: 1 });
    expect(() => {
      p.update({ max: -1 });
    }).toThrow(AbsoluteUIError);
    expect(p.track.getAttribute('aria-valuemax')).toBe('100');
  });

  it('destroy removes rendering and config subscriptions', () => {
    const el = host();
    const p = ProgressBar.create(el, { label: 'Gone', value: 5 });
    p.destroy();
    expect(el.childElementCount).toBe(0);
    expect(el.className).toBe('');
    configureAbsoluteUI({ locale: 'de-DE' });
    expect(el.childElementCount).toBe(0);
  });
});
