import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from './src/analyze.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const { ANTHROPIC_API_KEY, ACCESS_TOKEN, PORT = 3000 } = process.env;

if (!ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY. Copy .env.example to .env and set it.');
  process.exit(1);
}

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/examples', express.static(path.join(__dirname, 'examples')));

app.get('/healthz', (_req, res) => res.json({ ok: true }));

const limiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });

app.post('/api/analyze', limiter, async (req, res) => {
  if (ACCESS_TOKEN && req.get('x-access-token') !== ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Invalid or missing access token.' });
  }
  const { guideline, application, documents = '' } = req.body || {};
  if (typeof guideline !== 'string' || typeof application !== 'string' ||
      guideline.trim().length < 50 || application.trim().length < 50) {
    return res.status(400).json({ error: 'Provide guideline and application text (50+ characters each).' });
  }
  if (guideline.length + application.length + String(documents).length > 400_000) {
    return res.status(413).json({ error: 'Documents are too long.' });
  }
  try {
    res.json(await analyze({ guideline, application, documents: String(documents) }));
  } catch (err) {
    console.error('analyze failed:', err?.message || err);
    res.status(502).json({ error: 'Analysis failed: ' + (err?.message || 'unknown error') });
  }
});

app.listen(PORT, () => console.log(`Grant Review Assistant running on http://localhost:${PORT}`));
