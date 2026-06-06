import { FE_STYLES, drawBar } from '../fe-shared';
import {
  Component, AfterViewInit, ViewChildren, QueryList,
  ElementRef, HostListener, effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../../../core/services/data.service';
import { ChartService } from '../../../core/services/chart.service';

@Component({
  selector: 'app-frequency',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './frequency.component.html',
  styleUrls: ['./frequency.component.scss'],
  styles: [FE_STYLES],
})
export class Fe52Component implements AfterViewInit {

  @ViewChildren('ordCanvas') oc!: QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('actCanvas') ac!: QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('recCanvas') rc!: QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('iptCanvas') ic!: QueryList<ElementRef<HTMLCanvasElement>>;

  constructor(public data: DataService, private charts: ChartService) {
    effect(() => {
      const segs    = this.data.segments();
      const agg     = this.data.agg();
      const loading = this.data.loading();
      if (!loading && segs.length && Object.keys(agg).length) setTimeout(() => this.draw(), 80);
    });
  }

  ngAfterViewInit(): void { setTimeout(() => this.draw(), 150); setTimeout(() => this.draw(), 400); }
  @HostListener('window:resize') onResize(): void { this.draw(); }

  // ── KPI helpers ────────────────────────────────────────────────────────────

  private sf(segId: number, field: string): number {
    const a = this.data.agg()[segId] as any;
    return a ? (a[field] ?? 0) : 0;
  }

  /** Segment with the highest avg_orders */
  get topOrdersSeg(): string {
    const segs = this.data.segments();
    if (!segs.length) return '—';
    return segs.reduce((a, b) =>
      this.sf(a.id, 'avg_orders') >= this.sf(b.id, 'avg_orders') ? a : b
    ).name;
  }

  /** Max avg_orders across all segments */
  get topOrdersVal(): string {
    const segs = this.data.segments();
    if (!segs.length) return '—';
    const v = Math.max(...segs.map(s => this.sf(s.id, 'avg_orders')));
    return v.toFixed(0);
  }

  /** Weighted-average recency (days) across all segments, using customer counts */
  get globalAvgRecency(): string {
    const segs   = this.data.segments();
    const counts = this.data.segmentCounts();
    if (!segs.length) return '—';
    let sumW = 0, sumR = 0;
    segs.forEach(s => {
      const c = counts[s.id] ?? 0;
      sumR += this.sf(s.id, 'avg_recency') * c;
      sumW += c;
    });
    if (!sumW) return '—';
    return Math.round(sumR / sumW) + 'd';
  }

  /** Segment with the lowest avg_ipt (best — returns fastest) */
  get bestIptSeg(): string {
    const segs = this.data.segments();
    if (!segs.length) return '—';
    const valid = segs.filter(s => this.sf(s.id, 'avg_ipt') > 0);
    if (!valid.length) return '—';
    return valid.reduce((a, b) =>
      this.sf(a.id, 'avg_ipt') <= this.sf(b.id, 'avg_ipt') ? a : b
    ).name;
  }

  /** Best (lowest) avg_ipt value */
  get bestIptVal(): string {
    const segs = this.data.segments();
    if (!segs.length) return '—';
    const valid = segs.filter(s => this.sf(s.id, 'avg_ipt') > 0);
    if (!valid.length) return '—';
    const v = Math.min(...valid.map(s => this.sf(s.id, 'avg_ipt')));
    return v.toFixed(0) + 'd';
  }

  /** Weighted-average active months across all segments */
  get globalAvgActiveMonths(): string {
    const segs   = this.data.segments();
    const counts = this.data.segmentCounts();
    if (!segs.length) return '—';
    let sumW = 0, sumA = 0;
    segs.forEach(s => {
      const c = counts[s.id] ?? 0;
      sumA += this.sf(s.id, 'avg_active_months') * c;
      sumW += c;
    });
    if (!sumW) return '—';
    return (sumA / sumW).toFixed(1) + ' mo';
  }

  /** Bar fill % for global avg recency vs worst segment recency (lower = better → inverted) */
  get recencyBarPct(): number {
    const segs = this.data.segments();
    const counts = this.data.segmentCounts();
    if (!segs.length) return 0;
    const maxRec = Math.max(...segs.map(s => this.sf(s.id, 'avg_recency'))) || 1;
    let sumW = 0, sumR = 0;
    segs.forEach(s => {
      const c = counts[s.id] ?? 0;
      sumR += this.sf(s.id, 'avg_recency') * c;
      sumW += c;
    });
    const avg = sumW ? sumR / sumW : maxRec;
    // Invert: lower recency = higher bar
    return Math.min(Math.round((1 - avg / maxRec) * 100), 100);
  }

  /** Bar fill % for best IPT vs worst IPT (lower IPT = higher bar) */
  get iptBarPct(): number {
    const segs = this.data.segments();
    const valid = segs.filter(s => this.sf(s.id, 'avg_ipt') > 0);
    if (!valid.length) return 0;
    const maxIpt = Math.max(...valid.map(s => this.sf(s.id, 'avg_ipt'))) || 1;
    const minIpt = Math.min(...valid.map(s => this.sf(s.id, 'avg_ipt')));
    return Math.min(Math.round((1 - minIpt / maxIpt) * 100), 100);
  }

  /** Bar fill % for top orders vs a reference maximum */
  get ordersBarPct(): number {
    const segs = this.data.segments();
    if (!segs.length) return 0;
    const max = Math.max(...segs.map(s => this.sf(s.id, 'avg_orders'))) || 1;
    const min = Math.min(...segs.map(s => this.sf(s.id, 'avg_orders')));
    return Math.min(Math.round((max - min) / max * 100), 100);
  }

  /** Bar fill % for global avg active months */
  get activeMonthsBarPct(): number {
    const segs   = this.data.segments();
    const counts = this.data.segmentCounts();
    if (!segs.length) return 0;
    const maxAm = Math.max(...segs.map(s => this.sf(s.id, 'avg_active_months'))) || 1;
    let sumW = 0, sumA = 0;
    segs.forEach(s => {
      const c = counts[s.id] ?? 0;
      sumA += this.sf(s.id, 'avg_active_months') * c;
      sumW += c;
    });
    const avg = sumW ? sumA / sumW : 0;
    return Math.min(Math.round(avg / maxAm * 100), 100);
  }

  // ── Chart drawing ──────────────────────────────────────────────────────────

  draw(): void {
    const segs = this.data.segments();
    const agg  = this.data.agg();
    if (!segs.length || !Object.keys(agg).length) return;

    const n = segs.map(s => s.name);
    const c = segs.map(s => s.color);

    drawBar(this.oc.first?.nativeElement, segs.map(s => agg[s.id].avg_orders),        c, n, false, 'Orders', 'Segment', ' orders');
    drawBar(this.ac.first?.nativeElement, segs.map(s => agg[s.id].avg_active_months), c, n, false, 'Months', 'Segment', ' mo');
    drawBar(this.rc.first?.nativeElement, segs.map(s => agg[s.id].avg_recency),       c, n, true,  'Days',   'Segment', 'd');
    drawBar(this.ic.first?.nativeElement, segs.map(s => agg[s.id].avg_ipt ?? 0),      c, n, true,  'Days',   'Segment', 'd');
  }
}