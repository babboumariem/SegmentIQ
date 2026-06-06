import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../../../core/services/data.service';



@Component({
  selector: 'app-returns',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './returns.component.html',
  styleUrls: ['./returns.component.scss']
})
export class Fe56Component {
  constructor(public data: DataService) {}

  // ── KPI helpers ───────────────────────────────────────────────────────────
  get totalReturns(): number {
    return this.data.summary()?.total_returns ?? 0;
  }

  get returnRatePct(): string {
    return ((this.data.summary()?.return_rate ?? 0) * 100).toFixed(1);
  }

  /** Status "Returned" (code 3) */
  get returnedCount(): number {
    return this.data.summary()?.return_statuses?.['Returned'] ?? 0;
  }

  /** Status "Canceled" (code 4) */
  get canceledCount(): number {
    return this.data.summary()?.return_statuses?.['Canceled'] ?? 0;
  }

  get returnedPct(): number {
    const t = this.totalReturns || 1;
    return Math.round(this.returnedCount / t * 100);
  }
  get canceledPct(): number {
    const t = this.totalReturns || 1;
    return Math.round(this.canceledCount / t * 100);
  }

  get refundAmountFormatted(): string {
    const v = this.data.summary()?.total_refund_amount ?? 0;
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M KWD';
    if (v >= 1_000)     return (v / 1_000).toFixed(1) + 'K KWD';
    return v.toFixed(0) + ' KWD';
  }

  // ── Segment donut builder ─────────────────────────────────────────────────
  private buildSegmentDonut(
    getValue: (id: number) => number
  ): { id: number; name: string; icon: string; color: string; valuePct: string; dash: string; offset: string; dashLg: string; offsetLg: string }[] {
    const segs = this.data.segments();
    const C   = 2 * Math.PI * 54;   // small donut r=54
    const CLg = 2 * Math.PI * 74;   // large donut r=74
    const rawVals = segs.map(s => getValue(s.id));
    const total   = rawVals.reduce((a, b) => a + b, 0) || 1;

    const GAP     = 5;
    const MIN_ARC = C * 0.08;
    const raw     = rawVals.map(v => (v / total) * C);
    const clamped = raw.map(a => Math.max(a, MIN_ARC));
    const surplus = clamped.reduce((s, a) => s + a, 0) - C;
    const bigTot  = raw.filter(a => a > MIN_ARC).reduce((s, a) => s + a, 0) || 1;
    const final   = clamped.map((a, i) =>
      raw[i] > MIN_ARC ? Math.max(a - (raw[i] / bigTot) * surplus, MIN_ARC) : a
    );

    // proportions for large donut
    const GAP_LG     = 6;
    const MIN_ARC_LG = CLg * 0.08;
    const rawLg      = rawVals.map(v => (v / total) * CLg);
    const clampedLg  = rawLg.map(a => Math.max(a, MIN_ARC_LG));
    const surplusLg  = clampedLg.reduce((s, a) => s + a, 0) - CLg;
    const bigTotLg   = rawLg.filter(a => a > MIN_ARC_LG).reduce((s, a) => s + a, 0) || 1;
    const finalLg    = clampedLg.map((a, i) =>
      rawLg[i] > MIN_ARC_LG ? Math.max(a - (rawLg[i] / bigTotLg) * surplusLg, MIN_ARC_LG) : a
    );

    let cumAngle = 0;
    let cumAngleLg = 0;
    return segs.map((s, i) => {
      const arc = Math.max(final[i] - GAP, 4);
      const gap = C - arc;
      const off = C / 4 - cumAngle;
      cumAngle += final[i];

      const arcLg = Math.max(finalLg[i] - GAP_LG, 4);
      const gapLg = CLg - arcLg;
      const offLg = CLg / 4 - cumAngleLg;
      cumAngleLg += finalLg[i];

      return {
        id:       s.id,
        name:     s.name,
        icon:     s.icon,
        color:    s.color,
        valuePct: (rawVals[i] * 100).toFixed(1),
        dash:     `${arc} ${gap}`,
        offset:   String(off),
        dashLg:   `${arcLg} ${gapLg}`,
        offsetLg: String(offLg),
      };
    });
  }

  get returnRateDonut()  { return this.buildSegmentDonut(id => this.data.agg()[id]?.avg_return_rate  ?? 0); }
  get refundRatioDonut() { return this.buildSegmentDonut(id => this.data.agg()[id]?.avg_refund_ratio ?? 0); }

  get avgReturnRate(): string {
    const segs = this.data.segments();
    if (!segs.length) return '0.0';
    const sum = segs.reduce((a, s) => a + (this.data.agg()[s.id]?.avg_return_rate ?? 0), 0);
    return (sum / segs.length * 100).toFixed(1);
  }
  get avgRefundRatio(): string {
    const segs = this.data.segments();
    if (!segs.length) return '0.0';
    const sum = segs.reduce((a, s) => a + (this.data.agg()[s.id]?.avg_refund_ratio ?? 0), 0);
    return (sum / segs.length * 100).toFixed(1);
  }
}