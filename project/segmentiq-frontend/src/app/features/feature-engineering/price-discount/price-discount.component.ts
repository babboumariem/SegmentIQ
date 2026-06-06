import { FE_STYLES, drawBar } from '../fe-shared';
import { Component, AfterViewInit, ViewChildren, QueryList, ElementRef, HostListener, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../../../core/services/data.service';
import { ChartService } from '../../../core/services/chart.service';

@Component({ selector:'app-price-discount', standalone:true, imports:[CommonModule], templateUrl: './price-discount.component.html', styleUrls: ['./price-discount.component.scss']})
export class Fe55Component implements AfterViewInit {
  @ViewChildren('discCanvas')    dc!:  QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('aovCanvas')     ac!:  QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('pbDonutCanvas') pbc!: QueryList<ElementRef<HTMLCanvasElement>>;

  constructor(public data: DataService, private charts: ChartService) {
    effect(() => {
      const loading = this.data.loading();
      if (!loading && this.data.segments().length && Object.keys(this.data.agg()).length) {
        setTimeout(() => this.draw(), 80);
      }
    });
    effect(() => {
      const loading = this.data.loading();
      void this.data.summary()?.price_bands;
      void this.data.agg();
      if (!loading) setTimeout(() => this.drawPriceBandDonut(), 150);
    });
  }

  ngAfterViewInit() { setTimeout(() => this.draw(), 150); setTimeout(() => this.draw(), 400); }
  @HostListener('window:resize') onResize() { this.draw(); }

  // ── Draw ─────────────────────────────────────────────────────────────────

  draw() {
    const segs = this.data.segments(), agg = this.data.agg();
    if (!segs.length || !Object.keys(agg).length) return;
    const names  = segs.map(s => s.name);
    const colors = segs.map(s => s.color);

    const resize = (el: HTMLCanvasElement | undefined) => {
      if (!el) return;
      const p = el.parentElement;
      if (p) { el.width = p.offsetWidth || 460; el.height = p.offsetHeight || 300; }
    };

    const aovEl = this.ac.first?.nativeElement;
    const discEl = this.dc.first?.nativeElement;
    resize(aovEl);
    resize(discEl);

    drawBar(aovEl,  segs.map(s => agg[s.id].avg_aov), colors, names, false, 'KWD', 'Segment', ' KWD');
    drawBar(discEl, segs.map(s => agg[s.id].avg_discount * 100), colors, names, false, 'Discount %', 'Segment', '%');
    this.drawPriceBandDonut();
  }

  private drawPriceBandDonut(): void {
    const el = this.pbc.first?.nativeElement;
    if (!el) return;
    const size = 220;
    const ctx = el.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);
    const b = this.bands.filter(x => x.count > 0);
    const total = b.reduce((s, x) => s + x.count, 0);
    if (!total) {
      ctx.beginPath(); ctx.arc(size/2, size/2, 70, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(128,128,128,.15)'; ctx.lineWidth = 30; ctx.stroke();
      return;
    }
    let angle = -Math.PI / 2;
    b.forEach(band => {
      const sweep = (band.count / total) * Math.PI * 2;
      const gap   = b.length > 1 ? 0.04 : 0;
      ctx.beginPath();
      ctx.arc(size/2, size/2, 70, angle + gap, angle + sweep - gap);
      ctx.strokeStyle = band.color; ctx.lineWidth = 30; ctx.lineCap = 'butt'; ctx.stroke();
      angle += sweep;
    });
  }

  // ── Getters ───────────────────────────────────────────────────────────────

  get globalAvgDiscount(): string {
    const segs = this.data.segments(), agg = this.data.agg(), counts = this.data.segmentCounts();
    let w = 0, d = 0;
    segs.forEach(s => { const c = counts[s.id] ?? 0; w += c; d += (agg[s.id]?.avg_discount ?? 0) * c; });
    return w ? (d / w * 100).toFixed(3) : '0.000';
  }

  get globalAov(): string {
    const segs = this.data.segments(), agg = this.data.agg(), counts = this.data.segmentCounts();
    let w = 0, a = 0;
    segs.forEach(s => { const c = counts[s.id] ?? 0; w += c; a += (agg[s.id]?.avg_aov ?? 0) * c; });
    return w ? (a / w).toFixed(1) : '0.0';
  }

  get segmentsSortedByAov() {
    return [...this.data.segments()].sort(
      (a, b) => (this.data.agg()[b.id]?.avg_aov ?? 0) - (this.data.agg()[a.id]?.avg_aov ?? 0)
    );
  }

  get segmentsSortedByDiscount() {
    return [...this.data.segments()].sort(
      (a, b) => (this.data.agg()[b.id]?.avg_discount ?? 0) - (this.data.agg()[a.id]?.avg_discount ?? 0)
    );
  }

  get bestAovSeg(): string {
    const s = this.segmentsSortedByAov[0];
    return s ? s.name : '—';
  }
  get bestAovVal(): string {
    const s = this.segmentsSortedByAov[0];
    return s ? (this.data.agg()[s.id]?.avg_aov ?? 0).toFixed(1) : '—';
  }
  get worstAovSeg(): string {
    const arr = this.segmentsSortedByAov;
    const s   = arr[arr.length - 1];
    return s ? s.name : '—';
  }
  get worstAovVal(): string {
    const arr = this.segmentsSortedByAov;
    const s   = arr[arr.length - 1];
    return s ? (this.data.agg()[s.id]?.avg_aov ?? 0).toFixed(1) : '—';
  }

  get bands(): { label: string; count: number; pct: number; color: string }[] {
    const pb    = this.data.summary()?.price_bands;
    const pbSum = pb ? (pb.high ?? 0) + (pb.mid ?? 0) + (pb.low ?? 0) : 0;
    if (pbSum > 0) {
      return [
        { label: 'High  ≥500 KWD',   count: pb!.high, pct: Math.round(pb!.high / pbSum * 100), color: '#059669' },
        { label: 'Mid  100–499 KWD', count: pb!.mid,  pct: Math.round(pb!.mid  / pbSum * 100), color: '#e07820' },
        { label: 'Low  <100 KWD',    count: pb!.low,  pct: Math.round(pb!.low  / pbSum * 100), color: '#dc2626' },
      ];
    }
    // Fallback from agg
    const agg = this.data.agg(), segs = this.data.segments(), counts = this.data.segmentCounts();
    if (!segs.length) return [];
    let high = 0, mid = 0, low = 0;
    segs.forEach(s => {
      const spend = agg[s.id]?.avg_spend ?? 0;
      const n     = counts[s.id] ?? 0;
      if (spend >= 500)      high += n;
      else if (spend >= 100) mid  += n;
      else                   low  += n;
    });
    const t = high + mid + low || 1;
    return [
      { label: 'High  ≥500 KWD',   count: high, pct: Math.round(high / t * 100), color: '#059669' },
      { label: 'Mid  100–499 KWD', count: mid,  pct: Math.round(mid  / t * 100), color: '#e07820' },
      { label: 'Low  <100 KWD',    count: low,  pct: Math.round(low  / t * 100), color: '#dc2626' },
    ];
  }

  get highPct(): number { return this.bands.find(b => b.color === '#059669')?.pct ?? 0; }
  get midPct():  number { return this.bands.find(b => b.color === '#e07820')?.pct ?? 0; }
  get lowPct():  number { return this.bands.find(b => b.color === '#dc2626')?.pct ?? 0; }

  getAovPct(id: number): number {
    const max = Math.max(...this.data.segments().map(s => this.data.agg()[s.id]?.avg_aov ?? 0)) || 1;
    return Math.round((this.data.agg()[id]?.avg_aov ?? 0) / max * 100);
  }

  getNetAov(id: number): number {
    const aov  = this.data.agg()[id]?.avg_aov     ?? 0;
    const disc = this.data.agg()[id]?.avg_discount ?? 0;
    return aov * (1 - disc);
  }

  getNetAovPct(id: number): number {
    const max = Math.max(...this.data.segments().map(s => this.getNetAov(s.id))) || 1;
    return Math.round(this.getNetAov(id) / max * 100);
  }

  getLostKwd(id: number): number {
    const aov  = this.data.agg()[id]?.avg_aov     ?? 0;
    const disc = this.data.agg()[id]?.avg_discount ?? 0;
    return aov * disc;
  }

  getDiscPct(id: number): number {
    const max = Math.max(...this.data.segments().map(s => this.data.agg()[s.id]?.avg_discount ?? 0)) || 1;
    return Math.round((this.data.agg()[id]?.avg_discount ?? 0) / max * 100);
  }

  getEfficiency(id: number): { label: string; color: string } {
    const d = this.data.agg()[id]?.avg_discount ?? 0;
    if (d < 0.05)  return { label: 'Efficient', color: '#10b981' };
    if (d < 0.15)  return { label: 'Moderate',  color: '#e07820' };
    return               { label: 'Costly',    color: '#ef4444' };
  }
}