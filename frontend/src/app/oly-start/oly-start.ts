import { Component, effect, inject, Injector, OnDestroy, OnInit, signal, ChangeDetectorRef, DestroyRef, computed, Signal } from '@angular/core';
import { Router } from '@angular/router';
import { OlympiadeState } from '../olympiade-state';
import { CommonModule } from '@angular/common';
import { filter, pairwise, startWith, Subscription, tap } from 'rxjs';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../auth';
import { SocketService } from '../socket';

interface Game {
  id: number;
  name: string;
}

interface Player {
  userId: number;
  username: string;
  score: number;
}

interface OlympiadeResult {
    gameId: number;
    round: number;
    winnerUserId: number;
    pointsAwarded: number;
}


@Component({
  selector: 'app-olympiade-start',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './oly-start.html',
  styleUrl: './oly-start.css'
})
export class OlyStart implements OnInit, OnDestroy {
  router = inject(Router);
  olyStateService = inject(OlympiadeState);
  authService = inject(AuthService); // AuthService injecten
  injector = inject(Injector);
  cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  socketService = inject(SocketService)

  // --- Signale aus dem State Service direkt verwenden ---
  isLoading = this.olyStateService.isLoading;
  isActive = this.olyStateService.isActive;
  players = this.olyStateService.players;
  selectedGamesList = this.olyStateService.selectedGamesList;
  currentGameIndex = this.olyStateService.currentGameIndex;
  results = this.olyStateService.results;

   // --- Abgeleitete Signale (Computed Signals) ---
  currentUser = this.authService.currentUser; // Signal für den aktuellen Benutzer
  isCurrentUserJoined = computed(() => {
      const user = this.currentUser();
      return user ? this.players().some(p => p.userId === user.userId) : false;
  });
  currentGame: Signal<Game | null> = computed(() => {
      const index = this.currentGameIndex();
      const games = this.selectedGamesList();
      return (index >= 0 && index < games.length) ? games[index] : null;
  });
  nextGameIndex: Signal<number> = computed(() => this.results().length); // Nächstes Spiel = Anzahl gespielter Spiele
  canSelectNextGame: Signal<boolean> = computed(() =>
      this.isActive() && this.results().length < this.selectedGamesList().length
  );
  canDeclareWinner: Signal<boolean> = computed(() => {
     const currentIdx = this.currentGameIndex();
     const resultsLen = this.results().length;
     const gamesLen = this.selectedGamesList().length;
     return this.isActive() && currentIdx >= 0 && currentIdx === resultsLen && resultsLen < gamesLen;
  });
  isOlympiadeFinished: Signal<boolean> = computed(() =>
    this.isActive() && this.results().length === this.selectedGamesList().length && this.selectedGamesList().length > 0
  );

  // --- Subscriptions ---
  private isActiveSubscription: Subscription | null = null;

  constructor() {
    // Initial prüfen, ob der User beitreten sollte, falls die Seite neu geladen wird
     effect(() => {
        if (!this.isLoading() && this.isActive() && this.currentUser() && !this.isCurrentUserJoined()) {
            console.log("OlyStart: Olympiade aktiv, User eingeloggt aber nicht beigetreten. Trete automatisch bei.");
            this.joinGame();
        }
     }, { allowSignalWrites: true }); // Erlaube das Setzen von Signalen im Effekt (für joinGame)
    }


  ngOnInit(): void {
    console.log('OlyStart OnInit');

    // Umleitung, wenn Olympiade beendet wird
    this.isActiveSubscription = toObservable(this.isActive, { injector: this.injector }).pipe(
        takeUntilDestroyed(this.destroyRef),
        startWith(this.isActive()), // Initialen Wert berücksichtigen
        pairwise(),
        filter(([prevIsActive, currIsActive]) => prevIsActive === true && currIsActive === false),
        tap(() => console.log('Olympiade wurde beendet, leite zu / um'))
    ).subscribe(() => {
        this.router.navigate(['/']);
    });
  }

  joinGame(): void {
    const user = this.currentUser();
    if (user && this.isActive() && !this.isCurrentUserJoined()) {
      console.log(`Versuche beizutreten als: ${user.username}`);
      this.olyStateService.joinOlympiade({ userId: user.userId, username: user.username });
    } else if (!user) {
        console.error("Nicht eingeloggt, kann nicht beitreten.");
        // Optional: Zum Login leiten
        // this.router.navigate(['/login']);
    } else if (!this.isActive()) {
        console.warn("Keine aktive Olympiade zum Beitreten.");
    }
  }

  selectGameManually(gameId: number): void {
      if (this.canSelectNextGame()) {
          this.olyStateService.selectNextGame('manual', gameId);
      }
  }

  selectGameRandomly(): void {
      if (this.canSelectNextGame()) {
          console.log("Zufälliges Spiel auswählen...");
           // Der Server wird das Rad drehen und das Ergebnis per 'olympiadeStatusUpdate' senden
           this.olyStateService.selectNextGame('random');
      }
  }

  declareWinner(playerId: number): void {
    if (this.canDeclareWinner()) {
        this.olyStateService.declareWinner(playerId);
    }
  }

  finishOlympiade(): void {
    console.log('Beende Olympiade manuell...');
    this.olyStateService.endOlympiade();
    // Die Umleitung erfolgt durch das isActiveSubscription
  }

  getGameName(gameId: number): string {
      return this.selectedGamesList().find(g => g.id === gameId)?.name ?? `Spiel ID ${gameId}`;
  }

  getWinnerName(userId: number): string {
      return this.players().find(p => p.userId === userId)?.username ?? `Benutzer ID ${userId}`;
  }

  isGamePlayed(gameId: number): boolean {
      return this.results().some(r => r.gameId === gameId);
  }

  getResultForGame(gameId: number): OlympiadeResult | undefined {
    return this.results().find(r => r.gameId === gameId);
  }

  ngOnDestroy(): void {
    console.log("OlyStart Component destroyed.");
  }
}