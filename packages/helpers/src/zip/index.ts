/**
 * Streaming ZIP writer and reader on native `CompressionStream('deflate-raw')` (docs/PLAN-HELPERS.md section 3;
 * moved from @absoluteui/services/zip by R11-17, which re-exports it).
 * Writer: data descriptors, UTF-8 names, ZIP64, "zip slip" name validation. Reader: ZIP64,
 * zip-bomb guards, CRC-32 verification, sanitized names.
 */
export { createZipWriter, zipFiles, type ZipWriter, type ZipWriterOptions, type ZipAddOptions, type ZipCompression, type ZipEntryData, type ZipFileInput } from './writer.js';
export { readZip, type ReadZipOptions, type ZipEntry, type ZipArchive } from './reader.js';
