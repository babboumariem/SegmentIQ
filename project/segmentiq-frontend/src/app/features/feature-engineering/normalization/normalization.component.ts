import {
  Component, AfterViewInit, ViewChild,
  ElementRef, HostListener, effect, OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../../../core/services/data.service';
import { FE_STYLES } from '../fe-shared';



// ── Static data ───────────────────────────────────────────────────────────────
// Note: the backend (segment_engine.py) does NOT apply log1p.
// The actual preprocessing is: winsorization p01–p99 + StandardScaler.
// The table below reflects features with high skewness
// that benefit most from winsorization before standardization.
const LOG_ROWS = [
  { feat:'total_spend',    icon:'💰', apply:false, skew:95, why:'Winsorized p99 — VIP outliers clipped before StandardScaler' },
  { feat:'order_count',    icon:'📦', apply:false, skew:80, why:'Winsorized p99 — frequent buyers clipped' },
  { feat:'spend_velocity', icon:'⚡', apply:false, skew:75, why:'Inherits the tail of total_spend — winsorized p99' },
  { feat:'aov',            icon:'🧾', apply:false, skew:65, why:'High one-off orders — winsorized p99' },
  { feat:'recency',        icon:'🕐', apply:false, skew:20, why:'Bounded 1–730 d — winsorization + scaling sufficient' },
  { feat:'avg_discount',   icon:'🏷️', apply:false, skew:15, why:'Already ÷100 → [0,1] — little winsorization needed' },
  { feat:'return_rate',    icon:'↩️', apply:false, skew:12, why:'Proportion [0,1]; naturally bounded' },
  { feat:'diversity',      icon:'🌈', apply:false, skew:10, why:'Ratio unique_cats/orders ∈ [0,1]; already bounded' },
];

const SCALERS = [
  {
    name:'StandardScaler', icon:'📐', active:true,
    pros:['μ=0 σ=1 — ideal for K-Means & PCA','Fast, interpretable'],
    cons:['Sensitive to outliers without prior log'],
    note:'Default in segment_engine.py',
  },
  {
    name:'RobustScaler', icon:'🛡️', active:false,
    pros:['Median+IQR ignores outliers','No log pre-step required'],
    cons:['Not unit-variance; less PCA-friendly'],
    note:'Configurable via Settings panel',
  },
  {
    name:'MinMaxScaler', icon:'📏', active:false,
    pros:['Output strictly in [0,1]'],
    cons:['Outliers compress the majority','Least recommended here'],
    note:'Available but not recommended',
  },
];

const DIM_RED = [
  {
    icon:'🔍', name:'PCA', used:true,
    desc:'Applied AFTER K-Means — for 2D visualisation only. Also reduces collinearity between correlated features (e.g. total_spend ↔ spend_velocity).',
    tags:['Post-clustering','Dense features','n_components=2','random_state=42'],
  },
  {
    icon:'✂️', name:'TruncatedSVD', used:false,
    desc:'Preferred for sparse one-hot vectors (top_cat, region, channel). Operates on scipy.sparse matrices without centring — avoids memory explosion.',
    tags:['Sparse matrices','One-hot vectors','No centring needed'],
  },
];

@Component({
  selector: 'app-normalization',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './normalization.component.html',
  styleUrls: ['./normalization.component.scss'],
})
export class Fe57Component implements AfterViewInit, OnDestroy {

  @ViewChild('scatterCanvas') scatterRef!: ElementRef<HTMLCanvasElement>;
  private _dead = false;

  readonly logRows = LOG_ROWS;
  readonly scalers = SCALERS;
  readonly dimRed  = DIM_RED;
  readonly hCols   = ['Recency','Frequency','Spend','AOV','Return%'];

  constructor(public data: DataService) {
    effect(() => {
      if (!this.data.loading() && this.data.sample().length && this.data.segments().length)
        setTimeout(() => this.drawScatter(), 80);
    });
  }

  ngAfterViewInit() { setTimeout(() => this.drawScatter(), 160); setTimeout(() => this.drawScatter(), 420); }
  ngOnDestroy()     { this._dead = true; }
  @HostListener('window:resize') onResize() { this.drawScatter(); }

  get pipeline() {
    return [
      { title: 'Raw Data',              icon: '🗄️', color: '#64748b', sub: 'Orders · customers · returns' },
      { title: 'Data Cleaning',         icon: '🧹', color: '#0891b2', sub: 'Duplicates · nulls · types' },
      { title: 'Feature Engineering',   icon: '⚙️', color: '#7c3aed', sub: 'RFM · spend velocity · CLV' },
      { title: 'Data Preprocessing',    icon: '🔧', color: '#dc2626', sub: 'Winsorization p99 · StandardScaler' },
      { title: 'K-Means Clustering',    icon: '🎯', color: '#d97706', sub: 'Unsupervised segmentation' },
      { title: 'Customer Segmentation', icon: '👥', color: '#059669', sub: 'VIP · Loyal · At Risk · Lost' },
      { title: 'PCA Visualization',     icon: '🔍', color: '#8b5cf6', sub: '2D cluster scatter plot' },
      { title: 'Business Insights',     icon: '📊', color: '#0ea5e9', sub: 'KPIs · campaigns · actions' },
    ];
  }

  /** Returns the feature name with the highest absolute loading on a given component */
  /** Map feature name → human-readable label */
  private readonly FEATURE_LABEL_MAP: Record<string, string> = {
    total_spend:    'Spending Power',
    spend_velocity: 'Spending Velocity',
    aov:            'Avg Order Value',
    order_count:    'Order Frequency',
    recency:        'Recency',
    avg_discount:   'Discount Usage',
    active_months:  'Activity Duration',
    return_rate:    'Return Rate',
    diversity:      'Category Diversity',
    clv_slope:      'CLV Growth',
  };

  /** Default labels when loadings are absent — based on known PCA behaviour */
  private readonly PC_FALLBACK: Record<string, string> = {
    pc1: 'Spending Power',
    pc2: 'Recency',
  };

  private topFeature(pc: 'pc1' | 'pc2'): string {
    const loadings = this.data.pcaMeta()?.loadings ?? [];
    if (!loadings.length) return '';          // signal for fallback
    const top = [...loadings].sort((a, b) => Math.abs(b[pc]) - Math.abs(a[pc]))[0];
    return top?.feature ?? '';
  }

  /** Human-readable label for PC1 — derived from real PCA loadings, robust fallback */
  get pc1Label(): string {
    const f = this.topFeature('pc1');
    if (!f) return this.PC_FALLBACK['pc1'];
    return this.FEATURE_LABEL_MAP[f] ?? f;
  }

  /** Human-readable label for PC2 — derived from real PCA loadings, robust fallback */
  get pc2Label(): string {
    const f = this.topFeature('pc2');
    if (!f) return this.PC_FALLBACK['pc2'];
    return this.FEATURE_LABEL_MAP[f] ?? f;
  }

  get hRows() {
    const segs = this.data.segments();
    const agg  = this.data.agg();
    const all  = Object.values(agg);
    if (!all.length) return [];
    type K = 'avg_recency'|'avg_orders'|'avg_spend'|'avg_aov'|'avg_return_rate';
    const KEYS: K[] = ['avg_recency','avg_orders','avg_spend','avg_aov','avg_return_rate'];
    const stats = KEYS.map(key => {
      const vs = all.map(a => a[key]??0);
      const m  = vs.reduce((s,v)=>s+v,0)/(vs.length||1);
      const sd = Math.sqrt(vs.reduce((s,v)=>s+(v-m)**2,0)/(vs.length||1)) || 1;
      return { m, sd };
    });
    return segs.map(s => {
      const a = agg[s.id];
      const vals = a ? KEYS.map((k,i)=>+((( a[k]??0)-stats[i].m)/stats[i].sd).toFixed(2)) : [0,0,0,0,0];
      return { seg:s.name, icon:s.icon, color:s.color, vals };
    });
  }

  heatBg(v: number) {
    if (v> .6) return 'rgba(5,150,105,.15)';
    if (v> .2) return 'rgba(5,150,105,.06)';
    if (v<-.6) return 'rgba(220,38,38,.15)';
    if (v<-.2) return 'rgba(220,38,38,.06)';
    return 'var(--bg2)';
  }
  heatFg(v: number) {
    if (v> .6) return '#059669';
    if (v<-.6) return '#dc2626';
    return 'var(--t2)';
  }

  drawScatter() {
    if (this._dead) return;
    const el = this.scatterRef?.nativeElement;
    if (!el) return;
    const sample = this.data.sample(), segs = this.data.segments();
    if (!sample.length || !segs.length) return;

    const dpr = window.devicePixelRatio || 1;
    const par = el.parentElement!;
    const cW  = par.offsetWidth  || 700;
    const cH  = par.offsetHeight || 280;
    el.width  = cW * dpr; el.height = cH * dpr;
    el.style.width  = cW + 'px'; el.style.height = cH + 'px';
    const ctx = el.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cW, cH);

    // ── Margins — tight because labels are now in HTML outside canvas ──
    // Left margin: just enough for Y-tick values
    // Bottom margin: just enough for X-tick values
    const pL = 52, pR = 18, pT = 20, pB = 36;
    const plotW = cW - pL - pR;
    const plotH = cH - pT - pB;

    const cm: Record<number, string> = {};
    segs.forEach(s => { cm[s.id] = s.color; });

    const xs = sample.map(p => p.pca_x), ys = sample.map(p => p.pca_y);
    const xn = Math.min(...xs), xx = Math.max(...xs), xr = (xx - xn) || 1;
    const yn = Math.min(...ys), yx = Math.max(...ys), yr = (yx - yn) || 1;

    const toX = (v: number) => pL + ((v - xn) / xr) * plotW;
    const toY = (v: number) => pT + plotH - ((v - yn) / yr) * plotH;

    // ── Accumulate per-segment ────────────────────────────────────────
    const acc: Record<number, { sx: number; sy: number; n: number; pts: { x: number; y: number }[] }> = {};
    sample.forEach(pt => {
      if (!acc[pt.seg]) acc[pt.seg] = { sx: 0, sy: 0, n: 0, pts: [] };
      acc[pt.seg].sx += pt.pca_x; acc[pt.seg].sy += pt.pca_y; acc[pt.seg].n++;
      acc[pt.seg].pts.push({ x: toX(pt.pca_x), y: toY(pt.pca_y) });
    });

    // ── 1. Blobs ──────────────────────────────────────────────────────
    Object.entries(acc).forEach(([id, c]) => {
      const col = cm[+id] ?? '#6b7280';
      const cx  = toX(c.sx / c.n), cy = toY(c.sy / c.n);
      const rx  = (c.pts.map(p => Math.abs(p.x - cx)).reduce((a, b) => a + b, 0) / c.pts.length) * 1.7 + 20;
      const ry  = (c.pts.map(p => Math.abs(p.y - cy)).reduce((a, b) => a + b, 0) / c.pts.length) * 1.7 + 16;
      ctx.save(); ctx.translate(cx, cy);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(rx, ry));
      g.addColorStop(0, col + '28'); g.addColorStop(.65, col + '0e'); g.addColorStop(1, col + '00');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    // ── 2. Grid lines (subtle) ────────────────────────────────────────
    const TICKS = 5;
    ctx.save();
    ctx.strokeStyle = 'rgba(128,128,128,.07)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= TICKS; i++) {
      const gx = pL + (i / TICKS) * plotW;
      const gy = pT + (i / TICKS) * plotH;
      ctx.beginPath(); ctx.moveTo(gx, pT); ctx.lineTo(gx, pT + plotH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pL, gy); ctx.lineTo(pL + plotW, gy); ctx.stroke();
    }
    ctx.restore();

    // ── 3. Zero-cross lines (highlighted) ────────────────────────────
    // Draw zero lines if they fall within range
    const zeroX = toX(0), zeroY = toY(0);
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    if (zeroX >= pL && zeroX <= pL + plotW) {
      ctx.strokeStyle = 'rgba(100,116,139,.22)';
      ctx.beginPath(); ctx.moveTo(zeroX, pT); ctx.lineTo(zeroX, pT + plotH); ctx.stroke();
    }
    if (zeroY >= pT && zeroY <= pT + plotH) {
      ctx.strokeStyle = 'rgba(100,116,139,.22)';
      ctx.beginPath(); ctx.moveTo(pL, zeroY); ctx.lineTo(pL + plotW, zeroY); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();

    // ── 4. Axis lines ─────────────────────────────────────────────────
    ctx.save();
    ctx.strokeStyle = 'rgba(100,116,139,.3)';
    ctx.lineWidth = 1.5;
    // Y axis
    ctx.beginPath(); ctx.moveTo(pL, pT); ctx.lineTo(pL, pT + plotH); ctx.stroke();
    // X axis (at bottom of plot area)
    ctx.beginPath(); ctx.moveTo(pL, pT + plotH); ctx.lineTo(pL + plotW, pT + plotH); ctx.stroke();
    ctx.restore();

    // ── 5. Tick values — X axis ───────────────────────────────────────
    ctx.save();
    ctx.font = '600 9px system-ui,sans-serif';
    ctx.fillStyle = 'rgba(100,116,139,.75)';

    // X ticks — values below the bottom axis line
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= TICKS; i++) {
      const v  = xn + (i / TICKS) * xr;
      const px = pL + (i / TICKS) * plotW;
      // tick mark
      ctx.strokeStyle = 'rgba(100,116,139,.35)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, pT + plotH); ctx.lineTo(px, pT + plotH + 4); ctx.stroke();
      // value
      ctx.fillStyle = 'rgba(100,116,139,.75)';
      ctx.fillText(v.toFixed(1), px, pT + plotH + 6);
    }

    // Y ticks — values to the left of the Y axis
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= TICKS; i++) {
      const v  = yn + (i / TICKS) * yr;
      const py = pT + plotH - (i / TICKS) * plotH;
      ctx.strokeStyle = 'rgba(100,116,139,.35)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pL - 4, py); ctx.lineTo(pL, py); ctx.stroke();
      ctx.fillStyle = 'rgba(100,116,139,.75)';
      ctx.fillText(v.toFixed(1), pL - 7, py);
    }
    ctx.restore();

    // ── 6. Data points ────────────────────────────────────────────────
    segs.forEach(seg => {
      const pts = sample.filter(p => p.seg === seg.id);
      const col = cm[seg.id] ?? '#6b7280';
      // outer glow
      pts.forEach(pt => {
        ctx.beginPath();
        ctx.arc(toX(pt.pca_x), toY(pt.pca_y), 5, 0, Math.PI * 2);
        ctx.fillStyle = col + '20'; ctx.fill();
      });
      // solid dot
      pts.forEach(pt => {
        ctx.beginPath();
        ctx.arc(toX(pt.pca_x), toY(pt.pca_y), 3.5, 0, Math.PI * 2);
        ctx.fillStyle = col + 'd8'; ctx.fill();
      });
    });

    // ── 7. Centroids + labels ─────────────────────────────────────────
    Object.entries(acc).forEach(([id, c]) => {
      const col = cm[+id] ?? '#6b7280';
      const seg = segs.find(s => s.id === +id);
      const cx  = toX(c.sx / c.n), cy = toY(c.sy / c.n);

      // outer ring
      ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.strokeStyle = col + '40'; ctx.lineWidth = 6; ctx.stroke();
      // inner ring
      ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      // fill
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
      // white dot
      ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();

      if (seg) {
        ctx.font = '700 11px system-ui,sans-serif';
        ctx.textAlign = 'center';
        const lbl = seg.icon + ' ' + seg.name;
        const tw  = ctx.measureText(lbl).width;

        // Position label: prefer above centroid, clamp to plot bounds
        let ly = cy - 28;
        const bh = 20, bw = tw + 18;
        const bx = cx - bw / 2;
        // clamp vertically
        if (ly < pT + 2) ly = cy + 18;
        // clamp horizontally — keep pill inside canvas
        const clampedBx = Math.max(pL + 2, Math.min(bx, pL + plotW - bw - 2));

        // pill background
        ctx.fillStyle = col + 'ee';
        if (ctx.roundRect) ctx.roundRect(clampedBx, ly, bw, bh, 7);
        else ctx.rect(clampedBx, ly, bw, bh);
        ctx.fill();
        // text
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'middle';
        ctx.fillText(lbl, clampedBx + bw / 2, ly + bh / 2);
      }
    });
  }
}