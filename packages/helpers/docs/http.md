The HTTP knowledge a client needs without the client: status classes and plain-language messages, RFC 9457 Problem Details, retry rules, and parsers for the headers you actually act on (`Retry-After`, `Link`, `Content-Disposition`, `ETag`, `Cache-Control`). Reach for it when you call `fetch` yourself or handle responses from another library. The HTTP client in `@absoluteui/services/http` (in preview) uses all of it; the [HTTP guide](/docs/guides/http/) covers the client, error categories, and translating status messages.

### How do I turn a failed `fetch` into a message and field errors?

`assertResponse` throws an `HttpError` for an unexpected status or content type (its message never contains the query or body). For a failure, read the Problem Details body: `problemToFieldErrors` understands the common shapes (RFC 9457 `errors`, `invalid-params`, ASP.NET, `violations`), and `userMessageForStatus` gives a message when the body has none.

```ts
import { assertResponse, parseProblemDetails, problemToFieldErrors, userMessageForStatus } from '@absoluteui/helpers/http';

const res = new Response(
  JSON.stringify({ title: 'Invalid leave request', status: 422, errors: [{ detail: 'Must be a working day.', pointer: '#/startDate' }] }),
  { status: 422, headers: { 'content-type': 'application/problem+json' } },
);
let fields: Record<string, string> = {};
let message = '';
try {
  assertResponse(res, { expectContentType: 'json' });
} catch {
  const problem = parseProblemDetails(await res.text());
  fields = problemToFieldErrors(problem);
  message = userMessageForStatus(res.status);
}
fields; // => { startDate: 'Must be a working day.' }
message; // => 'Some of the information is not valid. Check it and try again.'
```

### How do I decide whether to retry, and when?

Retry only statuses that may succeed later, and only methods that are safe to repeat: a retried POST can create a second leave request. Honour `Retry-After`, which comes as seconds or an HTTP date.

```ts
import { isIdempotentMethod, isRetryableStatus, parseRetryAfter } from '@absoluteui/helpers/http';

const retryDelay = (method: string, status: number, retryAfter: string | null, attempt: number): number | undefined => {
  if (!isRetryableStatus(status) || !isIdempotentMethod(method) || attempt >= 3) return undefined;
  return parseRetryAfter(retryAfter, Date.now(), { maxMs: 30_000 }) ?? 500 * 2 ** attempt;
};
retryDelay('GET', 503, '5', 0); // => 5000
retryDelay('GET', 429, null, 2); // => 2000
retryDelay('POST', 503, '5', 0); // => undefined // not idempotent
retryDelay('PUT', 404, null, 0); // => undefined // will not change
```

### How do I follow server-side pagination?

APIs that page with a `Link` header (`rel="next"`) need no page arithmetic: `getPaginationLinks` resolves the targets against the request URL.

```ts
import { getPaginationLinks } from '@absoluteui/helpers/http';

const link = '</api/employees?cursor=b7Kq&limit=50>; rel="next", </api/employees?limit=50>; rel="first"';
const pages = getPaginationLinks(link, 'https://hr.example.com/api/employees?limit=50');
pages.next; // => 'https://hr.example.com/api/employees?cursor=b7Kq&limit=50'
pages.prev; // => undefined // on the first page
```

### How do I save a download under the server's file name?

`parseContentDisposition` decodes `filename*` (non-ASCII names) and gives `safeFilename`, a name that is safe on every operating system. Never write the raw `filename`: it can contain a path.

```ts
import { parseContentDisposition } from '@absoluteui/helpers/http';

const header = `attachment; filename="payslip.pdf"; filename*=UTF-8''Gehaltsabrechnung%20M%C3%BCller%202026-09.pdf`;
parseContentDisposition(header)?.safeFilename; // => 'Gehaltsabrechnung Müller 2026-09.pdf'
parseContentDisposition('attachment; filename="../../boot.ini"')?.safeFilename; // => 'boot.ini'
```

### How do I avoid overwriting someone else's change?

Keep the `ETag` from the load, send it as `If-Match` on save, and treat 412 as a conflict. `etagMatchesAny` is the same check for a server or a mock; strong comparison is required for `If-Match`.

```ts
import { etagMatchesAny, httpFailureCategory, httpStatus } from '@absoluteui/helpers/http';

const loadedEtag = '"v41"';
const headers = { 'content-type': 'application/json', 'if-match': loadedEtag };
etagMatchesAny(headers['if-match'], '"v42"', { weak: false }); // => false // someone saved in between
httpFailureCategory(httpStatus.PRECONDITION_FAILED); // => 'conflict'
```

### What goes wrong?

`isProblemDetails` accepts any object with a well-typed `type`, `title`, or `status`, so it cannot tell your API's errors from a proxy's. Oversized error bodies are rejected before parsing. Log URLs with `safeUrlForLog`, which drops credentials, query, and fragment (tokens often travel there).

```ts
import { assertResponse, parseProblemDetails, safeUrlForLog } from '@absoluteui/helpers/http';

assertResponse(new Response('<html>', { headers: { 'content-type': 'text/html' } }), { expectContentType: 'json' }); // => throws HLP_HTTP_CONTENT_TYPE
parseProblemDetails('{"title":"x"}'.padEnd(2000), { maxLength: 1000 }); // => throws HLP_HTTP_PROBLEM_TOO_LARGE
parseProblemDetails('{"message":"Oops"}'); // => undefined // not problem details
safeUrlForLog('https://hr.example.com/reset?token=s3cr3t'); // => 'https://hr.example.com/reset'
```
