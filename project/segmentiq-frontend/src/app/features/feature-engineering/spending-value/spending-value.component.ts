import { FE_STYLES } from '../fe-shared';
import {
  Component, AfterViewInit, ViewChildren, QueryList,
  ElementRef, HostListener, effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../../../core/services/data.service';
import { ChartService } from '../../../core/services/chart.service';

@Component({
  selector: 'app-spending-value',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './spending-value.component.html',
  styleUrls: ['./spending-value.component.scss'],
  styles: [FE_STYLES],
})
export class Fe51Component implements AfterViewInit {

  @ViewChildren('spendCanvas') sc!:   QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('aovCanvas')   ac!:   QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('sp30Canvas')  s3!:   QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('sp90Canvas')  s9!:   QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('velCanvas')   vc!:   QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('netCanvas')   nc!:   QueryList<ElementRef<HTMLCanvasElement>>;

  constructor(public data: DataService) {
    effect(() => {
      const segs = this.data.segments();
      const agg  = this.data.agg();
      const loading = this.data.loading();
      if (!loading && segs.length && Object.keys(agg).length) setTimeout(() => this.draw(), 80);
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.draw(), 150);
    setTimeout(() => this.draw(), 400);
  }
  @HostListener('window:resize') onResize(): void { this.draw(); }

  sf(segId: number, field: string): number {
    const a = this.data.agg()[segId] as any;
    return a ? (a[field] ?? 0) : 0;
  }

  get totalRevM(): string { return (this.data.totalRevenue() / 1_000_000).toFixed(2); }
  get overallAov(): string { return this.data.overallAov().toFixed(2); }

  private _revTrend(): { val: number; lbl: string } {
    const monthly = this.data.summary()?.monthly_revenue ?? {};
    const months  = Object.keys(monthly).sort();
    if (months.length < 12) return { val: 0, lbl: '—' };
    const prev6 = months.slice(-12, -6).reduce((a, m) => a + monthly[m], 0);
    const curr6 = months.slice(-6).reduce((a, m) => a + monthly[m], 0);
    if (!prev6) return { val: 0, lbl: '—' };
    const pct = Math.round((curr6 - prev6) / prev6 * 100);
    return { val: pct > 0 ? 1 : pct < 0 ? -1 : 0, lbl: (pct > 0 ? '+' : '') + pct + '%' };
  }
  get revTrend(): number    { return this._revTrend().val; }
  get revTrendLbl(): string { return this._revTrend().lbl; }

  get topVelocity(): string {
    const segs = this.data.segments();
    if (!segs.length) return '—';
    const max = Math.max(...segs.map(s => this.sf(s.id, 'avg_spend_velocity')));
    return max >= 1000 ? (max / 1000).toFixed(1) + 'K' : max.toFixed(0);
  }
  get topVelocityName(): string {
    const segs = this.data.segments();
    if (!segs.length) return '';
    return segs.reduce((a, b) => this.sf(a.id, 'avg_spend_velocity') > this.sf(b.id, 'avg_spend_velocity') ? a : b).name;
  }

  get topClvGrowing(): number {
    const segs = this.data.segments();
    if (!segs.length) return 0;
    return Math.round(Math.max(...segs.map(s => this.sf(s.id, 'clv_growing_pct'))));
  }
  get topClvGrowingName(): string {
    const segs = this.data.segments();
    if (!segs.length) return '';
    return segs.reduce((a, b) => this.sf(a.id, 'clv_growing_pct') > this.sf(b.id, 'clv_growing_pct') ? a : b).name;
  }

  get topSpendVal(): string {
    const segs = this.data.segments();
    if (!segs.length) return '—';
    const max = Math.max(...segs.map(s => this.sf(s.id, 'avg_spend')));
    return max >= 1000 ? (max / 1000).toFixed(1) + 'K' : max.toFixed(0);
  }
  get topSpendName(): string {
    const segs = this.data.segments();
    if (!segs.length) return '';
    return segs.reduce((a, b) => this.sf(a.id, 'avg_spend') > this.sf(b.id, 'avg_spend') ? a : b).name;
  }

  /** Bar % pour Overall AOV : AOV global vs max AOV parmi les segments */
  get aovBarPct(): number {
    const segs = this.data.segments();
    if (!segs.length) return 0;
    const maxSegAov = Math.max(...segs.map(s => this.sf(s.id, 'avg_aov'))) || 1;
    const overall = this.data.overallAov();
    return Math.min(Math.round((overall / maxSegAov) * 100), 100);
  }

  /** Bar % pour Top Velocity : toujours 100 car on affiche déjà le max */
  get velocityBarPct(): number {
    const segs = this.data.segments();
    if (!segs.length) return 0;
    const vals = segs.map(s => this.sf(s.id, 'avg_spend_velocity'));
    const max = Math.max(...vals) || 1;
    const avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    return Math.min(Math.round((max / (max * 1.15)) * 100), 100);
  }

  /** Bar % pour Top Avg. Spend : max segment / (max segment * 1.1) comme référence */
  get topSpendBarPct(): number {
    const segs = this.data.segments();
    if (!segs.length) return 0;
    const vals = segs.map(s => this.sf(s.id, 'avg_spend'));
    const max = Math.max(...vals) || 1;
    const min = Math.min(...vals) || 0;
    const range = max - min || 1;
    return Math.min(Math.round(((max - min) / (max * 1.1 - min)) * 100 + 40), 100);
  }

  private draw(): void {
    const segs = this.data.segments();
    const agg  = this.data.agg();
    if (!segs.length || !Object.keys(agg).length) return;

    const n = segs.map(s => s.name);
    const c = segs.map(s => s.color);

    this.drawBar(this.sc.first?.nativeElement,   segs.map(s => agg[s.id].avg_spend),                c, n, 'KWD');
    this.drawBar(this.ac.first?.nativeElement,   segs.map(s => agg[s.id].avg_aov),                  c, n, 'KWD');
    this.drawBar(this.s3.first?.nativeElement,   segs.map(s => agg[s.id].avg_sp30),                 c, n, 'KWD');
    this.drawBar(this.s9.first?.nativeElement,   segs.map(s => agg[s.id].avg_sp90),                 c, n, 'KWD');
    this.drawBar(this.vc.first?.nativeElement,   segs.map(s => this.sf(s.id, 'avg_spend_velocity')), c, n, '/mo');
    this.drawBar(this.nc.first?.nativeElement,   segs.map(s => this.sf(s.id, 'avg_net_revenue')),    c, n, 'KWD');
  }

  private drawBar(el: HTMLCanvasElement | undefined, vals: number[], colors: string[], labels: string[], unit = ''): void {
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    const W = el.offsetWidth || 280, H = 260;
    el.width = W * dpr; el.height = H * dpr;
    el.style.width = W + 'px'; el.style.height = H + 'px';
    const ctx = el.getContext('2d')!;
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, H);

    const P   = { l: 90, r: 18, t: 36, b: 76 };
    const chartH = H - P.t - P.b;
    const chartW = W - P.l - P.r;
    const max = Math.max(...vals) * 1.18 || 1;
    const t4  = this.css('--t4') || '#a3a8c8';
    const t3  = this.css('--t3') || '#6b71a0';
    const bd  = this.css('--bd2') || 'rgba(120,80,20,.06)';

    ctx.save();
    ctx.translate(14, P.t + chartH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = t3;
    ctx.font = `700 12px 'JetBrains Mono',monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(unit.toUpperCase(), 0, 0);
    ctx.restore();

    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const yVal = (max / steps) * i;
      const y    = P.t + (1 - i / steps) * chartH;
      ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(W - P.r, y);
      ctx.strokeStyle = i === 0 ? (this.css('--bd') || 'rgba(120,80,20,.15)') : bd;
      ctx.lineWidth = i === 0 ? 1.5 : 1; ctx.stroke();
      const numLbl = yVal >= 1_000_000 ? (yVal/1_000_000).toFixed(1)+'M'
                   : yVal >= 1000      ? (yVal/1000).toFixed(1)+'K'
                   : yVal.toFixed(yVal < 10 ? 1 : 0);
      const fullLbl = i === 0 ? '0' : numLbl + ' ' + unit;
      ctx.fillStyle = t4;
      ctx.font = `600 12px 'JetBrains Mono',monospace`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(fullLbl, P.l - 6, y);
    }

    ctx.beginPath(); ctx.moveTo(P.l, P.t); ctx.lineTo(P.l, P.t + chartH);
    ctx.strokeStyle = this.css('--bd') || 'rgba(120,80,20,.2)';
    ctx.lineWidth = 1.5; ctx.stroke();

    const xAxisY = P.t + chartH;
    ctx.beginPath(); ctx.moveTo(P.l, xAxisY); ctx.lineTo(W - P.r, xAxisY);
    ctx.strokeStyle = this.css('--bd') || 'rgba(120,80,20,.2)';
    ctx.lineWidth = 1.5; ctx.stroke();

    ctx.fillStyle = t3;
    ctx.font = `700 12px 'JetBrains Mono',monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('SEGMENT', P.l + chartW / 2, H - 4);

    const slotW = chartW / vals.length;
    const bw    = Math.floor(slotW * 0.58);
    const maxVal = Math.max(...vals);

    vals.forEach((v, i) => {
      const x    = P.l + i * slotW + (slotW - bw) / 2;
      const bh   = (v / max) * chartH;
      const y    = xAxisY - bh;
      const best = v === maxVal;
      const g = ctx.createLinearGradient(x, y, x, y + bh);
      g.addColorStop(0, colors[i] + 'ee'); g.addColorStop(1, colors[i] + '55');
      ctx.fillStyle = g;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, [4, 4, 0, 0]); else ctx.rect(x, y, bw, bh);
      ctx.fill();
      if (best) { ctx.shadowColor = colors[i]; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0; }
      const valLbl = (v >= 1_000_000 ? (v/1_000_000).toFixed(1)+'M'
                    : v >= 1000      ? (v/1000).toFixed(1)+'K'
                    : v.toFixed(v < 10 ? 1 : 0)) + ' ' + unit;
      ctx.fillStyle = best ? colors[i] : t3;
      ctx.font = `${best ? '700' : '600'} 13px 'JetBrains Mono',monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(valLbl, x + bw / 2, y - 4);
      ctx.fillStyle = t4;
      ctx.font = `600 12px 'JetBrains Mono',monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(labels[i].slice(0, 8), x + bw / 2, xAxisY + 6);
      if (best) {
        ctx.fillStyle = colors[i];
        ctx.font = '13px sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText('★', x + bw / 2, xAxisY + 22);
      }
    });
  }

  private drawClvSlope(el: HTMLCanvasElement | undefined, segs: any[], agg: any): void {
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    const W = el.offsetWidth || 280, H = 200;
    el.width = W * dpr; el.height = H * dpr;
    el.style.width = W + 'px'; el.style.height = H + 'px';
    const ctx = el.getContext('2d')!;
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, H);
    const vals   = segs.map(s => (agg[s.id] as any).avg_clv_slope ?? 0);
    const names  = segs.map(s => s.name);
    const P      = { l: 68, r: 12, t: 26, b: 58 };
    const absMax = Math.max(Math.abs(Math.min(...vals)), Math.abs(Math.max(...vals))) * 1.3 || 0.01;
    const midY   = P.t + (H - P.t - P.b) / 2;
    ctx.beginPath(); ctx.moveTo(P.l, midY); ctx.lineTo(W - P.r, midY);
    ctx.strokeStyle = this.css('--bd') || 'rgba(120,80,20,.15)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillStyle = this.css('--t4') || '#a3a8c8';
    ctx.font = `600 12px 'JetBrains Mono',monospace`;
    ctx.fillText('+' + absMax.toFixed(2), P.l - 4, P.t + 8);
    ctx.fillText('0', P.l - 4, midY + 3);
    ctx.fillText('-' + absMax.toFixed(2), P.l - 4, H - P.b - 4);
    const slotW = (W - P.l - P.r) / vals.length;
    const bw    = Math.floor(slotW * 0.62);
    const scale = (H / 2 - P.t) / absMax;
    vals.forEach((v, i) => {
      const x   = P.l + i * slotW + (slotW - bw) / 2;
      const bh  = Math.abs(v) * scale;
      const y   = v >= 0 ? midY - bh : midY;
      const col = v >= 0 ? '#10b981' : '#ef4444';
      const g   = ctx.createLinearGradient(x, y, x, y + bh);
      g.addColorStop(0, col + 'ee'); g.addColorStop(1, col + '55');
      ctx.fillStyle = g;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, v >= 0 ? [5, 5, 0, 0] : [0, 0, 5, 5]); else ctx.rect(x, y, bw, bh);
      ctx.fill();
      ctx.fillStyle = col; ctx.font = `bold 12px 'JetBrains Mono',monospace`; ctx.textAlign = 'center';
      ctx.fillText((v >= 0 ? '+' : '') + v.toFixed(3), x + bw / 2, v >= 0 ? y - 4 : y + bh + 11);
      ctx.fillStyle = this.css('--t4') || '#a3a8c8'; ctx.font = `600 12px 'JetBrains Mono',monospace`;
      ctx.fillText(names[i].slice(0, 7), x + bw / 2, H - P.b + 14);
    });
  }

  private css(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
}