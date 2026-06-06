export const FE_STYLES = `
  @keyframes fi{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  .fe-head { display:flex;align-items:flex-start;gap:12px;margin-bottom:20px; }
  .fe-bar { width:4px;height:44px;border-radius:2px;flex-shrink:0;margin-top:2px; }
  .fe-title { font-size:18px;font-weight:900;color:var(--tx);letter-spacing:-.03em; }
  .fe-sub { font-size:11px;color:var(--t3);margin-top:3px; }

  .cards4 { display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px; }
  .mc { background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:16px;box-shadow:var(--sh);position:relative;overflow:hidden; }
  .mc::after { content:'';position:absolute;inset:0;background:linear-gradient(135deg,var(--sb) 0%,transparent 55%);pointer-events:none; }
  .mc-top { display:flex;align-items:center;gap:8px;margin-bottom:10px; }
  .mc-icon { font-size:18px; }
  .mc-name { font-size:12px;font-weight:700; }
  .mc-main { font-size:24px;font-weight:900;font-family:'JetBrains Mono',monospace;letter-spacing:-.03em; }
  .mc-u { font-size:12px;font-weight:600; }
  .mc-lbl { font-size:9px;color:var(--t4);text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px; }
  .mc-row { display:grid;grid-template-columns:repeat(auto-fit,minmax(50px,1fr));gap:6px; }
  .mr { background:var(--bg2);border-radius:6px;padding:6px 8px;text-align:center; }
  .mr-v { font-size:13px;font-weight:800;color:var(--tx);font-family:'JetBrains Mono',monospace; }
  .mr-l { font-size:8px;color:var(--t4);text-transform:uppercase;letter-spacing:.07em; }

  .grid2 { display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px; }
  .card { background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:18px;box-shadow:var(--sh); }
  .ct { font-size:13px;font-weight:700;color:var(--tx);margin-bottom:12px; }
  .cs { font-size:9.5px;color:var(--t4);font-weight:400;margin-left:5px; }

  .bar-row { display:flex;align-items:center;gap:10px;margin-bottom:9px; }
  .br-name { font-size:11px;color:var(--t3);width:70px;flex-shrink:0; }
  .br-seg  { font-size:11.5px;font-weight:600;width:90px;flex-shrink:0; }
  .br-wrap { height:7px;background:var(--bg3);border-radius:4px;overflow:hidden;flex:1; }
  .br-fill { height:100%;border-radius:4px;transition:width 1.2s cubic-bezier(.25,1,.5,1); }
  .br-val  { font-size:11px;font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--t2);white-space:nowrap;width:80px;text-align:right; }

  .fn-box { background:var(--bg2);border:1px solid var(--bd);border-radius:14px;padding:18px; }
  .fn-title { font-size:12px;font-weight:700;color:var(--tx);margin-bottom:12px; }
  .fn-grid { display:grid;grid-template-columns:1fr 1fr;gap:10px; }
  .fn-item { font-size:11.5px;color:var(--t3); code { font-family:'JetBrains Mono',monospace;background:rgba(224,120,32,.15);color:var(--am);padding:1px 5px;border-radius:4px;font-size:11px; } }

  .ret-grid { display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:14px; }
  .ret-card { border-radius:12px;padding:14px;text-align:center; }
  .ret-card--blue   { background:rgba(37,99,235,.10);  border:1px solid rgba(37,99,235,.20); }
  .ret-card--green  { background:rgba(5,150,105,.10);  border:1px solid rgba(5,150,105,.20); }
  .ret-card--orange { background:rgba(224,120,32,.10);  border:1px solid rgba(224,120,32,.20); }
  .ret-card--red    { background:rgba(220,38,38,.10);  border:1px solid rgba(220,38,38,.20); }
  .ret-card--purple { background:rgba(124,58,237,.10); border:1px solid rgba(124,58,237,.20); }
  .ret-card--gray   { background:var(--bg2);           border:1px solid var(--bd); }
  .rc-icon { font-size:20px;margin-bottom:6px; }
  .rc-val  { font-size:18px;font-weight:800;color:var(--tx);font-family:'JetBrains Mono',monospace; }
  .rc-lbl  { font-size:9px;color:var(--t3);margin-top:2px;text-transform:uppercase;letter-spacing:.07em; }

  .pipeline { display:flex;align-items:center;gap:0;margin-bottom:16px;overflow-x:auto;padding:4px 0; }
  .pipe-step { background:var(--card);border:1.5px solid;border-radius:12px;padding:14px 12px;text-align:center;flex-shrink:0;width:130px;position:relative;overflow:hidden; }
  .pipe-step::before { content:'';position:absolute;inset:0;background:linear-gradient(135deg,var(--bg2) 0%,transparent 60%); }
  .ps-num { width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;margin:0 auto 8px; }
  .ps-icon { font-size:22px;margin-bottom:6px; }
  .ps-title { font-size:11.5px;font-weight:700;margin-bottom:4px;color:var(--tx); }
  .ps-desc { font-size:9px;color:var(--t4); }
  .pipe-arrow { font-size:18px;color:var(--t4);flex-shrink:0;padding:0 4px; }

  .norm-table { width:100%;border-collapse:collapse;font-size:12px; }
  .norm-table th { padding:9px 12px;text-align:left;font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:var(--t3);font-family:'JetBrains Mono',monospace;border-bottom:1px solid var(--bd); }
  .norm-table td { padding:9px 12px;border-bottom:1px solid var(--bd2);font-size:12px;color:var(--t2); }
  .norm-table tr:last-child td { border-bottom:none; }
  .mono { font-family:'JetBrains Mono',monospace!important; }
`;

