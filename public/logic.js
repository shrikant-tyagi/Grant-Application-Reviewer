// Pure, deterministic logic shared by the browser and the tests. No AI, no DOM.
export const STATUSES = ['met', 'weak', 'ambiguous', 'missing'];

export const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

export function hash(s) {
  s = String(s ?? '');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

/** True only if the quote appears (whitespace/case-insensitive) in the source text. */
export const quoteInSource = (src, q) => !!norm(q) && norm(src).includes(norm(q));

export function parseDocs(text) {
  return String(text || '').split('\n').map(l => l.split('|').map(x => x.trim()))
    .filter(p => p[0]).map(p => ({ name: p[0], type: p[1] || '', desc: p[2] || '' }));
}

/** Join requirements with their mappings; unmapped requirements default to "missing". */
export function buildRows(data) {
  const byId = {};
  (data.mappings || []).forEach(m => { byId[m.req_id] = m; });
  return (data.requirements || []).map(r => {
    const m = byId[r.id] || {};
    return { ...r, type: r.type === 'recommended' ? 'recommended' : 'mandatory',
      status: STATUSES.includes(m.status) ? m.status : 'missing',
      app_quote: m.app_quote || '', note: m.note || '', docs: m.supporting_docs || [], q: m.clarification || '' };
  });
}

/** Human review overrides AI: reject => missing; correct => reviewer's status; confirm/none => AI status. */
export function effectiveStatus(row, rev = {}) {
  const v = rev[row.id];
  if (v?.d === 'reject') return 'missing';
  if (v?.d === 'correct' && STATUSES.includes(v.s)) return v.s;
  return row.status;
}

export function completion(rows, rev = {}) {
  const out = {};
  for (const t of ['mandatory', 'recommended']) {
    const L = rows.filter(r => r.type === t);
    const met = L.filter(r => effectiveStatus(r, rev) === 'met');
    out[t] = {
      total: L.length,
      met: met.length,
      confirmed: met.filter(r => ['confirm', 'correct'].includes(rev[r.id]?.d)).length,
      reviewed: L.filter(r => rev[r.id]).length,
      pct: L.length ? Math.round((100 * met.length) / L.length) : 0
    };
  }
  return out;
}

/** An assessment is stale if the guideline, application or document list changed since analysis. */
export const isStale = (an, g, a, d) =>
  !!an && (an.gh !== hash(g) || an.ah !== hash(a) || an.dh !== hash(d));

/** A missing document counts as supplied if a metadata name matches it or the user ticked it. */
export function missingDocuments(data, docs, ticks = {}) {
  return (data.missing_documents || []).map((m, i) => {
    const n = norm(m.name);
    const matched = docs.some(d => norm(d.name).includes(n) || n.includes(norm(d.name)));
    return { key: i, name: m.name, req: m.req_id || '', supplied: matched || !!ticks[i] };
  });
}

export function buildSummary({ an, rows, rev = {}, dismissed = {}, ticks = {}, docs = [] }) {
  const C = completion(rows, rev);
  const L = ['REVIEWED COMPLETENESS SUMMARY',
    'This is NOT a legal or funding-eligibility determination. Final decisions rest with the funder.', '',
    `Guideline v${an.gv} | Application v${an.av} | Analyzed ${an.ts.slice(0, 16).replace('T', ' ')}`, '',
    `Mandatory: ${C.mandatory.met}/${C.mandatory.total} met (${C.mandatory.pct}%), ${C.mandatory.confirmed} human-confirmed, ${C.mandatory.reviewed} reviewed`,
    `Recommended: ${C.recommended.met}/${C.recommended.total} met (${C.recommended.pct}%), ${C.recommended.confirmed} human-confirmed, ${C.recommended.reviewed} reviewed`, ''];
  const unrev = rows.filter(r => !rev[r.id]).length;
  if (unrev) L.push(`Note: ${unrev} requirement(s) have not been reviewed by a person; their status is the AI's provisional view.`, '');
  for (const t of ['mandatory', 'recommended']) {
    const g = rows.filter(r => r.type === t && effectiveStatus(r, rev) !== 'met');
    L.push(`${t.toUpperCase()} items not met (${g.length}):`);
    g.forEach(r => L.push(`- ${r.id} [${effectiveStatus(r, rev)}] ${r.text}${rev[r.id]?.c ? ' | Reviewer: ' + rev[r.id].c : ''}`));
    L.push('');
  }
  const cl = (an.data.unsupported_claims || []).filter((_, i) => !dismissed[i]);
  L.push(`Unsupported claims (${cl.length}):`, ...cl.map(c => `- ${c.claim}`), '');
  const md = missingDocuments(an.data, docs, ticks).filter(m => !m.supplied);
  L.push(`Missing supporting documents (${md.length}):`, ...md.map(m => `- ${m.name} (${m.req})`), '');
  const qs = rows.filter(r => r.q && effectiveStatus(r, rev) !== 'met');
  L.push('Open clarification questions:', ...qs.map(r => `- ${r.id}: ${r.q}`));
  return L.join('\n');
}
