import { FileUpload, type FileUploadOptions } from '@absoluteui/components/file-upload';
import { host, seed } from '../seed.js';

export default seed<FileUploadOptions>({
  options: {
    label: 'Supporting documents',
    description: 'Payslips or certificates for your claim.',
    multiple: true,
    acceptExtensions: ['.pdf', '.png', '.jpg'],
    maxFileSize: 5 * 1024 * 1024,
    showConstraints: true,
  },
  call: 'FileUpload.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = FileUpload.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
