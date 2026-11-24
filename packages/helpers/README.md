# @absoluteui/helpers

Pure, zero-dependency helper functions and data structures for browsers, Node.js, workers, and server rendering. Each module is its own tree-shakeable subpath import with no side effects, and works on plain data, so results serialize cleanly.

## What's in the package

- **`@absoluteui/helpers/array`**: Grouping, chunking, sorting, searching, pagination, immutable edits, and tree building for arrays.
- **`@absoluteui/helpers/async`**: Abortable sleep, timeouts, retry with backoff, concurrency limits, batching, and polling.
- **`@absoluteui/helpers/boolean`**: Lenient boolean parsing, logic operators, and accessible labels.
- **`@absoluteui/helpers/business-calendar`**: Weekends, holidays, business days, business hours, SLA deadlines, and business-day differences.
- **`@absoluteui/helpers/color`**: Colour parsing and conversion (hex, rgb, hsl, oklch) and WCAG contrast checks.
- **`@absoluteui/helpers/compare`**: Comparers, natural ordering, equality, range checks, coalescing, and pattern matching.
- **`@absoluteui/helpers/convert`**: Strict conversions that return undefined instead of NaN or Invalid Date.
- **`@absoluteui/helpers/csv`**: RFC 4180 CSV parsing (including streaming) and generation with formula-injection protection.
- **`@absoluteui/helpers/date`**: Date-only values, calendar arithmetic, fiscal periods, weeks, intervals, formatting, and parsing.
- **`@absoluteui/helpers/decimal`**: Exact fixed-point decimal arithmetic for money, with rounding modes and allocation.
- **`@absoluteui/helpers/ds`**: Data structures: queues, heaps, caches, sorted maps, tries, graphs, interval trees, and more.
- **`@absoluteui/helpers/duration`**: ISO 8601 durations: parsing, arithmetic, and spoken-friendly formatting.
- **`@absoluteui/helpers/encoding`**: UTF-8, Base64, Base64URL, hex, data URLs, and CRC-32/Adler-32/FNV-1a checksums.
- **`@absoluteui/helpers/error`**: Error classes with stable codes, Result values, safe serialization, and field-error maps for forms.
- **`@absoluteui/helpers/fn`**: Debounce, throttle, memoize, once, pipe, and compose.
- **`@absoluteui/helpers/http`**: Status reason phrases and messages for every status, failure categories, Problem Details (RFC 9457), header parsers, and response validation.
- **`@absoluteui/helpers/is`**: Type guards and assertion functions.
- **`@absoluteui/helpers/json`**: Safe JSON parsing with limits, canonical output, JSON Pointer, JSON Patch, Merge Patch, and NDJSON.
- **`@absoluteui/helpers/linq`**: Lazy LINQ: pipeable operators and a fluent Enumerable with the .NET surface.
- **`@absoluteui/helpers/number`**: Exact rounding, clamping, percentages, locale-aware parsing and formatting, bytes, ordinals, and number words.
- **`@absoluteui/helpers/object`**: Pick, omit, deep get/set/merge/clone/equal, diff and patch, flatten and unflatten, all prototype-pollution safe.
- **`@absoluteui/helpers/random`**: Crypto-backed random numbers, picks, shuffles, UUID v4/v7, IDs, passwords, and a seeded generator for tests.
- **`@absoluteui/helpers/sanitize`**: Record cleanup, file-name sanitizing, invisible-character removal, PII masking, and redaction.
- **`@absoluteui/helpers/set`**: Union, intersection, difference, and relations for arrays and Sets, with key selectors.
- **`@absoluteui/helpers/stats`**: Mean, median, percentiles, deviation, histograms, correlation, and regression.
- **`@absoluteui/helpers/string`**: Case conversion, grapheme-safe truncation, slugs, masking, templates, fuzzy search, and escaping.
- **`@absoluteui/helpers/timezone`**: IANA time-zone conversion, offsets, and explicit daylight-saving gap and overlap handling.
- **`@absoluteui/helpers/url`**: Query strings, URL joining, scheme allow-lists, same-origin checks, and open-redirect protection.
- **`@absoluteui/helpers/validate`**: Format validators (email, IBAN, card, phone, postal code, and more) and a small typed schema validator.
- **`@absoluteui/helpers/zip`**: Streaming ZIP writer and reader with zip-slip and zip-bomb protection.

## Browser support

Chrome 116, Edge 116, Firefox 125, Safari (macOS) 17, Safari (iOS and iPadOS) 18.3, or later. Details: [Browser support](https://aui.kasadara.com/docs/quality/browser-support/).

## Documentation

Full documentation: [aui.kasadara.com/docs/api/helpers/](https://aui.kasadara.com/docs/api/helpers/)

## License

Licensed under the [Apache License 2.0](https://aui.kasadara.com/license/). Copyright (c) 2026 Kasadara Technology Solutions Pvt Ltd; see the LICENSE and NOTICE files in this package. AbsoluteUI is open source, Kasadara's contribution to the open-source community; the source is at https://github.com/Kasadara-Technology-Solutions-Pvt-Ltd/AbsoluteUI. Report vulnerabilities as described in the [Security Policy](https://aui.kasadara.com/security/).
