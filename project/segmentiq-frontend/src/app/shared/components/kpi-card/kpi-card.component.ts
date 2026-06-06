// src/app/shared/components/kpi-card/kpi-card.component.ts
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './kpi-card.component.html',
  styleUrls: ['./kpi-card.component.scss']
})
export class KpiCardComponent {
  @Input() icon = '';
  @Input() tag = '';
  @Input() label = '';
  @Input() value = '';
  @Input() sub = '';
  @Input() color = 'var(--am)';
  @Input() colorBg = 'var(--aml)';
}
