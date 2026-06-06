import { Component, effect, AfterViewInit, ViewChildren, QueryList, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../core/services/data.service';
import { ApiService } from '../../core/services/api.service';
import { ChartService } from '../../core/services/chart.service';
import { PdfExportService } from '../../core/services/pdf-export.service';

@Component({
  selector: 'app-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './report.component.html',
  styleUrls: ['./report.component.scss']
})
export class ReportComponent implements AfterViewInit {
  @ViewChildren('spendCanvas') sc!:  QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('ordCanvas')   oc!:  QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('recCanvas')   rc!:  QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('retCanvas')   rtc!: QueryList<ElementRef<HTMLCanvasElement>>;

  exporting = false;

  // ── Computed view helpers (formatting only — no business logic) ───────────

  get returnRatePct(): string {
    const rate = this.data.summary()?.return_rate ?? 0;
    return (rate * 100).toFixed(1);
  }

  /** Bar width for YoY card — real value capped at 100%, minimum 4% for visibility */
  get yoyBarWidth(): number {
    const pct = this.data.yoyPct();
    if (pct === null) return 4;
    return Math.min(Math.max(Math.abs(pct), 4), 100);
  }

  /**
   * Bar width for Customers KPI:
   * ratio of customers who placed at least one fulfilled order vs total customers.
   * Falls back to 100% if data not available.
   */
  get customersBarWidth(): number {
    const total     = this.data.totalCustomers();
    const fulfilled = this.data.totalFulfilledOrders();
    if (!total || !fulfilled) return 100;
    // Use active_customers_90 if available as a more meaningful "active" ratio
    const active90 = this.data.summary()?.active_customers_90 ?? 0;
    if (active90 > 0 && total > 0) {
      return Math.min(Math.round((active90 / total) * 100), 100);
    }
    return 100;
  }

  /**
   * Bar width for Fulfilled Orders KPI:
   * fulfilled orders / gross orders (returns included) × 100.
   */
  get fulfilledOrdersBarWidth(): number {
    const summary   = this.data.summary();
    const gross     = summary?.total_orders ?? 0;
    const fulfilled = this.data.totalFulfilledOrders();
    if (!gross) return 100;
    return Math.min(Math.round((fulfilled / gross) * 100), 100);
  }

  /**
   * Bar width for AOV KPI:
   * true_aov / avg_order_value (biased) × 100.
   * Represents how much the corrected AOV deviates from the raw AOV — closer to 100% is better.
   * Falls back to 100% when both are equal or unavailable.
   */
  get aovBarWidth(): number {
    const summary  = this.data.summary();
    const trueAov  = summary?.true_aov  ?? 0;
    const rawAov   = summary?.avg_order_value ?? 0;
    if (!rawAov) return 100;
    return Math.min(Math.round((trueAov / rawAov) * 100), 100);
  }

  // ── PDF Export ────────────────────────────────────────────────────────────

  exportPdf(): void {
    if (this.exporting) return;
    this.exporting = true;

    const reportData = {
      segments:             this.data.segments(),
      agg:                  this.data.agg(),
      segmentCounts:        this.data.segmentCounts(),
      summary:              this.data.summary(),
      totalRevenue:         this.data.totalRevenue(),
      overallAov:           this.data.overallAov(),
      totalFulfilledOrders: this.data.totalFulfilledOrders(),
      yoyGrowth:            this.data.yoyGrowthStr(),
    };

    this.pdfExport
      .exportReport([], 'segmentiq-report.pdf', reportData)
      .catch(err => console.error('PDF export error:', err))
      .finally(() => { this.exporting = false; });
  }

  // ── Chart drawing ─────────────────────────────────────────────────────────

  constructor(
    public data: DataService,
    public api: ApiService,
    private charts: ChartService,
    private pdfExport: PdfExportService,
  ) {
    effect(() => {
      const segs = this.data.segments();
      const agg  = this.data.agg();
      if (!segs.length || !Object.keys(agg).length) return;
      setTimeout(() => this.drawCharts(), 80);
    });
  }

  ngAfterViewInit(): void { setTimeout(() => this.drawCharts(), 120); }
  @HostListener('window:resize') onResize(): void { this.drawCharts(); }

  private drawCharts(): void {
    const segs = this.data.segments();
    const agg  = this.data.agg();
    if (!segs.length || !Object.keys(agg).length) return;

    const names  = segs.map(s => s.name);
    const colors = segs.map(s => s.color);
    const vals   = {
      spend:  segs.map(s => agg[s.id]?.avg_spend    ?? 0),
      orders: segs.map(s => agg[s.id]?.avg_orders   ?? 0),
      rec:    segs.map(s => agg[s.id]?.avg_recency  ?? 0),
      ret:    segs.map(s => (agg[s.id]?.avg_return_rate ?? 0) * 100),
    };

    this.drawBarWithAxes(this.sc.first?.nativeElement,  vals.spend,  colors, names, false, 'Avg Spend (KWD)',    'Segment');
    this.drawBarWithAxes(this.oc.first?.nativeElement,  vals.orders, colors, names, false, 'Avg Orders',         'Segment');
    this.drawBarWithAxes(this.rc.first?.nativeElement,  vals.rec,    colors, names, true,  'Avg Recency (days)', 'Segment');
    this.drawBarWithAxes(this.rtc.first?.nativeElement, vals.ret,    colors, names, true,  'Return Rate (%)',    'Segment');
  }

  private axisLabelColor(): string {
    return getComputedStyle(document.documentElement).getPropertyValue('--t2').trim() || '#2e3460';
  }
  private axisTitleColor(): string {
    return getComputedStyle(document.documentElement).getPropertyValue('--t3').trim() || '#6b71a0';
  }

  private drawBarWithAxes(
    el: HTMLCanvasElement | undefined,
    vals: number[],
    colors: string[],
    labels: string[],
    lowerBetter: boolean,
    yTitle: string,
    xTitle: string
  ): void {
    if (!el) return;

    const unitSuffix: string =
      yTitle.includes('KWD')    ? ' KWD'  :
      yTitle.includes('days')   ? ' d'    :
      yTitle.includes('%')      ? '%'     :
      yTitle.includes('Orders') ? ' orders' : '';

    el.width  = el.offsetWidth || 320;
    el.height = 260;

    const ctx = el.getContext('2d')!;
    const W   = el.width;
    const H   = el.height;
    const P   = { l: 68, r: 14, t: 30, b: 58 };

    ctx.clearRect(0, 0, W, H);
    if (!vals.length) return;

    const max   = Math.max(...vals) * 1.18 || 1;
    const n     = vals.length;
    const slotW = (W - P.l - P.r) / n;
    const bw    = Math.max(12, Math.floor(slotW * 0.55));

    const bx = (i: number) => P.l + i * slotW + (slotW - bw) / 2;
    const by = (v: number) => H - P.b - (v / max) * (H - P.t - P.b);
    const bh = (v: number) => (v / max) * (H - P.t - P.b);

    ctx.beginPath();
    ctx.moveTo(P.l, P.t - 6);
    ctx.lineTo(P.l, H - P.b);
    ctx.strokeStyle = 'rgba(128,128,128,0.2)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(P.l, H - P.b);
    ctx.lineTo(W - P.r, H - P.b);
    ctx.stroke();

    const ySteps = 4;
    for (let i = 0; i <= ySteps; i++) {
      const v = max * (1 - i / ySteps);
      const y = P.t + (i / ySteps) * (H - P.t - P.b);

      ctx.beginPath();
      ctx.moveTo(P.l + 1, y);
      ctx.lineTo(W - P.r, y);
      ctx.strokeStyle = 'rgba(128,128,128,0.08)';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth   = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.moveTo(P.l - 5, y);
      ctx.lineTo(P.l, y);
      ctx.strokeStyle = 'rgba(128,128,128,0.25)';
      ctx.stroke();

      ctx.fillStyle = this.axisLabelColor();
      ctx.font      = 'bold 12px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      const lbl = v >= 1000 ? (v / 1000).toFixed(1) + 'K' : v.toFixed(v < 10 ? 1 : 0);
      ctx.fillText(lbl, P.l - 8, y + 4);
    }

    ctx.save();
    ctx.translate(14, P.t + (H - P.t - P.b) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = this.axisTitleColor();
    ctx.font      = 'bold 12px Plus Jakarta Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(yTitle, 0, 0);
    ctx.restore();

    const best = lowerBetter
      ? vals.indexOf(Math.min(...vals))
      : vals.indexOf(Math.max(...vals));

    vals.forEach((v, i) => {
      const x = bx(i);
      const y = by(v);
      const h = bh(v);
      const isBest = i === best;

      if (isBest) {
        ctx.shadowColor   = colors[i] + '55';
        ctx.shadowBlur    = 10;
        ctx.shadowOffsetY = 3;
      }

      const grad = ctx.createLinearGradient(x, y, x, y + h);
      if (isBest) {
        grad.addColorStop(0, colors[i]);
        grad.addColorStop(1, colors[i] + '99');
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = colors[i] + '50';
      }

      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, bw, h, [4, 4, 0, 0]);
      else ctx.rect(x, y, bw, h);
      ctx.fill();

      ctx.shadowColor   = 'transparent';
      ctx.shadowBlur    = 0;
      ctx.shadowOffsetY = 0;

      ctx.fillStyle = isBest ? colors[i] : this.axisLabelColor();
      ctx.font      = `${isBest ? 'bold ' : ''}12px JetBrains Mono, monospace`;
      ctx.textAlign = 'center';
      const valLbl  = (v >= 1000 ? (v / 1000).toFixed(1) + 'K' : v.toFixed(v < 10 ? 1 : 0)) + unitSuffix;
      ctx.fillText(valLbl, x + bw / 2, y - 6);

      if (isBest) {
        ctx.fillStyle = colors[i];
        ctx.font      = '13px sans-serif';
        ctx.fillText('★', x + bw / 2, y - 20);
      }
    });

    vals.forEach((_, i) => {
      const x = bx(i) + bw / 2;

      ctx.beginPath();
      ctx.moveTo(x, H - P.b);
      ctx.lineTo(x, H - P.b + 5);
      ctx.strokeStyle = 'rgba(128,128,128,0.2)';
      ctx.lineWidth   = 1;
      ctx.stroke();

      ctx.fillStyle = this.axisLabelColor();
      ctx.font      = 'bold 12px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i].slice(0, 7), x, H - P.b + 18);
    });

    ctx.fillStyle = this.axisTitleColor();
    ctx.font      = 'bold 12px Plus Jakarta Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(xTitle, P.l + (W - P.l - P.r) / 2, H - 4);
  }
}