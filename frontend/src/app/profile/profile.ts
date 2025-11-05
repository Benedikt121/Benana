import { Component, inject, signal, computed, WritableSignal, Signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';

interface OlympiadeHistory {
  id: number;
  olympiade_id: number;
  user_id: number;
  final_score: number;
}
interface KniffelHistory {
  id: number;
  game_id: number;
  user_id: number;
  grand_total: number;
}
interface ProfileData {
  userId: number;
  username: string;
  olympiadeHistory: OlympiadeHistory[];
  kniffelHistory: KniffelHistory[];
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile.html',
  styleUrl: './profile.css'
})
export class Profile {

  private authService = inject(AuthService);
  private http = inject(HttpClient);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  userId: WritableSignal<number> = signal(0);
  username: WritableSignal<string> = signal('');
  olympiadeHistory: WritableSignal<OlympiadeHistory[]> = signal([]);
  kniffelHistory: WritableSignal<KniffelHistory[]> = signal([]);
  errorMessage: WritableSignal<string | null> = signal(null);

  owner: Signal<boolean> = computed(() => {
    return this.userId() > 0 && this.userId() === this.authService.getUserId();
  });

  constructor() {
    // Auf Parameter-Änderungen in der URL reagieren
    this.route.params.subscribe(params => {
      const id = parseInt(params['id'], 10);
      if (isNaN(id)) {
        this.errorMessage.set("Ungültiges Profil.");
        return;
      }
      
      // ID im Signal setzen
      this.userId.set(id);
      
      // Datenabruf für diese ID starten
      this.fetchProfileData(id);
    });
  }

  fetchProfileData(id: number) {
    this.errorMessage.set(null);
    this.http.get<ProfileData>(`/api/profile/${id}`).subscribe({
      next: (data) => {
        this.username.set(data.username);
        this.olympiadeHistory.set(data.olympiadeHistory);
        this.kniffelHistory.set(data.kniffelHistory);
      },
      error: (err) => {
        console.error("Fehler beim Abrufen der Profildaten:", err);
        this.errorMessage.set(err.error?.message || 'Profil konnte nicht geladen werden.');
      }
    });
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/']);
  }
}