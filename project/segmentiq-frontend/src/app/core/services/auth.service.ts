import { Injectable, signal, computed } from '@angular/core';
import { AuthUser } from '../../features/login/login.component';

/**
 * AuthService — Sécurisé
 * ─────────────────────────────────────────────────────────────────────────────
 * FIX v2 : AppComponent gère sa propre session dans localStorage (clé siq_user).
 * Au refresh, AppComponent relit siq_user mais n'injectait jamais l'utilisateur
 * dans AuthService → isAdmin() restait false → tous les boutons cachés.
 *
 * Solution : deux méthodes synchrones loginLocal() / logoutLocal() permettent
 * à AppComponent de synchroniser AuthService immédiatement au démarrage.
 */

@Injectable({ providedIn: 'root' })
export class AuthService {

  private readonly _user = signal<AuthUser | null>(null);

  readonly user    = this._user.asReadonly();
  readonly role    = computed(() => this._user()?.role ?? null);
  readonly isAdmin = computed(() => this._user()?.role === 'admin');

  // ✅ FIX : Injection directe de l'utilisateur (utilisé par AppComponent au démarrage)
  loginLocal(user: AuthUser): void {
    this._user.set(user);
  }

  // ✅ FIX : Réinitialisation directe (utilisé par AppComponent au logout)
  logoutLocal(): void {
    this._user.set(null);
  }

  // ── Login via backend — le cookie HttpOnly est posé par le serveur ─────────
  async loginWithApi(email: string, password: string): Promise<AuthUser> {
    const res = await fetch('/api/auth/login', {
      method:      'POST',
      headers:     { 'Content-Type': 'application/json' },
      credentials: 'include',
      body:        JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail ?? 'Email ou mot de passe incorrect');
    }
    const data = await res.json();
    const user: AuthUser = { email, role: data.role, name: data.name };
    this._user.set(user);
    return user;
  }

  // ── Vérifie la session auprès du backend (utile après un refresh de page) ──
  async restoreSession(): Promise<void> {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        this._user.set({ email: data.email, role: data.role, name: data.name });
      } else {
        this._user.set(null);
      }
    } catch {
      this._user.set(null);
    }
  }

  // ── Logout : invalide le cookie côté serveur ───────────────────────────────
  async logout(): Promise<void> {
    await fetch('/api/auth/logout', {
      method: 'POST', credentials: 'include',
    }).catch(() => {});
    this._user.set(null);
  }

  authFetchOptions(extra: RequestInit = {}): RequestInit {
    return {
      ...extra,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(extra.headers ?? {}) },
    };
  }

  authHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json' };
  }

  isSessionValid(): boolean {
    return this._user() !== null;
  }
}