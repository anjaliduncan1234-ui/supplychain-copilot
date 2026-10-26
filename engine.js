/* SupplyChain Copilot: rule engine (pure functions, no DOM). Works in browser and Node. */
(function (root) {
  const OPEN = ['In Transit', 'Processing'];           // statuses counted as "open"
  const HIGH = ['Critical', 'High'];                   // source priorities counted as high-risk

  function parseCSV(t) {
    const rows = []; let r = [], c = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { r.push(c); c = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; r.push(c); c = ''; if (r.length > 1 || r[0] !== '') rows.push(r); r = []; }
      else c += ch;
    }
    if (c !== '' || r.length) { r.push(c); rows.push(r); }
    const h = rows.shift();
    return rows.map(x => Object.fromEntries(h.map((k, i) => [k, (x[i] ?? '').trim()])));
  }
  const NUM = ['quantity', 'unit_price_inr', 'order_value_inr', 'days_late', 'risk_score'];
  const load = text => parseCSV(text).map(r => { const o = { ...r }; NUM.forEach(k => o[k] = r[k] === '' ? NaN : Number(r[k])); return o; });

  const D = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return null; const t = Date.UTC(+m[1], m[2] - 1, +m[3]); return new Date(t).getUTCDate() === +m[3] ? t : null; };
  const diff = (a, b) => Math.round((D(a) - D(b)) / 864e5);

  /* Evaluate one order against the rules for a given as-of date (YYYY-MM-DD). */
  function evaluate(o, asOf) {
    const cancelled = o.order_status === 'Cancelled', open = OPEN.includes(o.order_status);
    const e = { open, cancelled, overdue: false, daysOverdue: null, lateDays: null, doc: false, pay: false, reasons: [], actions: [], notes: [] };
    if (open && D(o.promised_delivery_date) != null && o.promised_delivery_date < asOf) {
      e.overdue = true; e.daysOverdue = diff(asOf, o.promised_delivery_date);
      e.reasons.push({ type: 'Overdue delivery', text: `The promised delivery date (${o.promised_delivery_date}) is earlier than the as-of date (${asOf}) and the order status is ${o.order_status}, so it is ${e.daysOverdue} day(s) past promise.` });
    }
    if (!cancelled && o.document_status !== 'Complete') {
      e.doc = true;
      e.reasons.push({ type: 'Documentation', text: `The document status is ${o.document_status}. The dataset does not show that the missing item has been received.` });
    }
    if (!cancelled && o.payment_status === 'On Hold') {
      e.pay = true;
      e.reasons.push({ type: 'Payment', text: 'The payment status is On Hold.' });
    }
    if (o.order_status === 'Delivered') {
      if (D(o.actual_delivery_date) == null) e.notes.push('Delivered, but no valid actual delivery date is recorded. Lateness cannot be calculated (not treated as 0).');
      else {
        e.lateDays = diff(o.actual_delivery_date, o.promised_delivery_date);
        e.notes.push(e.lateDays > 0 ? `Delivered ${e.lateDays} day(s) after the promised date. This is closed history, so it is not counted as an overdue open order.` : 'Delivered on or before the promised date.');
        if (o.actual_delivery_date > asOf) e.notes.push(`Data-quality warning: the actual delivery date (${o.actual_delivery_date}) is after the as-of date (${asOf}).`);
      }
    }
    if (cancelled) e.notes.push('Order is cancelled, so it is excluded from overdue, documentation, payment and high-risk counts.');
    // Rule-based suggestions, most urgent first. These are suggestions only, not actions taken.
    if (e.overdue && HIGH.includes(o.priority)) e.actions.push('Escalate to supplier and notify site manager');
    else if (e.overdue) e.actions.push('Confirm revised ETA with supplier');
    if (e.doc) e.actions.push('Request missing documents and verify compliance');
    if (e.pay) e.actions.push('Refer payment hold to finance team for review');
    if (!e.actions.length) e.actions.push(cancelled ? 'No action: order cancelled' : 'Continue routine monitoring');
    e.count = (e.overdue ? 1 : 0) + (e.doc ? 1 : 0) + (e.pay ? 1 : 0);
    return e;
  }

  const pct = (n, d) => d === 0 ? null : n / d * 100;      // null = not applicable (zero denominator)
  function kpis(ev) {
    const live = ev.filter(x => !x.e.cancelled);
    const open = ev.filter(x => x.e.open);
    const k = {
      total: ev.length,
      value: ev.reduce((s, x) => s + x.o.order_value_inr, 0),
      open: open.length,
      overdue: ev.filter(x => x.e.overdue).length,
      docExc: ev.filter(x => x.e.doc).length,
      payHold: ev.filter(x => x.e.pay).length,
      highCrit: live.filter(x => HIGH.includes(x.o.priority)).length,
      live: live.length,
      openValue: open.reduce((s, x) => s + x.o.order_value_inr, 0),
    };
    k.overdueRate = pct(k.overdue, k.open);
    k.docRate = pct(k.docExc, k.total);
    k.highRisk = pct(k.highCrit, k.live);
    return k;
  }

  /* Data validation checks on the raw rows. */
  function validate(rows, asOf) {
    const bad = f => rows.filter(f).map(r => r.order_id);
    const ids = new Set(rows.map(r => r.order_id));
    const checks = [
      ['Record count preserved', rows.length === 500, `${rows.length} records loaded (expected 500)`],
      ['Order IDs unique', ids.size === rows.length, `${ids.size} unique of ${rows.length}`],
      ['Numeric fields valid', !rows.some(r => NUM.some(k => !Number.isFinite(r[k]))), 'quantity, unit_price_inr, order_value_inr, days_late, risk_score'],
      ['Order value = quantity × unit price (±₹1)', !bad(r => Math.abs(r.quantity * r.unit_price_inr - r.order_value_inr) > 1).length, 'Checked on every record'],
      ['Order and promised dates valid', !bad(r => D(r.order_date) == null || D(r.promised_delivery_date) == null).length, 'YYYY-MM-DD, real calendar dates'],
      ['Promised date not before order date', !bad(r => r.promised_delivery_date < r.order_date).length, ''],
      ['Delivered orders have a valid actual date', !bad(r => r.order_status === 'Delivered' && D(r.actual_delivery_date) == null).length, ''],
      ['Non-delivered orders have no actual date', !bad(r => r.order_status !== 'Delivered' && r.actual_delivery_date).length, 'Missing actual date is never treated as 0 days'],
      ['Delivered actual date not after as-of date', !bad(r => r.order_status === 'Delivered' && r.actual_delivery_date > asOf).length, 'See list below if this fails'],
      ['Source days_late matches actual − promised (delivered)', !bad(r => r.order_status === 'Delivered' && Math.max(0, diff(r.actual_delivery_date, r.promised_delivery_date)) !== r.days_late).length, ''],
    ];
    return checks.map(([name, pass, detail]) => ({ name, pass, detail }));
  }

  const api = { OPEN, HIGH, parseCSV, load, evaluate, kpis, validate, diff, D };
  if (typeof module !== 'undefined') module.exports = api; else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
