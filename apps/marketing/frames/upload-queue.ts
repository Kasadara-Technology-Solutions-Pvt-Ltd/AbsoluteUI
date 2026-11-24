// Gallery preview for Upload Queue (docs/PLAN-R4.md C7): its docs examples upload with
// fetch, so they do not render on a static site. This frame simulates the transfer with
// a local timer and progress callbacks; nothing leaves the page.
import { UploadQueue } from '@absoluteui/components/upload-queue';
import './runtime.js';

const host = document.getElementById('queue');
if (host) {
  const queue = UploadQueue.create(host, {
    label: 'Uploads',
    upload: (file, { signal, onProgress }) =>
      new Promise((resolve, reject) => {
        let loaded = 0;
        const step = Math.max(1, Math.ceil(file.size / 20));
        const timer = setInterval(() => {
          loaded = Math.min(file.size, loaded + step);
          onProgress(loaded, file.size);
          if (loaded >= file.size) {
            clearInterval(timer);
            resolve({ name: file.name });
          }
        }, 120);
        signal.addEventListener('abort', () => {
          clearInterval(timer);
          reject(signal.reason instanceof Error ? signal.reason : new Error('Cancelled'));
        });
      }),
  });
  const file = (name: string, size: number, type: string): File => new File([new Uint8Array(size)], name, { type });
  queue.add([file('offer-letter.pdf', 240_000, 'application/pdf'), file('passport-scan.png', 820_000, 'image/png'), file('bank-details.csv', 12_000, 'text/csv')]);
}