// ── CSS variable reader ────────────────────────────────────────────────────────
function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

// ── Format helper ─────────────────────────────────────────────────────────────
function fmtVal(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000)     return (v / 1_000).toFixed(0) + 'K';
  return v.toFixed(v < 10 ? 1 : 0);
}

/**
 * drawBar — bar chart with full Y axis (grid + labels + rotated title)
 *           and X axis (segment names + tick marks + title).
 *
 * @param el          canvas element
 * @param vals        data values
 * @param colors      bar colours (one per segment)
 * @param labels      X-axis segment names
 * @param lowerBetter highlight the lowest bar instead of the highest
 * @param yTitle      rotated Y-axis title (e.g. "KWD", "orders", "%")
 * @param xTitle      X-axis title (default "Segment")
 * @param unit        unit suffix appended to value labels above bars (e.g. "d", "mo", " orders")
 */
export function drawBar(
  el: HTMLCanvasElement | undefined,
  vals: number[],
  colors: string[],
  labels: string[],
  lowerBetter = false,
  yTitle = '',
  xTitle = 'Segment',
  unit = '',
): void {
  if (!el) return;

  const dpr = window.devicePixelRatio || 1;
  const W   = el.offsetWidth || 260;
  const H   = 260;
  el.width  = W * dpr;
  el.height = H * dpr;
  el.style.width  = W + 'px';
  el.style.height = H + 'px';

  const ctx = el.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const labelColor = cssVar('--t4', '#a3a8c8');
  const titleColor = cssVar('--t3', '#6b71a0');
  const textColor  = cssVar('--t2', '#3d4166');
  const gridColor  = cssVar('--bd2', 'rgba(120,80,20,.05)');

  // Padding: left larger to fit Y-axis title + labels
  const P = { l: 68, r: 12, t: 24, b: 58 };

  const max    = Math.max(...vals) * 1.18 || 1;
  const yTicks = 4;

  // ── Axis lines ────────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(P.l, P.t - 4); ctx.lineTo(P.l, H - P.b);
  ctx.strokeStyle = 'rgba(128,128,128,.15)'; ctx.lineWidth = 1; ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(P.l, H - P.b); ctx.lineTo(W - P.r, H - P.b);
  ctx.stroke();

  // ── Y grid + labels ───────────────────────────────────────────────────────
  for (let i = 0; i <= yTicks; i++) {
    const yVal = (max / yTicks) * i;
    const y    = P.t + (1 - i / yTicks) * (H - P.t - P.b);

    ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(W - P.r, y);
    ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
    if (i > 0) { ctx.setLineDash([3, 3]); }
    ctx.stroke(); ctx.setLineDash([]);

    // Tick
    ctx.beginPath(); ctx.moveTo(P.l - 4, y); ctx.lineTo(P.l, y);
    ctx.strokeStyle = 'rgba(128,128,128,.25)'; ctx.lineWidth = 1; ctx.stroke();

    // Label
    ctx.fillStyle = labelColor;
    ctx.font      = `600 12px 'JetBrains Mono',monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(fmtVal(yVal), P.l - 6, y + 3);
  }

  // ── Y axis title (rotated) ────────────────────────────────────────────────
  if (yTitle) {
    ctx.save();
    ctx.translate(10, P.t + (H - P.t - P.b) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle   = titleColor;
    ctx.font        = `700 12px 'JetBrains Mono',monospace`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(yTitle.toUpperCase(), 0, 0);
    ctx.restore();
  }

  // ── Bars ──────────────────────────────────────────────────────────────────
  const slotW = (W - P.l - P.r) / vals.length;
  const bw    = Math.floor(slotW * 0.62);

  vals.forEach((v, i) => {
    const x    = P.l + i * slotW + (slotW - bw) / 2;
    const bh   = (v / max) * (H - P.t - P.b);
    const y    = H - P.b - bh;
    const best = lowerBetter ? v === Math.min(...vals) : v === Math.max(...vals);

    // Gradient fill
    const grad = ctx.createLinearGradient(x, y, x, y + bh);
    grad.addColorStop(0, colors[i] + 'dd');
    grad.addColorStop(1, colors[i] + '88');
    ctx.fillStyle = grad;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, [4, 4, 0, 0]);
    else ctx.rect(x, y, bw, bh);
    ctx.fill();

    // Glow for best bar
    if (best) {
      ctx.shadowColor = colors[i]; ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Value label above bar
    ctx.fillStyle  = best ? colors[i] : textColor;
    ctx.font       = `${best ? 'bold ' : ''}12px 'JetBrains Mono',monospace`;
    ctx.textAlign  = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(fmtVal(v) + unit, x + bw / 2, y - 4);

    // X tick
    ctx.beginPath();
    ctx.moveTo(x + bw / 2, H - P.b);
    ctx.lineTo(x + bw / 2, H - P.b + 4);
    ctx.strokeStyle = 'rgba(128,128,128,.2)'; ctx.lineWidth = 1; ctx.stroke();

    // Segment name label below bar
    ctx.fillStyle    = labelColor;
    ctx.font         = `600 12px 'JetBrains Mono',monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    const shortLbl   = labels[i].length > 8 ? labels[i].slice(0, 7) + '.' : labels[i];
    ctx.fillText(shortLbl, x + bw / 2, H - P.b + 15);

    // Best star
    if (best) {
      ctx.fillStyle    = colors[i];
      ctx.font         = '12px sans-serif';
      ctx.fillText('★', x + bw / 2, H - P.b + 27);
    }
  });

  // ── X axis title ──────────────────────────────────────────────────────────
  if (xTitle) {
    ctx.fillStyle    = titleColor;
    ctx.font         = `700 12px 'JetBrains Mono',monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(xTitle.toUpperCase(), P.l + (W - P.l - P.r) / 2, H - 1);
  }
}

/**
 * drawGrowthLine — line chart with full X and Y axes + titles.
 */
export function drawGrowthLine(
  el: HTMLCanvasElement,
  vals: number[],
  lbls: string[],
  color = '#e07820',
  yTitle = 'Value',
  xTitle = 'Month',
): void {
  const dpr = window.devicePixelRatio || 1;
  const W   = el.offsetWidth || 400;
  const H   = 260;
  el.width  = W * dpr;
  el.height = H * dpr;
  el.style.width  = W + 'px';
  el.style.height = H + 'px';

  const ctx = el.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  if (!vals.length) return;

  const labelColor = cssVar('--t4', '#a3a8c8');
  const titleColor = cssVar('--t3', '#6b71a0');
  const gridColor  = cssVar('--bd2', 'rgba(120,80,20,.05)');

  const P   = { l: 68, r: 16, t: 16, b: 58 };
  const max = Math.max(...vals) * 1.12 || 1;
  const sx  = (i: number) => P.l + (i / (vals.length - 1 || 1)) * (W - P.l - P.r);
  const sy  = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b);

  // ── Axis lines ────────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(P.l, P.t - 4); ctx.lineTo(P.l, H - P.b);
  ctx.strokeStyle = 'rgba(128,128,128,.15)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(P.l, H - P.b); ctx.lineTo(W - P.r, H - P.b);
  ctx.stroke();

  // ── Y grid + labels ───────────────────────────────────────────────────────
  const yTicks = 4;
  for (let i = 0; i <= yTicks; i++) {
    const yVal = max * (1 - i / yTicks);
    const y    = P.t + (i / yTicks) * (H - P.t - P.b);
    ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(W - P.r, y);
    ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
    if (i > 0) { ctx.setLineDash([3, 3]); } ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(P.l - 4, y); ctx.lineTo(P.l, y);
    ctx.strokeStyle = 'rgba(128,128,128,.25)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle    = labelColor;
    ctx.font         = `600 12px 'JetBrains Mono',monospace`;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmtVal(yVal), P.l - 6, y);
  }

  // ── Y axis title (rotated) ────────────────────────────────────────────────
  ctx.save();
  ctx.translate(10, P.t + (H - P.t - P.b) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle    = titleColor;
  ctx.font         = `700 12px 'JetBrains Mono',monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(yTitle.toUpperCase(), 0, 0);
  ctx.restore();

  // ── X labels ─────────────────────────────────────────────────────────────
  ctx.fillStyle    = labelColor;
  ctx.font         = `600 12px 'JetBrains Mono',monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  vals.forEach((_, i) => {
    const x = sx(i);
    ctx.beginPath(); ctx.moveTo(x, H - P.b); ctx.lineTo(x, H - P.b + 4);
    ctx.strokeStyle = 'rgba(128,128,128,.2)'; ctx.lineWidth = 1; ctx.stroke();
    if (i % 3 === 0) ctx.fillText(lbls[i] ?? String(i + 1), x, H - P.b + 14);
  });

  // ── X axis title ──────────────────────────────────────────────────────────
  ctx.fillStyle    = titleColor;
  ctx.font         = `700 12px 'JetBrains Mono',monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(xTitle.toUpperCase(), P.l + (W - P.l - P.r) / 2, H - 1);

  // ── Gradient area ─────────────────────────────────────────────────────────
  const grad = ctx.createLinearGradient(0, P.t, 0, H - P.b);
  grad.addColorStop(0, color + '30'); grad.addColorStop(1, color + '02');
  ctx.beginPath(); ctx.moveTo(sx(0), sy(vals[0]));
  vals.forEach((v, i) => { if (i > 0) ctx.lineTo(sx(i), sy(v)); });
  ctx.lineTo(sx(vals.length - 1), H - P.b);
  ctx.lineTo(sx(0), H - P.b); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  // ── Line ──────────────────────────────────────────────────────────────────
  ctx.beginPath(); ctx.moveTo(sx(0), sy(vals[0]));
  vals.forEach((v, i) => { if (i > 0) ctx.lineTo(sx(i), sy(v)); });
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();

  // ── Last point dot ────────────────────────────────────────────────────────
  const li = vals.length - 1;
  ctx.beginPath(); ctx.arc(sx(li), sy(vals[li]), 3.5, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
}

/**
 * drawSlopeBar — signed bar chart for YoY deltas (%).
 * Green bars above zero, red bars below zero, with full X/Y axes.
 *
 * @param el     canvas element
 * @param vals   delta values (e.g. % change, can be negative)
 * @param labels X-axis labels (month names)
 * @param colors bar colours per value (one per bar, e.g. green/red)
 */
export function drawSlopeBar(
  el: HTMLCanvasElement | undefined,
  vals: number[],
  labels: string[],
  colors: string[],
): void {
  if (!el || !vals.length) return;

  const dpr = window.devicePixelRatio || 1;
  const W   = el.offsetWidth || 460;
  const H   = el.offsetHeight || 216;
  el.width  = W * dpr;
  el.height = H * dpr;
  el.style.width  = W + 'px';
  el.style.height = H + 'px';

  const ctx = el.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const labelColor = cssVar('--t4', '#a3a8c8');
  const titleColor = cssVar('--t3', '#6b71a0');

  // Padding — left larger for Y labels, bottom for X labels + title
  const P      = { l: 68, r: 12, t: 20, b: 58 };
  const absMax = Math.max(Math.abs(Math.min(...vals)), Math.abs(Math.max(...vals))) * 1.25 || 1;
  const midY   = P.t + (H - P.t - P.b) / 2;

  // ── Axis lines ─────────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(P.l, P.t - 4); ctx.lineTo(P.l, H - P.b);
  ctx.strokeStyle = 'rgba(128,128,128,.15)'; ctx.lineWidth = 1; ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(P.l, H - P.b); ctx.lineTo(W - P.r, H - P.b);
  ctx.stroke();

  // ── Zero line ──────────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(P.l, midY); ctx.lineTo(W - P.r, midY);
  ctx.strokeStyle = 'rgba(128,128,128,.30)'; ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);

  // ── Y labels (top, zero, bottom) ──────────────────────────────────────────
  ctx.fillStyle    = labelColor;
  ctx.font         = `600 12px 'JetBrains Mono',monospace`;
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('+' + absMax.toFixed(0) + '%', P.l - 5, P.t + 4);
  ctx.fillText('0%',                           P.l - 5, midY);
  ctx.fillText('-' + absMax.toFixed(0) + '%', P.l - 5, H - P.b - 4);

  // Mid Y gridlines (±50% of absMax)
  for (const frac of [0.5]) {
    for (const sign of [1, -1]) {
      const y = midY - sign * frac * (H - P.t - P.b) / 2;
      ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(W - P.r, y);
      ctx.strokeStyle = 'rgba(128,128,128,.06)'; ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle    = labelColor;
      ctx.font         = `600 12px 'JetBrains Mono',monospace`;
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText((sign > 0 ? '+' : '-') + (absMax * frac).toFixed(0) + '%', P.l - 5, y);
    }
  }

  // ── Y axis title (rotated) ─────────────────────────────────────────────────
  ctx.save();
  ctx.translate(10, P.t + (H - P.t - P.b) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle    = titleColor;
  ctx.font         = `700 12px 'JetBrains Mono',monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('YoY DELTA (%)', 0, 0);
  ctx.restore();

  // ── Bars ───────────────────────────────────────────────────────────────────
  const slotW = (W - P.l - P.r) / vals.length;
  const bw    = Math.floor(slotW * 0.62);
  const scale = ((H - P.t - P.b) / 2) / absMax;

  vals.forEach((v, i) => {
    const x   = P.l + i * slotW + (slotW - bw) / 2;
    const bh  = Math.abs(v) * scale;
    const y   = v >= 0 ? midY - bh : midY;
    const col = colors[i] ?? (v >= 0 ? '#10b981' : '#ef4444');

    const grad = ctx.createLinearGradient(x, y, x, y + bh);
    grad.addColorStop(0, col + 'ee'); grad.addColorStop(1, col + '66');
    ctx.fillStyle = grad;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, v >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4]);
    else ctx.rect(x, y, bw, bh);
    ctx.fill();

    // Value label
    ctx.fillStyle    = col;
    ctx.font         = `bold 12px 'JetBrains Mono',monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    const labelY = v >= 0 ? y - 3 : y + bh + 10;
    ctx.fillText((v >= 0 ? '+' : '') + v.toFixed(0) + '%', x + bw / 2, labelY);

    // X tick
    ctx.beginPath();
    ctx.moveTo(x + bw / 2, H - P.b);
    ctx.lineTo(x + bw / 2, H - P.b + 4);
    ctx.strokeStyle = 'rgba(128,128,128,.2)'; ctx.lineWidth = 1; ctx.stroke();

    // X label
    ctx.fillStyle    = labelColor;
    ctx.font         = `600 12px 'JetBrains Mono',monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(labels[i] ?? String(i + 1), x + bw / 2, H - P.b + 15);
  });

  // ── X axis title ───────────────────────────────────────────────────────────
  ctx.fillStyle    = titleColor;
  ctx.font         = `700 12px 'JetBrains Mono',monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('MONTH', P.l + (W - P.l - P.r) / 2, H - 1);
}