import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRows, completion, effectiveStatus, isStale, quoteInSource, hash, missingDocuments, parseDocs } from '../public/logic.js';

const data = {
  requirements: [
    { id: 'R1', text: 'a', type: 'mandatory', guideline_quote: 'x' },
    { id: 'R2', text: 'b', type: 'mandatory', guideline_quote: 'x' },
    { id: 'R3', text: 'c', type: 'recommended', guideline_quote: 'x' },
    { id: 'R4', text: 'd', type: 'mandatory', guideline_quote: 'x' }
  ],
  mappings: [
    { req_id: 'R1', status: 'met' }, { req_id: 'R2', status: 'weak' }, { req_id: 'R3', status: 'met' }
  ]
};

test('unmapped requirement defaults to missing', () => {
  assert.equal(buildRows(data).find(r => r.id === 'R4').status, 'missing');
});
test('completion counts only "met"', () => {
  const c = completion(buildRows(data));
  assert.equal(c.mandatory.met, 1); assert.equal(c.mandatory.total, 3); assert.equal(c.mandatory.pct, 33);
  assert.equal(c.recommended.pct, 100);
});
test('reject turns met into missing; correct overrides', () => {
  const rows = buildRows(data);
  const rev = { R1: { d: 'reject' }, R2: { d: 'correct', s: 'met' } };
  assert.equal(effectiveStatus(rows[0], rev), 'missing');
  assert.equal(effectiveStatus(rows[1], rev), 'met');
  const c = completion(rows, rev);
  assert.equal(c.mandatory.met, 1); assert.equal(c.mandatory.confirmed, 1);
});
test('stale detection', () => {
  const an = { gh: hash('g'), ah: hash('a'), dh: hash('d') };
  assert.equal(isStale(an, 'g', 'a', 'd'), false);
  assert.equal(isStale(an, 'g2', 'a', 'd'), true);
  assert.equal(isStale(an, 'g', 'a2', 'd'), true);
  assert.equal(isStale(an, 'g', 'a', 'd2'), true);
});
test('quote verification is whitespace/case tolerant but rejects invented text', () => {
  assert.equal(quoteInSource('We request  $48,000\nfor a year', 'we request $48,000 for a year'), true);
  assert.equal(quoteInSource('We request $48,000', 'We request $90,000'), false);
  assert.equal(quoteInSource('anything', ''), false);
});
test('missing documents match supplied metadata or ticks', () => {
  const docs = parseDocs('Project budget spreadsheet | XLSX | v2');
  const d = { missing_documents: [{ name: 'Project budget' }, { name: 'Board resolution' }] };
  const m = missingDocuments(d, docs, { 1: true });
  assert.deepEqual(m.map(x => x.supplied), [true, true]);
  assert.equal(missingDocuments(d, docs)[1].supplied, false);
});
