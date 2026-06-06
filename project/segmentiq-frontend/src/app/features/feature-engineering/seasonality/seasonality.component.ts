import { FE_STYLES, drawBar, drawGrowthLine, drawSlopeBar } from '../fe-shared';
import {
  Component, AfterViewInit, ViewChildren, QueryList,
  ElementRef, HostListener, effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../../../core/services/data.service';
import { ChartService } from '../../../core/services/chart.service';
import { QuarterlyTopProduct, QuarterlyTopCategory } from '../../../core/models/segment.model';

@Component({
  selector: 'app-seasonality',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './seasonality.component.html',
  styleUrls: ['./seasonality.component.scss']
})
export class Fe54Component implements AfterViewInit {

  readonly monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  /** Quarter accent colours — Q1 blue, Q2 green, Q3 orange, Q4 purple (match q-card colours) */
  readonly qColors = ['#378ADD', '#1D9E75', '#D85A30', '#7F77DD'];

  @ViewChildren('growthCanvas') gc!: QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('lineCanvas')   lc!: QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('barCanvas')    bc!: QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('slopeCanvas')  sc!: QueryList<ElementRef<HTMLCanvasElement>>;

  constructor(public data: DataService, private charts: ChartService) {
    effect(() => {
      const segs = this.data.segments();
      const sum  = this.data.summary();
      const loading = this.data.loading();
      if (!loading && segs.length && Object.keys(sum).length) {
        setTimeout(() => this.draw(), 80);
      }
    });
  }

  ngAfterViewInit(): void { setTimeout(() => this.draw(), 150); setTimeout(() => this.draw(), 400); }

  @HostListener('window:resize')
  onResize(): void { this.draw(); }

  draw(): void {
    const segs = this.data.segments();
    const sum  = this.data.summary();
    if (!segs.length || !sum.monthly_revenue) return;

    const resize = (el: HTMLCanvasElement) => {
      const p = el.parentElement;
      el.width  = Math.round(p?.offsetWidth  || el.offsetWidth  || 460);
      el.height = Math.round(p?.offsetHeight || el.offsetHeight || 190);
    };

    /* ── Growth line (timeline with moving average) ── */
    const ge = this.gc.first?.nativeElement;
    if (ge) {
      resize(ge);
      const vals = this.data.monthlyTotalArray();
      const lbls = this.data.monthlyTotalLabels();
      drawGrowthLine(ge, vals, lbls, '#AFA9EC', 'KWD total', 'Month');
    }

    /* ── Segment avg-spend line ── */
    const le = this.lc.first?.nativeElement;
    if (le) {
      resize(le);
      this.charts.drawLine(le, segs.map(s => ({ color: s.color, values: this.data.monthlyArray(s.id) })));
    }

    /* ── Stacked bar by month ── */
    const be = this.bc.first?.nativeElement;
    if (be) {
      resize(be);
      const mt     = sum.monthly_revenue ?? {};
      const keys14 = Object.keys(mt).sort().slice(-14);
      drawBar(be, keys14.map(k => mt[k]), keys14.map(() => '#534AB7'), keys14.map(k => k.slice(5)), false, 'KWD', 'Month');
    }

    /* ── YoY slope bar ── */
    const se = this.sc.first?.nativeElement;
    if (se) {
      resize(se);
      const deltas = this._yoyDeltas();
      drawSlopeBar(se, deltas.vals, deltas.labels, deltas.vals.map(v => v >= 0 ? '#1D9E75' : '#E24B4A'));
    }
  }

  /* ── Private helpers ──────────────────────────────────────────────────────── */

  private _yoyDeltas(): { vals: number[]; labels: string[] } {
    const mr   = this.data.summary()?.monthly_revenue ?? {};
    const keys = Object.keys(mr).sort();
    if (keys.length < 24) return { vals: [], labels: [] };
    const curr12 = keys.slice(-12);
    const prev12 = keys.slice(-24, -12);
    if (prev12.length < 12) return { vals: [], labels: [] };
    const vals = curr12.map((k, i) => {
      const c = mr[k] ?? 0, p = mr[prev12[i]] ?? 0;
      return p > 0 ? Math.round((c - p) / p * 100) : 0;
    });
    return { vals, labels: curr12.map(k => k.slice(5)) };
  }

  private _fmtKey(k: string): string {
    return new Date(k + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  }

  private _fmtKwd(v: number): string {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + ' M';
    if (v >= 1_000)     return Math.round(v / 1_000) + ' K';
    return v.toFixed(0);
  }

  /* ── Public computed properties ───────────────────────────────────────────── */

  get dateRange(): string {
    const keys = Object.keys(this.data.summary()?.monthly_revenue ?? {}).sort();
    return keys.length ? this._fmtKey(keys[0]) + ' – ' + this._fmtKey(keys[keys.length - 1]) : '—';
  }

  get fullRange(): string {
    const keys = Object.keys(this.data.summary()?.monthly_revenue ?? {}).sort();
    return keys.length ? keys[0].slice(0, 4) + '–' + keys[keys.length - 1].slice(0, 4) : '';
  }

  get recentYear(): string {
    const keys = Object.keys(this.data.summary()?.monthly_revenue ?? {}).sort();
    return keys.length ? keys[keys.length - 1].slice(0, 4) : '';
  }

  get recentRange(): string {
    const keys = Object.keys(this.data.summary()?.monthly_revenue ?? {}).sort().slice(-14);
    return keys.length ? this._fmtKey(keys[0]) + ' – ' + this._fmtKey(keys[keys.length - 1]) : '';
  }

  get prevYear(): string { return this.recentYear ? String(Number(this.recentYear) - 1) : '—'; }
  get currYear(): string { return this.recentYear; }

  get peakMonth(): string {
    const mr      = this.data.summary()?.monthly_revenue ?? {};
    const entries = Object.entries(mr);
    if (!entries.length) return '—';
    const [key] = entries.sort((a, b) => b[1] - a[1])[0];
    return this._fmtKey(key);
  }

  get peakRevShort(): string {
    const mr  = this.data.summary()?.monthly_revenue ?? {};
    const max = Math.max(...Object.values(mr));
    return isFinite(max) ? this._fmtKwd(max) : '—';
  }

  get yoyGrowth(): string {
    const mr   = this.data.summary()?.monthly_revenue ?? {};
    const keys = Object.keys(mr).sort();
    if (keys.length < 24) return '—';
    const prev = keys.slice(-24, -12).reduce((a, k) => a + mr[k], 0);
    const curr = keys.slice(-12).reduce((a, k) => a + mr[k], 0);
    if (!prev) return '—';
    const pct = Math.round((curr - prev) / prev * 100);
    return (pct > 0 ? '+' : '') + pct + '%';
  }

  get yoyGrowthColor(): string {
    const g = this.yoyGrowth;
    return g === '—' ? 'var(--t3)' : g.startsWith('+') ? '#0F6E56' : '#A32D2D';
  }

  get quarters(): { label: string; months: string; color: string; revFormatted: string; pct: number }[] {
    const mr   = this.data.summary()?.monthly_revenue ?? {};
    const keys = Object.keys(mr).sort();
    if (!keys.length) return [];
    const r12   = keys.slice(-12);
    const qDefs = [
      { label: 'Q1', months: 'Jan–Mar', mo: [1,2,3],     color: '#378ADD' },
      { label: 'Q2', months: 'Apr–Jun', mo: [4,5,6],     color: '#1D9E75' },
      { label: 'Q3', months: 'Jul–Sep', mo: [7,8,9],     color: '#D85A30' },
      { label: 'Q4', months: 'Oct–Dec', mo: [10,11,12],  color: '#7F77DD' },
    ];
    const revs  = qDefs.map(q => r12.filter(k => q.mo.includes(Number(k.slice(5)))).reduce((a, k) => a + mr[k], 0));
    const total = revs.reduce((a, b) => a + b, 0) || 1;
    return qDefs.map((q, i) => ({
      label:        q.label,
      months:       q.months,
      color:        q.color,
      revFormatted: this._fmtKwd(revs[i]),
      pct:          Math.round(revs[i] / total * 100),
    }));
  }

  get bestQuarterPct(): number { return Math.max(...this.quarters.map(q => q.pct), 0); }

  get bestQuarterLabel(): string {
    const q = this.quarters.find(q => q.pct === this.bestQuarterPct);
    return q ? q.label + ' (' + q.pct + '%)' : '—';
  }

  get bestQuarterColor(): string {
    const q = this.quarters.find(q => q.pct === this.bestQuarterPct);
    return q?.color ?? 'var(--tx)';
  }

  /* ── Segment peak / trough helpers ───────────────────────────────────────── */

  getSegPeak(segId: number): { month: string; rev: string } {
    const monthly = this.data.agg()[segId]?.monthly ?? {};
    const entries = Object.entries(monthly).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return { month: '—', rev: '—' };
    const [key, val] = entries[0];
    return {
      month: new Date(key + '-01').toLocaleDateString('en-GB', { month: 'short' }),
      rev:   this._fmtKwd(val),
    };
  }

  getSegTrough(segId: number): { month: string; rev: string } {
    const monthly = this.data.agg()[segId]?.monthly ?? {};
    const entries = Object.entries(monthly).filter(e => e[1] > 0).sort((a, b) => a[1] - b[1]);
    if (!entries.length) return { month: '—', rev: '—' };
    const [key, val] = entries[0];
    return {
      month: new Date(key + '-01').toLocaleDateString('en-GB', { month: 'short' }),
      rev:   this._fmtKwd(val),
    };
  }

  getSeasonalityVariance(segId: number): string {
    const monthly = this.data.agg()[segId]?.monthly ?? {};
    const vals    = Object.values(monthly).filter(v => v > 0);
    if (vals.length < 2) return '—';
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std  = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    const cv   = mean > 0 ? std / mean : 0;
    if (cv < 0.3) return 'Stable';
    if (cv < 0.6) return 'Moderate';
    return 'High var.';
  }

  getVarColor(segId: number): string {
    const v = this.getSeasonalityVariance(segId);
    if (v === 'Stable')    return '#085041';
    if (v === 'Moderate')  return '#633806';
    if (v === 'High var.') return '#791F1F';
    return 'var(--t3)';
  }

  getVarBg(segId: number): string {
    const v = this.getSeasonalityVariance(segId);
    if (v === 'Stable')    return '#E1F5EE';
    if (v === 'Moderate')  return '#FAEEDA';
    if (v === 'High var.') return '#FCEBEB';
    return 'var(--bg2)';
  }

  /* ── Top 3 produits / catégories par trimestre ────────────────────────────── */

  getTopProductsForQuarter(quarter: string): QuarterlyTopProduct[] {
    const qMap = this.data.summary()?.quarterly_top_products;
    if (!qMap || !qMap[quarter]) return [];
    return qMap[quarter];
  }

  getTopCatsForQuarter(quarter: string): QuarterlyTopCategory[] {
    const qMap = this.data.summary()?.quarterly_top_categories;
    if (!qMap || !qMap[quarter]) return [];
    return qMap[quarter];
  }

  /** Kept for backward compat (used in template fallback) */
  getTopProductForQuarter(quarter: string): string {
    const products = this.getTopProductsForQuarter(quarter);
    return products.length ? products[0].name : '';
  }
}