import { Component, inject, signal, computed, WritableSignal, Signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';

// Interfaces für die empfangenen Daten
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
// Erweitertes Interface für Profildaten
interface ProfileData {
  userId: number;
  username: string;
  avatarUrl: string | null;
  personalColor: string;
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

  // Signale für die Ansicht
  userId: WritableSignal<number> = signal(0);
  username: WritableSignal<string> = signal('');
  avatarUrl: WritableSignal<string | null> = signal(null);
  personalColor: WritableSignal<string> = signal('#FFFFFF');
  olympiadeHistory: WritableSignal<OlympiadeHistory[]> = signal([]);
  kniffelHistory: WritableSignal<KniffelHistory[]> = signal([]);
  errorMessage: WritableSignal<string | null> = signal(null);
  uploadMessage: WritableSignal<string | null> = signal(null);

  // "owner" wird ein 'computed' Signal
  owner: Signal<boolean> = computed(() => {
    return this.userId() > 0 && this.userId() === this.authService.getUserId();
  });

  constructor() {
    this.route.params.subscribe(params => {
      const id = parseInt(params['id'], 10);
      if (isNaN(id)) {
        this.errorMessage.set("Ungültiges Profil.");
        return;
      }
      this.userId.set(id);
      this.fetchProfileData(id);
    });
  }

  fetchProfileData(id: number) {
    this.errorMessage.set(null);
    this.http.get<ProfileData>(`/api/profile/${id}`).subscribe({
      next: (data) => {
        this.username.set(data.username);
        this.avatarUrl.set(data.avatarUrl);
        this.personalColor.set(data.personalColor || '#FFFFFF');
        this.olympiadeHistory.set(data.olympiadeHistory);
        this.kniffelHistory.set(data.kniffelHistory);
      },
      error: (err) => {
        console.error("Fehler beim Abrufen der Profildaten:", err);
        this.errorMessage.set(err.error?.message || 'Profil konnte nicht geladen werden.');
      }
    });
  }

  // NEU: Wird aufgerufen, wenn eine Datei ausgewählt wird
  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }
    const file = input.files[0];
    if (file.size > 2 * 1024 * 1024) { // 2MB Limit
       this.uploadMessage.set("Fehler: Datei ist zu groß (max. 2MB).");
       return;
    }

    const formData = new FormData();
    formData.append('avatar', file, file.name);

    this.uploadMessage.set("Lade Bild hoch...");

    // POST an den neuen Endpunkt, :id wird aus dem Signal genommen
    this.http.post<{ message: string, avatarUrl: string }>(`/api/profile/${this.userId()}/avatar`, formData)
      .subscribe({
        next: (res) => {
          this.avatarUrl.set(res.avatarUrl); // Avatar-Signal direkt aktualisieren
          this.uploadMessage.set("Profilbild erfolgreich geändert!");
        },
        error: (err) => {
          console.error("Avatar-Upload-Fehler:", err);
          this.uploadMessage.set(err.error?.error || 'Upload fehlgeschlagen.');
        }
      });
  }

  // NEU: Wird aufgerufen, wenn sich die Farbe ändert (beim Loslassen)
  onColorChange(event: Event) {
    const newColor = (event.target as HTMLInputElement).value;
    this.personalColor.set(newColor); // Optimistisches Update der UI

    this.http.put(`/api/profile/${this.userId()}/color`, { color: newColor })
      .subscribe({
        next: () => {
          console.log("Farbe gespeichert");
        },
        error: (err) => {
          console.error("Farbe-Speichern-Fehler:", err);
          this.uploadMessage.set("Fehler beim Speichern der Farbe.");
          // Hier könnte man die Farbe auf den alten Wert zurücksetzen
        }
      });
  }

  // Logout-Funktion
  logout() {
    this.authService.logout();
    this.router.navigate(['/']);
  }
}