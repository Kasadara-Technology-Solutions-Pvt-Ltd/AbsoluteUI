import { describe, expect, expectTypeOf, it } from 'vitest';
import fc from 'fast-check';
import {
  v,
  validate,
  createValidator,
  defaultMessages,
  type Infer,
  type Schema,
  isEmail,
  isUrl,
  isHttpUrl,
  isPhoneE164,
  isPhone,
  isIban,
  isBic,
  luhnCheck,
  isCreditCard,
  cardBrand,
  isUuid,
  isUlid,
  isIpv4,
  isIpv6,
  isCidr,
  isMacAddress,
  isHexColor,
  isSlug,
  isStrongPassword,
  isPostalCode,
  POSTAL_CODE_COUNTRIES,
  isIsoDate,
  isIsoDateTime,
  isJwtShape,
  isSemver,
  parseSemver,
  compareSemver,
  isLatitude,
  isLongitude,
  isEan13,
  isIsbn,
} from '@absoluteui/helpers/validate';
import { ValidationError } from '@absoluteui/helpers/error';
import { plainDate } from '../src/date/plain-date.js';

const timed = (fn: () => void): number => {
  const t = performance.now();
  fn();
  return performance.now() - t;
};

describe('isEmail', () => {
  it('accepts practical addresses', () => {
    for (const ok of ['ada@example.com', 'first.last+tag@sub.example.co.uk', "o'brien@example.ie", 'x@a-b.io', 'user_1!#$%&*=?^`{|}~@example.org']) expect(isEmail(ok)).toBe(true);
  });
  it('rejects malformed addresses', () => {
    for (const bad of ['', 'plain', '@x.com', 'a@', 'a..b@x.com', '.a@x.com', 'a.@x.com', 'a@x', 'a@-x.com', 'a@x-.com', 'a@x..com', 'a b@x.com', '"quoted"@x.com', 'a@[127.0.0.1]', 'a@1.2.3.4', 'a@b@c.com', 'ü@x.com', 42, null]) {
      expect(isEmail(bad)).toBe(false);
    }
    expect(isEmail('a@localhost')).toBe(false);
    expect(isEmail('a@localhost', { requireTld: false })).toBe(true);
  });
  it('enforces length limits (254 total, 64 local)', () => {
    expect(isEmail(`${'a'.repeat(64)}@x.com`)).toBe(true);
    expect(isEmail(`${'a'.repeat(65)}@x.com`)).toBe(false);
    expect(isEmail(`a@${'b'.repeat(63)}.com`)).toBe(true);
    expect(isEmail(`a@${'b'.repeat(64)}.com`)).toBe(false);
    expect(isEmail(`a@${'b.'.repeat(126)}com`)).toBe(false);
  });
  it('supports internationalized addresses on request', () => {
    expect(isEmail('用户@例子.广告', { allowIdn: true })).toBe(true);
    expect(isEmail('josé@bücher.de', { allowIdn: true })).toBe(true);
    expect(isEmail('josé@bücher.de')).toBe(false);
    expect(isEmail(`a${String.fromCharCode(0x202e)}b@x.com`, { allowIdn: true })).toBe(false);
  });
  it('is fast on adversarial input', () => {
    for (const a of ['a'.repeat(100_000), `${'a.'.repeat(120)}@${'b.'.repeat(120)}`, '@'.repeat(250)]) expect(timed(() => isEmail(a))).toBeLessThan(50);
  });
});

