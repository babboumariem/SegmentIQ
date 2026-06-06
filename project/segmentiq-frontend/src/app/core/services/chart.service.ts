// src/app/core/services/chart.service.ts
import { Injectable } from '@angular/core';

export interface LineDataset  { color: string; values: number[]; label?: string; }
export interface DonutSlice   { value: number; color: string; label: string; }
export interface ScatterPoint { x: number; y: number; color: string; label?: string; }

@Injectable({ providedIn: 'root' })
export class ChartService {

  // ── Reads the current theme's text color for axis labels ─────────────────────
  private axisLabelColor(): string {
    return getComputedStyle(document.documentElement).getPropertyValue('--t2').trim() || '#5a3e1a';
  }
  private axisTitleColor(): string {
    return getComputedStyle(document.documentElement).getPropertyValue('--t3').trim() || '#8a6840';
  }

  // ── Line chart (multi-series, 12-month) ─────────────────────────────────────
  drawLine(el: HTMLCanvasElement, datasets: LineDataset[], xLabels?: string[]): void {
    const ctx = el.getContext('2d')!;
    const W = el.width, H = el.height;
    ctx.clearRect(0, 0, W, H);

    const activeSets = datasets.filter(d => d.values.length && d.values.some(v => v > 0));
    if (!activeSets.length) return;
    const len = activeSets[0].values.length;
    const P = { l: 68, r: 36, t: 20, b: 52 };

    // ── Log scale helpers
    const allVals = activeSets.flatMap(d => d.values).filter(v => v > 0);
    const rawMin  = Math.min(...allVals);
    const rawMax  = Math.max(...allVals);
    // Floor at 0.8 so even near-zero values (Lost segment) stay inside the chart
    const logMin  = Math.log10(Math.max(rawMin * 0.5, 0.8));
    const logMax  = Math.log10(rawMax * 1.15);
    // Minimum displayable value — values at or below zero are clamped here
    const valFloor = Math.pow(10, logMin);

    const sx  = (i: number) => P.l + (i / Math.max(len - 1, 1)) * (W - P.l - P.r);
    const sy  = (v: number) => {
      const lv = Math.log10(Math.max(v, valFloor));
      return P.t + (1 - (lv - logMin) / (logMax - logMin)) * (H - P.t - P.b);
    };

    // ── Clip to chart area (lines only)
    ctx.save();
    ctx.beginPath();
    ctx.rect(P.l, P.t, W - P.l - P.r, H - P.t - P.b);
    ctx.clip();

    // ── Lines only — no area fill
    for (const ds of activeSets) {
      ctx.beginPath();
      ctx.strokeStyle = ds.color;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round';
      ctx.lineCap  = 'round';
      let penDown = false;
      let prevI = 0, prevV = 0;
      for (let i = 0; i < len; i++) {
        const v = ds.values[i];
        if (!v || v <= 0) { penDown = false; continue; }
        const px = sx(i), py = sy(v);
        if (!penDown) {
          ctx.moveTo(px, py);
          penDown = true;
        } else {
          const cpx = (sx(prevI) + px) / 2;
          ctx.bezierCurveTo(cpx, sy(prevV), cpx, py, px, py);
        }
        prevI = i; prevV = v;
      }
      ctx.stroke();
    }
    ctx.restore();

    // ── End dots drawn OUTSIDE clip so they are never cut off
    for (const ds of activeSets) {
      const lastV = [...ds.values].reverse().find(v => v > 0) ?? 0;
      const lastI = ds.values.lastIndexOf(lastV);
      if (lastV > 0) {
        ctx.beginPath();
        ctx.arc(sx(lastI), sy(lastV), 4, 0, Math.PI * 2);
        ctx.fillStyle = ds.color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // ── Log Y grid — nice round powers of 10 / halves
    const yTicks: number[] = [];
    const startPow = Math.floor(logMin);
    const endPow   = Math.ceil(logMax);
    for (let p = startPow; p <= endPow; p++) {
      for (const mult of [1, 2, 5]) {
        const v = mult * Math.pow(10, p);
        if (v >= Math.pow(10, logMin) && v <= Math.pow(10, logMax)) yTicks.push(v);
      }
    }

    for (const v of yTicks) {
      const y = sy(v);
      ctx.beginPath();
      ctx.moveTo(P.l, y);
      ctx.lineTo(W - P.r, y);
      ctx.strokeStyle = 'rgba(128,128,128,0.1)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = this.axisLabelColor();
      ctx.font = '10.5px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(this.fmtK(v), P.l - 7, y + 4);

      // Tick mark
      ctx.beginPath();
      ctx.moveTo(P.l - 3, y);
      ctx.lineTo(P.l, y);
      ctx.strokeStyle = 'rgba(128,128,128,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // ── Y axis line
    ctx.beginPath();
    ctx.moveTo(P.l, P.t);
    ctx.lineTo(P.l, H - P.b);
    ctx.strokeStyle = 'rgba(128,128,128,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // ── Y axis title
    ctx.save();
    ctx.translate(12, P.t + (H - P.t - P.b) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = this.axisTitleColor();
    ctx.font = 'bold 11px Plus Jakarta Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Avg Spend (KWD) — log scale', 0, 0);
    ctx.restore();

    // ── X axis
    ctx.beginPath();
    ctx.moveTo(P.l, H - P.b);
    ctx.lineTo(W - P.r, H - P.b);
    ctx.strokeStyle = 'rgba(128,128,128,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const defaultMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const lbls = xLabels ?? defaultMonths;
    const maxLabels = 14;
    const step = len <= maxLabels ? 1 : Math.ceil(len / maxLabels);
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i < len; i++) {
      ctx.beginPath();
      ctx.moveTo(sx(i), H - P.b);
      ctx.lineTo(sx(i), H - P.b + 3);
      ctx.strokeStyle = 'rgba(128,128,128,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (i % step === 0) {
        ctx.fillStyle = this.axisLabelColor();
        ctx.fillText(lbls[i] ?? String(i + 1), sx(i), H - P.b + 15);
      }
    }

    ctx.fillStyle = this.axisTitleColor();
    ctx.font = 'bold 11px Plus Jakarta Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Month', P.l + (W - P.l - P.r) / 2, H - 4);
  }

