import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
let client;

const SYSTEM = `You review a draft funding application against a grant guideline.
You must NOT make any legal or funding-eligibility decision; you only assess documented completeness.
Rules:
- mandatory = guideline uses must/shall/required/only eligible if. recommended = should/encouraged/may/preferred.
- One mapping per requirement. Status: met | weak | ambiguous | missing.
- "ambiguous" = the application text could be read more than one way. "weak" = addressed but insufficient or unevidenced.
- guideline_quote and app_quote MUST be copied verbatim from the provided texts. Never paraphrase quotes. Use an empty string if none.
- supporting_docs may only contain names from the supplied document list.
- Unsupported claims are factual assertions (numbers, rankings, outcomes, partnerships, status) with no backing application text or supplied document.
- missing_documents are documents the guideline requires that are not in the supplied list.
- Keep notes under 25 words.`;

const str = { type: 'string' };
const TOOL = {
  name: 'submit_review',
  description: 'Submit the structured review.',
  input_schema: {
    type: 'object',
    required: ['requirements', 'mappings', 'unsupported_claims', 'missing_documents'],
    properties: {
      requirements: { type: 'array', items: { type: 'object',
        required: ['id', 'text', 'type', 'guideline_quote'],
        properties: { id: str, text: str, type: { enum: ['mandatory', 'recommended'] },
          category: { enum: ['eligibility', 'submission', 'budget', 'project', 'other'] }, guideline_quote: str } } },
      mappings: { type: 'array', items: { type: 'object',
        required: ['req_id', 'status', 'app_quote', 'note'],
        properties: { req_id: str, status: { enum: ['met', 'weak', 'ambiguous', 'missing'] }, app_quote: str,
          supporting_docs: { type: 'array', items: str }, note: str, clarification: str } } },
      unsupported_claims: { type: 'array', items: { type: 'object',
        required: ['claim', 'app_quote', 'reason'], properties: { claim: str, app_quote: str, reason: str } } },
      missing_documents: { type: 'array', items: { type: 'object',
        required: ['name'], properties: { name: str, req_id: str } } }
    }
  }
};

export async function analyze({ guideline, application, documents }) {
  client ??= new Anthropic();
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'submit_review' },
    messages: [{ role: 'user', content:
      `GUIDELINE:\n${guideline}\n\nAPPLICATION:\n${application}\n\nSUPPORTING DOCUMENTS (metadata only, one per line):\n${documents || '(none supplied)'}` }]
  });
  if (msg.stop_reason === 'max_tokens') throw new Error('Output was cut off; try shorter documents.');
  const block = msg.content.find(b => b.type === 'tool_use');
  if (!block) throw new Error('Model returned no structured result.');
  return sanitize(block.input);
}

export function sanitize(d = {}) {
  const arr = x => (Array.isArray(x) ? x : []);
  return {
    requirements: arr(d.requirements).filter(r => r?.id && r?.text),
    mappings: arr(d.mappings),
    unsupported_claims: arr(d.unsupported_claims),
    missing_documents: arr(d.missing_documents).filter(m => m?.name)
  };
}
