import { FileUpload } from '@absoluteui/components/file-upload';
import { UploadQueue, type UploadFunction, type UploadQueueOptions } from '@absoluteui/components/upload-queue';
import { host, seed } from '../seed.js';

/** Simulated transport: reports progress over about 1.5 s and stops when the signal aborts. */
const simulateUpload: UploadFunction = (file, { signal, onProgress }) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Upload aborted', 'AbortError'));
      return;
    }
    let step = 0;
    let timer = 0;
    const tick = (): void => {
      step += 1;
      onProgress(Math.round((file.size * step) / 10), file.size);
      if (step >= 10) resolve(undefined);
      else timer = window.setTimeout(tick, 150);
    };
    timer = window.setTimeout(tick, 150);
    signal.addEventListener('abort', () => { window.clearTimeout(timer); reject(new DOMException('Upload aborted', 'AbortError')); }, { once: true });
  });

const sample = (name: string, type: string, kb: number): File => new File([new Uint8Array(kb * 1024)], name, { type });

export default seed<UploadQueueOptions>({
  options: {
    label: 'Onboarding documents',
    upload: simulateUpload,
    concurrency: 2,
    retries: 1,
  },
  codeValues: {
    upload: "(file, { signal }) => fetch('/api/documents', { method: 'POST', body: file, signal })",
  },
  call: 'const queue = UploadQueue.create(host, $);\nqueue.add(files)',
  note: 'Uploads are simulated in the page (about 1.5 s each, cancellable). Choose files to add more.',
  mount(stage, options) {
    const pickerHost = host(stage);
    const picker = FileUpload.create(pickerHost, { label: 'Add files', multiple: true, dropZone: false });
    const h = host(stage);
    const queue = UploadQueue.create(h, options);
    pickerHost.addEventListener('aui-change', (e) => {
      if (!(e instanceof CustomEvent)) return;
      const detail: unknown = e.detail;
      if (typeof detail !== 'object' || detail === null || !('added' in detail) || !Array.isArray(detail.added)) return;
      const files = detail.added.filter((f): f is File => f instanceof File);
      picker.setValue([]);
      if (files.length) queue.add(files);
    });
    queue.add([
      sample('offer-letter.pdf', 'application/pdf', 240),
      sample('passport-scan.png', 'image/png', 820),
      sample('bank-details.pdf', 'application/pdf', 96),
    ]);
    return {
      events: h,
      update: (p) => { queue.update(p); },
      destroy: () => { queue.destroy(); picker.destroy(); h.remove(); pickerHost.remove(); },
    };
  },
});
