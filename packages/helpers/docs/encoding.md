Byte and text encodings that behave the same in every browser: UTF-8, Base64 and Base64URL (Unicode-safe, unlike raw `btoa`), hex, `data:` URLs, and fast non-cryptographic checksums. Reach for it when you move text through a byte channel, put small payloads in URLs, or detect changed content. For hashing or comparing secrets, use the services `crypto` module instead. The [Helpers and services guide](/docs/guides/helpers-and-services/) covers import and error conventions.

### How do I put a small JSON payload in a URL or header?

Base64URL has no `+`, `/`, or `=`, so the result needs no further escaping. Strings are encoded as UTF-8 first, so names with accents survive the round trip.

```ts
import { base64UrlDecodeText, base64UrlEncode } from '@absoluteui/helpers/encoding';

const state = base64UrlEncode(JSON.stringify({ employee: 'Zoë Müller', tab: 'leave' }));
/^[A-Za-z0-9_-]+$/.test(state); // => true
JSON.parse(base64UrlDecodeText(state)).employee; // => 'Zoë Müller'
```

### How do I read an image or document pasted as a data URL?

`parseDataUrl` returns the media type and the decoded bytes, or `undefined` when the URL is malformed. Set `maxBytes` so an oversized paste fails before it is decoded.

```ts
import { parseDataUrl, toDataUrl } from '@absoluteui/helpers/encoding';

const pasted = toDataUrl('Payslip 2026-09', 'text/plain');
const parsed = parseDataUrl(pasted, { maxBytes: 1024 * 1024 });
parsed?.mimeType; // => 'text/plain'
parsed?.bytes.length; // => 15
parseDataUrl('not a data url'); // => undefined
```

### How do I checksum a file that arrives in chunks?

`crc32`, `adler32`, and `fnv1a32` take the previous result as a second argument, so you can hash a stream without buffering it. The result equals the checksum of the whole content.

```ts
import { crc32 } from '@absoluteui/helpers/encoding';

const chunks = ['employee_id,name\n', 'E-1001,Asha Rao\n', 'E-1002,Liam Chen\n'];
let crc: number | undefined;
for (const chunk of chunks) crc = crc32(chunk, crc);
crc === crc32(chunks.join('')); // => true
```

### How do I derive a stable cache key or bucket from a string?

`fnv1a32` is fast and deterministic across sessions, which makes it good for cache keys, sharding, or A/B buckets. It is not a security hash: never use it for passwords or tokens.

```ts
import { fnv1a32, hexEncode } from '@absoluteui/helpers/encoding';

const bucket = fnv1a32('E-1001') % 4;
bucket === fnv1a32('E-1001') % 4; // => true // same input, same bucket
const key = fnv1a32('/api/employees?dept=finance').toString(16).padStart(8, '0');
key.length; // => 8
hexEncode('OK', { uppercase: true }); // => '4F4B'
```

### What goes wrong?

Decoders reject malformed input with a `ValidationError` instead of returning garbage. `utf8Decode` replaces invalid bytes with U+FFFD unless you pass `fatal: true`. Oversized data URLs throw a `LimitError`.

```ts
import { base64Decode, hexDecode, parseDataUrl, toDataUrl, utf8Decode } from '@absoluteui/helpers/encoding';

base64Decode('not*base64'); // => throws HLP_ENCODING_INVALID_BASE64
hexDecode('abc'); // => throws HLP_ENCODING_INVALID_HEX // odd length
utf8Decode(new Uint8Array([0xff]), { fatal: true }); // => throws HLP_ENCODING_INVALID_UTF8
parseDataUrl(toDataUrl('x'.repeat(2000)), { maxBytes: 1000 }); // => throws HLP_ENCODING_DATA_URL_TOO_LARGE
```
