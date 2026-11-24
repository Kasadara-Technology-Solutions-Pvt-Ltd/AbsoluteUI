Safe building and reading of URLs and query strings, plus the checks that stop open redirects and `javascript:` links. Reach for it whenever a URL contains user input: a return address after sign-in, an ID in an API path, filters kept in the address bar, or a link someone typed into a profile. The [HTTP guide](/docs/guides/http/) shows how the services HTTP client builds request URLs on top of these helpers.

### How do I build a safe redirect target after sign-in?

Never redirect to a `returnTo` parameter as is. `safeRedirectTarget` keeps same-site paths and absolute URLs on the origins you allow; anything else (`//evil.test`, `/\evil.test`, other schemes) becomes the fallback.

```ts
import { getQueryParam, safeRedirectTarget } from '@absoluteui/helpers/url';

const options = { allowedOrigins: ['https://payroll.example.com'], fallback: '/home' };
const back = (url: string) => safeRedirectTarget(getQueryParam(url, 'returnTo'), options);

back('https://hr.example.com/login?returnTo=%2Fleave%2Frequests%3Fstatus%3Dopen'); // => '/leave/requests?status=open'
back('https://hr.example.com/login?returnTo=https%3A%2F%2Fpayroll.example.com%2Fpayslips'); // => 'https://payroll.example.com/payslips'
back('https://hr.example.com/login?returnTo=%2F%2Fevil.test'); // => '/home'
back('https://hr.example.com/login'); // => '/home' // parameter missing
```

### How do I put an untrusted ID into an API path?

`joinUrl` handles the slashes but does not encode, so encode each untrusted segment with `encodePathSegment`. Then add the query with `withQuery`, which encodes values and skips `undefined`.

```ts
import { encodePathSegment, joinUrl, withQuery } from '@absoluteui/helpers/url';

const employeeId = '../admin';
const path = joinUrl('https://api.example.com/v1/', 'employees', encodePathSegment(employeeId), 'payslips');
path; // => 'https://api.example.com/v1/employees/..%2Fadmin/payslips' // the slash is encoded, so no traversal
withQuery(path, { year: 2026, month: undefined, status: ['issued', 'paid'] }); // => 'https://api.example.com/v1/employees/..%2Fadmin/payslips?year=2026&status=issued&status=paid'
```

### How do I keep list filters in the address bar?

Read the current filters with `parseQuery` (null-prototype, repeated keys become arrays), change one with `withQuery`, and clear them with `removeQuery`. Other parameters and the fragment are kept.

```ts
import { parseQuery, removeQuery, withQuery } from '@absoluteui/helpers/url';

const current = '/employees?dept=finance&dept=hr&page=3#results';
parseQuery(current.split(/[?#]/)[1] ?? '').dept; // => ['finance', 'hr']
withQuery(current, { page: 1, q: 'rao' }); // => '/employees?dept=finance&dept=hr&page=1&q=rao#results'
removeQuery(current, ['dept']); // => '/employees?page=3#results'
```

### How do I show a link that a user typed?

Check it with `isSafeUrl` before it reaches `href`. The default allow-list is `http`, `https`, `mailto`, and `tel`; pass `allowedSchemes` to narrow it and `allowRelative: false` to require absolute URLs.

```ts
import { isSafeUrl } from '@absoluteui/helpers/url';

const profileLink = (url: string) => (isSafeUrl(url, { allowedSchemes: ['https'], allowRelative: false }) ? url : undefined);
profileLink('https://www.linkedin.com/in/asha-rao'); // => 'https://www.linkedin.com/in/asha-rao'
profileLink('javascript:alert(document.cookie)'); // => undefined
profileLink('http://example.com'); // => undefined // not on the narrowed list
profileLink('/relative/path'); // => undefined
```

### What goes wrong?

Unsafe input fails loudly instead of producing a surprising URL. `parseQuery` caps length (64 KiB), parameter count (1000), and nesting depth (5) by default; lower them for untrusted input.

```ts
import { buildQuery, joinUrl, parseQuery } from '@absoluteui/helpers/url';

joinUrl('/files', '../etc/passwd', { confine: true }); // => throws HLP_URL_PATH_TRAVERSAL
buildQuery(JSON.parse('{"__proto__":{"admin":true}}')); // => throws HLP_UNSAFE_KEY
parseQuery('a=1&b=2&c=3', { maxParams: 2 }); // => throws HLP_URL_TOO_MANY_PARAMS
parseQuery('a[b][c]=1', { maxDepth: 1 }); // => throws HLP_URL_TOO_DEEP
```
