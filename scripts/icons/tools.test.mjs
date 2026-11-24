// Tests of the icon build tools (node --test scripts/icons/tools.test.mjs). Node's built-in runner: no dependencies.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileSource } from './compile.mjs';
import { bounds, parsePath, parseTransform, samplePath, serializePath, transformPath } from './geometry.mjs';
import { parseSvg } from './svg-parse.mjs';

const NS = 'http://www.w3.org/2000/svg';
const entry = { id: 'sample', category: 'navigation', description: 'A sample.', variants: ['outline'], layers: [], animations: [], mirror: false };
const doc = (body, rootExtra = '') => `<svg xmlns="${NS}" viewBox="0 0 24 24" data-id="sample"${rootExtra}>\n${body}\n</svg>\n`;
const outline = (shapes) => `<g data-variant="outline"><g data-layer="base" data-role="primary" data-paint="stroke">${shapes}</g></g>`;
const compile = (text, e = entry) => compileSource(text, { id: 'sample', kind: 'vector', file: 'sample.svg', entry: e });

test('parser accepts the restricted subset and rejects markup tricks', () => {
  const tree = parseSvg(`<!-- note -->\n<svg a="1"><g b="2"/></svg>`);
  assert.equal(tree.name, 'svg');
  assert.equal(tree.children[0]?.attributes.b, '2');
  for (const bad of ['<!DOCTYPE svg><svg/>', '<?xml version="1.0"?><svg/>', '<svg>text</svg>', '<svg a=\'1\'/>', '<svg a="&amp;"/>', '<svg><![CDATA[x]]></svg>', '<svg/><svg/>', '<svg><g></svg>', '<svg a="1" a="2"/>']) {
    assert.throws(() => parseSvg(bad), undefined, bad);
  }
});

test('paths normalize to absolute commands and serialize deterministically', () => {
  assert.equal(serializePath(parsePath('m9 6 6 6-6 6')), 'M9 6L15 12L9 18');
  assert.equal(serializePath(parsePath('M4 4h16v16H4z')), 'M4 4H20V20H4Z');
  assert.throws(() => parsePath('M0 0 url(x)'));
  assert.throws(() => parsePath('L1 1'));
});

test('similarity transforms flatten, including arcs under rotation and reflection', () => {
  const rotated = transformPath(parsePath('M12 4L12 20'), parseTransform('rotate(90 12 12)'));
  assert.equal(serializePath(rotated), 'M20 12L4 12');
  const mirrored = transformPath(parsePath('M4 12A8 8 0 0 1 20 12'), parseTransform('translate(24 0) scale(-1 1)'));
  assert.equal(serializePath(mirrored), 'M20 12A8 8 0 0 0 4 12');
  assert.throws(() => transformPath(parsePath('M0 0L1 1'), parseTransform('scale(2 1)')), /only translate/);
  assert.throws(() => parseTransform('skewX(10)'));
  const b = bounds(samplePath(parsePath('M4 12A8 8 0 0 1 20 12')));
  assert.ok(Math.abs((b[1] ?? 0) - 4) < 0.05, `arc top ${String(b[1])}`);
});

test('compiler builds a definition and checks the catalog', () => {
  const def = compile(doc(outline('<path d="m9 6 6 6-6 6"/>')));
  assert.deepEqual(def, { kind: 'vector', id: 'sample', viewBox: '0 0 24 24', variants: { outline: [{ name: 'base', role: 'primary', paint: 'stroke', nodes: [['path', { d: 'M9 6L15 12L9 18' }]] }] } });
  // Transforms are flattened into path data.
  const t = compile(doc(outline('<rect x="4" y="4" width="16" height="16" transform="rotate(90 12 12)"/>')));
  assert.equal(t.variants.outline[0]?.nodes[0]?.[0], 'path');
  // Catalog disagreements.
  assert.throws(() => compile(doc(outline('<path d="M9 6L15 12"/>'), ' data-mirror="true"')), /data-mirror must be false/);
  assert.throws(() => compile(doc(outline('<path d="M9 6L15 12"/>')), { ...entry, variants: ['outline', 'solid'] }), /differ from the catalog/);
});

test('compiler rejects unsafe or off-spec sources', () => {
  const cases = [
    [doc(outline('<path d="M9 6L15 12" style="fill:red"/>')), /style is not allowed/],
    [doc(outline('<path d="M9 6L15 12" onclick="x"/>')), /onclick is not allowed/],
    [doc(outline('<script/>')), /not an allowed shape/],
    [doc(outline('<use href="#a"/>')), /not an allowed shape/],
    [doc(outline('<path d="M0 6L15 12"/>')), /extends outside/],
    [doc('<g data-variant="outline"><g data-layer="base" data-role="primary" data-paint="fill"><rect x="4" y="4" width="16" height="16"/></g></g>'), /outline layers are strokes/],
    [doc(outline('<path d="M9 6L15 12"/>')).replace('viewBox="0 0 24 24"', 'viewBox="0 0 32 32"'), /viewBox must be/],
    [doc(outline('<path d="M9 6L15 12"/>')).replace('data-id="sample"', 'data-id="other"'), /data-id must be/],
    [doc(outline('<path d="M9 6L15 12"/>'), ' class="x"'), /class is not allowed/],
  ];
  for (const [text, pattern] of cases) assert.throws(() => compile(text), pattern);
});

test('compiler output is deterministic', () => {
  const text = doc(outline('<circle cx="12.00001" cy="12" r="9"/><path d="M12 7.5v5"/>'));
  assert.deepEqual(compile(text), compile(text));
  assert.equal(JSON.stringify(compile(text)), JSON.stringify(compile(text)));
  assert.equal(compile(text).variants.outline[0]?.nodes[0]?.[1].cx, 12);
});

test('compound layers merge shapes into one path; stroke outlines become closed shapes', () => {
  const solidEntry = { ...entry, variants: ['outline', 'solid'] };
  const text = doc(`${outline('<path d="M9 6L15 12"/>')}<g data-variant="solid"><g data-layer="base" data-role="primary" data-paint="fill" data-fill-rule="evenodd" data-compound="true"><circle cx="12" cy="12" r="10"/><polyline points="8 12.5 10.75 15.25 16 9.75" data-outline-width="2"/></g></g>`);
  const def = compile(text, solidEntry);
  const nodes = def.variants.solid[0].nodes;
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0][0], 'path');
  assert.equal((nodes[0][1].d.match(/M/g) ?? []).length, 2);
  assert.equal(def.variants.solid[0].fillRule, 'evenodd');
  assert.throws(() => compile(doc(outline('<rect x="4" y="4" width="16" height="16" data-outline-width="2"/>'))), /data-outline-width is not allowed/);
});

test('duotone variants need a secondary fill layer', () => {
  const duo = { ...entry, variants: ['outline', 'duotone'], layers: ['base', 'secondary'] };
  const text = doc(`${outline('<path d="M9 6L15 12"/>')}<g data-variant="duotone"><g data-layer="base" data-role="primary" data-paint="stroke"><path d="M9 6L15 12"/></g></g>`);
  assert.throws(() => compile(text, duo), /secondary fill layer/);
});
