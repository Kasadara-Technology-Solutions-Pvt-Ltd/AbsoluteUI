Random values from the platform's cryptographic generator (`crypto.getRandomValues`): UUIDs, URL-safe ids, tokens, passwords, one-time codes, picks, and shuffles, all without modulo bias. For tests, demos, and reproducible sample data, `createSeededRandom` gives the same sequence for the same seed; it is **not** safe for secrets. The [Helpers and services guide](/docs/guides/helpers-and-services/) lists the security rules.

### How do I create ids for new records?

`uuidV7` ids start with a millisecond timestamp, so they sort by creation time and index well in databases; `createUuidV7Generator` also keeps ids created in the same millisecond in order. `randomId` makes short URL-safe ids.

```ts
import { createUuidV7Generator, isUuid, randomId, uuidV7, uuidV7Timestamp } from '@absoluteui/helpers/random';

const id = uuidV7(); // e.g. '01922e6a-7c3b-7d4e-9f12-4c1d2e3f4a5b'
isUuid(id, 7); // => true
uuidV7Timestamp(uuidV7(Date.UTC(2026, 9, 5))); // => 1791158400000
const nextId = createUuidV7Generator();
const batch = [nextId(), nextId(), nextId()];
batch.join() === [...batch].sort().join(); // => true
randomId(12).length; // => 12
```

### How do I generate a temporary password and a one-time code?

`generatePassword` guarantees at least one character from each enabled class; `excludeAmbiguous` drops look-alikes such as `l`, `1`, `O`, and `0` for passwords read aloud or from paper. Deliver them over a secure channel and never log them.

```ts
import { generatePassword, randomOtp, randomString } from '@absoluteui/helpers/random';

const temp = generatePassword({ length: 14, excludeAmbiguous: true }); // e.g. 'q7G#mT2x!R4bNw'
[temp.length, /[a-z]/.test(temp), /[A-Z]/.test(temp), /[0-9]/.test(temp), /[Il1O0o]/.test(temp)]; // => [14, true, true, true, false]
const otp = randomOtp(6); // e.g. '042917'
/^[0-9]{6}$/.test(otp); // => true
randomString(32, { charset: 'hex' }).length; // => 32
```

### How do I use repeatable randomness in tests and demo data?

Seed `createSeededRandom` with a number or string; the same seed yields the same values on every run and in every browser, so snapshots and screenshots stay stable.

```ts
import { createSeededRandom } from '@absoluteui/helpers/random';

const depts = ['Finance', 'HR', 'IT', 'Sales'];
function demoEmployees(seed: string) {
  const rng = createSeededRandom(seed);
  return Array.from({ length: 3 }, (_, i) => ({ id: `E-${i + 1}`, dept: rng.pick(depts), salary: rng.int(40, 90) * 1000 }));
}
JSON.stringify(demoEmployees('hrms-demo')) === JSON.stringify(demoEmployees('hrms-demo')); // => true
JSON.stringify(demoEmployees('hrms-demo')) === JSON.stringify(demoEmployees('other')); // => false
```

### How do I pick reviewers or a random sample?

`sample` picks `k` distinct items and `shuffle` returns a shuffled copy; `randomPickWeighted` favours some options, for example spreading audits by team size.

```ts
import { randomPickWeighted, sample, shuffle } from '@absoluteui/helpers/random';

const reviewers = ['Maya', 'Omar', 'Lin', 'Sam', 'Ada'];
const panel = sample(reviewers, 2); // e.g. ['Lin', 'Maya']
new Set(panel).size; // => 2
shuffle(reviewers).length; // => 5
randomPickWeighted(['Finance', 'HR'], [1, 0]); // => 'Finance'
```

### What goes wrong?

Impossible requests throw instead of returning a weaker result:

```ts
import { generatePassword, sample } from '@absoluteui/helpers/random';

sample(['Maya', 'Omar'], 3); // => throws HLP_RANDOM_SAMPLE_SIZE
generatePassword({ lower: false, upper: false, digits: false, symbols: false }); // => throws HLP_RANDOM_PASSWORD
```

Never use `createSeededRandom` or `Math.random` for tokens, passwords, or ids that must be unguessable.
