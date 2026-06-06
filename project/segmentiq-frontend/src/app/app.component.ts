// src/app/app.component.ts
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavService } from './core/services/nav.service';
import { DataService } from './core/services/data.service';
import { AuthService } from './core/services/auth.service';
import { CampaignsComponent } from './features/campaigns/campaigns.component';

import { TopbarComponent }  from './layout/topbar/topbar.component';
import { SidebarComponent } from './layout/sidebar/sidebar.component';
import { LoginComponent, AuthUser } from './features/login/login.component';
import { DashboardComponent }   from './features/dashboard/dashboard.component';
import { SegmentsComponent }    from './features/segments/segments.component';
import { CustomersComponent }   from './features/customers/customers.component';
import { ReportComponent }      from './features/report/report.component';
import { BehaviorComponent }    from './features/behavior/behavior.component';
import { ParamsComponent }      from './features/params/params.component';
import { Fe51Component } from './features/feature-engineering/spending-value/spending-value.component';
import { Fe52Component } from './features/feature-engineering/frequency/frequency.component';
import { Fe53Component } from './features/feature-engineering/category-affinity/category-affinity.component';
import { Fe54Component } from './features/feature-engineering/seasonality/seasonality.component';
import { Fe55Component } from './features/feature-engineering/price-discount/price-discount.component';
import { Fe56Component } from './features/feature-engineering/returns/returns.component';
import { Fe57Component } from './features/feature-engineering/normalization/normalization.component';
import { ChatbotComponent } from './features/chatbot/chatbot.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    TopbarComponent, SidebarComponent, LoginComponent,
    DashboardComponent, SegmentsComponent, CustomersComponent,
    ReportComponent, BehaviorComponent, ParamsComponent,
    Fe51Component, Fe52Component, Fe53Component, Fe54Component,
    Fe55Component, Fe56Component, Fe57Component,
    ChatbotComponent, CampaignsComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  private readonly LS_USER = 'siq_user';
  private readonly LS_PAGE = 'siq_page';

  user = signal<AuthUser | null>(this._restoreUser());

  constructor(public nav: NavService, public data: DataService, private auth: AuthService) {
    // ✅ FIX : Synchroniser AuthService avec la session stockée dès le démarrage
    // Sans ça, isAdmin() reste false après un refresh même si l'utilisateur est admin
    const restoredUser = this._restoreUser();
    if (restoredUser) {
      // Injecter l'utilisateur directement dans AuthService via loginLocal
      this.auth.loginLocal(restoredUser);
    }

    // Restaure la page active au refresh
    const savedPage = localStorage.getItem(this.LS_PAGE) as any;
    if (this.user() && savedPage) {
      this.nav.navigate(savedPage);
    }
  }

  private _restoreUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem(this.LS_USER);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  onLogin(u: AuthUser): void {
    localStorage.setItem(this.LS_USER, JSON.stringify(u));
    this.user.set(u);
    // ✅ FIX : Synchroniser AuthService au login
    this.auth.loginLocal(u);
    this.nav.navigate('dashboard');
  }

  onLogout(): void {
    localStorage.removeItem(this.LS_USER);
    localStorage.removeItem(this.LS_PAGE);
    this.user.set(null);
    // ✅ FIX : Réinitialiser AuthService au logout
    this.auth.logoutLocal();
    this.nav.navigate('dashboard');
  }
}