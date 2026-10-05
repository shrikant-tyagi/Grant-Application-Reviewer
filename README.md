# Grant Application Reviewer

Reviews a draft funding application against a grant guideline. It extracts requirements, maps application text to each one with **verified citations**, flags missing/weak/ambiguous evidence and unsupported claims, tracks missing documents, and produces a **deterministic** completeness score and a reviewed summary.

> **Not a decision tool.** It makes no legal or funding-eligibility determination. It is a completeness aid for the applicant; final decisions rest with the funder.

## Features
- Mandatory vs recommended requirements (from the guideline's wording: must/shall vs should/may)
- Every mapping cites a guideline quote and an application quote; quotes are checked in code against the source text ("citation verified" / "citation not found")
- Clarification questions, unsupported-claim detection, missing-document tracking
- Human review: confirm, correct or reject each mapping; dismiss claim flags; tick off documents
- Completion score computed by plain code (`public/logic.js`), never by the AI
- Guideline and application versions kept (full text, restorable); assessment marked **stale** when either document or the document list changes
- Reviewed summary (copy or download)

## Architecture
```
server.js          Express server: static files, /api/analyze, rate limit, optional access token
src/analyze.js     Claude call (forced tool-use for structured JSON) + output sanitising
public/logic.js    Pure deterministic logic (scoring, staleness, citation check, summary) - unit tested
public/app.js      Browser UI; state + version history in localStorage
test/              node:test unit tests for the deterministic logic
```
The API key stays on the server. The server is stateless; review state lives in the user's browser.

## Run locally
Requires Node 22+ and an Anthropic API key.
```bash
npm install
cp .env.example .env      # set ANTHROPIC_API_KEY
npm start                 # http://localhost:3000
npm test
```

## Configuration (environment variables)
| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Required |
| `ANTHROPIC_MODEL` | Default `claude-sonnet-5-5` |
| `PORT` | Default 3000 |
| `ACCESS_TOKEN` | If set, users must enter it; **set this on any public deployment** to protect your API credits |


## Limitations
- Text input only (paste or .txt/.md). Add PDF/DOCX parsing in `public/app.js` or the server if needed.
- Supporting documents are metadata only; contents are not read.
- Review state is per browser. For teams, add a database and move state to the server.
- AI ratings can be wrong; citation checks prove a quote exists, not that it satisfies the requirement. Human review is part of the design.
- Don't upload confidential material unless your Anthropic data terms allow it.
