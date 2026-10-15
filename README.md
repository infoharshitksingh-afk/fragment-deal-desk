# Deal Desk for Fragment

> **Independent work sample by Harshit Singh, not affiliated with or endorsed by Fragment.** Everything about Fragment here (products, pricing, customers, investors) comes from fragment.dev. The test data is synthetic.

An outbound agent for Fragment's founder-led sales. It looks for the moment a company is about to build or rebuild a ledger, usually visible as a ledger, payments or billing engineering hire, a new money product, a new technical leader or a funding round, and gets a researched, scored account with a first email in front of a founder. The full model is on the **ICP** tab and in `api/_lib/icp.js`.

One run:

1. **Sources** new job postings for ledger, payments, billing and money-movement engineering roles, plus reconciliation and finance-ops roles. With a TheirStack key it pulls structured postings (title, company, domain, technologies) filtered by title, technology, country and company size, and only fetches jobs posted since the last run. Without it, it searches job portals (Greenhouse, Lever, Workday, Ashby, LinkedIn Jobs) through Firecrawl.
2. **Checks the company registry**, so a company is never added or researched twice. Fragment's existing customers (from its public customers page), other ledger vendors, consultancies and staffing firms are excluded and remembered with the reason.
3. **Researches** each new company (website, careers page, news, how money moves through the product, how balances are kept today) with Firecrawl and Claude, and scores it against the Fragment ICP (fit and timing, tiers 1–3).
4. **Finds peers** at the same stage for strong-fit accounts and adds them to the queue.
5. **Finds people** for Tier 1 accounts (payments engineering lead, CTO, finance lead) through Apollo, with LinkedIn and Sales Navigator search links for manual entry.
6. **Finds emails** through Apollo or Hunter (optional, capped per run).
7. **Drafts** a first email from one of four signal-based formats.
8. **Sends** only the drafts you approve, through Resend or Gmail/SMTP, with an opt-out list and a daily cap.

Everything exports to Excel (Accounts, Contacts, Signals, Drafts, Company registry).

## Deploy (about 10 minutes)

1. Push this folder to a private GitHub repository.
2. In Vercel, choose **Add New → Project**, import the repository and deploy. No build settings are needed.
3. In the project, go to **Storage → Marketplace → Upstash (Redis)**, create a free database and connect it to the project. This sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
4. In **Settings → Environment Variables**, add `ACCESS_CODE`, a long passphrase the team will use to sign in. Optionally add `CRON_SECRET` to turn on the weekday scheduled run.
5. **Redeploy** so the variables take effect.
6. Open the site and enter the access code. In **Settings**, paste your API keys and fill in the sender details, then press **Run full pipeline**.

Then open **Settings → Test keys**. It confirms the database is connected and checks every key with a free call.

### If a run says "isn't set up" after you saved a key

- **No database connected.** Without Redis, each Vercel function has its own temporary disk, so the Settings page and the pipeline never see the same saved key. Connect Upstash Redis (step 3) and redeploy. The app now refuses to save until a database is connected, and Test keys shows which storage is in use. Any of these variable names work: `KV_REST_API_URL`/`KV_REST_API_TOKEN`, `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, the same with a custom prefix, or an Upstash `REDIS_URL`.
- **ACCESS_CODE changed** after keys were saved. Saved keys are encrypted with it, so paste them again.
- **Quick workaround:** add `FIRECRAWL_API_KEY` and `ANTHROPIC_API_KEY` as environment variables in Vercel and redeploy. Environment variables always win.

### Firecrawl rate limits

Free and Hobby Firecrawl plans allow only a few requests a minute. The app sends Firecrawl calls one at a time, waits out a rate limit and retries, and the Run page pauses for 40 seconds and continues if a limit still gets hit. On a free plan, a full run over many accounts takes a while. Set `FIRECRAWL_GAP_MS` (default 1500) higher to slow it down further.

### Pull from Tsenta with Claude in Chrome (hidden for now)

The panel is in `public/index.html` (`id="tsentaPanel"`); remove its `hidden` attribute to turn it back on.

**Import and export → Pull from Tsenta** opens your Tsenta recommendations in a new tab and copies an instruction for Claude in Chrome. Paste it into the Claude side panel, or save it once as a shortcut (for example `/tsenta`) so later pulls are one click. Claude scrolls the recommendations, opens Deal Desk at `/#import`, pastes the jobs with Source set to Tsenta, and presses Import. The first time, Tsenta asks you to sign in or create an account; Claude stops so you can do that yourself. The Tsenta page URL can be changed on the same panel.

