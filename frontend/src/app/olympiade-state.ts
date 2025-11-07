import { Injectable, signal, inject, WritableSignal, effect, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap, catchError, of, Subscription } from 'rxjs';
import { SocketService } from './socket';

// Interfaces definieren
interface Game {
  id: number;
  name: string;
}

interface Player {
  userId: number;
  username: string;
  score: number;
  avatarUrl?: string | null;
  personalColor?: string;
}

interface OlympiadeResult {
  gameId: number;
  round: number;
  winnerUserId: number;
  pointsAwarded: number;
}

interface OlympiadeStatus {
  isActive: boolean;
  gameIds: string | null;
  selectedGamesList: Game[];
  players: Player[];
  currentGameIndex: number;
  results: OlympiadeResult[];
}

@Injectable({
  providedIn: 'root'
})
export class OlympiadeState implements OnDestroy {
  private http = inject(HttpClient);
  private socketService = inject(SocketService);

  isActive: WritableSignal<boolean> = signal(false);
  activeGameIds: WritableSignal<string | null> = signal(null);
  selectedGamesList: WritableSignal<Game[]> = signal([]);
  players: WritableSignal<Player[]> = signal([]);
  currentGameIndex: WritableSignal<number> = signal(-1);
  results: WritableSignal<OlympiadeResult[]> = signal([]);
  isLoading: WritableSignal<boolean> = signal(true);

  private stateUpdateSubscription: Subscription | null = null;
  private errorSubscription: Subscription | null = null;
  private finishedSubscription: Subscription | null = null;


  constructor() {
    this.fetchInitialState();

    this.stateUpdateSubscription = this.socketService.listen<OlympiadeStatus>('olympiadeStatusUpdate')
      .subscribe((status) => {
        console.log('>>> OlympiadeStateService: Event "olympiadeStatusUpdate" erhalten:', status);
        this.updateState(status);
        if (this.isLoading()) {
          this.isLoading.set(false);
        }
      });

    this.errorSubscription = this.socketService.listen<{ message: string }>('olympiadeError')
      .subscribe((error) => {
        console.error('Olympiade-Fehler vom Server erhalten:', error.message);
        alert(`Olympiade-Fehler: ${error.message}`);
      });

    this.finishedSubscription = this.socketService.listen<{ results: OlympiadeResult[], players: Player[] }>('olympiadeFinished')
        .subscribe((data) => {
            console.log('Olympiade beendet!', data);
            alert(`Olympiade beendet! Gewinner ist (einfache Logik): ${this.getWinnerUsername(data.players)}`);
        });

        
    effect(() => {
      console.log(`OlympiadeState Update: Active=${this.isActive()}, Players=${this.players().length}, CurrentGameIndex=${this.currentGameIndex()}, Results=${this.results().length}`);
    });
  }

   // Hilfsfunktion für Alert
  private getWinnerUsername(players: Player[]): string {
      if (!players || players.length === 0) return 'Niemand';
      const winner = players.reduce((prev, current) => (prev.score > current.score) ? prev : current);
      return winner.username;
  }

  fetchInitialState(): void {
    this.isLoading.set(true);
    // GET /api/olympiade/status sollte jetzt das erweiterte Status-Objekt zurückgeben
    this.http.get<OlympiadeStatus>('/api/olympiade/status').pipe(
      tap((status) => {
         // Nur updaten, wenn wir noch laden, um Race Conditions mit Socket-Updates zu vermeiden
         if (this.isLoading()) {
           this.updateState(status);
         }
      }),
      catchError((error) => {
        console.error('Fehler beim Abrufen des initialen Olympiade-Status:', error);
        if (this.isLoading()) {
            // Setze auf leeren, inaktiven Status
            this.updateState({
                isActive: false, gameIds: null, selectedGamesList: [],
                players: [], currentGameIndex: -1, results: []
            });
        }
        return of(null); // Fehler behandeln, Observable vervollständigen
      })
    ).subscribe(() => {
         if (this.isLoading()) {
            this.isLoading.set(false); // Ladevorgang abschließen
         }
    });
  }

  // --- Methoden zum Senden von Events ---
  startOlympiade(gameIds: string): void {
    if (!this.isActive()) { // Nur starten, wenn nicht schon aktiv
       this.socketService.emit('startOlympiade', { gameIds });
    } else {
       console.warn("Versuch, eine bereits laufende Olympiade zu starten.");
    }
  }

  joinOlympiade(user: { userId: number, username: string }): void {
      if (this.isActive() && user) {
          this.socketService.emit('joinOlympiade', user);
      } else {
          console.error("Kann nicht beitreten: Keine aktive Olympiade oder keine Benutzerdaten.");
      }
  }

  selectNextGame(type: 'manual' | 'random', gameId?: number): void {
      if (this.isActive()) {
          this.socketService.emit('selectNextGame', { type, gameId });
      }
  }

  declareWinner(winnerUserId: number): void {
      if (this.isActive() && this.currentGameIndex() >= 0) {
          this.socketService.emit('declareWinner', { winnerUserId });
      }
  }

  endOlympiade(): void {
     if (this.isActive()) {
        this.socketService.emit('endOlympiade');
     }
  }

  // --- Interne Update-Logik ---
  private updateState(status: OlympiadeStatus | null): void {
    console.log('>>> OlympiadeStateService: updateState aufgerufen mit:', status);
    if (status) {
      this.isActive.set(status.isActive);
      this.activeGameIds.set(status.gameIds);
      this.selectedGamesList.set(status.selectedGamesList || []);
      this.players.set(status.players || []);
      this.currentGameIndex.set(status.currentGameIndex ?? -1);
      this.results.set(status.results || []);
    } else {
      // Reset auf Default-Werte
      this.isActive.set(false);
      this.activeGameIds.set(null);
      this.selectedGamesList.set([]);
      this.players.set([]);
      this.currentGameIndex.set(-1);
      this.results.set([]);
    }
  }

  ngOnDestroy(): void {
    console.log("OlympiadeStateService destroyed");
    this.stateUpdateSubscription?.unsubscribe();
    this.errorSubscription?.unsubscribe();
    this.finishedSubscription?.unsubscribe();
  }
}