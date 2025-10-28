import {
  Component, effect, inject, Injector, OnDestroy, OnInit, signal,
  ChangeDetectorRef, DestroyRef, computed, Signal,
  AfterViewInit, // Beibehalten
  ElementRef, // Beibehalten
  viewChild // Beibehalten
} from '@angular/core';
import { Router } from '@angular/router';
import { OlympiadeState } from '../olympiade-state';
import { CommonModule } from '@angular/common';
import { filter, pairwise, startWith, Subscription, tap } from 'rxjs';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../auth';
import { SocketService } from '../socket'; // SocketService importieren

// KEIN Import für Wheel hier

// Deklariere die globale Variable für die Bibliothek
declare var Wheel: any;

// Interfaces (Game, Player, OlympiadeResult) bleiben unverändert
interface Game { id: number; name: string; }
interface Player { userId: number; username: string; score: number; }
interface OlympiadeResult { gameId: number; round: number; winnerUserId: number; pointsAwarded: number; }

@Component({
  selector: 'app-olympiade-start',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './oly-start.html',
  // CSS (wie im vorherigen Schritt, ohne Rad-Animationen)
  styleUrls: ['./oly-start.css']
})
export class OlyStart implements OnInit, OnDestroy, AfterViewInit {
  router = inject(Router);
  olyStateService = inject(OlympiadeState);
  authService = inject(AuthService);
  socketService = inject(SocketService); // SocketService injecten
  injector = inject(Injector);
  cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);

  // --- Container Element Referenz ---
  wheelContainer = viewChild<ElementRef<HTMLDivElement>>('wheelContainer');
  private wheelInstance: any = null;

  // --- Signale (bleiben gleich) ---
  isLoading = this.olyStateService.isLoading;
  isActive = this.olyStateService.isActive;
  players = this.olyStateService.players;
  selectedGamesList = this.olyStateService.selectedGamesList;
  currentGameIndex = this.olyStateService.currentGameIndex;
  results = this.olyStateService.results;
  isSpinning = signal(false);

  // --- Abgeleitete Signale (bleiben gleich) ---
  currentUser = this.authService.currentUser;
  isCurrentUserJoined = computed(() => {
      const user = this.currentUser();
      return user ? this.players().some(p => p.userId === user.userId) : false;
  });
  currentGame: Signal<Game | null> = computed(() => {
      const index = this.currentGameIndex();
      const games = this.selectedGamesList();
      return (index >= 0 && index < games.length) ? games[index] : null;
  });
  nextGameIndex: Signal<number> = computed(() => this.results().length);
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

  private isActiveSubscription: Subscription | null = null;

  ngOnInit(): void {
    console.log('OlyStart OnInit');

    // Umleitung bei Beendigung (bleibt gleich)
    this.isActiveSubscription = toObservable(this.isActive, { injector: this.injector }).pipe(
        takeUntilDestroyed(this.destroyRef),
        startWith(this.isActive()),
        pairwise(),
        filter(([prevIsActive, currIsActive]) => prevIsActive === true && currIsActive === false),
        tap(() => console.log('Olympiade wurde beendet, leite zu / um'))
    ).subscribe(() => {
        this.router.navigate(['/']);
    });

    // Auf Socket-Event für das Drehen hören
    this.socketService.listen<{ targetGameId: number, availableGames: Game[] }>('wheelSpinning')
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(({ targetGameId, availableGames }) => {
            console.log("Event 'wheelSpinning' erhalten. Ziel:", targetGameId);
            // Stelle sicher, dass der Container sichtbar ist (isSpinning=true wird gesetzt)
            // bevor wir versuchen, das Rad zu initialisieren und zu drehen.
            this.isSpinning.set(true);
            this.cdr.detectChanges(); // Warte auf DOM-Update
            // Leichte Verzögerung, um sicherzustellen, dass der Container im DOM ist
            setTimeout(() => {
                this.spinTheWheel(targetGameId, availableGames);
            }, 0);
        });

    // Automatisches Beitreten (bleibt gleich)
    effect(() => {
       if (!this.isLoading() && this.isActive() && this.currentUser() && !this.isCurrentUserJoined()) {
           console.log("OlyStart: Olympiade aktiv, User eingeloggt aber nicht beigetreten. Trete automatisch bei.");
           this.joinGame();
       }
    }, { allowSignalWrites: true });
  }

  ngAfterViewInit(): void {
    // Keine Initialisierung mehr hier, da sie dynamisch in spinTheWheel erfolgt
    console.log('OlyStart AfterViewInit');
  }

  selectGameRandomly(): void {
      if (this.canSelectNextGame() && !this.isSpinning()) {
          console.log("Zufälliges Spiel anfordern...");
          this.olyStateService.selectNextGame('random');
          // isSpinning wird jetzt durch das 'wheelSpinning' Event gesetzt
      }
  }

  // Wird durch das 'wheelSpinning' Event vom Server ausgelöst (nach kurzer Verzögerung)
  spinTheWheel(targetGameId: number, availableGames: Game[]): void {
    const containerEl = this.wheelContainer()?.nativeElement; // Container holen

    if (!containerEl) {
        console.error("Kann Rad nicht drehen: Container nicht gefunden.");
        this.isSpinning.set(false); // Zurücksetzen, falls etwas schiefgeht
        return;
    }
     if (!availableGames || availableGames.length === 0) {
        console.error("Kann Rad nicht drehen: Keine Spiele verfügbar.");
        this.isSpinning.set(false);
        return;
    }


    // Finde den Index des Ziel-Spiels in der Liste der verfügbaren Spiele
    const targetIndex = availableGames.findIndex(game => game.id === targetGameId);
    if (targetIndex === -1) {
        console.error("Zielspiel nicht in verfügbarer Liste gefunden!");
        this.isSpinning.set(false);
        return;
    }

    console.log("Aktualisiere/Initialisiere Rad-Segmente:", availableGames);

    // Items für die Bibliothek vorbereiten
    const wheelItems = availableGames.map(game => ({
        label: game.name.length > 15 ? game.name.substring(0, 13) + '...' : game.name,
        value: game.id
        // Optional: Farben hinzufügen
        // backgroundColor: '#' + Math.floor(Math.random()*16777215).toString(16)
    }));

    try {
        // Zerstöre alte Instanz, falls vorhanden
        if (this.wheelInstance && typeof this.wheelInstance.remove === 'function') {
            this.wheelInstance.remove();
            this.wheelInstance = null;
            console.log("Alte Rad-Instanz entfernt.");
        }

        // Neue Instanz erstellen
        this.wheelInstance = new Wheel(containerEl, {
            items: wheelItems,
            radius: 0.85,
            itemLabelRadius: 0.7,
            itemLabelRadiusMax: 0.4,
            itemLabelFontSizeMax: 14,
            rotationResistance: -35,
            pointerAngle: 0,
            lineWidth: 1,
            lineColor: '#333',
            borderColor: '#666',
            borderWidth: 2,
            itemLabelColors: ['#000'],
            itemBackgroundColors: ['#eee', '#ddd'],
            onRest: (event: any) => {
                console.log('Rad gestoppt bei:', event.currentIndex, event.currentItem);
                // Nur den Status zurücksetzen. Der Server bestimmt das Ergebnis via 'olympiadeStatusUpdate'.
                this.isSpinning.set(false);
                this.cdr.detectChanges();
            }
        });
        console.log("Neue Rad-Instanz erstellt.");

        // Warte kurz, damit das Rad gezeichnet wird, bevor wir drehen
        setTimeout(() => {
            if (!this.wheelInstance) return; // Sicherheitscheck
            console.log(`Starte Drehung zum Spiel ${availableGames[targetIndex].name} (Index ${targetIndex})`);
            const spinDuration = 5000;
            const revolutions = 3;
            this.wheelInstance.spinToItem(targetIndex, spinDuration, true, revolutions, 1);
        }, 100); // Kurze Verzögerung für das Rendern

    } catch (error) {
         console.error("Fehler beim Initialisieren/Drehen des Rads:", error);
         this.isSpinning.set(false);
    }
  }


  // --- Restliche Methoden bleiben gleich ---
  joinGame(): void {
    const user = this.currentUser();
    if (user && this.isActive() && !this.isCurrentUserJoined()) {
      console.log(`Versuche beizutreten als: ${user.username}`);
      this.olyStateService.joinOlympiade({ userId: user.userId, username: user.username });
    } else if (!user) {
        console.error("Nicht eingeloggt, kann nicht beitreten.");
    } else if (!this.isActive()) {
        console.warn("Keine aktive Olympiade zum Beitreten.");
    }
  }

  selectGameManually(gameId: number): void {
      if (this.canSelectNextGame()) {
          this.olyStateService.selectNextGame('manual', gameId);
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
    if (this.wheelInstance && typeof this.wheelInstance.remove === 'function') {
        this.wheelInstance.remove();
        console.log("Glücksrad-Instanz entfernt.");
    }
  }
}