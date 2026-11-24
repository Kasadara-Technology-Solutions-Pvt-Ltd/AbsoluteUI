// Live frames: `data-scaled` frames render at a fixed design width and scale to fit their
// container (the hero app preview); fluid frames take the height their content reports.
// Frames load lazily from data-src when they come near the viewport.
interface HeightMessage {
  readonly type: 'aui-frame-height';
  readonly height: number;
}

const isHeightMessage = (data: unknown): data is HeightMessage =>
  typeof data === 'object' && data !== null && (data as Record<string, unknown>).type === 'aui-frame-height' && typeof (data as Record<string, unknown>).height === 'number';

export function initFrames(): void {
  const frames = [...document.querySelectorAll<HTMLIFrameElement>('iframe[data-src]')];
  if (!frames.length) return;

  const loadFrame = (frame: HTMLIFrameElement): void => {
    const src = frame.dataset.src;
    if (src && !frame.getAttribute('src')) frame.src = src;
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.target instanceof HTMLIFrameElement) {
            loadFrame(e.target);
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '400px' },
    );
    for (const f of frames) io.observe(f);
  } else frames.forEach(loadFrame);

  // Scaled frames: fixed design size, CSS transform to the viewport width.
  for (const frame of frames.filter((f) => f.dataset.scaled !== undefined)) {
    const viewport = frame.parentElement;
    const width = Number(frame.dataset.width ?? '1120');
    const height = Number(frame.dataset.height ?? '720');
    if (!viewport || !width || !height) continue;
    frame.width = String(width);
    frame.height = String(height);
    // CSS sizes win over the attributes; set the design size explicitly before scaling.
    frame.style.setProperty('width', `${String(width)}px`);
    frame.style.setProperty('height', `${String(height)}px`);
    const fit = (): void => {
      // Scale up as well as down, so very large screens (4K) show no empty band.
      const scale = viewport.clientWidth / width;
      frame.style.setProperty('transform', `scale(${String(scale)})`);
      viewport.style.setProperty('height', `${String(Math.round(height * scale))}px`);
    };
    new ResizeObserver(fit).observe(viewport);
    fit();
  }

  // Fluid frames: resize to the height their content reports (same origin only).
  addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.origin !== location.origin || !isHeightMessage(event.data)) return;
    const frame = frames.find((f) => f.contentWindow === event.source);
    if (!frame || frame.dataset.scaled !== undefined) return;
    const min = Number(frame.dataset.minHeight ?? '0');
    frame.style.setProperty('height', `${String(Math.max(min, Math.min(event.data.height, 4000)))}px`);
  });
}