describe('isUrl', () => {
  it('uses an allow-list of schemes', () => {
    expect(isUrl('https://example.com/a?b=1#c')).toBe(true);
    expect(isHttpUrl('http://localhost:8080')).toBe(true);
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'ftp://x.com', '//x.com', '/relative', 'https://', 'not a url']) expect(isUrl(bad)).toBe(false);
    expect(isUrl('ftp://x.com', { schemes: ['ftp'] })).toBe(true);
    expect(isUrl('mailto:a@x.com', { schemes: ['mailto'], requireHost: false })).toBe(true);
  });
  it('rejects credentials, whitespace and control characters', () => {
    expect(isUrl('https://user:pass@example.com')).toBe(false);
    expect(isUrl('https://user:pass@example.com', { allowCredentials: true })).toBe(true);
    expect(isUrl('https://exa\nmple.com')).toBe(false);
    expect(isUrl('https://example.com/\t')).toBe(false);
    expect(isUrl(' https://example.com')).toBe(false);
    expect(isUrl(`https://example.com/${'a'.repeat(3000)}`)).toBe(false);
  });
});

describe('phones', () => {
  it('validates E.164 and loose input', () => {
    expect(isPhoneE164('+442079460958')).toBe(true);
    for (const bad of ['442079460958', '+0442079460958', '+44 20 7946 0958', '+1234567890123456', '+12345']) expect(isPhoneE164(bad)).toBe(false);
    expect(isPhone('+1 (555) 010-9999')).toBe(true);
    expect(isPhone('020 7946 0958')).toBe(true);
    expect(isPhone('555-0199')).toBe(true);
    for (const bad of ['123456', '1'.repeat(16), '555-CALL-NOW', '12+34567890', '']) expect(isPhone(bad)).toBe(false);
  });
});

describe('banking and cards', () => {
  it('validates IBANs (ISO 13616 examples)', () => {
    for (const ok of ['GB82 WEST 1234 5698 7654 32', 'GB82WEST12345698765432', 'DE89 3704 0044 0532 0130 00', 'FR14 2004 1010 0505 0001 3M02 606', 'NL91ABNA0417164300', 'NO9386011117947', 'BE68539007547034', 'gb82west12345698765432']) {
      expect(isIban(ok)).toBe(true);
    }
    for (const bad of ['GB82 WEST 1234 5698 7654 33', 'GB82WEST123456987654', 'XX82WEST12345698765432', 'DE89370400440532013001', '', 'GB82-WEST-1234']) expect(isIban(bad)).toBe(false);
  });
  it('validates BICs', () => {
    expect(isBic('DEUTDEFF')).toBe(true);
    expect(isBic('DEUTDEFF500')).toBe(true);
    expect(isBic('deutdeff')).toBe(true);
    for (const bad of ['DEUT1EFF', 'DEUTDEF', 'DEUTDEFF50', 'DEUTDEFF5000']) expect(isBic(bad)).toBe(false);
  });
  it('checks Luhn and card numbers', () => {
    expect(luhnCheck('79927398713')).toBe(true);
    expect(luhnCheck('79927398710')).toBe(false);
    expect(luhnCheck('7992a398713')).toBe(false);
    expect(luhnCheck('')).toBe(false);
    expect(isCreditCard('4111 1111 1111 1111')).toBe(true);
    expect(isCreditCard('4111-1111-1111-1111')).toBe(true);
    expect(isCreditCard('4111 1111 1111 1112')).toBe(false);
    expect(isCreditCard('00000000000')).toBe(false);
    expect(isCreditCard('4111x1111')).toBe(false);
  });
  it('detects card brands from IIN ranges (published test numbers)', () => {
    const cases: [string, string | undefined][] = [
      ['4111111111111111', 'visa'],
      ['4012888888881881', 'visa'],
      ['5555555555554444', 'mastercard'],
      ['2223003122003222', 'mastercard'],
      ['378282246310005', 'amex'],
      ['371449635398431', 'amex'],
      ['6011111111111117', 'discover'],
      ['6221260000000000', 'discover'],
      ['30569309025904', 'diners'],
      ['3566002020360505', 'jcb'],
      ['6200000000000005', 'unionpay'],
      ['6759649826438453', 'maestro'],
      ['5018000000000009', 'maestro'],
      ['3782822463100050', undefined],
      ['9111111111111111', undefined],
    ];
    for (const [n, brand] of cases) expect(cardBrand(n)).toBe(brand);
  });
});

