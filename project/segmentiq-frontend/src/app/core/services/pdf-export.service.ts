// src/app/core/services/pdf-export.service.ts
import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';

// ─── Palette — LIGHT MODE ─────────────────────────────────────────────────────
type RGB = [number, number, number];
const C: Record<string, RGB> = {
  amber:   [180,  90,   0],
  blue:    [ 29,  78, 216],
  green:   [  4, 120,  87],
  red:     [185,  28,  28],
  purple:  [109,  40, 217],
  // page / card backgrounds
  bg:      [245, 246, 250],   // light grey page
  card:    [255, 255, 255],   // pure white cards
  bg2:     [237, 238, 244],   // subtle inner bg
  // text
  tx:      [ 17,  24,  39],   // near-black
  t2:      [ 55,  65,  81],
  t3:      [107, 114, 128],
  t4:      [156, 163, 175],
  border:  [209, 213, 219],   // light grey border
  white:   [255, 255, 255],
  // explanation panel
  expoBg:  [248, 249, 253],   // very light blue-grey
  expoBd:  [219, 224, 240],   // subtle border
};

// ─── Layout ───────────────────────────────────────────────────────────────────
const ML  = 12;
const MR  = 12;
const PW  = 210;
const PH  = 297;
const CW  = PW - ML - MR;   // 186 mm

// KPI section split: left cards + right explanation panel
const KPI_CARD_COL_W  = 118;   // width for the 3-col KPI grid
const KPI_EXPO_W      = CW - KPI_CARD_COL_W - 6;  // remaining for explanation
const KPI_EXPO_X      = ML + KPI_CARD_COL_W + 6;

// Chart section split
const CHART_CARD_COL_W = 118;
const CHART_EXPO_W     = CW - CHART_CARD_COL_W - 6;
const CHART_EXPO_X     = ML + CHART_CARD_COL_W + 6;

// Revenue section split (page 2)
const REV_CARD_COL_W  = 118;
const REV_EXPO_W      = CW - REV_CARD_COL_W - 6;
const REV_EXPO_X      = ML + REV_CARD_COL_W + 6;

export interface ReportData {
  segments:             any[];
  agg:                  Record<number, any>;
  segmentCounts:        Record<number, number>;
  summary:              any;
  totalRevenue:         number;
  overallAov:           number;
  totalFulfilledOrders: number;
  yoyGrowth:            string;
}

// ─── jsPDF colour helpers ─────────────────────────────────────────────────────
function fill(doc: jsPDF, rgb: RGB)   { doc.setFillColor(rgb[0], rgb[1], rgb[2]); }
function stroke(doc: jsPDF, rgb: RGB) { doc.setDrawColor(rgb[0], rgb[1], rgb[2]); }
function txt(doc: jsPDF, rgb: RGB)    { doc.setTextColor(rgb[0], rgb[1], rgb[2]); }

@Injectable({ providedIn: 'root' })
export class PdfExportService {

