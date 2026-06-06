import {
  Component,
  AfterViewInit,
  ViewChildren,
  QueryList,
  ElementRef,
  HostListener,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../../core/services/data.service';

@Component({
  selector: 'app-behavior',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './behavior.component.html',
  styleUrls: ['./behavior.component.scss'],
})
export class BehaviorComponent implements AfterViewInit {

  @ViewChildren('clvCanvas')    clvC!:  QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('bubbleCanvas') bubC!:  QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('iptCanvas')    iptC!:  QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('projCanvas')   projC!: QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('lifeCanvas')   lifeC!: QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('netCanvas')    netC!:  QueryList<ElementRef<HTMLCanvasElement>>;

  kpis:      any[] = [];
  segLegend: any[] = [];

  private segmentColorMap: Record<number, { color: string; name: string }> = {};

  private buildSegmentColorMap(): void {
    for (const s of this.data.segments()) {
      if (!this.segmentColorMap[s.id]) {
        this.segmentColorMap[s.id] = { color: s.color, name: s.name };
      }
    }
  }

  private segColor(id: number, fallback: string): string {
    return this.segmentColorMap[id]?.color ?? fallback;
  }
  private segName(id: number, fallback: string): string {
    return this.segmentColorMap[id]?.name ?? fallback;
  }

  constructor(public data: DataService) {
    effect(() => {
      const segs = this.data.segments();
      const agg  = this.data.agg();
      if (!segs.length || !Object.keys(agg).length) return;
      this.buildSegmentColorMap();
      this.buildKpis();
      this.buildLegend();
      setTimeout(() => this.drawAll(), 80);
    });
  }

  ngAfterViewInit(): void { setTimeout(() => this.drawAll(), 120); }

  @HostListener('window:resize')
  onResize(): void { this.drawAll(); }

  private buildLegend(): void {
    this.segLegend = this.data.segments().map(s => ({
      id:    s.id,
      name:  this.segName(s.id, s.name),
      color: this.segColor(s.id, s.color),
    }));
  }

  private buildKpis(): void {
    const segs = this.data.segments();
    const agg  = this.data.agg();
    if (!segs.length || !Object.keys(agg).length) return;

    const totalCount = segs.reduce((a, sg) => a + (agg[sg.id]?.n ?? 1), 0) || 1;
    const wavg = (field: string) =>
      segs.reduce((a, sg) => a + ((agg[sg.id] as any)[field] ?? 0) * (agg[sg.id]?.n ?? 1), 0) / totalCount;

    const globalIPT      = wavg('avg_ipt');
    const globalProj     = wavg('avg_projected_annual');
    const globalLifespan = wavg('avg_lifespan') / 30;  // backend stores days → convert to months
    const globalNet      = wavg('avg_net_revenue');

    const bestIPT  = segs.reduce((a, b) =>
      ((agg[a.id] as any)?.avg_ipt ?? 999) < ((agg[b.id] as any)?.avg_ipt ?? 999) ? a : b);
    const bestProj = segs.reduce((a, b) =>
      ((agg[a.id] as any)?.avg_projected_annual ?? 0) > ((agg[b.id] as any)?.avg_projected_annual ?? 0) ? a : b);
    const bestLife = segs.reduce((a, b) =>
      ((agg[a.id] as any)?.avg_lifespan ?? 0) > ((agg[b.id] as any)?.avg_lifespan ?? 0) ? a : b);
    const bestNet  = segs.reduce((a, b) =>
      ((agg[a.id] as any)?.avg_net_revenue ?? 0) > ((agg[b.id] as any)?.avg_net_revenue ?? 0) ? a : b);

    this.kpis = [
      {
        id:    'ipt',
        icon:  '⏳',
        category: 'Loyalty',
        title: 'Inter-Purchase Time',
        value: globalIPT.toFixed(1),
        unit:  'days',
        desc:  `Average days between 2 purchases — ${this.segName(bestIPT.id, bestIPT.name)} is the fastest`,
        badge: `↓ Best: ${this.segName(bestIPT.id, bestIPT.name)}`,
        trend: ((agg[bestIPT.id] as any)?.avg_ipt ?? 0).toFixed(1) + ' d',
        color: '#e07820',
      },
      {
        id:    'proj',
        icon:  '📈',
        category: 'Future Value',
        title: 'Projected Annual Value',
        value: this.fmtKpi(globalProj),
        unit:  'KWD / yr',
        desc:  `Projected annual value — ${this.segName(bestProj.id, bestProj.name)} leads`,
        badge: `↑ Best: ${this.segName(bestProj.id, bestProj.name)}`,
        trend: this.fmtKpi((agg[bestProj.id] as any)?.avg_projected_annual ?? 0) + ' KWD',
        color: '#2563eb',
      },
      {
        id:    'life',
        icon:  '📅',
        category: 'Longevity',
        title: 'Customer Lifespan',
        value: globalLifespan.toFixed(1),
        unit:  'months',
        desc:  `Customer lifetime — ${this.segName(bestLife.id, bestLife.name)} is the most loyal`,
        badge: `↑ Best: ${this.segName(bestLife.id, bestLife.name)}`,
        trend: (((agg[bestLife.id] as any)?.avg_lifespan ?? 0) / 30).toFixed(1) + ' mo',
        color: '#059669',
      },
      {
        id:    'net',
        icon:  '💎',
        category: 'Real Profitability',
        title: 'Avg Net Revenue',
        value: this.fmtKpi(globalNet),
        unit:  'KWD net',
        desc:  `Net revenue after returns — ${this.segName(bestNet.id, bestNet.name)} generates the most`,
        badge: `↑ Best: ${this.segName(bestNet.id, bestNet.name)}`,
        trend: this.fmtKpi((agg[bestNet.id] as any)?.avg_net_revenue ?? 0) + ' KWD',
        color: '#7c3aed',
      },
    ];
  }

  private fmtKpi(v: number): string {
    if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
    if (Math.abs(v) >= 1000)      return (v / 1000).toFixed(1) + 'K';
    return v.toFixed(0);
  }

  private drawAll(): void {
    const segs = this.data.segments();
    const agg  = this.data.agg();
    if (!segs.length || !Object.keys(agg).length) return;

    const names  = segs.map(s => this.segName(s.id, s.name));
    const colors = segs.map(s => this.segColor(s.id, s.color));

    this.drawDivergingBar(
      this.clvC.first?.nativeElement,
      segs.map(s => (agg[s.id] as any)?.avg_clv_slope ?? 0),
      colors, names, ' KWD',
    );

    this.drawBubble(
      this.bubC.first?.nativeElement,
      segs.map(s => (agg[s.id] as any)?.avg_spend_velocity   ?? 0),
      segs.map(s => (agg[s.id] as any)?.avg_clv_slope        ?? 0),
      segs.map(s => (agg[s.id] as any)?.avg_projected_annual ?? 0),
      colors, names,
    );

    this.drawHBar(
      this.iptC.first?.nativeElement,
      segs.map(s => (agg[s.id] as any)?.avg_ipt ?? 0),
      colors, names, true, ' d',
    );

    this.drawDonut(
      this.projC.first?.nativeElement,
      segs.map(s => (agg[s.id] as any)?.avg_projected_annual ?? 0),
      colors, names,
    );

    this.drawBar(
      this.lifeC.first?.nativeElement,
      segs.map(s => ((agg[s.id] as any)?.avg_lifespan ?? 0) / 30),  // days → months
      colors, names, false, ' mo',
    );

    this.drawBar(
      this.netC.first?.nativeElement,
      segs.map(s => (agg[s.id] as any)?.avg_net_revenue ?? 0),
      colors, names, false, ' KWD',
    );

  }

  private setupCanvas(
    el: HTMLCanvasElement, h: number,
  ): { ctx: CanvasRenderingContext2D; W: number; H: number } {
    const dpr = window.devicePixelRatio || 1;
    const W   = el.offsetWidth || 300;
    el.width  = W * dpr;
    el.height = h * dpr;
    el.style.width  = W + 'px';
    el.style.height = h + 'px';
    const ctx = el.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, h);
    return { ctx, W, H: h };
  }

  private cssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  private fmtVal(v: number, unit = ''): string {
    if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M' + unit;
    if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + 'K' + unit;
    if (Math.abs(v) < 10)    return v.toFixed(2) + unit;
    return v.toFixed(0) + unit;
  }

  // ─── FONT SIZE CONSTANTS ───────────────────────────────────────────────────
  private readonly FONT_AXIS  = `13px 'JetBrains Mono', monospace`;       // axis tick labels
  private readonly FONT_LABEL = `bold 13px 'JetBrains Mono', monospace`;  // bar / segment labels
  private readonly FONT_VALUE = `bold 13px 'JetBrains Mono', monospace`;  // value on top of bars
  private readonly FONT_STAR  = `13px sans-serif`;                         // ★ best marker

  private drawGridLines(
    ctx: CanvasRenderingContext2D,
    steps: number, min: number, max: number,
    P: { l: number; r: number; t: number; b: number },
    W: number, H: number,
    unit = '',
    showZero = false,
  ): void {
    const t4  = this.cssVar('--t4') || '#a3a8c8';
    const bd2 = this.cssVar('--bd2') || 'rgba(120,80,20,.06)';
    for (let i = 0; i <= steps; i++) {
      const val = min + (max - min) * (i / steps);
      const y   = P.t + (1 - i / steps) * (H - P.t - P.b);
      ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(W - P.r, y);
      ctx.strokeStyle = i === 0 ? t4 : bd2;
      ctx.lineWidth = 1; ctx.stroke();
      if (i > 0 || showZero) {
        ctx.fillStyle = t4;
        ctx.font = this.FONT_AXIS;
        ctx.textAlign = 'right';
        ctx.fillText(this.fmtVal(val, unit), P.l - 8, y + 4);
      }
    }
  }

  private drawBar(
    el: HTMLCanvasElement | undefined,
    vals: number[], colors: string[], labels: string[],
    lowerBetter = false, unit = '',
  ): void {
    if (!el) return;
    const H_CHART = 300;
    // ↑ padding left increased to 90 to accommodate Y-axis labels fully
    const { ctx, W, H } = this.setupCanvas(el, H_CHART);
    const P   = { l: 90, r: 20, t: 32, b: 60 };
    const max = Math.max(...vals.map(Math.abs)) * 1.2 || 1;

    this.drawGridLines(ctx, 4, 0, max, P, W, H, unit);

    const slotW  = (W - P.l - P.r) / vals.length;
    const bw     = Math.min(Math.floor(slotW * 0.55), 56);
    const chartH = H - P.t - P.b;

    vals.forEach((v, i) => {
      const x    = P.l + i * slotW + (slotW - bw) / 2;
      const bh   = Math.max((v / max) * chartH, 2);
      const y    = H - P.b - bh;
      const best = lowerBetter ? v === Math.min(...vals) : v === Math.max(...vals);

      if (best) { ctx.shadowColor = colors[i]; ctx.shadowBlur = 14; }
      const grad = ctx.createLinearGradient(x, y, x, y + bh);
      grad.addColorStop(0, colors[i] + 'ee');
      grad.addColorStop(1, colors[i] + '44');
      ctx.fillStyle = grad;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, [6, 6, 0, 0]);
      else ctx.rect(x, y, bw, bh);
      ctx.fill();
      ctx.shadowBlur = 0;

      // value label above bar
      ctx.fillStyle = best ? colors[i] : (this.cssVar('--t2') || '#3a3f6b');
      ctx.font      = this.FONT_VALUE;
      ctx.textAlign = 'center';
      ctx.fillText(this.fmtVal(v, unit), x + bw / 2, y - 7);

      // segment label on X axis
      ctx.fillStyle = this.cssVar('--t3') || '#6b71a0';
      ctx.font      = this.FONT_LABEL;
      const lbl = labels[i].length > 8 ? labels[i].slice(0, 7) + '.' : labels[i];
      ctx.fillText(lbl, x + bw / 2, H - P.b + 18);

      // ★ best indicator
      if (best) {
        ctx.fillStyle = colors[i];
        ctx.font = this.FONT_STAR;
        ctx.fillText('★', x + bw / 2, H - P.b + 36);
      }
    });
  }

  private drawDivergingBar(
    el: HTMLCanvasElement | undefined,
    vals: number[], colors: string[], labels: string[], unit = '',
  ): void {
    if (!el) return;
    // ↑ height increased + larger left padding for full Y-label visibility
    const { ctx, W, H } = this.setupCanvas(el, 310);
    const P      = { l: 90, r: 20, t: 44, b: 60 };
    const absMax = Math.max(...vals.map(Math.abs));
    const max    = (absMax === 0 ? 1 : absMax) * 1.35;
    const chartH = H - P.t - P.b;
    const zeroY  = P.t + chartH / 2;
    const t4  = this.cssVar('--t4') || '#a3a8c8';
    const bd2 = this.cssVar('--bd2') || 'rgba(120,80,20,.06)';

    // horizontal grid lines with labels
    [-1, -.5, .5, 1].forEach(f => {
      const y = zeroY - f * (chartH / 2);
      ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(W - P.r, y);
      ctx.strokeStyle = bd2; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = t4;
      ctx.font = this.FONT_AXIS; ctx.textAlign = 'right';
      const yVal = f * max;
      ctx.fillText(this.fmtVal(yVal, ''), P.l - 8, y + 4);
    });

    // zero line
    ctx.beginPath(); ctx.moveTo(P.l, zeroY); ctx.lineTo(W - P.r, zeroY);
    ctx.strokeStyle = t4; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = t4;
    ctx.font = `bold ${this.FONT_AXIS}`; ctx.textAlign = 'right';
    ctx.fillText('0', P.l - 8, zeroY + 4);

    const slotW = (W - P.l - P.r) / vals.length;
    const bw    = Math.min(Math.floor(slotW * 0.55), 56);

    vals.forEach((v, i) => {
      const x     = P.l + i * slotW + (slotW - bw) / 2;
      const bh    = Math.max((Math.abs(v) / max) * (chartH / 2), v !== 0 ? 2 : 0);
      const y     = v >= 0 ? zeroY - bh : zeroY;
      const isPos = v >= 0;

      ctx.shadowColor = isPos ? colors[i] : '#ef4444';
      ctx.shadowBlur  = 10;

      const c0   = isPos ? colors[i] + 'ee' : '#ef444488';
      const c1   = isPos ? colors[i] + '44' : '#ef444422';
      const grad = ctx.createLinearGradient(x, y, x, y + bh);
      if (isPos) { grad.addColorStop(0, c0); grad.addColorStop(1, c1); }
      else       { grad.addColorStop(0, c1); grad.addColorStop(1, c0); }
      ctx.fillStyle = grad;
      ctx.beginPath();
      if (isPos) {
        if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, [6, 6, 0, 0]); else ctx.rect(x, y, bw, bh);
      } else {
        if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, [0, 0, 6, 6]); else ctx.rect(x, y, bw, bh);
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      // value label
      ctx.fillStyle = isPos ? colors[i] : '#ef4444';
      ctx.font = this.FONT_VALUE; ctx.textAlign = 'center';
      const sign   = isPos ? '+' : '';
      const labelY = isPos ? y - 8 : y + bh + 17;
      ctx.fillText(sign + this.fmtVal(v, ''), x + bw / 2, labelY);

      // segment label on X axis
      ctx.fillStyle = this.cssVar('--t3') || '#6b71a0';
      ctx.font = this.FONT_LABEL;
      const lbl = labels[i].length > 8 ? labels[i].slice(0, 7) + '.' : labels[i];
      ctx.fillText(lbl, x + bw / 2, H - P.b + 18);
    });
  }

  private drawHBar(
    el: HTMLCanvasElement | undefined,
    vals: number[], colors: string[], labels: string[],
    lowerBetter = true, unit = '',
  ): void {
    if (!el) return;
    const rowH = 58;  // ↑ taller rows for readability
    const H    = vals.length * rowH + 28;
    const { ctx, W } = this.setupCanvas(el, H);
    // ↑ left padding increased to 96 so segment labels don't get clipped
    const P      = { l: 96, r: 80, t: 14, b: 14 };
    const trackW = W - P.l - P.r;
    const max    = Math.max(...vals) * 1.15 || 1;

    vals.forEach((v, i) => {
      const y    = P.t + i * rowH + 8;
      const bh   = rowH - 22;
      const bw   = Math.max((v / max) * trackW, 4);
      const best = lowerBetter ? v === Math.min(...vals) : v === Math.max(...vals);

      // segment label
      ctx.fillStyle = best ? colors[i] : (this.cssVar('--t3') || '#6b71a0');
      ctx.font = best ? this.FONT_LABEL : this.FONT_AXIS;
      ctx.textAlign = 'right';
      const lbl = labels[i].length > 9 ? labels[i].slice(0, 8) + '.' : labels[i];
      ctx.fillText(lbl, P.l - 10, y + bh / 2 + 5);

      // track background
      ctx.fillStyle = this.cssVar('--bg2') || 'rgba(120,80,20,.06)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(P.l, y, trackW, bh, 6);
      else ctx.rect(P.l, y, trackW, bh);
      ctx.fill();

      // filled bar
      if (best) { ctx.shadowColor = colors[i]; ctx.shadowBlur = 12; }
      const grad = ctx.createLinearGradient(P.l, 0, P.l + bw, 0);
      grad.addColorStop(0, colors[i] + 'ee');
      grad.addColorStop(1, colors[i] + '55');
      ctx.fillStyle = grad;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(P.l, y, bw, bh, 6);
      else ctx.rect(P.l, y, bw, bh);
      ctx.fill();
      ctx.shadowBlur = 0;

      // value label right of bar
      const valTxt  = v.toFixed(1) + unit;
      const starTxt = best ? ' ★' : '';
      ctx.fillStyle = best ? colors[i] : (this.cssVar('--t2') || '#3a3f6b');
      ctx.font      = best ? this.FONT_LABEL : this.FONT_AXIS;
      ctx.textAlign = 'left';
      ctx.fillText(valTxt + starTxt, P.l + trackW + 10, y + bh / 2 + 5);
    });
  }

  private drawDonut(
    el: HTMLCanvasElement | undefined,
    vals: number[], colors: string[], labels: string[],
  ): void {
    if (!el) return;
    const { ctx, W, H } = this.setupCanvas(el, 280);
    const total = vals.reduce((a, b) => a + b, 0) || 1;
    const cx    = W / 2;
    const cy    = H / 2 - 18;
    const R     = Math.min(W * 0.38, H * 0.38, 90);
    const r     = R * 0.56;

    let startAngle = -Math.PI / 2;
    vals.forEach((v, i) => {
      const slice = (v / total) * Math.PI * 2;

      ctx.shadowColor = colors[i];
      ctx.shadowBlur  = 10;
      ctx.beginPath();
      ctx.arc(cx, cy, R, startAngle, startAngle + slice);
      ctx.arc(cx, cy, r, startAngle + slice, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = colors[i] + 'cc'; ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = this.cssVar('--card') || '#fff';
      ctx.lineWidth = 2.5; ctx.stroke();

      // percentage inside slice
      if (slice > 0.35) {
        const midA = startAngle + slice / 2;
        const lr   = (R + r) / 2;
        ctx.fillStyle = '#fff';
        ctx.font = `bold 13px 'JetBrains Mono', monospace`; ctx.textAlign = 'center';
        ctx.fillText(
          Math.round(v / total * 100) + '%',
          cx + Math.cos(midA) * lr,
          cy + Math.sin(midA) * lr + 4,
        );
      }
      startAngle += slice;
    });

    // center text
    ctx.fillStyle = this.cssVar('--t2') || '#3a3f6b';
    ctx.font = `bold 17px 'JetBrains Mono', monospace`; ctx.textAlign = 'center';
    ctx.fillText(this.fmtVal(total / vals.length, ''), cx, cy - 2);
    ctx.fillStyle = this.cssVar('--t4') || '#a3a8c8';
    ctx.font = `11px 'JetBrains Mono', monospace`;
    ctx.fillText('avg. KWD/yr', cx, cy + 17);

    // legend row at bottom — fully visible with proper spacing
    const legendY  = H - 16;
    const itemW    = W / labels.length;
    labels.forEach((lbl, i) => {
      const lx = i * itemW + itemW / 2;
      ctx.fillStyle = colors[i];
      ctx.beginPath(); ctx.arc(lx - 24, legendY, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = this.cssVar('--t3') || '#6b71a0';
      ctx.font = `11px 'JetBrains Mono', monospace`; ctx.textAlign = 'left';
      const short = lbl.length > 7 ? lbl.slice(0, 6) + '.' : lbl;
      ctx.fillText(short, lx - 14, legendY + 5);
    });
  }

  private drawBubble(
    el: HTMLCanvasElement | undefined,
    xVals: number[], yVals: number[], sizeVals: number[],
    colors: string[], labels: string[],
  ): void {
    if (!el) return;
    // ↑ increased height + bigger paddings on all sides
    const { ctx, W, H } = this.setupCanvas(el, 330);
    const P = { l: 90, r: 24, t: 40, b: 64 };

    const xMax    = Math.max(...xVals) * 1.25 || 1;
    const yAbsMax = Math.max(...yVals.map(Math.abs)) * 1.4 || 1;
    const sMax    = Math.max(...sizeVals) || 1;

    const toX = (v: number) => P.l + (v / xMax) * (W - P.l - P.r);
    const toY = (v: number) => P.t + (H - P.t - P.b) / 2 - (v / yAbsMax) * ((H - P.t - P.b) / 2);
    const toR = (v: number) => 12 + (v / sMax) * 26;

    const zeroY = toY(0);
    const zeroX = toX(0);
    const t4    = this.cssVar('--t4') || '#a3a8c8';
    const bd2   = this.cssVar('--bd2') || 'rgba(120,80,20,.06)';

    // positive quadrant highlight
    ctx.fillStyle = 'rgba(99,102,241,.035)';
    ctx.fillRect(zeroX, P.t, W - P.r - zeroX, zeroY - P.t);

    // horizontal grid lines
    [-1, -.5, .5, 1].forEach(f => {
      const y = toY(f * yAbsMax * 0.75);
      ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(W - P.r, y);
      ctx.strokeStyle = bd2; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = t4;
      ctx.font = this.FONT_AXIS; ctx.textAlign = 'right';
      ctx.fillText(this.fmtVal(f * yAbsMax * 0.75, ''), P.l - 8, y + 4);
    });

    // zero line
    ctx.beginPath(); ctx.moveTo(P.l, zeroY); ctx.lineTo(W - P.r, zeroY);
    ctx.strokeStyle = t4; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = t4; ctx.font = this.FONT_AXIS; ctx.textAlign = 'right';
    ctx.fillText('0', P.l - 8, zeroY + 4);

    // axis labels
    ctx.fillStyle = this.cssVar('--t3') || '#6b71a0';
    ctx.font = `bold 12px 'JetBrains Mono', monospace`; ctx.textAlign = 'center';
    ctx.fillText('Spend Velocity (KWD/mo) →', P.l + (W - P.l - P.r) / 2, H - P.b + 22);
    ctx.save();
    ctx.translate(16, P.t + (H - P.t - P.b) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('CLV Slope →', 0, 0);
    ctx.restore();

    // directional hints
    ctx.fillStyle = t4;
    ctx.font = `10px 'JetBrains Mono', monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('↑ rising', zeroX + 7, P.t + 16);
    ctx.fillText('↓ value loss', zeroX + 7, H - P.b - 8);

    // bubbles
    xVals.forEach((xv, i) => {
      const bx = toX(xv);
      const by = toY(yVals[i]);
      const rb = toR(sizeVals[i]);

      ctx.shadowColor = colors[i];
      ctx.shadowBlur  = 16;
      ctx.beginPath(); ctx.arc(bx, by, rb, 0, Math.PI * 2);
      ctx.fillStyle = colors[i] + 'aa'; ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = colors[i]; ctx.lineWidth = 2; ctx.stroke();

      // label inside bubble
      ctx.fillStyle  = this.cssVar('--tx') || '#1e2040';
      ctx.font       = `bold 11px 'JetBrains Mono', monospace`; ctx.textAlign = 'center';
      const lbl = labels[i].length > 6 ? labels[i].slice(0, 5) + '.' : labels[i];
      ctx.fillText(lbl, bx, by + 4);
    });
  }
}