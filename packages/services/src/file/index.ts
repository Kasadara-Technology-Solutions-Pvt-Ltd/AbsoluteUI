/**
 * Files: read text/bytes/data URLs/streams, chunked and line reads, magic-byte detection,
 * validation, image dimensions/resize/compress, checksums, dropped folders, pasted files and the
 * file picker (docs/PLAN-HELPERS.md section 3, section 5, section 6). Importing is SSR safe; saving lives in `download`.
 */
export { readAsText, readAsArrayBuffer, readAsBytes, readAsDataUrl, readChunks, readLines, streamFile, DEFAULT_MAX_READ_BYTES, type ReadOptions, type ReadAsTextOptions, type ReadChunksOptions, type ReadLinesOptions } from './read.js';
export { detectFileType, detectFileTypeFromBytes, DETECT_SAMPLE_BYTES, type DetectedFileType } from './detect.js';
export { validateFiles, defaultFileMessage, type ValidateFilesOptions, type FileValidationResult, type FileRejection, type FileValidationError, type FileErrorCode, type FileMessageCatalog, type FileMessageParams, type ImageDimensionLimits } from './validate.js';
export { getImageDimensions, resizeImage, compressImage, type ImageDimensions, type ImageOutputType, type ResizeImageOptions, type CompressImageOptions, type ProcessedImage, type CompressedImage } from './image.js';
export { fileChecksum, DEFAULT_SHA_MAX_BYTES, type ChecksumAlgorithm, type FileChecksumOptions } from './checksum.js';
export { formatFileSize, getExtension, withExtension, splitFileName, type FileNameParts } from './names.js';
export { collectDroppedFiles, filesFromClipboardEvent, openFilePicker, type DroppedFile, type CollectDroppedFilesOptions, type CollectDroppedFilesResult, type DataTransferLike, type OpenFilePickerOptions } from './dom.js';
