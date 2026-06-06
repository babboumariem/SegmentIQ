// src/app/layout/topbar/notification-bell.component.ts
import {
  Component, HostListener, signal, inject, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavService } from '../../core/services/nav.service';
import { NotificationService, SmartNotification } from '../../core/services/notification.service';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-bell.component.html',
  styleUrls: ['./notification-bell.component.scss']
})
export class NotificationBellComponent {
  notif = inject(NotificationService);
  nav   = inject(NavService);
  el    = inject(ElementRef);

  open = signal(false);

  toggle(): void { this.open.update(v => !v); }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (!this.el.nativeElement.contains(e.target as Node)) {
      this.open.set(false);
    }
  }

  onItemClick(n: SmartNotification): void { this.notif.markRead(n.id); }

  onAction(e: MouseEvent, n: SmartNotification): void {
    e.stopPropagation();
    this.notif.markRead(n.id);
    if (n.actionPage) this.nav.navigate(n.actionPage as any);
    this.open.set(false);
  }

  markAll(): void { this.notif.markAllRead(); }

  dismiss(e: MouseEvent, id: string): void {
    e.stopPropagation();
    this.notif.dismiss(id);
  }
}