describe('identifiers and network addresses', () => {
  it('validates UUIDs and ULIDs', () => {
    expect(isUuid('0190f2a8-1b2c-7d3e-8f40-123456789abc')).toBe(true);
    expect(isUuid('0190f2a8-1b2c-7d3e-8f40-123456789abc', 7)).toBe(true);
    expect(isUuid('0190f2a8-1b2c-7d3e-8f40-123456789abc', 4)).toBe(false);
    expect(isUuid('550e8400-e29b-41d4-a716-446655440000', 4)).toBe(true);
    expect(isUuid('00000000-0000-0000-0000-000000000000')).toBe(true);
    expect(isUuid('FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF')).toBe(true);
    expect(isUuid('00000000-0000-0000-0000-000000000000', 4)).toBe(false);
    for (const bad of ['550e8400-e29b-41d4-c716-446655440000', '550e8400e29b41d4a716446655440000', '550e8400-e29b-91d4-a716-446655440000', '{550e8400-e29b-41d4-a716-446655440000}']) expect(isUuid(bad)).toBe(false);
    expect(isUlid('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(true);
    expect(isUlid('81ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(false);
    expect(isUlid('01ARZ3NDEKTSV4RRFFQ69G5FAU')).toBe(false);
  });
  it('validates IPv4, IPv6 and CIDR', () => {
    for (const ok of ['0.0.0.0', '192.168.0.1', '255.255.255.255']) expect(isIpv4(ok)).toBe(true);
    for (const bad of ['256.1.1.1', '01.2.3.4', '1.2.3', '1.2.3.4.5', '1.2.3.-4', ' 1.2.3.4', '1..2.3']) expect(isIpv4(bad)).toBe(false);
    for (const ok of ['::', '::1', '2001:db8::ff00:42:8329', '2001:0db8:0000:0000:0000:ff00:0042:8329', 'fe80::1', '::ffff:192.0.2.128', '64:ff9b::192.0.2.33', '1:2:3:4:5:6:7:8', '1::8']) expect(isIpv6(ok)).toBe(true);
    for (const bad of ['1:2:3:4:5:6:7:8:9', '1::2::3', '12345::', 'g::1', '1:2:3:4:5:6:7::8', '::ffff:999.0.2.128', '192.0.2.128::', 'fe80::1%eth0', ':1:2:3:4:5:6:7']) expect(isIpv6(bad)).toBe(false);
    expect(isCidr('10.0.0.0/8')).toBe(true);
    expect(isCidr('2001:db8::/32')).toBe(true);
    expect(isCidr('10.0.0.0/33')).toBe(false);
    expect(isCidr('2001:db8::/129')).toBe(false);
    expect(isCidr('10.0.0.0/08')).toBe(false);
    expect(isCidr('10.0.0.0/8', 6)).toBe(false);
    expect(isCidr('10.0.0.0')).toBe(false);
  });
  it('validates MAC addresses, hex colours and slugs', () => {
    for (const ok of ['01:23:45:67:89:AB', '01-23-45-67-89-ab', '0123.4567.89ab']) expect(isMacAddress(ok)).toBe(true);
    for (const bad of ['01:23:45:67:89', '01:23-45:67:89:ab', '0123456789ab', 'GG:23:45:67:89:ab']) expect(isMacAddress(bad)).toBe(false);
    for (const ok of ['#abc', '#abcd', '#a1b2c3', '#a1b2c3d4']) expect(isHexColor(ok)).toBe(true);
    for (const bad of ['abc', '#ab', '#abcde', '#ggg', '#a1b2c3d4e']) expect(isHexColor(bad)).toBe(false);
    expect(isHexColor('#abcd', { alpha: false })).toBe(false);
    expect(isHexColor('abc', { requireHash: false })).toBe(true);
    expect(isSlug('hello-world-2')).toBe(true);
    for (const bad of ['Hello', 'a--b', '-a', 'a-', 'a_b', '', 'a'.repeat(201)]) expect(isSlug(bad)).toBe(false);
    expect(timed(() => isSlug(`${'a-'.repeat(99)}-`))).toBeLessThan(50);
  });
});

describe('isStrongPassword', () => {
  it('reports every failed rule as a code', () => {
    expect(isStrongPassword('Tr1cky-Horse-42')).toEqual({ valid: true, failures: [] });
    expect(isStrongPassword('short').failures).toEqual(['too-short', 'missing-uppercase', 'missing-digit', 'missing-symbol']);
    expect(isStrongPassword('Password123!').failures).toEqual(['common']);
    expect(isStrongPassword('!!Qwerty2024!!').failures).toEqual(['common']);
    expect(isStrongPassword('Has Space 12!x').failures).toEqual(['contains-space']);
    expect(isStrongPassword('Has Space 12!x', { allowSpaces: true }).valid).toBe(true);
    expect(isStrongPassword('A'.repeat(200) + 'a1!').failures).toContain('too-long');
    expect(isStrongPassword('Acme-Corp-2026', { extraCommon: ['acme-corp'] }).failures).toEqual(['common']);
  });
  it('supports passphrase policies and Unicode classes', () => {
    const passphrase = { requireUppercase: false, requireDigit: false, requireSymbol: false, allowSpaces: true, minLength: 15 } as const;
    expect(isStrongPassword('correct horse battery staple', passphrase).valid).toBe(true);
    expect(isStrongPassword('Ärger-Über-2026')).toEqual({ valid: true, failures: [] });
    expect(isStrongPassword('abcdefghijkl', { requireUppercase: false, requireDigit: false, requireSymbol: false, minClasses: 2 }).failures).toEqual(['too-few-classes']);
    expect(isStrongPassword(String.fromCharCode(0xd83d, 0xde00).repeat(10) + 'a', { requireUppercase: false, requireDigit: false, requireSymbol: false }).failures).toEqual(['too-short']);
  });
});

describe('postal codes', () => {
  it('validates documented countries', () => {
    const ok: [string, string][] = [
      ['90210', 'US'], ['90210-1234', 'US'], ['K1A 0B1', 'CA'], ['k1a0b1', 'CA'], ['SW1A 1AA', 'GB'], ['M1 1AE', 'GB'], ['EC1A 1BB', 'GB'], ['GIR 0AA', 'GB'],
      ['110001', 'IN'], ['110 001', 'IN'], ['10115', 'DE'], ['75008', 'FR'], ['2000', 'AU'], ['100-0001', 'JP'], ['1000001', 'JP'], ['1011 AB', 'NL'], ['01310-000', 'BR'],
      ['D02 X285', 'IE'], ['28013', 'ES'], ['00-950', 'PL'], ['1000-001', 'PT'], ['114 55', 'SE'], ['018956', 'SG'],
    ];
    for (const [code, country] of ok) expect(isPostalCode(code, country)).toBe(true);
    const bad: [string, string][] = [
      ['9021', 'US'], ['D1A 0B1', 'CA'], ['SW1A1AAA', 'GB'], ['011001', 'IN'], ['1011 SA', 'NL'], ['53000', 'ES'], ['90210 ', 'US'], ['12345', 'ZZ'],
    ];
    for (const [code, country] of bad) expect(isPostalCode(code, country)).toBe(false);
    expect(isPostalCode('90210', 'us')).toBe(true);
    expect(POSTAL_CODE_COUNTRIES).toContain('GB');
    expect(isPostalCode('1', 'constructor')).toBe(false);
  });
});

describe('dates, versions, tokens', () => {
  it('validates strict ISO dates and date-times', () => {
    expect(isIsoDate('2024-02-29')).toBe(true);
    for (const bad of ['2023-02-29', '2026-13-01', '2026-00-10', '2026-9-29', '2026-09-29T00:00Z', '+002026-09-29']) expect(isIsoDate(bad)).toBe(false);
    for (const ok of ['2026-09-29T14:30:00Z', '2026-09-29T14:30:00.123456789+05:30', '2026-09-29T14:30-08:00']) expect(isIsoDateTime(ok)).toBe(true);
    for (const bad of ['2026-09-29T24:00:00Z', '2026-09-29t14:30:00z', '2026-09-29 14:30:00Z', '2026-09-29T14:30:00', '2026-09-29T14:30:60Z', '2026-02-30T00:00:00Z', '2026-09-29T14:30:00+24:00', '2026-09-29T14:30:00.1234567890Z']) {
      expect(isIsoDateTime(bad)).toBe(false);
    }
    expect(isIsoDateTime('2026-09-29T14:30:00', { requireOffset: false })).toBe(true);
    expect(isIsoDateTime('2026-09-29T14:30Z', { requireSeconds: true })).toBe(false);
  });
  it('checks JWT shape only', () => {
    const b64 = (o: unknown): string => btoa(JSON.stringify(o)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '1', name: 'Ada' })}.c2lnbmF0dXJl`;
    expect(isJwtShape(token)).toBe(true);
    expect(isJwtShape(`${b64({ alg: 'none' })}.${b64({ sub: '1' })}.`)).toBe(true);
    expect(isJwtShape(`${b64({ typ: 'JWT' })}.${b64({ sub: '1' })}.x`)).toBe(false);
    expect(isJwtShape(`${b64({ alg: 'HS256' })}.${b64([1])}.x`)).toBe(false);
    expect(isJwtShape('a.b')).toBe(false);
    expect(isJwtShape('a.b.c.d')).toBe(false);
    expect(isJwtShape('eyJ+.eyJ.x')).toBe(false);
    expect(isJwtShape(`${'a'.repeat(20_000)}.b.c`)).toBe(false);
  });
  it('parses and compares SemVer 2.0.0', () => {
    expect(parseSemver('1.2.3-rc.1+build.5')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: ['rc', '1'], build: ['build', '5'] });
    for (const ok of ['0.0.0', '1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-0.3.7', '1.0.0-x.7.z.92', '1.0.0+20130313144700', '1.0.0-beta+exp.sha.5114f85', '1.0.0-x-y-z.--']) expect(isSemver(ok)).toBe(true);
    for (const bad of ['1', '1.2', '01.0.0', '1.0.0-', '1.0.0-01', '1.0.0+', '1.0.0-alpha..1', 'v1.0.0', '1.0.0 ', '99999999999999999.0.0']) expect(isSemver(bad)).toBe(false);
    // Precedence example from semver.org §11.
    const order = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0'];
    for (let i = 0; i < order.length - 1; i++) {
      expect(compareSemver(order[i]!, order[i + 1]!)).toBe(-1);
      expect(compareSemver(order[i + 1]!, order[i]!)).toBe(1);
    }
    expect(compareSemver('1.0.0+a', '1.0.0+b')).toBe(0);
    expect(compareSemver('2.0.0', '10.0.0')).toBe(-1);
    expect(() => compareSemver('x', '1.0.0')).toThrow(ValidationError);
  });
  it('compareSemver is antisymmetric and consistent with sorting', () => {
    const id = fc.oneof(fc.integer({ min: 0, max: 20 }).map(String), fc.constantFrom('alpha', 'beta', 'rc', 'x-y'));
    const ver = fc.tuple(fc.nat(3), fc.nat(3), fc.nat(3), fc.array(id, { maxLength: 3 })).map(([a, b, c, pre]) => `${a}.${b}.${c}${pre.length ? `-${pre.join('.')}` : ''}`);
    fc.assert(fc.property(ver, ver, ver, (a, b, c) => {
      expect(compareSemver(a, b)).toBe(-compareSemver(b, a) || 0);
      if (compareSemver(a, b) <= 0 && compareSemver(b, c) <= 0) expect(compareSemver(a, c)).toBeLessThanOrEqual(0);
    }));
  });
  it('validates coordinates and product codes', () => {
    expect(isLatitude(51.5074)).toBe(true);
    expect(isLatitude('-90')).toBe(true);
    expect(isLatitude(90.0001)).toBe(false);
    expect(isLatitude('1e1')).toBe(false);
    expect(isLongitude('-0.1278')).toBe(true);
    expect(isLongitude(181)).toBe(false);
    expect(isLongitude(Number.NaN)).toBe(false);
    expect(isEan13('4006381333931')).toBe(true);
    expect(isEan13('4006381333932')).toBe(false);
    expect(isIsbn('978-0-306-40615-7')).toBe(true);
    expect(isIsbn('0-306-40615-2')).toBe(true);
    expect(isIsbn('0-8044-2957-X')).toBe(true);
    expect(isIsbn('0-306-40615-2', 13)).toBe(false);
    expect(isIsbn('978-0-306-40615-7', 10)).toBe(false);
    expect(isIsbn('977-0-306-40615-7')).toBe(false);
    expect(isIsbn('0-306-40615-3')).toBe(false);
  });
});

describe('ReDoS resistance', () => {
  it('every format check returns quickly on pathological input', () => {
    const inputs = ['a'.repeat(100_000), '1'.repeat(100_000), '1.'.repeat(50_000), ':'.repeat(50_000), `${'a-'.repeat(50_000)}!`, '-'.repeat(50_000), `${'0'.repeat(50_000)}x`];
    const checks = [isEmail, isUrl, isPhoneE164, isPhone, isIban, isBic, isCreditCard, isUuid, isUlid, isIpv4, isIpv6, isCidr, isMacAddress, isHexColor, isSlug, isIsoDate, isIsoDateTime, isJwtShape, isSemver, isEan13, isIsbn, isLatitude];
    for (const input of inputs) {
      for (const check of checks) expect(timed(() => check(input))).toBeLessThan(100);
      expect(timed(() => isPostalCode(input, 'GB'))).toBeLessThan(100);
      expect(timed(() => isStrongPassword(input))).toBeLessThan(200);
    }
  });
});

describe('schema validator', () => {
  const address = v.object({ street: v.string({ min: 1, trim: true }), zip: v.string({ pattern: /^\d{5}$/, patternCode: 'zip.format' }) });
  const order = v.object({
    email: v.string({ email: true }),
    address,
    items: v.array(v.object({ sku: v.string({ min: 1 }), qty: v.number({ integer: true, min: 1 }) }), { min: 1 }),
    note: v.optional(v.string({ max: 10 })),
    status: v.enumOf(['draft', 'placed'] as const),
    due: v.nullable(v.date({ min: '2020-01-01' })),
  });

  it('infers types', () => {
    type Order = Infer<typeof order>;
    expectTypeOf<Order['items'][number]['qty']>().toEqualTypeOf<number>();
    expectTypeOf<Order['status']>().toEqualTypeOf<'draft' | 'placed'>();
    expectTypeOf<Order>().toHaveProperty('note');
    const partial: Order = { email: 'a@b.co', address: { street: 's', zip: '12345' }, items: [], status: 'draft', due: null };
    expect(partial.note).toBeUndefined();
  });

  it('returns typed values and builds fresh objects', () => {
    const input = { email: 'ada@example.com', address: { street: '  Main St ', zip: '12345' }, items: [{ sku: 'A', qty: 2 }], status: 'placed', due: '2026-09-29', extra: 1 };
    const r = validate(order, input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ email: 'ada@example.com', address: { street: 'Main St', zip: '12345' }, items: [{ sku: 'A', qty: 2 }], status: 'placed', due: plainDate(2026, 9, 29) });
    expect('note' in r.value).toBe(false);
    expect(r.value.address).not.toBe(input.address);
  });

  it('maps nested paths to actionable messages', () => {
    const r = validate(order, { email: 'nope', address: { street: '   ', zip: '1' }, items: [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 1 }, { sku: '', qty: 1.5 }], status: 'x', due: '2019-12-31', note: 'a'.repeat(11) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBeInstanceOf(ValidationError);
    expect(r.error.code).toBe('HLP_VALIDATE_FAILED');
    expect(r.error.fields).toEqual({
      email: 'Enter an email address in the format name@example.com.',
      'address.street': 'Enter a value for this field.',
      'address.zip': 'Check this value and correct it.',
      'items[2].sku': 'Enter a value for this field.',
      'items[2].qty': 'Enter a whole number without decimals.',
      note: 'Enter no more than 10 characters.',
      status: 'Choose one of: draft, placed.',
      due: 'Enter a date on or after 2020-01-01.',
    });
    expect(r.error.message).not.toContain('nope');
    const issues = (r.error.details as { issues: { path: string; code: string }[] }).issues;
    expect(issues.find((i) => i.path === 'address.zip')?.code).toBe('zip.format');
    for (const msg of Object.values(r.error.fields)) expect(msg).not.toMatch(/^Invalid\.?$/);
  });

  it('localizes through a replaceable catalog', () => {
    const fr = createValidator((code, p) => (code === 'string.min' ? `Saisissez au moins ${String(p.min)} caractères.` : defaultMessages(code, p)));
    const r = fr(v.object({ name: v.string({ min: 3 }) }), { name: 'ab' });
    expect(!r.ok && r.error.fields.name).toBe('Saisissez au moins 3 caractères.');
    const root = validate(v.string(), 5, { formKey: 'form' });
    expect(!root.ok && root.error.fields).toEqual({ form: 'Enter text.' });
  });

  it('rejects prototype-pollution keys and handles unknown keys', () => {
    const s = v.object({ a: v.number() });
    const evil = JSON.parse('{"a": 1, "__proto__": {"polluted": true}}') as unknown;
    const r = validate(s, evil);
    expect(r.ok).toBe(false);
    expect(!r.ok && Object.keys(r.error.fields)).toEqual(['__proto__']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(validate(v.object({ a: v.number() }, { unknownKeys: 'keep' }), JSON.parse('{"a":1,"constructor":{"prototype":{}}}')).ok).toBe(false);
    expect(validate(s, { a: 1, b: 2 })).toEqual({ ok: true, value: { a: 1 } });
    expect(validate(v.object({ a: v.number() }, { unknownKeys: 'keep' }), { a: 1, b: 2 })).toEqual({ ok: true, value: { a: 1, b: 2 } });
    const strict = validate(v.object({ a: v.number() }, { unknownKeys: 'error' }), { a: 1, 'b.c': 2 });
    expect(!strict.ok && strict.error.fields).toEqual({ '["b.c"]': 'Remove this field; it is not recognized.' });
    expect(() => v.object({ __proto__: v.number() } as unknown as Record<string, never>)).not.toThrow();
    expect(() => v.object(JSON.parse('{"__proto__": 1}') as Record<string, never>)).toThrow(ValidationError);
    expect(validate(s, new (class { a = 1; })()).ok).toBe(false);
    expect(validate(s, [1]).ok).toBe(false);
  });

  it('supports literals, unions, refine, transform, coercion', () => {
    const mode = v.union(v.literal('auto'), v.number({ min: 0 }));
    expect(validate(mode, 'auto')).toEqual({ ok: true, value: 'auto' });
    expect(validate(mode, 3)).toEqual({ ok: true, value: 3 });
    const bad = validate(mode, 'manual');
    expect(!bad.ok && bad.error.fields).toEqual({ _form: 'Enter a value in one of the accepted formats.' });
    const username = v.refine(v.string({ trim: true, lowercase: true }), (s) => s !== 'admin', 'username.reserved');
    const u = validate(username, ' Admin ');
    expect(!u.ok && (u.error.details as { issues: { code: string }[] }).issues[0]?.code).toBe('username.reserved');
    expect(validate(v.refine(v.string(), () => { throw new Error('x'); }), 'a').ok).toBe(false);
    const tags = v.transform(v.string({ trim: true }), (s) => s.split(',').map((t) => t.trim()));
    expect(validate(tags, ' a, b ')).toEqual({ ok: true, value: ['a', 'b'] });
    expect(validate(v.transform(v.string(), () => { throw new Error('x'); }), 'a').ok).toBe(false);
    expect(validate(v.number({ coerce: true }), ' 4.5 ')).toEqual({ ok: true, value: 4.5 });
    expect(validate(v.number({ coerce: true }), '4,5').ok).toBe(false);
    expect(validate(v.number(), Number.NaN).ok).toBe(false);
    expect(validate(v.number(), Infinity).ok).toBe(false);
    expect(validate(v.boolean({ coerce: true }), 'on')).toEqual({ ok: true, value: true });
    expect(validate(v.boolean(), 'on').ok).toBe(false);
    expect(validate(v.date(), new Date(Date.UTC(2026, 0, 15, 12)), {}).ok).toBe(true);
    expect(validate(v.date({ timeZone: 'UTC' }), new Date(Date.UTC(2026, 0, 15, 23)))).toEqual({ ok: true, value: plainDate(2026, 1, 15) });
    expect(validate(v.date(), '2026-02-30').ok).toBe(false);
    expect(validate(v.date(), plainDate(2026, 2, 28))).toEqual({ ok: true, value: plainDate(2026, 2, 28) });
    expect(validate(v.literal(null), null)).toEqual({ ok: true, value: null });
    expect(validate(v.string({ url: true }), 'javascript:alert(1)').ok).toBe(false);
    expect(validate(v.array(v.string(), { max: 1 }), ['a', 'b']).ok).toBe(false);
    const glob = /a/g;
    const g = v.string({ pattern: glob });
    expect(validate(g, 'a').ok && validate(g, 'a').ok && validate(g, 'a').ok).toBe(true);
  });

  it('bounds depth, size and issue count', () => {
    interface Tree { child?: Tree }
    let tree: Tree = {};
    for (let i = 0; i < 100; i++) tree = { child: tree };
    const node = (depth: number): Schema<unknown> => (depth === 0 ? v.object({}) : v.object({ child: v.optional(node(depth - 1)) }));
    const deep = validate(node(60), tree);
    expect(!deep.ok && Object.values(deep.error.fields)).toContain('The data is nested too deeply. Simplify it and try again.');
    const many = validate(v.array(v.number()), Array.from({ length: 200_001 }, () => 1));
    expect(!many.ok && many.error.fields._form).toBe('The data is too large. Reduce its size and try again.');
    const errors = validate(v.array(v.number()), Array.from({ length: 5000 }, () => 'x'));
    expect(!errors.ok && (errors.error.details as { issues: unknown[] }).issues.length).toBe(100);
    expect(timed(() => validate(v.array(v.number()), Array.from({ length: 50_000 }, () => 'x')))).toBeLessThan(500);
    expect(validate(v.string(), 'x'.repeat(2_000_000)).ok).toBe(false);
  });

  it('property: valid objects round-trip through object/array schemas unchanged', () => {
    const schema = v.object({ n: v.number({ integer: true }), s: v.string(), list: v.array(v.boolean()), opt: v.optional(v.string()) });
    const arb = fc.record({ n: fc.integer(), s: fc.string(), list: fc.array(fc.boolean()), opt: fc.option(fc.string(), { nil: undefined }) }, { requiredKeys: ['n', 's', 'list'] });
    fc.assert(fc.property(arb, (value) => {
      const r = validate(schema, value);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual(value);
    }));
  });
});