  async exportReport(
    _unused: any[],
    filename = 'segmentiq-report.pdf',
    data: ReportData
  ): Promise<void> {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    // ── Page 1 — Header + KPIs ───────────────────────────────────────────────
    this.drawBg(doc);
    let y = this.drawHeader(doc, data);
    y = this.drawKpiStrip(doc, y, data);

    // ── Page 2 — Bar Charts ───────────────────────────────────────────────────
    doc.addPage();
    this.drawBg(doc);
    let y2 = ML;
    y2 = this.drawDivider(doc, y2, 'SEGMENT METRICS — BAR CHARTS');
    y2 = this.drawBarChartsSection(doc, y2, data);

    // ── Page 3 — Revenue Panels ───────────────────────────────────────────────
    doc.addPage();
    this.drawBg(doc);
    let y3 = ML;
    y3 = this.drawDivider(doc, y3, 'REVENUE & CATEGORY BREAKDOWN');
    y3 = this.drawRevenuePanels(doc, y3, data);

    // ── Footers ───────────────────────────────────────────────────────────────
    this.addFooters(doc);

    doc.save(filename);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // PAGE BACKGROUND — light
  // ══════════════════════════════════════════════════════════════════════════════
  private drawBg(doc: jsPDF): void {
    fill(doc, C['bg']);
    doc.rect(0, 0, PW, PH, 'F');
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // HEADER BAND  (light mode)
  // ══════════════════════════════════════════════════════════════════════════════
  private drawHeader(doc: jsPDF, data: ReportData): number {
    const h = 26;

    // card bg
    fill(doc, C['card']);
    stroke(doc, C['border']);
    doc.setLineWidth(0.3);
    doc.roundedRect(ML, ML, CW, h, 3, 3, 'FD');

    // amber top accent
    fill(doc, C['amber']);
    doc.roundedRect(ML, ML, CW, 1.2, 1, 1, 'F');

    // amber eyebrow
    txt(doc, C['amber']);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text('SEGMENTIQ · ANALYTICS', ML + 6, ML + 7.5);

    // main title
    txt(doc, C['tx']);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Analytics Report', ML + 6, ML + 16);

    // subtitle
    txt(doc, C['t3']);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('Customer segmentation · RFM analysis · Real-time data', ML + 6, ML + 21);

    // freshness pill
    const refDate = data.summary?.ref_date;
    if (refDate) {
      const pillTxt = `Data as of ${refDate}`;
      const pillW   = doc.getStringUnitWidth(pillTxt) * 5.5 / doc.internal.scaleFactor + 10;
      fill(doc, [232, 247, 241] as RGB);
      stroke(doc, C['green']);
      doc.setLineWidth(0.2);
      doc.roundedRect(ML + 6, ML + 21, pillW, 4, 1.5, 1.5, 'FD');
      fill(doc, C['green']);
      doc.circle(ML + 9, ML + 23.1, 0.9, 'F');
      txt(doc, C['green']);
      doc.setFontSize(5.5);
      doc.text(pillTxt, ML + 11, ML + 23.7);
    }

    // Export buttons (right side)
    const bx = ML + CW - 62;
    const by = ML + 8;
    fill(doc, C['amber']);
    doc.roundedRect(bx, by, 28, 7.5, 2, 2, 'F');
    txt(doc, C['white']);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.text('Export CSV', bx + 14, by + 4.8, { align: 'center' });

    fill(doc, C['green']);
    doc.roundedRect(bx + 31, by, 28, 7.5, 2, 2, 'F');
    txt(doc, C['white']);
    doc.text('Export PDF', bx + 45, by + 4.8, { align: 'center' });

    // bottom separator
    stroke(doc, C['border']);
    doc.setLineWidth(0.2);
    doc.line(ML, ML + h + 1, ML + CW, ML + h + 1);

    return ML + h + 5;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // KPI STRIP — 3×2 grid on the LEFT  +  explanation panel on the RIGHT
  // ══════════════════════════════════════════════════════════════════════════════
  private drawKpiStrip(doc: jsPDF, startY: number, data: ReportData): number {
    const s     = data.summary ?? {};
    const total = Object.values(data.segmentCounts ?? {}).reduce((a: number, b: number) => a + b, 0);

    const retRate = s.return_rate != null ? (s.return_rate * 100).toFixed(1) : '0.0';
    const retBar  = Math.min(parseFloat(retRate), 100);

    const yoyPct   = s.yoy_pct ?? null;
    const yoyPos   = yoyPct === null || yoyPct >= 0;
    const yoyBar   = yoyPct !== null ? Math.min(Math.max(Math.abs(yoyPct), 4), 100) : 4;
    const yoyColor = yoyPos ? C['green'] : C['red'];

    const kpis = [
      {
        label: 'TOTAL SALES',
        val: this.fmtKwd(data.totalRevenue),
        unit: 'KWD',
        color: C['amber'],
        bar: 100,
        note: '',
        explanation: [
          'Cumulative revenue from all fulfilled',
          'orders across every customer segment.',
          'Excludes returned orders.',
        ],
      },
      {
        label: 'TOTAL CUSTOMERS',
        val: this.fmtNum(total),
        unit: 'clients',
        color: C['blue'],
        bar: 80,
        note: '',
        explanation: [
          'Total unique customers present in',
          'the RFM segmentation model across',
          'all active segments.',
        ],
      },
      {
        label: 'FULFILLED ORDERS',
        val: this.fmtNum(data.totalFulfilledOrders),
        unit: 'orders',
        color: C['green'],
        bar: 70,
        note: `Returns excluded · ${this.fmtNum(s.total_returns ?? 0)} returned`,
        explanation: [
          'Orders delivered and kept by the',
          'customer. Returned orders are',
          'subtracted to reflect true demand.',
        ],
      },
      {
        label: 'TOTAL RETURNS',
        val: this.fmtNum(s.total_returns ?? 0),
        unit: 'returns',
        color: C['red'],
        bar: retBar,
        note: `${retRate}% of gross orders`,
        explanation: [
          'Volume of orders sent back. A high',
          'return rate may signal product-fit or',
          'quality issues worth investigating.',
        ],
      },
      {
        label: 'AVG ORDER VALUE',
        val: data.overallAov.toFixed(2),
        unit: 'KWD',
        color: C['purple'],
        bar: 60,
        note: 'On fulfilled orders only',
        explanation: [
          'Total fulfilled revenue ÷ fulfilled',
          'orders. Tracks basket size health.',
          'Compare across segments for insight.',
        ],
      },
      {
        label: 'YEAR-OVER-YEAR',
        val: data.yoyGrowth ?? '—',
        unit: '',
        color: yoyColor,
        bar: yoyBar,
        note: yoyPct !== null ? `Last 12M: ${this.fmtNum(s.yoy_last12 ?? 0)} KWD` : '',
        explanation: [
          'Revenue change vs. the same 12-month',
          `window last year. ${yoyPos ? 'Positive growth' : 'Negative growth'}`,
          `signals ${yoyPos ? 'business momentum.' : 'need for action.'}`,
        ],
      },
    ];

    // ── Layout: 1 column — each row = KPI card 50% LEFT + explanation 50% RIGHT ──
    const gap   = 3;
    const cardW = CW / 2 - 3;        // exactly 50% of content width
    const expoW = CW - cardW - 6;    // other 50%
    const cardH = 22;

    kpis.forEach((kpi, i) => {
      const cx = ML;
      const cy = startY + i * (cardH + gap);
      const ex = ML + cardW + 6;      // explanation at 50% mark

      // ── KPI card ────────────────────────────────────────────────────────────
      fill(doc, C['card']);
      stroke(doc, C['border']);
      doc.setLineWidth(0.25);
      doc.roundedRect(cx, cy, cardW, cardH, 2.5, 2.5, 'FD');

      // top accent
      fill(doc, kpi.color);
      doc.roundedRect(cx, cy, cardW, 1.2, 1, 1, 'F');

      // icon bg
      doc.setGState(doc.GState({ opacity: 0.12 }));
      fill(doc, kpi.color);
      doc.circle(cx + 7.5, cy + 8, 5, 'F');
      doc.setGState(doc.GState({ opacity: 1 }));

      // label
      txt(doc, C['t3']);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.5);
      doc.text(kpi.label, cx + 16, cy + 6.5);

      // value
      txt(doc, C['tx']);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(kpi.val, cx + 4, cy + 16);

      // unit
      if (kpi.unit) {
        txt(doc, C['t3']);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.5);
        const vw = doc.getStringUnitWidth(kpi.val) * 11 / doc.internal.scaleFactor;
        doc.text(kpi.unit, cx + 4 + vw + 1.5, cy + 15.5);
      }

      // sub note
      if (kpi.note) {
        txt(doc, C['t4']);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(4.5);
        doc.text(kpi.note, cx + 4, cy + 19.5);
      }

      // progress bar
      fill(doc, C['bg2']);
      doc.roundedRect(cx + 4, cy + cardH - 4.5, cardW - 8, 1.8, 0.9, 0.9, 'F');
      fill(doc, kpi.color);
      const fw = Math.max(2, (cardW - 8) * kpi.bar / 100);
      doc.roundedRect(cx + 4, cy + cardH - 4.5, fw, 1.8, 0.9, 0.9, 'F');

      // ── Inline explanation panel (right of the card) ─────────────────────
      fill(doc, C['expoBg']);
      stroke(doc, C['expoBd']);
      doc.setLineWidth(0.15);
      doc.roundedRect(ex, cy, expoW, cardH, 2, 2, 'FD');

      // left accent stripe
      fill(doc, kpi.color);
      doc.roundedRect(ex, cy + 3, 1.2, 8, 0.4, 0.4, 'F');

      // explanation lines
      let ey = cy + 7;
      kpi.explanation.forEach((line, li) => {
        txt(doc, li === 0 ? C['tx'] : C['t2']);
        doc.setFont('helvetica', li === 0 ? 'bold' : 'normal');
        doc.setFontSize(li === 0 ? 7 : 6);
        doc.text(line, ex + 5, ey);
        ey += li === 0 ? 5.5 : 5;
      });
    });

    const kpiBlockH = kpis.length * (cardH + gap) - gap;

    return startY + kpiBlockH + 4;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION DIVIDER
  // ══════════════════════════════════════════════════════════════════════════════
  private drawDivider(doc: jsPDF, y: number, label: string): number {
    const cy   = y + 4;
    const midX = PW / 2;
    const lblW = doc.getStringUnitWidth(label) * 6.5 / doc.internal.scaleFactor + 8;
    // left line
    stroke(doc, C['amber']);
    doc.setLineWidth(0.4);
    doc.line(ML, cy, midX - lblW / 2 - 3, cy);
    // right line
    doc.line(midX + lblW / 2 + 3, cy, ML + CW, cy);
    // pill bg
    fill(doc, C['amber']);
    doc.roundedRect(midX - lblW / 2, cy - 3, lblW, 6, 3, 3, 'F');
    // label text
    txt(doc, C['white']);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text(label, midX, cy + 1.2, { align: 'center' });
    return y + 11;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // BAR CHARTS — 2×2 grid (LEFT) + explanation panel (RIGHT)
  // ══════════════════════════════════════════════════════════════════════════════
  private drawBarChartsSection(doc: jsPDF, startY: number, data: ReportData): number {
    const segs = data.segments ?? [];
    const agg  = data.agg ?? {};
    if (!segs.length) return startY;

    const names  = segs.map((s: any) => s.name as string);
    const colors = segs.map((s: any) => this.hexToRgb(s.color));
    const spend  = segs.map((s: any) => agg[s.id]?.avg_spend       ?? 0);
    const orders = segs.map((s: any) => agg[s.id]?.avg_orders      ?? 0);
    const rec    = segs.map((s: any) => agg[s.id]?.avg_recency     ?? 0);
    const ret    = segs.map((s: any) => (agg[s.id]?.avg_return_rate ?? 0) * 100);

    // ── Layout: 1 row per chart — chart 50% LEFT + explanation 50% RIGHT ───────
    // Page 2 full height ≈ 281mm → 4 rows × 63mm + 3 gaps × 4mm = 264mm ✓
    const gap    = 4;
    const chartW = CW / 2 - 3;      // exactly 50% of content width (~90mm)
    const expoW  = CW - chartW - 6; // other 50% (~90mm)
    const chartH = 63;
    const expoX  = ML + chartW + 6; // explanation at 50% mark

    const charts = [
      {
        title: 'Avg Spend',   subtitle: 'KWD per customer',               vals: spend,  color: C['amber'], lower: false, unit: ' KWD',
        expo: ['Avg Spend (KWD)', 'Avg revenue per customer.', 'Higher = more valuable.'],
      },
      {
        title: 'Avg Orders',  subtitle: 'per customer',                   vals: orders, color: C['blue'],  lower: false, unit: '',
        expo: ['Avg Orders', 'Purchase frequency per customer.', 'Higher = stronger loyalty.'],
      },
      {
        title: 'Avg Recency', subtitle: 'days since last order ↓ better', vals: rec,    color: C['green'], lower: true,  unit: ' d',
        expo: ['Avg Recency (days)', 'Days since last purchase.', 'Lower is better.'],
      },
      {
        title: 'Return Rate', subtitle: '% of orders returned ↓ better',  vals: ret,    color: C['red'],   lower: true,  unit: '%',
        expo: ['Return Rate (%)', 'Share of orders returned.', 'Lower is better. ★ = best.'],
      },
    ];

    charts.forEach((ch, i) => {
      const cy = startY + i * (chartH + gap);

      // Chart card on the left (50%)
      this.drawBarChart(doc, ML, cy, chartW, chartH, ch.title, ch.subtitle, ch.vals, colors, names, ch.color, ch.lower, ch.unit);

      // Inline explanation panel on the right (50%)
      fill(doc, C['expoBg']);
      stroke(doc, C['expoBd']);
      doc.setLineWidth(0.2);
      doc.roundedRect(expoX, cy, expoW, chartH, 3, 3, 'FD');

      // left accent stripe
      fill(doc, ch.color);
      doc.roundedRect(expoX, cy + 4, 2, 12, 0.6, 0.6, 'F');

      // explanation lines
      let ey = cy + 13;
      ch.expo.forEach((line, li) => {
        txt(doc, li === 0 ? C['tx'] : C['t2']);
        doc.setFont('helvetica', li === 0 ? 'bold' : 'normal');
        doc.setFontSize(li === 0 ? 8 : 7);
        doc.text(line, expoX + 7, ey);
        ey += li === 0 ? 9 : 8;
      });
    });

    const totalH = charts.length * (chartH + gap) - gap;
    return startY + totalH + 4;
  }


  /** Single bar chart card */
  private drawBarChart(
    doc: jsPDF,
    x: number, y: number, W: number, H: number,
    title: string, subtitle: string,
    vals: number[], colors: RGB[], labels: string[],
    accentColor: RGB, lowerBetter: boolean, unit: string
  ): void {
    // card bg
    fill(doc, C['card']);
    stroke(doc, C['border']);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, y, W, H, 2.5, 2.5, 'FD');

    // left accent bar
    fill(doc, accentColor);
    doc.roundedRect(x, y + 2.5, 1.2, 10, 0.5, 0.5, 'F');

    // title
    txt(doc, C['tx']);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(title, x + 5, y + 8);

    txt(doc, C['t4']);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.text(subtitle, x + 5, y + 12.5);

    // chart area  — PL increased to 18 to give room for rotated y-axis title
    const PL = 18, PR = 4, PT = 15, PB = 13;
    const cw  = W - PL - PR;
    const ch  = H - PT - PB;
    const max = (Math.max(...vals) || 1) * 1.18;
    const n   = vals.length;
    const sw  = cw / n;
    const bw  = Math.max(3, sw * 0.55);

    const bxFn = (i: number) => x + PL + i * sw + (sw - bw) / 2;
    const byFn = (v: number) => y + PT + ch - (v / max) * ch;
    const bhFn = (v: number) => (v / max) * ch;

    // axes
    stroke(doc, C['border']);
    doc.setLineWidth(0.25);
    doc.line(x + PL, y + PT, x + PL, y + PT + ch);
    doc.line(x + PL, y + PT + ch, x + PL + cw, y + PT + ch);

    // y-grid + labels
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const gv = max * (1 - i / steps);
      const gy = y + PT + (i / steps) * ch;
      stroke(doc, C['border']);
      doc.setLineWidth(0.12);
      doc.setLineDashPattern([0.8, 0.8], 0);
      doc.line(x + PL + 0.5, gy, x + PL + cw, gy);
      doc.setLineDashPattern([], 0);
      const lbl = gv >= 1000 ? (gv / 1000).toFixed(1) + 'K' : gv.toFixed(gv < 10 ? 1 : 0);
      txt(doc, C['t3']);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(4.5);
      doc.text(lbl, x + PL - 1.5, gy + 1.2, { align: 'right' });
    }

    // y-axis title (rotated) — inside the card, between left edge and the axis line
    txt(doc, C['t2']);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.text(title, x + 9, y + PT + ch / 2, { angle: 90, align: 'center' });

    // best index
    const bestI = lowerBetter
      ? vals.indexOf(Math.min(...vals))
      : vals.indexOf(Math.max(...vals));

    // bars
    vals.forEach((v, i) => {
      const bx  = bxFn(i);
      const bY  = byFn(v);
      const bH  = bhFn(v);
      const isBest = i === bestI;

      if (isBest) {
        doc.setGState(doc.GState({ opacity: 0.15 }));
        fill(doc, colors[i]);
        doc.roundedRect(bx - 0.7, bY - 0.5, bw + 1.4, bH + 0.5, 1, 1, 'F');
        doc.setGState(doc.GState({ opacity: 1 }));
        fill(doc, colors[i]);
      } else {
        doc.setGState(doc.GState({ opacity: 0.35 }));
        fill(doc, colors[i]);
        doc.setGState(doc.GState({ opacity: 1 }));
      }
      doc.roundedRect(bx, bY, bw, bH, 1, 1, 'F');

      // value label
      txt(doc, isBest ? colors[i] : C['t3']);
      doc.setFont('helvetica', isBest ? 'bold' : 'normal');
      doc.setFontSize(4.5);
      const valLbl = (v >= 1000 ? (v / 1000).toFixed(1) + 'K' : v.toFixed(v < 10 ? 1 : 0)) + unit;
      doc.text(valLbl, bx + bw / 2, bY - 1.5, { align: 'center' });

      // star ★ for best
      if (isBest) {
        txt(doc, colors[i]);
        doc.setFontSize(6.5);
        doc.text('★', bx + bw / 2, bY - 5.5, { align: 'center' });
      }

      // x-axis label
      txt(doc, C['t2']);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(4.5);
      doc.text(labels[i].slice(0, 8), bx + bw / 2, y + PT + ch + 5, { align: 'center' });
    });

    // x-axis title
    txt(doc, C['t2']);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5);
    doc.text('Segment', x + PL + cw / 2, y + H - 2, { align: 'center' });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // REVENUE PANELS — left side  +  explanation panel RIGHT
  // ══════════════════════════════════════════════════════════════════════════════
  private drawRevenuePanels(doc: jsPDF, startY: number, data: ReportData): number {
    const gap   = 5;                  // vertical gap between the two rows
    const half  = CW / 2 - 3;        // 50% each: panel = 90mm, expo = 90mm
    const expoX = ML + half + 6;      // explanation starts at 50% mark
    const expoW = CW - half - 6;      // ~90mm for explanation

    const segs = data.segments ?? [];
    const cats = Object.entries((data.summary?.category_revenue ?? {}) as Record<string, number>)
                       .sort((a, b) => b[1] - a[1]).slice(0, 8);

    const rowH    = 12;
    const panel1H = 20 + segs.length * rowH + 6;
    const panel2H = 20 + cats.length * rowH + 6;

    // ── Row 1: Revenue Share by Segment (LEFT) + explanation (RIGHT) ──────────
    this.drawRevSharePanel(doc, ML, startY, half, panel1H, data, segs);

    fill(doc, C['expoBg']);
    stroke(doc, C['expoBd']);
    doc.setLineWidth(0.2);
    doc.roundedRect(expoX, startY, expoW, panel1H, 3, 3, 'FD');
    // accent stripe
    fill(doc, C['amber']);
    doc.roundedRect(expoX, startY + 4, 2, 12, 0.6, 0.6, 'F');
    // title
    txt(doc, C['tx']); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text('Revenue Share by Segment', expoX + 7, startY + 12);
    // body lines
    const r1lines = [
      'Each bar shows how much a segment',
      'contributes to the total revenue.',
      'Wider bar = larger revenue share.',
      'Percentage shown on the right.',
    ];
    txt(doc, C['t2']); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
    r1lines.forEach((line, i) => {
      doc.text(line, expoX + 7, startY + 22 + i * 8);
    });

    // ── Row 2: Category Revenue (LEFT) + explanation (RIGHT) ─────────────────
    const row2Y = startY + panel1H + gap;
    this.drawCatPanel(doc, ML, row2Y, half, panel2H, data, cats);

    fill(doc, C['expoBg']);
    stroke(doc, C['expoBd']);
    doc.setLineWidth(0.2);
    doc.roundedRect(expoX, row2Y, expoW, panel2H, 3, 3, 'FD');
    // accent stripe
    fill(doc, C['blue']);
    doc.roundedRect(expoX, row2Y + 4, 2, 12, 0.6, 0.6, 'F');
    // title
    txt(doc, C['tx']); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text('Category Revenue', expoX + 7, row2Y + 12);
    // body lines
    const r2lines = [
      'Top 8 product categories ranked',
      'by total revenue generated.',
      'Bar = relative share vs. top category.',
      'Use to guide stock & promotions.',
    ];
    txt(doc, C['t2']); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
    r2lines.forEach((line, i) => {
      doc.text(line, expoX + 7, row2Y + 22 + i * 8);
    });

    return row2Y + panel2H + 4;
  }

  /** Revenue Share by Segment */
  private drawRevSharePanel(
    doc: jsPDF, x: number, y: number, W: number, H: number,
    data: ReportData, segs: any[]
  ): void {
    fill(doc, C['card']);
    stroke(doc, C['border']);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, y, W, H, 2.5, 2.5, 'FD');

    // top accent
    fill(doc, C['amber']);
    doc.roundedRect(x, y, W, 1.2, 1, 1, 'F');

    txt(doc, C['tx']);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('Revenue Share by Segment', x + 7, y + 7.5);

    txt(doc, C['t3']);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    doc.text('Total revenue distribution · exact figures', x + 7, y + 11.5);

    // total badge
    const totalM = (data.totalRevenue / 1_000_000).toFixed(2) + 'M KWD';
    const bw     = doc.getStringUnitWidth(totalM) * 6 / doc.internal.scaleFactor + 7;
    fill(doc, [255, 245, 230] as RGB);
    stroke(doc, C['amber']);
    doc.setLineWidth(0.2);
    doc.roundedRect(x + W - bw - 5, y + 4, bw, 5.5, 2.5, 2.5, 'FD');
    txt(doc, C['amber']);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5);
    doc.text(totalM, x + W - 5 - bw / 2, y + 8, { align: 'center' });

