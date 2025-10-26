import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject, OnInit, signal, TrackByFunction, WritableSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { OlympiadeState } from '../olympiade-state';

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
  cdr = inject(ChangeDetectorRef);
  olyStateService = inject(OlympiadeState);

  availableGames: WritableSignal<Game[]> = signal([]);
  selectedGames: WritableSignal<Game[]> = signal([]);
  newGameName: WritableSignal<string> = signal('');
  isLoadingGames: WritableSignal<boolean> = signal(true);
  errorMessage: WritableSignal<string | null> = signal(null);

  ngOnInit(): void {
      this.loadAvalilableGames();
  }

  gameTrackBy: TrackByFunction<Game> = (index: number, game: Game): number => {
    return game.id;
  };

  loadAvalilableGames(): void {
    this.isLoadingGames.set(true);
    this.errorMessage.set(null);

    this.http.get<Game[]>('/api/games').subscribe({
      next: (games) => {
        this.availableGames.set(games);
        this.isLoadingGames.set(false);
        console.log('Spiele geladen:', this.availableGames);
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.errorMessage.set('Fehler beim Laden der Spiele.');
        this.isLoadingGames.set(false);
        console.error('Fehler beim Laden der Spiele:', error);
        this.cdr.detectChanges();
      }
    });
  }

  addGame() {
    const trimmedName = this.newGameName().trim();
    if (!trimmedName) return;

    if(this.availableGames().find(g => g.name.toLowerCase() === trimmedName.toLowerCase())) {
      this.errorMessage.set('Spiel mit diesem Namen existiert bereits.');
      return;
    }

    this.errorMessage.set(null);
    this.http.post<Game>('/api/games', { name: trimmedName }).subscribe({
      next: (newGame) => {
        this.availableGames.update(games => {
          const updatedGames = [...games, newGame];
          return updatedGames;
        });
        this.newGameName.set('');
        console.log('Spiel hinzugefügt:', newGame);

        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Fehler beim Hinzufügen des Spiels:', error);
        let errMsg = 'Fehler beim Hinzufügen des Spiels.';
        if (error.status === 409) { 
          this.errorMessage.set('Ein Spiel mit diesem Namen existiert bereits (vom Server geprüft).');
           if (!this.availableGames().some(game => game.name.toLowerCase() === trimmedName.toLowerCase())) {
          this.loadAvalilableGames();
        }
        } else {
          this.errorMessage.set('Fehler beim Hinzufügen des Spiels.');
        }
        this.newGameName.set('');
        this.cdr.detectChanges();
      }
    });
  }

selectGame(game: Game) {
    this.selectedGames.update(games => {
        if (!games.some(selected => selected.id === game.id)) {
            return [...games, game];
        }
        return games;
    });
    this.cdr.detectChanges();
  }

  isGameSelected(gameToCheck: Game): boolean {
    return this.selectedGames().some(g => g.id === gameToCheck.id);
  }

  removeSelectedGame(gameToRemove: Game) {
    this.selectedGames.update(games => 
      games.filter(game => game.id !== gameToRemove.id)
    );
    this.cdr.detectChanges();
  }

  startOlympiade() {
    if (this.selectedGames().length > 0) {
      const gameIds = this.selectedGames().map(g => g.id).join(',');
      console.log('Starte Olympiade mit Spielen:', gameIds);

      this.olyStateService.startOlympiade(gameIds);

      this.router.navigate(['/olympiade-start'], { queryParams: { games: gameIds } });
    } else {
      alert('Bitte wählen Sie mindestens ein Spiel aus, um die Olympiade zu starten.');
    }
  }
}
