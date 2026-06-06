import {
  Component, AfterViewInit, ViewChildren, QueryList,
  ElementRef, HostListener, effect, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../../core/services/data.service';
import { ChartService } from '../../core/services/chart.service';
import { NavService } from '../../core/services/nav.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements AfterViewInit, OnDestroy {
  @ViewChildren('scatterCanvas') scatterC!: QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('donutCanvas')   donutC!:   QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('lineCanvas')    lineC!:    QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('growthCanvas')  growthC!:  QueryList<ElementRef<HTMLCanvasElement>>;

  isLoaded = false;
  kpis: any[] = [];

  private readonly CHANNEL_ICONS: Record<string, string> = {
    'whatsapp': '💬', 'whatsapp order': '💬',
    'in-store': '🏪', 'instore': '🏪', 'in store': '🏪',
    'online': '🌐', 'website': '🌐', 'website direct': '🌐',
    'tiktok': '🎵', 'instagram': '📷', 'snapchat': '👻',
    'google ads': '🔍', 'google': '🔍',
    'walk-in': '🚶', 'walk in': '🚶', 'walkin': '🚶',
    'referral': '🤝', 'default': '📊',
  };

  private readonly CHANNEL_COLORS = ['#25D366','#e07820','#2563eb','#7c3aed','#ec4899','#06b6d4'];

  private getChannelIcon(name: string): string {
    const key = name.toLowerCase();
    return this.CHANNEL_ICONS[key] ?? this.CHANNEL_ICONS['default'];
  }

  get channels(): { name: string; pct: number; barPct: number; color: string; icon: string }[] {
    const counts  = this.data.summary()?.channel_counts ?? {};
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const total   = entries.reduce((s, [, v]) => s + v, 0) || 1;
    const maxN    = entries[0]?.[1] ?? 1;
    const minN    = entries[entries.length - 1]?.[1] ?? 0;
    const range   = (maxN - minN) || maxN || 1;
    return entries.map(([name, n], i) => ({
      name,
      pct:    total ? Math.round(n / total * 1000) / 10 : 0,
      barPct: Math.round((n / (entries[0]?.[1] ?? 1)) * 60),
      color: this.CHANNEL_COLORS[i % this.CHANNEL_COLORS.length],
      icon: this.getChannelIcon(name),
    }));
  }

  get dominantPC1() {
    const l = this.data.pcaMeta()?.loadings ?? [];
    return l.reduce((b: any, x) => !b || x.pc1 * x.pc1 > b.pc1 * b.pc1 ? x : b, null);
  }

  get dominantPC2() {
    const l = this.data.pcaMeta()?.loadings ?? [];
    return l.reduce((b: any, x) => !b || x.pc2 * x.pc2 > b.pc2 * b.pc2 ? x : b, null);
  }

  get topCats(): { name: string; rev: string; pct: number }[] {
    // Use exact pre-computed category revenue from backend (via DataService.categoryRevenue)
    return this.data.categoryRevenue().slice(0, 8);
  }


  get channelSummary(): { totalRev: string; totalOrders: string; aov: string } {
    const s = this.data.summary();
    return {
      totalRev:    (this.data.totalRevenue() / 1_000_000).toFixed(2) + 'M',
      totalOrders: (s?.total_orders ?? 0) >= 1000
        ? ((s?.total_orders ?? 0) / 1000).toFixed(0) + 'K'
        : String(s?.total_orders ?? 0),
      aov: (s?.true_aov ?? s?.avg_order_value ?? 0).toFixed(2),
    };
  }

  /** Montant des remboursements = totalRevenue (fulfilled) - totalRevenue (net) */
  get refundsFormatted(): string {
    const sales = this.data.totalRevenue();
    const net   = this.data.totalRevenue();
    const diff  = sales - net;
    if (diff <= 0) return '';
    return diff >= 1_000_000
      ? (diff / 1_000_000).toFixed(2) + 'M'
      : (diff / 1_000).toFixed(1) + 'K';
  }

  constructor(
    public  data:   DataService,
    private charts: ChartService,
    public  nav:    NavService
  ) {
    effect(() => {
      const segs = this.data.segments();
      const agg  = this.data.agg();
      if (!segs.length || !Object.keys(agg).length) return;
      this.buildKpis();
      setTimeout(() => { this.drawAll(); this.isLoaded = true; }, 80);
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => { this.drawAll(); this.isLoaded = true; }, 120);
  }

  @HostListener('window:resize')
  onResize(): void { this.drawAll(); }

  ngOnDestroy(): void {}

  getPct(id: number): string {
    const tot = this.data.totalCustomers();
    if (!tot) return '0.0';
    return (this.data.segmentCounts()[id] / tot * 100).toFixed(1);
  }

  getRevShare(id: number): string {
    const revBySeg = this.data.revenueBySegment();
    // Utiliser la somme des segments comme dénominateur (même source que le numérateur)
    const total = Object.values(revBySeg).reduce((a, b) => a + b, 0);
    if (!total) return '0';
    return ((revBySeg[String(id)] ?? 0) / total * 100).toFixed(1);
  }

  private buildKpis(): void {
    const tot     = this.data.totalCustomers();
    const rev     = this.data.totalRevenue();          // commandes réussies (fulfilled) uniquement
    const aov     = this.data.overallAov();         // true_aov from backend
    const s       = this.data.summary();
    const monthly = s?.monthly_revenue ?? {};
    const months  = Object.keys(monthly).sort();

    const fmtTrend = (pct: number | null) => {
      if (pct === null) return { trend: 0, trendLabel: '—' };
      return { trend: pct > 0 ? 1 : pct < 0 ? -1 : 0, trendLabel: (pct > 0 ? '+' : '') + pct + '%' };
    };

    // ── Revenue trend — YoY pre-calculé par le backend ──────────────────────
    const yoyPct  = this.data.yoyPct();   // +332% sur ces données
    const revTrend = fmtTrend(yoyPct);

    const maxMonthlyRev = months.length ? Math.max(...months.map(m => monthly[m])) : 1;
    const currMonthRev  = months.length ? monthly[months[months.length - 1]] : 0;
    const revPct        = maxMonthlyRev > 0 ? Math.round(currMonthRev / maxMonthlyRev * 100) : 0;

    // ── AOV trend — vrai AOV mensuel (revenue / fulfilled orders par mois) ──
    const monthlyAov = s?.monthly_aov ?? {};
    const aovMonths  = Object.keys(monthlyAov).sort();
    let aovTrend = fmtTrend(null);
    if (aovMonths.length >= 6) {
      const curr3Aov = aovMonths.slice(-3).reduce((a, m) => a + (monthlyAov[m] ?? 0), 0) / 3;
      const prev3Aov = aovMonths.slice(-6, -3).reduce((a, m) => a + (monthlyAov[m] ?? 0), 0) / 3;
      const diff = prev3Aov > 0 ? Math.round((curr3Aov - prev3Aov) / prev3Aov * 100) : 0;
      aovTrend = fmtTrend(diff);   // attendu: -0% sur ces données
    }
    // AOV progress bar: actual AOV vs a meaningful benchmark (e.g. max segment AOV)
    const agg      = this.data.agg();
    const segs     = this.data.segments();
    const counts   = this.data.segmentCounts();
    const maxSegAov = Math.max(...segs.map(sg => agg[sg.id]?.avg_aov ?? 0), aov) || aov || 1;
    const aovPct    = Math.min(100, Math.round(aov / maxSegAov * 100));

    // ── Avg Annual Spend — weighted avg_sp365 across all segments ──────────
    // (replaces the misleading "Avg Customer Spend" which was CLV-like total spend)
    const totalCust = segs.reduce((s, sg) => s + (counts[sg.id] ?? 0), 0) || 1;
    const weightedAnnual = segs.reduce((s, sg) => {
      const a = agg[sg.id];
      return s + (a ? (a.avg_sp365 ?? 0) * (counts[sg.id] ?? 0) : 0);
    }, 0);
    const avgAnnualSpend = weightedAnnual / totalCust;
    // Progress bar: fraction relative to best segment's avg_sp365
    const maxAnnual  = Math.max(...segs.map(sg => agg[sg.id]?.avg_sp365 ?? 0), avgAnnualSpend) || 1;
    const annualPct  = Math.min(100, Math.round(avgAnnualSpend / maxAnnual * 100));
    // Trend: compare avg_sp365 vs avg_sp90 * 4 as a momentum proxy
    const weightedSp90 = segs.reduce((s, sg) => {
      const a = agg[sg.id];
      return s + (a ? (a.avg_sp90 ?? 0) * (counts[sg.id] ?? 0) : 0);
    }, 0);
    const avgSp90 = weightedSp90 / totalCust;
    const annualisedSp90 = avgSp90 * 4;
    const annualTrendPct = avgAnnualSpend > 0
      ? Math.round((annualisedSp90 - avgAnnualSpend) / avgAnnualSpend * 100)
      : null;

    // ── Retention Rate — valeur exacte calculée côté backend (individu par individu) ──
    // Backend: % de clients avec spend_90 > 0, calculé sur feat (une ligne par client)
    const retentionRate = Math.round(s?.retention_rate ?? 0);

    // ── Retention Rate trend — compare avg_ord90 vs avg_ord30*3 as momentum proxy ─
    const weightedOrd30 = segs.reduce((s, sg) => s + (agg[sg.id]?.avg_ord30 ?? 0) * (counts[sg.id] ?? 0), 0);
    const weightedOrd90 = segs.reduce((s, sg) => s + (agg[sg.id]?.avg_ord90 ?? 0) * (counts[sg.id] ?? 0), 0);
    const annualisedOrd30 = weightedOrd30 / totalCust * 3;
    const avgOrd90        = weightedOrd90 / totalCust;
    const retentionTrendPct = avgOrd90 > 0
      ? Math.round((annualisedOrd30 - avgOrd90) / avgOrd90 * 100)
      : null;

    this.kpis = [
      { icon:'👥', color:'#e07820', bg:'rgba(224,120,32,.12)',   label:'Total Customers',    unit:'',      value: tot.toLocaleString(),              pct: 100,        ...fmtTrend(yoyPct) },
      { icon:'💰', color:'#2563eb', bg:'rgba(37,99,235,.12)',   label:'Total Revenue',       sublabel:'fulfilled orders', unit:'M KWD', value: (rev/1_000_000).toFixed(2),         pct: revPct,     ...revTrend },
      { icon:'🛒', color:'#059669', bg:'rgba(5,150,105,.12)',   label:'Avg Order Value',     unit:'KWD',   value: aov.toFixed(2),                     pct: aovPct,     ...aovTrend },
      { icon:'📅', color:'#7c3aed', bg:'rgba(124,58,237,.12)', label:'Avg Annual Spend',    unit:'KWD',   value: avgAnnualSpend.toFixed(0),           pct: annualPct,  ...fmtTrend(annualTrendPct) },
      { icon:'🔄', color:'#0891b2', bg:'rgba(8,145,178,.12)',  label:'Retention Rate',      unit:'%',     value: retentionRate.toString(),            pct: retentionRate, ...fmtTrend(retentionTrendPct) },
    ];
  }

  private css(v: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  }

  private drawAll(): void {
    const segs = this.data.segments(), agg = this.data.agg();
    if (!segs.length || !Object.keys(agg).length) return;

    this.drawSparklines();

    // ── Line chart ─────────────────────────────────────────────────────────
    const lc = this.lineC.first?.nativeElement;
    if (lc) {
      const draw = () => {
        lc.height = lc.parentElement?.offsetHeight || 320;
        lc.width  = lc.parentElement?.offsetWidth  || lc.offsetWidth || 600;
        this.charts.drawLine(lc, segs.map(s => ({ color: s.color, label: s.name, values: this.data.monthlyArray(s.id) })), this.data.monthlyLabels(segs[0]?.id ?? 0));
      };
      draw();
      setTimeout(draw, 50);
    }

    // ── Donut ──────────────────────────────────────────────────────────────
    const dc = this.donutC.first?.nativeElement;
    if (dc) {
      dc.width = dc.height = 180;
      const revBySeg  = this.data.revenueBySegment();
      // Use the true PaymentLog-deduplicated total revenue (2.89M KD)
      const trueTotal = this.data.totalRevenue();
      const segSum    = segs.reduce((a, s) => a + (revBySeg[String(s.id)] ?? 0), 0) || 1;
      // Scale segment slices proportionally so they sum to trueTotal
      const scale     = trueTotal / segSum;
      const parts     = segs.map(s => ({
        value: (revBySeg[String(s.id)] ?? 0) * scale,
        color: s.color,
        label: s.name,
      }));
      // Center label = true total revenue (PaymentLog dédupliqué)
      const centerLabel = trueTotal >= 1_000_000
        ? `${(trueTotal / 1_000_000).toFixed(2)}M`
        : `${(trueTotal / 1_000).toFixed(1)}K`;
      this.charts.drawDonut(dc, parts, centerLabel, 'KWD total');
    }

    // ── Scatter ────────────────────────────────────────────────────────────
    const sc = this.scatterC.first?.nativeElement;
    if (sc) {
      sc.height = sc.parentElement?.offsetHeight || 230;
      sc.width  = sc.parentElement?.offsetWidth  || sc.offsetWidth || 400;
      const pc1Lbl = `PC1 — ${this.dominantPC1?.feature ?? 'Spending Power'}`;
      const pc2Lbl = `PC2 — ${this.dominantPC2?.feature ?? 'Recency'}`;
      this.charts.drawScatter(sc,
        this.data.sample().map(d => ({ x: d.pca_x, y: d.pca_y, color: segs[d.seg]?.color || '#999' })),
        pc1Lbl,
        pc2Lbl
      );
    }

    // ── Growth line ────────────────────────────────────────────────────────
    const gc = this.growthC.first?.nativeElement;
    if (gc) {
      gc.height = gc.parentElement?.offsetHeight || 230;
      gc.width  = gc.parentElement?.offsetWidth  || gc.offsetWidth || 400;
      if (this.data.summary()?.monthly_revenue) {
        this.drawGrowth(gc, this.data.monthlyTotalArray(), this.data.monthlyTotalLabels());
      }
    }
  }

  private getSparkData(kpiIndex: number): number[] {
    const segs = this.data.segments();
    const agg  = this.data.agg();
    const s    = this.data.summary();

    // KPI 0 — Total Customers: count per segment
    if (kpiIndex === 0) {
      const counts = this.data.segmentCounts();
      return segs.map(sg => counts[sg.id] ?? 0);
    }

    // KPI 1 — Total Revenue: monthly total revenue trend
    if (kpiIndex === 1) return this.data.monthlyTotalArray();

    // KPI 2 — Avg Order Value: proxy monthly AOV = monthly_rev / (totalRev/fulfilledOrders)
    if (kpiIndex === 2) {
      const monthly = s?.monthly_revenue ?? {};
      const months  = Object.keys(monthly).sort();
      if (!months.length) return [];
      const globalAov = this.data.overallAov() || 1;
      const globalRev = this.data.totalRevenue() || 1;
      return months.map(m => (monthly[m] / globalRev) * globalAov);
    }

    // KPI 3 — Avg Annual Spend: use monthly total revenue as time trend (same shape as spend)
    if (kpiIndex === 3) return this.data.monthlyTotalArray();

    // KPI 4 — Retention Rate: use monthly total revenue as time proxy (no monthly retention series available)
    if (kpiIndex === 4) return this.data.monthlyTotalArray();

    return [];
  }

  private drawSparklines(): void {
    document.querySelectorAll<HTMLCanvasElement>('canvas[data-kpi]').forEach((el, i) => {
      const d     = this.getSparkData(i);
      const color = this.kpis[i]?.color ?? '#e07820';
      el.width    = el.offsetWidth || 140;
      el.height   = 36;
      const ctx   = el.getContext('2d')!;
      const W = el.width, H = el.height;
      ctx.clearRect(0, 0, W, H);
      if (!d.length) return;
      const max = Math.max(...d), min = Math.min(...d);
      const sx  = (i: number) => (i / (d.length - 1)) * W;
      const sy  = (v: number) => H - ((v - min) / (max - min + 1)) * (H - 4) - 2;
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, color + '28'); grad.addColorStop(1, color + '00');
      ctx.beginPath(); ctx.moveTo(sx(0), sy(d[0]));
      d.forEach((v, i) => { if (i > 0) ctx.lineTo(sx(i), sy(v)); });
      ctx.lineTo(sx(d.length - 1), H); ctx.lineTo(0, H); ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();
      ctx.beginPath(); ctx.moveTo(sx(0), sy(d[0]));
      d.forEach((v, i) => { if (i > 0) ctx.lineTo(sx(i), sy(v)); });
      ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.stroke();
    });
  }

  /* ── Growth chart — avec axes X et Y complets ──────────────────────────── */
  private drawGrowth(el: HTMLCanvasElement, vals: number[], lbls: string[]): void {
    const dpr = window.devicePixelRatio || 1;
    const W   = el.width;
    const H   = el.height;
    // Padding suffisant pour les titres d'axe
    const P   = { l: 68, r: 16, t: 20, b: 58 };
    const ctx = el.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    if (!vals.length) return;

    const max = Math.max(...vals) * 1.12 || 1;
    const sx  = (i: number) => P.l + (i / (vals.length - 1 || 1)) * (W - P.l - P.r);
    const sy  = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b);

    // ── Axes lines ─────────────────────────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(P.l, P.t - 6); ctx.lineTo(P.l, H - P.b);
    ctx.strokeStyle = 'rgba(128,128,128,.18)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(P.l, H - P.b); ctx.lineTo(W - P.r, H - P.b);
    ctx.stroke();

    // ── Y grid + labels ────────────────────────────────────────────────────
    const ySteps = 4;
    for (let i = 0; i <= ySteps; i++) {
      const v = max * (1 - i / ySteps);
      const y = P.t + (i / ySteps) * (H - P.t - P.b);

      ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(W - P.r, y);
      ctx.strokeStyle = 'rgba(128,128,128,.06)'; ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);

      ctx.beginPath(); ctx.moveTo(P.l - 4, y); ctx.lineTo(P.l, y);
      ctx.strokeStyle = 'rgba(128,128,128,.25)'; ctx.lineWidth = 1; ctx.stroke();

      ctx.fillStyle = this.css('--t2') || '#5a3e1a';
      ctx.font      = 'bold 12px JetBrains Mono,monospace';
      ctx.textAlign = 'right';
      ctx.fillText(this.fmtK(v), P.l - 7, y + 3.5);
    }

    // ── Y axis title (rotated) ─────────────────────────────────────────────
    ctx.save();
    ctx.translate(11, P.t + (H - P.t - P.b) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle   = this.css('--t3') || '#8a6840';
    ctx.font        = 'bold 12px Plus Jakarta Sans,sans-serif';
    ctx.textAlign   = 'center';
    ctx.fillText('Revenue (KWD)', 0, 0);
    ctx.restore();

    // ── X tick marks + labels ──────────────────────────────────────────────
    const maxLabels = 12;
    const step = vals.length <= maxLabels ? 1 : Math.ceil(vals.length / maxLabels);
    ctx.font      = 'bold 12px JetBrains Mono,monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i < vals.length; i++) {
      const x = sx(i);
      ctx.beginPath(); ctx.moveTo(x, H - P.b); ctx.lineTo(x, H - P.b + 4);
      ctx.strokeStyle = 'rgba(128,128,128,.22)'; ctx.lineWidth = 1; ctx.stroke();
      if (i % step === 0) {
        ctx.fillStyle = this.css('--t2') || '#5a3e1a';
        ctx.fillText(lbls[i] ?? String(i + 1), x, H - P.b + 15);
      }
    }

    // ── X axis title ───────────────────────────────────────────────────────
    ctx.fillStyle = this.css('--t3') || '#8a6840';
    ctx.font      = 'bold 12px Plus Jakarta Sans,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Month', P.l + (W - P.l - P.r) / 2, H - 1);

    // ── Area + line ────────────────────────────────────────────────────────
    const grad = ctx.createLinearGradient(0, P.t, 0, H - P.b);
    grad.addColorStop(0, 'rgba(200,160,32,.18)');
    grad.addColorStop(1, 'rgba(200,160,32,.01)');
    ctx.beginPath(); ctx.moveTo(sx(0), sy(vals[0]));
    vals.forEach((v, i) => { if (i > 0) ctx.lineTo(sx(i), sy(v)); });
    ctx.lineTo(sx(vals.length - 1), H - P.b); ctx.lineTo(sx(0), H - P.b);
    ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

    ctx.beginPath(); ctx.moveTo(sx(0), sy(vals[0]));
    vals.forEach((v, i) => { if (i > 0) ctx.lineTo(sx(i), sy(v)); });
    ctx.strokeStyle = '#e07820'; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.stroke();

    // ── Peak dot + label ──────────────────────────────────────────────────
    const maxIdx = vals.indexOf(Math.max(...vals));
    ctx.beginPath(); ctx.arc(sx(maxIdx), sy(vals[maxIdx]), 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#e07820'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.fillStyle = '#e07820'; ctx.font = 'bold 12px JetBrains Mono,monospace'; ctx.textAlign = 'center';
    ctx.fillText(this.fmtK(vals[maxIdx]), sx(maxIdx), sy(vals[maxIdx]) - 10);
  }

  private fmtK(v: number): string {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
    if (v >= 1_000)     return (v / 1_000).toFixed(0) + 'K';
    return v.toFixed(0);
  }

  /** Formats an integer with space as thousands separator (e.g. 1 322) */
  fmtN(v: number | undefined | null): string {
    if (v == null) return '0';
    return Math.round(v).toLocaleString('fr-FR');
  }
}