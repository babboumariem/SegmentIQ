import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-metric-card',
  standalone: true,
  templateUrl: './metric-card.component.html',
  styleUrls: ['./metric-card.component.scss']
})
export class MetricCardComponent {
  @Input() segName = '';
  @Input() icon = '';
  @Input() color = '';
  @Input() value = '';
  @Input() label = '';
  @Input() secondary = '';
}
