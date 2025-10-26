import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

interface Game {
  id: number;
  name: string;
}

@Component({
  selector: 'app-oly',
  imports: [CommonModule, FormsModule],
  templateUrl: './oly.html',
  styleUrl: './oly.css'
})
export class Oly implements OnInit {
  router = inject(Router);
  http = inject(HttpClient);

  availableGames: Game[] = [];
  selectedGames: Game[] = [];
  newGameName: string = '';

  isLoadingGames: boolean = false;
  errorMessage: string | null = null;

  ngOnInit(): void {
      this.loadAvalilableGames();
  }

  loadAvalilableGames(): void {
    this.isLoadingGames = true;
    this.errorMessage = null;

    this.http.get<Game[]>('/api/games').subscribe({
      next: (games) => {
        this.availableGames = games;
        this.isLoadingGames = false;
        console.log('Spiele geladen:', this.availableGames);
      },
      error: (error) => {
        this.errorMessage = 'Fehler beim Laden der Spiele.';
        this.isLoadingGames = false;
        console.error('Fehler beim Laden der Spiele:', error);
      }
    });
  }

  addGame() {
    const trimmedName = this.newGameName.trim();
    if (!trimmedName) return;

    if(this.availableGames.find(g => g.name.toLowerCase() === trimmedName.toLowerCase())) {
      this.errorMessage = 'Spiel mit diesem Namen existiert bereits.';
      return;
    }

    this.errorMessage = null;
    this.http.post<Game>('/api/games', { name: trimmedName }).subscribe({
      next: (game) => {
        this.availableGames.push(game);
        this.newGameName = '';
        console.log('Spiel hinzugefügt:', game);
      },
      error: (error) => {
        console.error('Fehler beim Hinzufügen des Spiels:', error);
        if (error.status === 409) { 
          this.errorMessage = 'Spiel mit diesem Namen existiert bereits.';
           if (!this.availableGames.some(game => game.name.toLowerCase() === trimmedName.toLowerCase())) {
          this.loadAvalilableGames();
        }
        } else {
          this.errorMessage = 'Fehler beim Hinzufügen des Spiels.';
        }
        this.newGameName = '';
      }
    });
  }

  selectGame(game: Game) {
    if (!this.selectedGames.some(selected => selected.id === game.id)) {
      this.selectedGames.push(game);
    }
  }

  isSelected(game: Game): boolean {
    return this.selectedGames.some(selected => selected.id === game.id);
  }

  removeSelectedGame(gameToRemove: Game) {
    this.selectedGames = this.selectedGames.filter(game => game.id !== gameToRemove.id);
  }

  startOlympiade() {
    if (this.selectedGames.length > 0) {
      console.log('Olympiade gestartet mit Spielen:', this.selectedGames.map(g => g.name));
      const gameIds = this.selectedGames.map(g => g.id).join(',');
      this.router.navigate(['/oly-session'], { queryParams: { games: gameIds } });
    } else {
      alert('Bitte wählen Sie mindestens ein Spiel aus, um die Olympiade zu starten.');
    }
  }
}
