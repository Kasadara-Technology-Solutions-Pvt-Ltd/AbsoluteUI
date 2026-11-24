Thin, typed wrappers over the browser's Web Crypto API: digests, HMAC, AES-GCM encryption, password-based keys (PBKDF2), ECDSA signatures, and timing-safe comparison. Every function is async and accepts text (UTF-8) or bytes. Web Crypto needs a secure context (HTTPS or `localhost`); elsewhere every call rejects with `SVC_CRYPTO_UNAVAILABLE`, so check `isWebCryptoAvailable()` before offering features that depend on it.

### How do I hash a value?

`sha256Hex` and `digestHex` return lowercase hex, ready to compare with a checksum published by a server. For files, `fileChecksum` in `@absoluteui/services/file` streams large inputs.

```ts
import { digestHex, sha256Hex } from '@absoluteui/services/crypto';

await sha256Hex('payroll-2026-09.csv'); // e.g. a 64-character hex string
(await sha256Hex('abc')).length; // => 64
await digestHex('SHA-1', 'abc'); // => 'a9993e364706816aba3e25717850c26c9cd0d89d'
```

### How do I sign or verify a webhook payload with HMAC?

Sign with `hmac` or `hmacHex` and verify with `hmacVerify`, which compares in constant time. Import the secret once with `importHmacKey` when you check many messages.

```ts
import { hexDecode } from '@absoluteui/helpers/encoding';
import { hmacHex, hmacVerify, importHmacKey } from '@absoluteui/services/crypto';

const body = JSON.stringify({ event: 'employee.hired', id: 42 });
const key = await importHmacKey('webhook-secret', 'SHA-256');
const header = await hmacHex(key, body); // what the sender puts in its signature header
await hmacVerify(key, body, hexDecode(header)); // => true
await hmacVerify(key, body.replace('42', '43'), hexDecode(header)); // => false
```

Never compare signatures or tokens with `===`; use `hmacVerify` or `timingSafeEqual`.

### How do I encrypt data with a password?

Derive an AES-GCM key from the password and a random salt with `deriveKeyPbkdf2` (600,000 iterations by default), then encrypt to a compact token. Store the salt with the token; it is not secret.

```ts
import { aesGcmDecryptString, aesGcmEncryptString, deriveKeyPbkdf2, randomSalt } from '@absoluteui/services/crypto';
import { base64UrlDecode, base64UrlEncode } from '@absoluteui/helpers/encoding';

const salt = randomSalt();
const key = await deriveKeyPbkdf2('correct horse battery staple', salt);
const token = await aesGcmEncryptString(key, 'Salary review: 8% raise', { aad: 'employee:42' });
const saved = { salt: base64UrlEncode(salt), token };

const again = await deriveKeyPbkdf2('correct horse battery staple', base64UrlDecode(saved.salt));
await aesGcmDecryptString(again, saved.token, { aad: 'employee:42' }); // => 'Salary review: 8% raise'
```

`aad` binds the ciphertext to a context (here the employee), so a token copied to another record fails to decrypt. For encrypted local storage, use `createEncryptedStore` in `@absoluteui/services/storage`.

### How do I sign a document so others can verify it?

ECDSA keeps the private key in the browser (non-extractable by default) and hands out the public key.

```ts
import { ecdsaSign, ecdsaVerify, exportKey, generateEcdsaKeyPair } from '@absoluteui/services/crypto';

const { privateKey, publicKey } = await generateEcdsaKeyPair('P-256');
const signature = await ecdsaSign(privateKey, 'payslip-2026-09-42.pdf');
await ecdsaVerify(publicKey, signature, 'payslip-2026-09-42.pdf'); // => true
const jwk = await exportKey(publicKey, 'jwk'); // send this to the verifier
jwk.kty; // => 'EC'
```

### How do I read the expiry from a JWT?

`jwtDecodeUnsafe` decodes the header and payload **without** verifying anything. Use it only for display hints, such as warning before a session expires; the server must make every authorization decision.

```ts
import { jwtDecodeUnsafe } from '@absoluteui/services/crypto';

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0MiIsImV4cCI6MTc5MDAwMDAwMH0.sig';
jwtDecodeUnsafe(token)?.payload['exp']; // => 1790000000
jwtDecodeUnsafe('not-a-jwt'); // => undefined
```

### What goes wrong?

- A wrong key, wrong `aad`, or a tampered token rejects with `SVC_CRYPTO_DECRYPT_FAILED`; the error never says which, by design.
- Keys are non-extractable unless you pass `{ extractable: true }`; `exportKey` on such a key throws `SVC_CRYPTO_NOT_EXTRACTABLE`.
- SHA-1 is available for interoperability with old systems only; do not use it for new signatures.

```ts
import { aesGcmDecryptString, aesGcmEncryptString, exportKey, generateAesKey } from '@absoluteui/services/crypto';

const key = await generateAesKey();
const token = await aesGcmEncryptString(key, 'Annual leave', { aad: 'employee:42' });
await aesGcmDecryptString(key, token, { aad: 'employee:43' }); // => throws SVC_CRYPTO_DECRYPT_FAILED
await exportKey(key); // => throws SVC_CRYPTO_NOT_EXTRACTABLE
```
