// Upload showcase: pick or drop documents, then watch the queue upload them to a simulated
// server with progress, concurrency, failures, retries, and cancellation.
import { FileUpload, type FileUploadChangeDetail, type FileUploadRejectDetail } from '@absoluteui/components/file-upload';
import { UploadQueue } from '@absoluteui/components/upload-queue';
import { action, choice, createShowcase, hostIn, section, toggle, wait } from './kit.js';

const sc = createShowcase({
  title: 'Document upload',
  description: 'Add files (PDF, images, or text up to 5 MB), or use the sample files. Uploads go to a simulated server.',
  simulated: true,
});

let failRate = 0.25;
let speed = 1;

const pickSection = section(sc, 'Choose files', ['file-upload']);
const picker = FileUpload.create(hostIn(pickSection), {
  label: 'Documents',
  description: 'PDF, PNG, JPEG, or plain text.',
  multiple: true,
  maxFiles: 10,
  maxFileSize: 5_000_000,
  acceptTypes: ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'],
  acceptExtensions: ['.pdf', '.png', '.jpg', '.jpeg', '.txt'],
  dropZone: true,
  showConstraints: true,
});

const queueSection = section(sc, 'Uploads', ['upload-queue', 'file-upload']);
const queue = UploadQueue.create(hostIn(queueSection), {
  label: 'Uploads',
  concurrency: 2,
  retries: 1,
  retryDelay: 500,
  preview: true,
  // The simulated server: progress in steps, a random failure rate, and cancellation.
  upload: async (file, { signal, onProgress }) => {
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      await wait((150 + Math.min(file.size / 5000, 250)) / speed, signal);
      onProgress((file.size * i) / steps, file.size);
      if (i === 6 && Math.random() < failRate) throw new Error('The server answered 503.');
    }
    return { id: `${file.name}-${String(Date.now())}` };
  },
  errorMessage: (error) => (error instanceof Error ? error.message : 'Upload failed.'),
});

picker.host.addEventListener('aui-change', (e) => {
  const { added } = (e as CustomEvent<FileUploadChangeDetail>).detail;
  if (added.length > 0) {
    queue.add(added);
    picker.setValue([]);
  }
});
picker.host.addEventListener('aui-reject', (e) => {
  const { rejected } = (e as CustomEvent<FileUploadRejectDetail>).detail;
  sc.log('picker aui-reject', rejected.map((r) => `${r.file.name}: ${r.message}`));
});
sc.listen(queue.host, ['aui-complete'], 'queue');
queue.host.addEventListener('aui-change', (e) => {
  const detail = (e as CustomEvent<{ reason: string }>).detail;
  if (detail.reason !== 'progress') sc.log('queue aui-change', { reason: detail.reason });
});

const sample = (name: string, type: string, kb: number): File => new File([new Uint8Array(kb * 1024)], name, { type });
action(sc, 'Add sample files', () => {
  queue.add([sample('Contract.pdf', 'application/pdf', 820), sample('Passport scan.png', 'image/png', 1400), sample('Notes.txt', 'text/plain', 12), sample('Offer letter.pdf', 'application/pdf', 260)]);
}, ['upload-queue']);
action(sc, 'Cancel all', () => {
  queue.cancelAll();
}, ['upload-queue']);
action(sc, 'Clear finished', () => {
  queue.clearCompleted();
}, ['upload-queue']);
choice(
  sc,
  'Failure rate',
  [
    { value: '0', label: 'Never fail' },
    { value: '0.25', label: 'Sometimes (25 %)' },
    { value: '1', label: 'Always fail' },
  ],
  '0.25',
  (v) => {
    failRate = Number(v);
  },
);
choice(
  sc,
  'Network',
  [
    { value: '0.5', label: 'Slow' },
    { value: '1', label: 'Normal' },
    { value: '3', label: 'Fast' },
  ],
  '1',
  (v) => {
    speed = Number(v);
  },
);
toggle(sc, 'Disabled picker', false, (disabled) => {
  picker.update({ disabled });
}, ['file-upload']);
