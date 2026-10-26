# SupplyChain Copilot

Rule-based supply chain exception management for construction procurement. **Independent portfolio prototype using 500 synthetic orders. Not an official ArisInfra product, not connected to ArisInfra systems, not endorsed by any company. No AI or ML is used; the core app needs no API key.**

## Run it
- **Just open `dist/index.html`** in a browser (single self-contained file, data embedded, no server).
- Rebuild after editing: `python3 build.py`. Run tests: `node tests/run.js` (Node 18+, no dependencies).

## Architecture (and one deviation from the preferred stack)
The brief preferred React + TypeScript + Tailwind + Recharts. I chose dependency-free vanilla JavaScript in one file instead, because it opens anywhere without `npm install`, and rules stay in a pure, testable module.
- `src/engine.js`: CSV parsing, rules, KPIs, validation (no DOM).
- `src/template.html`: UI (5 screens + order detail drawer). Charts are accessible HTML bars (clickable), not Recharts.
- `build.py`: inlines engine + CSV into `dist/index.html`. `tests/run.js`: test suite.
A React/TypeScript port would be a sensible next step; `engine.js` can move over unchanged.

## Dataset findings (Phase 1)
500 rows, 21 columns, unique order IDs, no nulls except `actual_delivery_date` (218 blank: all non-delivered). Quantity × price = value on every row. Source quirks, left unchanged:
- Priority has **Critical 209 / Medium 95 / Low 196, no "High"**; score ranges overlap (Critical 32–96, Medium 38–64, Low 10–37).
- Source `exception_type` labels 127 *delivered* late orders and cancelled orders as exceptions; this app follows the brief's rules instead (open orders only; cancelled excluded).
- **27 delivered orders have actual delivery dates after 2026-10-27** (future-dated); flagged, not altered.
- The source's overdue flags imply an as-of date of about 2026-10-26.

## Business rules
Open = In Transit or Processing. Overdue = open and promised date < as-of date (default today, editable in Data & Methodology). Delivered lateness = actual − promised (missing actual ≠ 0; history, not an exception). Documentation exception = status ≠ Complete. Payment exception = On Hold. Cancelled orders are excluded from all exception and high-risk counts. Priority and risk score are source values, not recomputed and not a validated model.
Suggestions (most urgent first): critical overdue → escalate to supplier and site manager; overdue → confirm revised ETA; missing docs → request and verify; payment hold → refer to finance; else routine monitoring.

## KPIs (as of 2026-10-27, unfiltered)
| KPI | Definition | Value |
|---|---|---|
| Total orders / value | count; sum of order_value_inr | 500 / ₹202.45 Cr |
| Open orders | In Transit + Processing | 201 |
| Overdue-order rate | overdue open ÷ open | 181 ÷ 201 = 90.0% |
| Documentation exception rate | non-cancelled doc exceptions ÷ all orders | 178 ÷ 500 = 35.6% |
| Payment on hold | non-cancelled On Hold | 42 |
| High-risk order share | Critical/High non-cancelled ÷ non-cancelled | 209 ÷ 483 = 43.3% |
| Open order value | sum value of open orders | shown in app |
Zero denominators display "n/a".

## QA results
`node tests/run.js` → **19 passed, 0 failed** (`tests/results.txt`): the six required scenarios on real records (critical overdue SC-0002; missing docs SC-0003; payment hold SC-0077; delivered SC-0001; cancelled SC-0027; no exception SC-0001), multi-exception ordering, as-of boundary, missing actual date, zero denominators, KPI cross-check against an independent loop, and validation. A headless-DOM smoke test also exercised chart-click filtering, reset, search/empty state, filters, order drawer, supplier/site drill-down and methodology (all passed; script not packaged). **Not tested:** real browsers/devices, accessibility audit, keyboard-only walkthrough, tablet layout visually.

## Product case study
**Problem.** Procurement teams juggle suppliers, deliveries, documents and payments; it is hard to see which exceptions need action first.
**Users and jobs.** Procurement managers (triage what to chase today), site managers (know which materials are late), finance/compliance (see payment holds and missing documents). No user research was done; these are assumptions.
**Key journey.** Overview → click a chart bar or filter → Exception Management sorted by risk → open order → read why it was flagged → take the suggested step outside the tool.
**MVP scope.** In: 5 screens, 3 rule-based exceptions, filters, search, sort, drill-down, validation, methodology. Out: login, write-back or workflow, notifications, supplier messaging, live ERP data, AI summaries, recalculated risk model.
**Prioritisation.** Delivery exceptions first (largest count), then documents, then payments; transparency over sophistication so users can verify every flag.
**User stories and acceptance criteria**
1. *Procurement manager:* filter by priority to address urgent risks first. AC: selecting Critical shows only Critical orders (209) and KPIs/charts update.
2. *Procurement manager:* see overdue open orders by supplier. AC: counts exclude delivered and cancelled orders; clicking a bar filters the table.
3. *Site manager:* find exceptions for my site. AC: site filter or chart click limits table and KPIs to that site.
4. *Finance:* see payment holds. AC: flag filter "Payment on hold" lists only non-cancelled On Hold orders (42).
5. *Compliance:* see which document is missing. AC: table and detail show the source document status and never imply receipt.
6. *Any user:* understand why an order was flagged. AC: detail shows each triggered rule in plain language, and suggestions are labelled as not taken.
7. *Analyst:* reproduce numbers. AC: as-of date is visible and editable; changing it recalculates overdue counts.
**Risks.** Source priority is unvalidated and differs from rule-based flags; 90% overdue rate reflects the synthetic data and may look alarming; as-of date drives results; real data would need integration and permissions.
**Limitations / next steps.** Simulated data only; no real-user testing; React/TypeScript port; optional AI summaries grounded in order fields via a server-side key; evaluate any rule against real before/after data before claiming impact. No customer interviews, usability studies, experiments or deployments occurred.

## Demo walkthrough
1. Overview: note as-of date, KPIs, rates. 2. Click "Delivered" bar, then Reset. 3. Click a supplier in the overdue chart, open Exception Management, sort by days late. 4. Open SC-0002 and read "Why this order was flagged". 5. Suppliers/Project Sites drill-down. 6. Data & Methodology: validation results, change the as-of date, return to Overview.

## Five-minute presentation outline
1 min problem and users · 1 min data inspection and the quirks found (no "High", 27 future-dated deliveries, source vs rule differences) · 1.5 min live demo · 1 min rules, KPIs and testing (19 tests) · 0.5 min limitations and next steps.
## Live Demo
[Open SupplyChain Copilot](https://verdant-starburst-f11b17.netlify.app)
