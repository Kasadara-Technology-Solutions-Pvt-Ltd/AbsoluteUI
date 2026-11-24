import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { instant, resetAbsoluteUIConfig } from '@absoluteui/core';
import type { FileEntry, FileManagerProvider } from '@absoluteui/components/file-manager';
import type { ImageViewerImage } from '@absoluteui/components/image-viewer';
import type { TimelineActionDetail, TimelineItem } from '@absoluteui/components/timeline';
import type { TourStep } from '@absoluteui/components/tour';
import { provideAbsoluteUI } from '../src/index.js';
import { AuiCodeViewer } from '../src/code-viewer/index.js';
import { AuiFileManager } from '../src/file-manager/index.js';
import { AuiImageViewer } from '../src/image-viewer/index.js';
import { AuiTimeline } from '../src/timeline/index.js';
import { AuiTour } from '../src/tour/index.js';

// docs/PLAN-R20.md P10: generated Timeline, Tour, Image Viewer, Code Viewer, and File Manager components.
beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch {
    // Already initialized by another test file in the same run.
  }
});

afterEach(() => {
  TestBed.resetTestingModule();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

async function render<T>(type: new () => T): Promise<ComponentFixture<T>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAbsoluteUI({ themeRuntime: false, locale: 'en-US' })] });
  const fixture = TestBed.createComponent(type);
  document.body.append(fixture.nativeElement as HTMLElement);
  await fixture.whenStable();
  return fixture;
}

const items: TimelineItem[] = [
  { id: 'a', title: 'Policy approved', tone: 'success', time: instant(Date.UTC(2026, 10, 20, 14)), actions: [{ id: 'open', label: 'Open' }] },
  { id: 'b', title: 'Review requested', time: instant(Date.UTC(2026, 10, 19, 9)) },
];

@Component({
  imports: [AuiTimeline],
  template: `<aui-timeline label="Activity" timezone="UTC" [items]="items" (action)="last.set($event)"></aui-timeline>`,
})
class TimelineHost {
  readonly items = items;
  readonly last = signal<TimelineActionDetail | null>(null);
}

@Component({
  imports: [AuiTour],
  template: `<button type="button" id="p10-target">Search</button><aui-tour #tour="auiTour" [steps]="steps" (finished)="finished.set(true)"></aui-tour>`,
})
class TourHost {
  readonly steps: TourStep[] = [
    { id: 'welcome', title: 'Welcome', content: 'A short tour.' },
    { id: 'search', title: 'Search', content: 'Find anything.', target: '#p10-target' },
  ];
  readonly finished = signal(false);
  readonly tour = viewChild.required<AuiTour>('tour');
}

/** A 2x2 PNG (data URL), so the test needs no network. */
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxcCAr7ZvM0AAAAASUVORK5CYII=';

@Component({
  imports: [AuiImageViewer],
  template: `<aui-image-viewer label="Office photos" [images]="images"></aui-image-viewer>`,
})
class ImageViewerHost {
  readonly images: ImageViewerImage[] = [
    { src: PIXEL, alt: 'Lobby' },
    { src: PIXEL, alt: 'Meeting room' },
  ];
}

@Component({
  imports: [AuiCodeViewer],
  template: `<aui-code-viewer label="Export" language="json" [code]="code"></aui-code-viewer>`,
})
class CodeViewerHost {
  readonly code = '{\n  "id": 7,\n  "name": "Ada"\n}';
}

const entries: FileEntry[] = [
  { id: 'policies', name: 'Policies', kind: 'folder', parentId: null },
  { id: 'handbook', name: 'Handbook.md', kind: 'file', size: 1200, parentId: null },
];
const provider: FileManagerProvider = {
  list: (folderId) => Promise.resolve(entries.filter((e) => e.parentId === folderId)),
  createFolder: (parentId, name) => Promise.resolve({ id: name, name, kind: 'folder', parentId }),
  rename: (entry, name) => Promise.resolve({ ...entry, name }),
  move: (moved, target) => Promise.resolve(moved.map((e) => ({ ...e, parentId: target }))),
  delete: () => Promise.resolve(),
  upload: (folderId, file) => Promise.resolve({ id: file.name, name: file.name, kind: 'file', size: file.size, parentId: folderId }),
};

@Component({
  imports: [AuiFileManager],
  template: `<aui-file-manager label="Documents" [provider]="provider"></aui-file-manager>`,
})
class FileManagerHost {
  readonly provider = provider;
}

describe('R20 P10 Angular components', () => {
  it('<aui-timeline> renders an ordered list and forwards (action)', async () => {
    const f = await render(TimelineHost);
    const root = f.nativeElement as HTMLElement;
    expect(root.querySelector('ol')).not.toBeNull();
    expect(root.textContent).toContain('Policy approved');
    const open = [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent.includes('Open'));
    open?.click();
    await f.whenStable();
    expect(f.componentInstance.last()?.actionId).toBe('open');
  });

  it('<aui-tour> stays closed until start() and emits (finished)', async () => {
    const f = await render(TourHost);
    const panel = (f.nativeElement as HTMLElement).querySelector<HTMLElement>('[role="dialog"]');
    expect(panel?.matches(':popover-open')).toBe(false);
    await f.componentInstance.tour().start();
    expect(panel?.matches(':popover-open')).toBe(true);
    f.componentInstance.tour().finish();
    await f.whenStable();
    expect(f.componentInstance.finished()).toBe(true);
  });

  it('<aui-image-viewer> renders the first image with its alt text', async () => {
    const f = await render(ImageViewerHost);
    const img = (f.nativeElement as HTMLElement).querySelector<HTMLImageElement>('img[alt="Lobby"]');
    expect(img).not.toBeNull();
  });

  it('<aui-code-viewer> renders a labelled region with the code as text', async () => {
    const f = await render(CodeViewerHost);
    const region = (f.nativeElement as HTMLElement).querySelector('[role="region"]');
    expect(region?.getAttribute('aria-label') ?? region?.getAttribute('aria-labelledby')).toBeTruthy();
    expect((f.nativeElement as HTMLElement).textContent).toContain('"name"');
  });

  it('<aui-file-manager> lists the root folder from the provider', async () => {
    const f = await render(FileManagerHost);
    await new Promise((r) => setTimeout(r, 50));
    expect((f.nativeElement as HTMLElement).textContent).toContain('Handbook.md');
  });
});