  // ── Donut chart ──────────────────────────────────────────────────────────────
  drawDonut(el: HTMLCanvasElement, slices: DonutSlice[], centerVal: string, centerLbl: string): void {
    const ctx = el.getContext('2d')!;
    const W = el.width, H = el.height;
    ctx.clearRect(0, 0, W, H);

    const cx    = W / 2;
    const cy    = H / 2;
    const r     = Math.min(W, H) * 0.38;
    const inner = r * 0.62;
    const total = slices.reduce((s, x) => s + x.value, 0) || 1;

    let angle = -Math.PI / 2;
    for (const sl of slices) {
      const sweep = (sl.value / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle, angle + sweep);
      ctx.closePath();
      ctx.fillStyle = sl.color;
      ctx.fill();
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#fffdf9';
      ctx.lineWidth = 2;
      ctx.stroke();
      angle += sweep;
    }

    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, 2 * Math.PI);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#fffdf9';
    ctx.fill();

    ctx.textAlign  = 'center';
    ctx.fillStyle  = getComputedStyle(document.documentElement).getPropertyValue('--tx').trim() || '#2a1f0a';
    ctx.font       = `bold ${Math.floor(inner * 0.38)}px Plus Jakarta Sans, sans-serif`;
    ctx.fillText(centerVal, cx, cy + 5);
    ctx.fillStyle = this.axisTitleColor();
    ctx.font      = `${Math.floor(inner * 0.22)}px Plus Jakarta Sans, sans-serif`;
    ctx.fillText(centerLbl, cx, cy + Math.floor(inner * 0.38) + 4);
  }

  // ── Scatter plot ─────────────────────────────────────────────────────────────
  drawScatter(el: HTMLCanvasElement, points: ScatterPoint[], xLabel = 'PCA Component 1', yLabel = 'PCA Component 2'): void {
    const ctx = el.getContext('2d')!;
    const W   = el.width;
    const H   = el.height;
    const P   = { l: 68, r: 16, t: 16, b: 58 };
    ctx.clearRect(0, 0, W, H);

    if (!points.length) return;

    const xs   = points.map(p => p.x);
    const ys   = points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rx   = maxX - minX || 1;
    const ry   = maxY - minY || 1;

    const sx = (x: number) => P.l + ((x - minX) / rx) * (W - P.l - P.r);
    const sy = (y: number) => P.t + (1 - (y - minY) / ry) * (H - P.t - P.b);

    ctx.beginPath();
    ctx.moveTo(P.l, P.t);
    ctx.lineTo(P.l, H - P.b);
    ctx.strokeStyle = 'rgba(128,128,128,0.18)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(P.l, H - P.b);
    ctx.lineTo(W - P.r, H - P.b);
    ctx.stroke();

    const ySteps = 4;
    for (let i = 0; i <= ySteps; i++) {
      const v = minY + (maxY - minY) * (1 - i / ySteps);
      const y = P.t + (i / ySteps) * (H - P.t - P.b);

      ctx.beginPath();
      ctx.moveTo(P.l, y);
      ctx.lineTo(W - P.r, y);
      ctx.strokeStyle = 'rgba(128,128,128,0.07)';
      ctx.setLineDash([3, 4]);
      ctx.lineWidth   = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle  = this.axisLabelColor();
      ctx.font       = 'bold 12px JetBrains Mono, monospace';
      ctx.textAlign  = 'right';
      ctx.fillText(v.toFixed(1), P.l - 5, y + 3);
    }

    const xSteps = 4;
    for (let i = 0; i <= xSteps; i++) {
      const v = minX + (maxX - minX) * (i / xSteps);
      const x = P.l + (i / xSteps) * (W - P.l - P.r);

      ctx.beginPath();
      ctx.moveTo(x, P.t);
      ctx.lineTo(x, H - P.b);
      ctx.strokeStyle = 'rgba(128,128,128,0.07)';
      ctx.setLineDash([3, 4]);
      ctx.lineWidth   = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle  = this.axisLabelColor();
      ctx.font       = 'bold 12px JetBrains Mono, monospace';
      ctx.textAlign  = 'center';
      ctx.fillText(v.toFixed(1), x, H - P.b + 13);
    }

    ctx.fillStyle  = '#7c3aed';
    ctx.font       = 'bold 12px Plus Jakarta Sans, sans-serif';
    ctx.textAlign  = 'center';
    ctx.fillText(xLabel, P.l + (W - P.l - P.r) / 2, H - 2);

    ctx.save();
    ctx.translate(11, P.t + (H - P.t - P.b) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign  = 'center';
    ctx.fillStyle  = '#2563eb';
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();

    for (const pt of points) {
      ctx.beginPath();
      ctx.arc(sx(pt.x), sy(pt.y), 3.5, 0, 2 * Math.PI);
      ctx.fillStyle = this.hexAlpha(pt.color, 0.72);
      ctx.fill();
    }
  }

  // ── Horizontal bar chart ─────────────────────────────────────────────────────
  drawHorizBar(el: HTMLCanvasElement, vals: number[], colors: string[], labels: string[], lowerBetter = false): void {
    const ctx = el.getContext('2d')!;
    const W   = el.width;
    const H   = el.height;
    ctx.clearRect(0, 0, W, H);

    if (!vals.length) return;

    const max    = Math.max(...vals) || 1;
    const barH   = Math.floor((H - 12) / vals.length) - 5;
    const labelW = 72;
    const trackW = W - labelW - 12;

    for (let i = 0; i <= 4; i++) {
      const x = labelW + (i / 4) * trackW;
      ctx.beginPath();
      ctx.moveTo(x, 4);
      ctx.lineTo(x, H - 8);
      ctx.strokeStyle = 'rgba(128,128,128,0.08)';
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = this.axisLabelColor();
      ctx.font      = 'bold 12px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.fmtK(max * i / 4), x, H - 1);
    }

    for (let i = 0; i < vals.length; i++) {
      const y = 4 + i * (barH + 5);
      const w = (vals[i] / max) * trackW;

      ctx.fillStyle = 'rgba(128,128,128,0.07)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(labelW, y, trackW, barH, 3);
      else ctx.rect(labelW, y, trackW, barH);
      ctx.fill();

      const isBest = lowerBetter
        ? vals[i] === Math.min(...vals)
        : vals[i] === Math.max(...vals);
      const baseCol = lowerBetter
        ? this.heatColor(1 - vals[i] / max)
        : (colors[i] ?? '#e07820');
      const col = isBest ? baseCol : this.desaturate(baseCol, 0.3);
      ctx.fillStyle = col;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(labelW, y, Math.max(w, 2), barH, 3);
      else ctx.rect(labelW, y, Math.max(w, 2), barH);
      ctx.fill();

      ctx.fillStyle = this.axisLabelColor();
      ctx.font      = '12px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(labels[i] ?? '', labelW - 5, y + barH / 2 + 3.5);

      ctx.font      = 'bold 12px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      const valX = labelW + w + 4;
      ctx.fillStyle = col;
      ctx.fillText(this.fmtK(vals[i]), valX, y + barH / 2 + 3.5);
    }
  }

  // ── Bubble chart ─────────────────────────────────────────────────────────────
  drawBubble(
    el: HTMLCanvasElement,
    bubbles: { x: number; y: number; r: number; color: string; label: string }[]
  ): void {
    const ctx = el.getContext('2d')!;
    const W   = el.width;
    const H   = el.height;
    const P   = { l: 68, r: 16, t: 14, b: 58 };
    ctx.clearRect(0, 0, W, H);
    if (!bubbles.length) return;

    const xs   = bubbles.map(b => b.x);
    const ys   = bubbles.map(b => b.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rx   = maxX - minX || 1;
    const ry   = maxY - minY || 1;

    const sx = (x: number) => P.l + ((x - minX) / rx) * (W - P.l - P.r);
    const sy = (y: number) => P.t + (1 - (y - minY) / ry) * (H - P.t - P.b);

    ctx.beginPath();
    ctx.moveTo(P.l, P.t);
    ctx.lineTo(P.l, H - P.b);
    ctx.strokeStyle = 'rgba(128,128,128,0.18)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(P.l, H - P.b);
    ctx.lineTo(W - P.r, H - P.b);
    ctx.stroke();

    for (let i = 0; i <= 4; i++) {
      const v = minY + (maxY - minY) * (1 - i / 4);
      const y = P.t + (i / 4) * (H - P.t - P.b);
      ctx.beginPath();
      ctx.moveTo(P.l, y);
      ctx.lineTo(W - P.r, y);
      ctx.strokeStyle = 'rgba(128,128,128,0.07)';
      ctx.setLineDash([2, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = this.axisLabelColor();
      ctx.font      = 'bold 12px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(this.fmtK(v), P.l - 5, y + 3);
    }

    for (let i = 0; i <= 4; i++) {
      const v = minX + (maxX - minX) * (i / 4);
      const x = P.l + (i / 4) * (W - P.l - P.r);
      ctx.fillStyle = this.axisLabelColor();
      ctx.font      = 'bold 12px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.fmtK(v), x, H - P.b + 13);
    }

    for (const b of bubbles) {
      ctx.beginPath();
      ctx.arc(sx(b.x), sy(b.y), b.r, 0, 2 * Math.PI);
      ctx.fillStyle = this.hexAlpha(b.color, 0.22);
      ctx.fill();
      ctx.strokeStyle = b.color;
      ctx.lineWidth   = 2;
      ctx.stroke();
      ctx.fillStyle  = b.color;
      ctx.font       = `bold 11px Plus Jakarta Sans, sans-serif`;
      ctx.textAlign  = 'center';
      ctx.fillText(b.label, sx(b.x), sy(b.y) + 4);
    }
  }

  fmtK(v: number): string {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
    if (v >= 1_000)     return (v / 1_000).toFixed(0) + 'K';
    return v.toFixed(0);
  }

  hexAlpha(hex: string, alpha: number): string {
    if (hex.startsWith('rgba')) return hex;
    if (hex.startsWith('rgb(')) return hex.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  private desaturate(hex: string, amount: number): string {
    if (!hex.startsWith('#')) return hex;
    const h = hex.replace('#','');
    const r = parseInt(h.slice(0,2),16);
    const g = parseInt(h.slice(2,4),16);
    const b = parseInt(h.slice(4,6),16);
    const gray = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
    const nr = Math.round(r + (gray - r) * amount);
    const ng = Math.round(g + (gray - g) * amount);
    const nb = Math.round(b + (gray - b) * amount);
    return `rgb(${nr},${ng},${nb})`;
  }

  private heatColor(t: number): string {
    const r = Math.round(255 * (1 - t));
    const g = Math.round(180 * t);
    return `rgb(${r},${g},60)`;
  }
}