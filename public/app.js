import { STATUSES, hash, quoteInSource as has, parseDocs, buildRows, effectiveStatus as eff, completion, isStale, missingDocuments, buildSummary } from './logic.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KEY = 'grant-review-state-v1';

// State: texts, version history (full text), last analysis, and human review decisions.
let S = { g: '', a: '', d: '', vers: { g: [], a: [] }, an: null, rev: {}, cl: {}, dc: {} };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };

function recordVersion(k, text) {
  const v = S.vers[k], h = hash(text);
  if (!v.length || v.at(-1).h !== h) v.push({ n: v.length + 1, h, ts: new Date().toISOString(), text });
  return v.at(-1).n;
}
function status(msg, err = false) { $('st').textContent = msg; $('st').className = err ? 'err' : ''; }

async function postAnalyze(token) {
  return fetch('/api/analyze', { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-access-token': token } : {}) },
    body: JSON.stringify({ guideline: S.g, application: S.a, documents: S.d }) });
}

async function run() {
  sync();
  if (S.g.trim().length < 50 || S.a.trim().length < 50)
    return status('Paste both the guideline and the application (at least 50 characters each).', true);
  const gv = recordVersion('g', S.g), av = recordVersion('a', S.a);
  $('run').disabled = true; status('Analyzing… this can take up to a minute.');
  try {
    let r = await postAnalyze(sessionStorage.getItem('tok'));
    if (r.status === 401) {
      const t = prompt('Access token required:'); if (!t) throw new Error('Access token required.');
      sessionStorage.setItem('tok', t); r = await postAnalyze(t);
    }
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `Server error ${r.status}`);
    if (!body.requirements?.length) throw new Error('No requirements were extracted. Check the guideline text.');
    S.an = { gh: hash(S.g), ah: hash(S.a), dh: hash(S.d), gv, av, ts: new Date().toISOString(), data: body };
    S.rev = {}; S.cl = {}; S.dc = {}; save(); status('');
  } catch (e) { status(e.message, true); }
  $('run').disabled = false; render();
}

const badge = (ok, l) => `<span class="b ${ok ? 'met' : 'weak'}">${ok ? '✓ ' : '⚠ '}${l}</span>`;
const cite = (src, q) => badge(has(src, q), has(src, q) ? 'citation verified' : 'citation not found');

function fillVersionSelects() {
  for (const k of ['g', 'a']) {
    $(k + 'sel').innerHTML = S.vers[k].map(v => `<option value="${v.n}">v${v.n} — ${v.ts.slice(0, 16).replace('T', ' ')}</option>`).join('') || '<option value="">no versions yet</option>';
    $(k + 'v').textContent = S.vers[k].length ? `(saved: v${S.vers[k].length})` : '';
  }
}

