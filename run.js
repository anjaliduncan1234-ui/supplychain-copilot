const fs = require('fs'), E = require('../src/engine.js');
const ASOF = '2026-10-27';
const rows = E.load(fs.readFileSync(__dirname + '/../data/ARIS_Supply_Chain_Simulated_500_Orders.csv', 'utf8'));
const ev = rows.map(o => ({ o, e: E.evaluate(o, ASOF) }));
let pass = 0, fail = 0;
const t = (name, cond, info = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  [' + info + ']' : ''}`); };
const find = f => ev.find(f);

// Six required scenarios (real, unmodified dataset records)
let x = find(x => x.e.overdue && x.o.priority === 'Critical');
t('1. Critical overdue order → escalation suggested first', x && x.e.actions[0].startsWith('Escalate'), x.o.order_id);
x = find(x => x.e.doc && !x.e.overdue && !x.e.pay && !x.e.cancelled);
t('2. Missing documentation → request documents', x && x.e.actions[0].startsWith('Request missing documents'), `${x.o.order_id} ${x.o.document_status}`);
x = find(x => x.e.pay && !x.e.overdue && !x.e.doc);
t('3. Payment on hold → refer to finance', x && x.e.actions[0].startsWith('Refer payment'), x.o.order_id);
x = find(x => x.o.order_status === 'Delivered' && x.e.lateDays > 0);
t('4. Delivered order uses actual − promised; not overdue-open', x && x.e.lateDays === E.diff(x.o.actual_delivery_date, x.o.promised_delivery_date) && !x.e.overdue, `${x.o.order_id} late ${x.e.lateDays}d`);
x = find(x => x.e.cancelled && x.o.payment_status === 'On Hold');
t('5. Cancelled order excluded from all exception flags', x && !x.e.overdue && !x.e.doc && !x.e.pay && x.e.count === 0, x.o.order_id);
x = find(x => x.e.count === 0 && !x.e.cancelled);
t('6. Order with no active exception → routine monitoring', x && x.e.actions[0] === 'Continue routine monitoring', x.o.order_id);

// Multi-exception: all issues listed, most urgent first
x = find(x => x.e.overdue && x.e.doc && x.e.pay);
t('Multiple exceptions: all reasons shown, overdue action first', x && x.e.reasons.length === 3 && /ETA|Escalate/.test(x.e.actions[0]), x.o.order_id);

// Edge rules
const base = rows.find(r => r.order_status === 'In Transit');
t('Promised date equal to as-of is NOT overdue', !E.evaluate({ ...base, promised_delivery_date: ASOF }, ASOF).overdue);
t('Promised date one day before as-of IS overdue', E.evaluate({ ...base, promised_delivery_date: '2026-10-26' }, ASOF).overdue);
const d0 = rows.find(r => r.order_status === 'Delivered');
t('Delivered with no actual date → lateDays null, not 0', E.evaluate({ ...d0, actual_delivery_date: '' }, ASOF).lateDays === null);
t('Zero denominators return null, not NaN/Infinity', (k => k.overdueRate === null && k.docRate === null && k.highRisk === null)(E.kpis([])));
t('Changing as-of date changes overdue count', E.kpis(rows.map(o => ({ o, e: E.evaluate(o, '2026-06-01') }))).overdue < E.kpis(ev).overdue);

// KPI cross-check against an independent loop
let open = 0, od = 0, doc = 0, pay = 0, hi = 0, live = 0, val = 0, ov = 0;
for (const o of rows) {
  val += o.order_value_inr;
  const c = o.order_status === 'Cancelled', op = ['In Transit', 'Processing'].includes(o.order_status);
  if (!c) { live++; if (o.priority === 'Critical') hi++; if (o.document_status !== 'Complete') doc++; if (o.payment_status === 'On Hold') pay++; }
  if (op) { open++; ov += o.order_value_inr; if (o.promised_delivery_date < ASOF) od++; }
}
const k = E.kpis(ev);
t('KPI total/value', k.total === 500 && Math.abs(k.value - val) < 0.01, `₹${val.toFixed(2)}`);
t('KPI open/overdue/doc/pay', k.open === open && k.overdue === od && k.docExc === doc && k.payHold === pay, `${open}/${od}/${doc}/${pay}`);
t('KPI high-risk and open value', k.highCrit === hi && k.live === live && Math.abs(k.openValue - ov) < 0.01, `${hi}/${live}`);
t('Rates computed from counts', Math.abs(k.overdueRate - od / open * 100) < 1e-9 && Math.abs(k.docRate - doc / 500 * 100) < 1e-9 && Math.abs(k.highRisk - hi / live * 100) < 1e-9, `${k.overdueRate.toFixed(1)}% / ${k.docRate.toFixed(1)}% / ${k.highRisk.toFixed(1)}%`);
t('No order double-counted: per-order exception count ≤ 3', ev.every(x => x.e.count <= 3));

// Validation
const v = E.validate(rows, ASOF);
t('Dataset validation: structural checks pass', v.filter(c => !/after as-of/.test(c.name)).every(c => c.pass), v.filter(c => !c.pass).map(c => c.name).join('; '));
t('Dataset validation: future-dated delivered records detected, not altered', !v.find(c => /after as-of/.test(c.name)).pass && rows.length === 500);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