    // rows
    const totRev   = data.totalRevenue || 1;
    const revBySeg = data.summary?.revenue_by_segment ?? {};
    // Scale segment values so percentages are relative to the true PaymentLog total
    const segSum   = Object.values(revBySeg).reduce((a: number, b) => a + Number(b), 0) || 1;
    const scale    = totRev / segSum;
    const rowH     = 11;
    const rowsY    = y + 16;
    const barX     = x + 54, barW = W - 54 - 26;

    segs.forEach((seg: any, i: number) => {
      const ry     = rowsY + i * rowH;
      const segRev = Number(revBySeg[String(seg.id)] ?? 0) * scale;
      const pct    = Math.round(segRev / totRev * 100);
      const rgb    = this.hexToRgb(seg.color);

      if (i > 0) {
        stroke(doc, C['border']);
        doc.setLineWidth(0.15);
        doc.line(x + 5, ry, x + W - 5, ry);
      }

      fill(doc, rgb);
      doc.circle(x + 10, ry + rowH / 2, 1.8, 'F');

      txt(doc, rgb);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.text(seg.name, x + 14.5, ry + rowH / 2 + 1.5);

      // bar
      fill(doc, C['bg2']);
      doc.roundedRect(barX, ry + rowH / 2 - 1.8, barW, 3.5, 1.5, 1.5, 'F');
      fill(doc, rgb);
      doc.roundedRect(barX, ry + rowH / 2 - 1.8, Math.max(1, barW * pct / 100), 3.5, 1.5, 1.5, 'F');

      // value
      txt(doc, rgb);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.text(this.fmtSegRev(segRev), x + W - 4.5, ry + rowH / 2 + 1.5, { align: 'right' });

      txt(doc, C['t3']);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5);
      doc.text(`${pct}%`, x + W - 4.5, ry + rowH / 2 + 5.5, { align: 'right' });
    });
  }

  /** Category Revenue */
  private drawCatPanel(
    doc: jsPDF, x: number, y: number, W: number, H: number,
    data: ReportData, cats: [string, number][]
  ): void {
    fill(doc, C['card']);
    stroke(doc, C['border']);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, y, W, H, 2.5, 2.5, 'FD');

    // top accent
    fill(doc, C['blue']);
    doc.roundedRect(x, y, W, 1.2, 1, 1, 'F');

    txt(doc, C['tx']);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('Category Revenue', x + 7, y + 7.5);

    txt(doc, C['t3']);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    doc.text(`KWD total · ${cats.length} categories`, x + 7, y + 11.5);

    const maxRev = cats[0]?.[1] ?? 1;
    const totRev = cats.reduce((s, [, v]) => s + v, 0) || 1;
    const rowH   = 11;
    const rowsY  = y + 16;
    const barX   = x + 46, barW = W - 46 - 26;

    cats.forEach(([name, rev], i) => {
      const ry  = rowsY + i * rowH;
      const pct = Math.round(rev / totRev * 100);

      if (i > 0) {
        stroke(doc, C['border']);
        doc.setLineWidth(0.15);
        doc.line(x + 5, ry, x + W - 5, ry);
      }

      // rank badge
      fill(doc, C['bg2']);
      doc.roundedRect(x + 6, ry + rowH / 2 - 2.5, 7, 5, 1.2, 1.2, 'F');
      txt(doc, C['t3']);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5);
      doc.text(`${i + 1}`, x + 9.5, ry + rowH / 2 + 1, { align: 'center' });

      txt(doc, C['t2']);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.text(name, x + 16, ry + rowH / 2 + 1.5);

      // bar
      fill(doc, C['bg2']);
      doc.roundedRect(barX, ry + rowH / 2 - 1.8, barW, 3.5, 1.5, 1.5, 'F');
      fill(doc, C['amber']);
      doc.roundedRect(barX, ry + rowH / 2 - 1.8, Math.max(1, barW * rev / maxRev), 3.5, 1.5, 1.5, 'F');

      txt(doc, C['amber']);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.text((rev / 1000).toFixed(0) + 'K', x + W - 4.5, ry + rowH / 2 + 1.5, { align: 'right' });

      txt(doc, C['t3']);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5);
      doc.text(`${pct}%`, x + W - 4.5, ry + rowH / 2 + 5.5, { align: 'right' });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // REUSABLE EXPLANATION PANEL (right column)
  // ══════════════════════════════════════════════════════════════════════════════
  /**
   * Draws a light-mode explanation side-panel.
   * @param items  Array of { bullet: RGB color, lines: string[] }
   *               First line = bold heading, rest = body text
   */
  private drawExplanationPanel(
    doc: jsPDF,
    x: number, y: number,
    W: number, H: number,
    title: string,
    items: { bullet: RGB; lines: string[] }[]
  ): void {
    // Panel card
    fill(doc, C['expoBg']);
    stroke(doc, C['expoBd']);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, W, H, 2.5, 2.5, 'FD');

    // Left accent stripe
    fill(doc, C['amber']);
    doc.roundedRect(x, y + 3, 1.5, 10, 0.5, 0.5, 'F');

    // Panel title
    txt(doc, C['t3']);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.text(title.toUpperCase(), x + 5, y + 6);

    // Divider
    stroke(doc, C['expoBd']);
    doc.setLineWidth(0.15);
    doc.line(x + 4, y + 8.5, x + W - 4, y + 8.5);

    // Items
    let iy = y + 13;
    const pad = x + 5;
    const lineH = 4.2;

    items.forEach((item, idx) => {
      // Bullet dot
      fill(doc, item.bullet);
      doc.circle(pad + 1.2, iy - 0.8, 1.2, 'F');

      // Lines
      item.lines.forEach((line, li) => {
        txt(doc, li === 0 ? C['tx'] : C['t3']);
        doc.setFont('helvetica', li === 0 ? 'bold' : 'normal');
        doc.setFontSize(li === 0 ? 5.5 : 5);
        doc.text(line, pad + 4.5, iy);
        iy += lineH;
      });

      // Separator between items (not after last)
      if (idx < items.length - 1) {
        iy += 1;
        stroke(doc, C['expoBd']);
        doc.setLineWidth(0.1);
        doc.setLineDashPattern([0.8, 0.8], 0);
        doc.line(pad, iy, x + W - 4, iy);
        doc.setLineDashPattern([], 0);
        iy += 3;
      }
    });

    // Footer note
    const footerY = y + H - 4.5;
    if (footerY > iy) {
      stroke(doc, C['expoBd']);
      doc.setLineWidth(0.1);
      doc.line(x + 4, footerY - 1.5, x + W - 4, footerY - 1.5);
      txt(doc, C['t4']);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(4.5);
      doc.text('★ = best performer in category', x + 5, footerY + 1);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // FOOTERS
  // ══════════════════════════════════════════════════════════════════════════════
  private addFooters(doc: jsPDF): void {
    const total = (doc as any).internal.getNumberOfPages();
    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      stroke(doc, C['border']);
      doc.setLineWidth(0.3);
      doc.line(ML, PH - 8, ML + CW, PH - 8);
      fill(doc, C['card']);
      doc.rect(0, PH - 7.5, PW, 7.5, 'F');
      // amber accent
      fill(doc, C['amber']);
      doc.rect(0, PH - 7.8, PW, 0.4, 'F');
      txt(doc, C['t3']);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.text(`SegmentIQ Analytics · ${today}`, ML, PH - 3.5);
      doc.text(`Page ${p} of ${total}`, PW - MR, PH - 3.5, { align: 'right' });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // UTILS
  // ══════════════════════════════════════════════════════════════════════════════
  private hexToRgb(hex: string): RGB {
    const m = (hex ?? '#6b7280').replace('#', '').match(/.{2}/g);
    if (!m || m.length < 3) return C['t3'];
    return [parseInt(m[0], 16), parseInt(m[1], 16), parseInt(m[2], 16)];
  }

  private fmtKwd(v: number): string {
    if (!v) return '0';
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M';
    if (v >= 1_000)     return (v / 1_000).toFixed(0) + 'K';
    return v.toFixed(0);
  }

  private fmtNum(v: number): string {
    return (v ?? 0).toLocaleString('en-US');
  }

  private fmtSegRev(v: number): string {
    if (!v) return '0';
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M KWD';
    return (v / 1_000).toFixed(0) + 'K KWD';
  }
}