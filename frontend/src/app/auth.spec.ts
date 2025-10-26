import { Injectable, signal, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

interface User {
  userId: number;
  username: string;
}

const USER_STORAGE_KEY = 'currentUserData';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  currentUser = signal<User | null>(null);
  
  private isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);
    this.loadUserFromStorage();
  }

  private loadUserFromStorage() {
    if (this.isBrowser) {
      const storedUser = localStorage.getItem(USER_STORAGE_KEY);
      if (storedUser) {
        try {
          const user: User = JSON.parse(storedUser);
          this.currentUser.set(user);
          console.log('AuthService: Benutzer aus localStorage geladen', this.currentUser());
        } catch (e) {
          console.error('AuthService: Fehler beim Parsen der gespeicherten Benutzerdaten', e);
          localStorage.removeItem(USER_STORAGE_KEY);
        }
      }
    }
  }

  login(userData: User) {
    this.currentUser.set(userData);
    if (this.isBrowser) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData)); 
    }
    console.log('AuthService: Benutzer eingeloggt und gespeichert', this.currentUser());
  }

  logout() {
    this.currentUser.set(null);
    if (this.isBrowser) {
      localStorage.removeItem(USER_STORAGE_KEY);
    }
    console.log('AuthService: Benutzer ausgeloggt und Speicher bereinigt');
  }


  isLoggedIn(): boolean {
    return this.currentUser() !== null;
  }

  getUsername(): string | null {
    return this.currentUser()?.username ?? null; 
  }

  getUserId(): number | null {
      return this.currentUser()?.userId ?? null;
  }
}