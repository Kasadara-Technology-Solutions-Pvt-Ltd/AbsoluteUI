import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Carousel, carouselConfig, type CarouselChangeDetail, type CarouselOptions } from '@absoluteui/components/carousel';

afterEach(() => {
  vi.useRealTimers();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const SLIDES = [
  { content: 'Spring sale: 20% off', label: 'Spring sale' },
  { content: 'New arrivals' },
  { content: 'Free delivery over 50 EUR' },
];

function mount(options: Partial<CarouselOptions> = {}): Carousel {
  const host = document.createElement('section');
  document.body.append(host);
  return Carousel.create(host, { label: 'Featured', slides: SLIDES, ...options });
}

const slides = (c: Carousel): HTMLElement[] => [...c.host.querySelectorAll<HTMLElement>('.aui-carousel__slide')];
const button = (c: Carousel, name: string): HTMLButtonElement => [...c.host.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === name)!;

describe('Carousel', () => {
  it('is a named carousel region with slides labelled N of M; inactive slides are inert', () => {
    const c = mount();
    expect(c.host.getAttribute('role')).toBe('region');
    expect(c.host.getAttribute('aria-roledescription')).toBe('carousel');
    expect(c.host.getAttribute('aria-label')).toBe('Featured');
    expect(slides(c).map((s) => s.getAttribute('aria-label'))).toEqual(['1 of 3: Spring sale', '2 of 3', '3 of 3']);
    expect(slides(c)[0]!.getAttribute('aria-roledescription')).toBe('slide');
    expect(slides(c).map((s) => s.inert)).toEqual([false, true, true]);
    expect(c.host.querySelector('.aui-carousel__viewport')!.getAttribute('aria-live')).toBe('polite');
    expect(c.host.querySelector<HTMLElement>('.aui-carousel__pause')!.hidden).toBe(true);
  });

  it('previous and next move by one; the ends disable them without loop', async () => {
    const c = mount();
    const changes: number[] = [];
    c.host.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<CarouselChangeDetail>).detail.index));
    expect(button(c, 'Previous slide').disabled).toBe(true);
    await userEvent.click(button(c, 'Next slide'));
    await userEvent.click(button(c, 'Next slide'));
    expect(c.index).toBe(2);
    expect(button(c, 'Next slide').disabled).toBe(true);
    expect(slides(c).map((s) => s.inert)).toEqual([true, true, false]);
    expect(changes).toEqual([1, 2]);
  });

  it('loop wraps; pickers jump and mark the current slide', async () => {
    const c = mount({ loop: true });
    await userEvent.click(button(c, 'Previous slide'));
    expect(c.index).toBe(2);
    await userEvent.click(button(c, 'Go to slide 2'));
    expect(c.index).toBe(1);
    expect(button(c, 'Go to slide 2').getAttribute('aria-current')).toBe('true');
    expect(button(c, 'Go to slide 1').hasAttribute('aria-current')).toBe(false);
  });

  it('autoplay rotates, pauses on hover and focus, and the pause button stops it', () => {
    vi.useFakeTimers();
    const c = mount({ autoplay: 3000 });
    const pause = c.host.querySelector<HTMLButtonElement>('.aui-carousel__pause')!;
    expect(pause.hidden).toBe(false);
    expect(c.host.firstElementChild).toBe(pause);
    expect(c.rotating).toBe(true);
    expect(c.host.querySelector('.aui-carousel__viewport')!.getAttribute('aria-live')).toBe('off');
    vi.advanceTimersByTime(3000);
    expect(c.index).toBe(1);
    c.host.dispatchEvent(new PointerEvent('pointerenter'));
    expect(c.rotating).toBe(false);
    c.host.dispatchEvent(new PointerEvent('pointerleave'));
    expect(c.rotating).toBe(true);
    pause.click();
    expect(c.rotating).toBe(false);
    expect(pause.getAttribute('aria-label')).toBe('Start automatic slide show');
    expect(c.host.querySelector('.aui-carousel__viewport')!.getAttribute('aria-live')).toBe('polite');
    vi.advanceTimersByTime(10_000);
    expect(c.index).toBe(1);
  });

  it('does not rotate with the animation setting "none"', () => {
    configureAbsoluteUI({ common: { animation: 'none' } });
    const c = mount({ autoplay: 3000 });
    expect(c.rotating).toBe(false);
  });

  it('goTo and update do not emit; one slide hides the controls; showPicker follows configuration', () => {
    const c = mount();
    const onChange = vi.fn();
    c.host.addEventListener('aui-change', onChange);
    c.goTo(2);
    c.update({ index: 0 });
    expect(onChange).not.toHaveBeenCalled();
    configureAbsoluteUI({ components: { carousel: { showPicker: false } } });
    expect(c.host.querySelector<HTMLElement>('.aui-carousel__picker')!.hidden).toBe(true);
    c.update({ slides: [{ content: 'Only one' }] });
    expect(c.host.querySelector<HTMLElement>('.aui-carousel__controls')!.hidden).toBe(true);
    expect([...carouselConfig.optionNames].sort()).toEqual(['locale', 'showPicker']);
  });

  it('validates options before touching the host', () => {
    const host = document.createElement('section');
    const bad: unknown[] = [{ label: '', slides: SLIDES }, { label: 'x', slides: [] }, { label: 'x', slides: [{ content: 42 }] }, { label: 'x', slides: SLIDES, index: 3 }, { label: 'x', slides: SLIDES, autoplay: 500 }];
    for (const options of bad) expect(() => Carousel.create(host, options as CarouselOptions)).toThrow(AbsoluteUIError);
    expect(host.className).toBe('');
    expect(host.childNodes.length).toBe(0);
  });

  it('destroy stops rotation and removes rendering', () => {
    vi.useFakeTimers();
    const c = mount({ autoplay: 3000 });
    c.destroy();
    vi.advanceTimersByTime(10_000);
    expect(c.index).toBe(0);
    expect(c.host.childNodes.length).toBe(0);
    expect(c.host.getAttributeNames().filter((n) => n !== 'class')).toEqual([]);
  });
});
