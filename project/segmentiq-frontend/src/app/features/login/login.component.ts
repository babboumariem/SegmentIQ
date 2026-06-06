import { Component, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../core/services/theme.service';
import { AuthService } from '../../core/services/auth.service';

export type UserRole = 'admin' | 'analyst';
export interface AuthUser { email: string; role: UserRole; name: string; }

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  loggedIn = output<AuthUser>();
  email=''; password=''; remember=false; showPwd=false; loading=false; globalError='';
  errors: {email:string;password:string} = {email:'',password:''};

  constructor(public theme: ThemeService, private authSvc: AuthService) {}

  // ── Pré-remplit UNIQUEMENT l'email du compte demo, jamais le mot de passe ──
  // L'authentification reste toujours vérifiée côté serveur (JWT).
  fillDemo(role: 'admin'|'analyst') {
    this.email = role === 'admin' ? 'admin@the3beez.com' : 'analyst@the3beez.com';
    this.password = '';
    this.errors = {email:'', password:''}; this.globalError = '';
  }

  async onSubmit() {
    this.validate();
    if (this.errors.email || this.errors.password) return;
    this.loading = true; this.globalError = '';
    try {
      // Authentification UNIQUEMENT via le backend (JWT) — aucun fallback local
      const user = await this.authSvc.loginWithApi(this.email, this.password);
      this.loggedIn.emit(user);
    } catch (apiErr: any) {
      this.globalError = apiErr?.message ?? 'Incorrect email or password. Please try again.';
    } finally {
      this.loading = false;
    }
  }

  private validate() {
    this.errors = {email:'', password:''};
    if (!this.email) this.errors.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email)) this.errors.email = 'Invalid email format.';
    if (!this.password) this.errors.password = 'Password is required.';
    else if (this.password.length < 6) this.errors.password = 'Minimum 6 characters.';
  }
}