Feed imports keep only ledger, payments, billing and finance-operations roles, and say how many unrelated roles were skipped.

To start from the accounts already sourced, use **Import and export → Import CSV or JSON** with `deal-desk-seed-accounts.json`.

## Sharing with the team

- `ACCESS_CODE` is the **owner** code. In **Settings → Team access**, the owner sets a separate **team code** (stored hashed) and shares the site link and that code.
- Everyone signed in sees and works the same data: accounts, people, drafts, the registry and run history. Edits by anyone show up for everyone.
- The team runs on the owner's API keys but never sees them (not even the last four characters). Only the owner can change keys, daily limits or the team code, or run **Test keys**. The team can change sourcing rules, sender details and sending settings.
- **Daily limits** (Settings) cap paid calls for everyone: Claude calls, Firecrawl calls, TheirStack jobs, Apollo calls and Hunter calls. When one is reached, runs stop with a clear message until midnight UTC. Today's usage shows on the Run page.
- To revoke access, press **Turn off team access** or save a new team code.

## How the ICP works

Fit (out of 50) is the segment (marketplace and payouts, cards and wallets, brokerage, usage billing, lending and more, 15), the ledger stack (homegrown ledger under strain scores highest, another ledger vendor lowest, 15), funding stage (10), HQ (5) and money-movement complexity (5). Timing (out of 50) sums signals that halve over their half-life: an engineering hire for ledger or payments work weighs most. Tier 1 needs fit of 35+ and timing of 20+.

Proof points in emails are limited to facts on Fragment's site (customers, investors, products, SOC 2 and HIPAA, the MCP server, the free plan), and drafts are told not to invent anything else.

## Starting data

`api/_lib/seed.js` is empty for a fresh workspace. Rows added there load once the first time the app opens, deduplicated against anything already there.

## API keys

| Service | Used for | Required |
|---|---|---|
| Anthropic | Reading job feeds, research, competitors, drafts | Yes |
| Firecrawl | Website and careers pages, news; job search when TheirStack isn't set | Yes |
| TheirStack | Job postings for sourcing (1 credit per job returned; capped per run in Settings) | Recommended |
| Apollo.io | People search and work emails (People Search needs a paid plan) | No |
| Hunter.io | Work emails when Apollo has none | No |
| Resend, or Gmail/SMTP | Sending approved emails | Only to send |
| ZoomInfo, Clay, RocketReach | Placeholders for later | No |

Keys pasted in Settings are encrypted (AES-256-GCM, with the key derived from `ACCESS_CODE`) and stored in your Redis. They are never sent back to the browser. Keys set as environment variables take priority. If you change `ACCESS_CODE`, paste the keys again.

## How runs work

Each pipeline stage does one unit of work per request (one search batch, one account, one email), so runs never hit serverless time limits. The Run page calls the stages in order and shows each step live. The optional cron (`vercel.json`, weekdays at 13:00 UTC) runs the same stages for up to about 4.5 minutes. It never sends email.

## Settings worth knowing

- **Roles and portals** decide what sourcing searches for. Fewer, sharper roles give cleaner results.
- **New companies per run** caps how many companies are added in each run (default 15).
- **Competitors per account** defaults to 3. Competitors don't spawn competitors of their own.
- **Find emails automatically** is off by default because it spends Apollo or Hunter credits.
- **Exclude list** keeps existing customers or partners out.

## Sending rules

- Only drafts marked **Approved** are sent, and a sent email is never resent.
- Nothing sends until the footer includes a mailing address and an opt-out line.
- Emails or domains on the opt-out list are blocked.
- A daily cap (default 25) applies across all sends.
- For more than a few dozen emails a day, send from a separate domain with SPF, DKIM and DMARC set up.

## Local development

```bash
npm install
ACCESS_CODE=dev node scripts/dev-server.js           # real APIs, data stored in /tmp
ACCESS_CODE=dev MOCK=1 node scripts/dev-server.js    # fake APIs, no keys needed
npm test                                             # end-to-end test with fake APIs
```

## Changing the model

`api/_lib/icp.js` holds the ICP, signal weights, email formats, personas, proof points and the customer exclusion list. `api/_lib/providers.js` holds every outside API endpoint in one place.