function render() {
  fillVersionSelects();
  if (!S.an) { $('out').innerHTML = ''; return; }
  const docs = parseDocs(S.d), R = buildRows(S.an.data), C = completion(R, S.rev);
  const stale = isStale(S.an, S.g, S.a, S.d), md = missingDocuments(S.an.data, docs, S.dc);
  let h = '';
  if (stale) h += `<div class="ban"><b>Assessment is stale.</b> The guideline, application or document list changed since analysis (analyzed on guideline v${S.an.gv}, application v${S.an.av}). Re-run Analyze; the summary is disabled until then.</div>`;
  const pb = (t, l) => `<div style="margin:8px 0"><b>${l}:</b> ${C[t].met}/${C[t].total} met (${C[t].pct}%) · ${C[t].confirmed} human-confirmed · ${C[t].reviewed}/${C[t].total} reviewed<div class="bar"><i style="width:${C[t].pct}%"></i></div></div>`;
  h += `<h2>Checklist completion</h2><div class="card">${pb('mandatory', 'Mandatory')}${pb('recommended', 'Recommended')}<div class="mu">Deterministic: a requirement counts as met only if its current status is “met” (AI status, or your correction; rejected mappings count as missing). Weak and ambiguous do not count.</div></div>`;
  for (const t of ['mandatory', 'recommended']) {
    h += `<h2>${t === 'mandatory' ? 'Mandatory requirements' : 'Recommendations'}</h2>`;
    R.filter(r => r.type === t).forEach(r => {
      const s = eff(r, S.rev), v = S.rev[r.id], id = esc(r.id);
      h += `<div class="card"><b>${id}</b> <span class="b ${s}">${s}</span>${v ? `<span class="b" style="color:var(--ac)">${{ confirm: 'confirmed', reject: 'rejected', correct: 'corrected' }[v.d] || 'reviewed'}</span>` : ''}<span class="mu">${esc(r.category || '')}</span>
      <div>${esc(r.text)}</div><div class="q">Guideline: “${esc(r.guideline_quote)}” ${cite(S.g, r.guideline_quote)}</div>
      ${r.app_quote ? `<div class="q">Application: “${esc(r.app_quote)}” ${cite(S.a, r.app_quote)}</div>` : '<div class="mu">No application text mapped.</div>'}
      ${r.docs.length ? `<div class="mu">Supporting docs cited: ${r.docs.map(x => esc(x) + (docs.some(d => d.name === x) ? '' : ' ⚠ not in supplied list')).join(', ')}</div>` : ''}
      <div class="mu">AI note: ${esc(r.note)}</div>${r.q ? `<div>❓ ${esc(r.q)}</div>` : ''}
      <div class="row"><button class="s ${v?.d === 'confirm' ? 'on' : ''}" data-a="confirm" data-id="${id}">Confirm</button>
      <button class="s ${v?.d === 'reject' ? 'on' : ''}" data-a="reject" data-id="${id}">Reject</button>
      <select data-a="correct" data-id="${id}"><option value="">Correct status…</option>${STATUSES.map(x => `<option ${v?.d === 'correct' && v.s === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <input type="text" data-a="cmt" data-id="${id}" placeholder="Reviewer comment" value="${esc(v?.c || '')}" style="flex:1;min-width:140px"></div></div>`;
    });
  }
  const cl = S.an.data.unsupported_claims || [];
  h += `<h2>Claims without supplied evidence (${cl.length})</h2>`;
  cl.forEach((c, i) => { h += `<div class="card" style="${S.cl[i] ? 'opacity:.55' : ''}">${esc(c.claim)}<div class="q">“${esc(c.app_quote)}” ${cite(S.a, c.app_quote)}</div><div class="mu">${esc(c.reason)}</div><div class="row"><button class="s" data-a="claim" data-id="${i}">${S.cl[i] ? 'Reinstate flag' : 'Dismiss (evidence exists elsewhere)'}</button></div></div>`; });
  h += '<h2>Supporting documents</h2>' + (md.length ? '' : '<div class="mu">No missing documents identified.</div>');
  md.forEach(m => { h += `<div class="card"><label><input type="checkbox" data-a="doc" data-id="${m.key}" ${m.supplied ? 'checked' : ''}> ${esc(m.name)}</label> <span class="mu">(for ${esc(m.req || '—')}; ticked = supplied)</span></div>`; });
  const qs = R.filter(r => r.q && eff(r, S.rev) !== 'met');
  h += `<h2>Clarification questions (${qs.length})</h2><div class="card">${qs.map(r => `<div>${esc(r.id)}: ${esc(r.q)}</div>`).join('') || '<span class="mu">None.</span>'}</div>`;
  h += `<h2>Reviewed completeness summary</h2><div class="row"><button id="sum" ${stale ? 'disabled' : ''}>Generate summary</button></div><div id="sumo"></div>`;
  $('out').innerHTML = h;
  $('sum').onclick = () => {
    const t = buildSummary({ an: S.an, rows: R, rev: S.rev, dismissed: S.cl, ticks: S.dc, docs });
    $('sumo').innerHTML = `<pre>${esc(t)}</pre><div class="row"><button class="s" id="dl">Download .txt</button><button class="s" id="cp">Copy</button></div>`;
    $('cp').onclick = () => navigator.clipboard?.writeText(t);
    $('dl').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain' })); a.download = 'review-summary.txt'; a.click(); };
  };
}

$('out').addEventListener('click', e => {
  const b = e.target.closest('button[data-a]'); if (!b) return;
  const { id, a } = b.dataset;
  if (a === 'claim') S.cl[id] = !S.cl[id];
  else if (S.rev[id]?.d === a) delete S.rev[id];
  else S.rev[id] = { ...S.rev[id], d: a };
  save(); render();
});
$('out').addEventListener('change', e => {
  const t = e.target, { id, a } = t.dataset; if (!a) return;
  if (a === 'correct' && t.value) S.rev[id] = { ...S.rev[id], d: 'correct', s: t.value };
  else if (a === 'cmt') S.rev[id] = { d: 'confirm', ...S.rev[id], c: t.value };
  else if (a === 'doc') S.dc[id] = t.checked;
  save(); render();
});

function sync() { S.g = $('gt').value; S.a = $('at').value; S.d = $('dt').value; save(); }
let timer;
['gt', 'at', 'dt'].forEach(i => $(i).addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { sync(); render(); }, 400); }));
document.querySelectorAll('input[data-f]').forEach(i => i.onchange = () => {
  const f = i.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => { $(i.dataset.f + 't').value = r.result; sync(); render(); }; r.readAsText(f);
});
for (const k of ['g', 'a']) $(k + 'rest').onclick = () => {
  const v = S.vers[k].find(x => x.n === +$(k + 'sel').value); if (!v) return;
  $(k + 't').value = v.text; sync(); render();
};
$('demo').onclick = async () => {
  const get = async f => (await fetch('/examples/' + f)).text();
  $('gt').value = await get('guideline.txt'); $('at').value = await get('application.txt'); $('dt').value = await get('documents.txt'); sync(); render();
};
$('run').onclick = run;
$('gt').value = S.g; $('at').value = S.a; $('dt').value = S.d; render();
