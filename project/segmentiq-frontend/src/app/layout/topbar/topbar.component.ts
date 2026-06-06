import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavService } from '../../core/services/nav.service';
import { DataService } from '../../core/services/data.service';
import { ThemeService } from '../../core/services/theme.service';
import { NotificationBellComponent } from './notification-bell.component';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, NotificationBellComponent],
  templateUrl: './topbar.component.html',
  styleUrls: ['./topbar.component.scss']
})
export class TopbarComponent implements OnInit {
  dateStr = '';
  constructor(public nav: NavService, public data: DataService, public theme: ThemeService) {}
  ngOnInit(): void {
    this.dateStr = new Date().toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  }
}