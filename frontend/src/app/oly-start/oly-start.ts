// @ts-ignore
import {Wheel} from 'https://cdn.jsdelivr.net/npm/spin-wheel@5.0.2/dist/spin-wheel-esm.js';

import {
  Component, inject, Injector, OnDestroy, OnInit, signal,
  ChangeDetectorRef, DestroyRef, computed, Signal,
  AfterViewInit, // Beibehalten
  ElementRef, effect, // effect hinzugefügt
  viewChild, // Beibehalten
  runInInjectionContext
} from '@angular/core';
import { Router } from '@angular/router';
import { OlympiadeState } from '../olympiade-state';
import { CommonModule } from '@angular/common';
import { filter, pairwise, startWith, Subscription, tap } from 'rxjs';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../auth';
import { SocketService } from '../socket'; // SocketService importieren


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

  // Signal für die Spiele, die *aktuell* im Rad angezeigt werden sollen
  availableGamesForWheel: Signal<Game[]> = computed(() => {
    const allGames = this.selectedGamesList();
    const playedGameIds = new Set(this.results().map(r => r.gameId));
    return allGames.filter(game => !playedGameIds.has(game.id));
  });


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
    const currentIdx = this.currentGameIndex(); // z.B. 3 (nach dem Spin)
    const games = this.selectedGamesList();     // z.B. Liste mit 5 Spielen
    const results = this.results();           // z.B. [] (Länge 0)
    const isActive = this.isActive();

    if (!isActive || currentIdx < 0 || currentIdx >= games.length) {
      return false;
    }
    // Finde das Spiel, das laut Index aktuell ausgewählt ist
    const currentGame = games[currentIdx]; // z.B. Spiel an Index 3
    if (!currentGame) {
      return false;
    }
    // Prüfe, ob für DIESES SPIEL (anhand der ID) bereits ein Ergebnis vorliegt
    const gameHasResult = results.some(r => r.gameId === currentGame.id);

    

    // Wir können einen Gewinner deklarieren, wenn ein Spiel ausgewählt ist (currentIdx > -1)
    // UND für dieses spezifische Spiel noch KEIN Ergebnis existiert.
    return !gameHasResult;
  });

  isOlympiadeFinished: Signal<boolean> = computed(() =>
    this.isActive() && this.results().length === this.selectedGamesList().length && this.selectedGamesList().length > 0
  );

  private isActiveSubscription: Subscription | null = null;

  ngOnInit(): void {
    console.log('OlyStart OnInit');

    // Effekt zum Initialisieren/Aktualisieren des Rades, wenn sich verfügbare Spiele ändern
    effect(() => {
      const games = this.availableGamesForWheel();
      const container = this.wheelContainer(); //nativeElement wird in der Methode geholt
      const isActive = this.isActive();
      const isLoading = this.isLoading();

      // Nur initialisieren, wenn aktiv, nicht ladend, Spiele vorhanden sind und Container bereit ist
      if (!isLoading && isActive && games.length > 0 && container) {
         // Kurze Verzögerung, um sicherzustellen, dass der Container sichtbar ist, falls er gerade erst durch *ngIf angezeigt wurde
         setTimeout(() => this.initializeOrUpdateWheel(games), 0);
      } else if (this.wheelInstance) {
         // Rad entfernen, wenn keine Spiele mehr da sind oder Olympiade endet
         this.removeWheel();
      }
    }, { injector: this.injector }); // Injector übergeben


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

    // Auf Socket-Event hören, das das Ziel für den Spin vorgibt
    this.socketService.listen<{ targetGameId: number, availableGames: Game[] }>('spinTargetDetermined')
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(({ targetGameId, availableGames }) => {
            console.log("Event 'spinTargetDetermined' erhalten. Ziel:", targetGameId);
            // Nur drehen, wenn wir auch den Spin-Vorgang gestartet haben (isSpinning === true)
            if (this.isSpinning()) {
                 this.spinTheWheelToTarget(targetGameId, availableGames);
            } else {
                this.isSpinning() === true;
                this.spinTheWheelToTarget(targetGameId, availableGames);
            }
        });

    // Automatisches Beitreten (bleibt gleich)
    runInInjectionContext(this.injector, () => {
          effect(() => {
       if (!this.isLoading() && this.isActive() && this.currentUser() && !this.isCurrentUserJoined()) {
           console.log("OlyStart: Olympiade aktiv, User eingeloggt aber nicht beigetreten. Trete automatisch bei.");
           this.joinGame();
       }
    }, { allowSignalWrites: true });
    })
  }


  ngAfterViewInit(): void {
    // Keine Initialisierung mehr hier, da sie dynamisch in spinTheWheel erfolgt
    console.log('OlyStart AfterViewInit, wheelContainer:', this.wheelContainer());
    // Trigger initial wheel creation if needed (effect might run earlier)
    // this.initializeOrUpdateWheel(this.availableGamesForWheel()); // Redundant wg. effect
  }

  selectGameRandomly(): void {
      if (this.canSelectNextGame() && !this.isSpinning()) {
          console.log("Zufälliges Spiel anfordern...");
          this.isSpinning.set(true); // Visuellen Spin-Zustand starten
          this.olyStateService.selectNextGame('random');
          // Das Backend sendet nun 'spinTargetDetermined'
      }
  }

  private initializeOrUpdateWheel(games: Game[]): void {
     const containerEl = this.wheelContainer()?.nativeElement;
     if (!containerEl || games.length === 0) {
       console.log("Bedingungen für Rad-Initialisierung nicht erfüllt (Container oder Spiele fehlen).");
       this.removeWheel(); // Sicherstellen, dass keine alte Instanz übrig bleibt
       return;
     }

     console.log("Initialisiere/Aktualisiere Rad mit Spielen:", games.map(g => g.name));

     const wheelItems = games.map(game => ({
        label: game.name.length > 15 ? game.name.substring(0, 13) + '...' : game.name,
        value: game.id,
        // Farben dynamisch basierend auf ID oder Index
        backgroundColor: '#' + (Math.abs(game.id * 123456) % 16777215).toString(16).padStart(6, '0')
     }));

     try {
        this.removeWheel(); // Vorherige Instanz sicher entfernen

        // Neue Instanz erstellen
        this.wheelInstance = new Wheel(containerEl, {
            items: wheelItems,
            radius: 0.85, itemLabelRadius: 0.9, itemLabelRadiusMax: 0.38,
            itemLabelRotation: 180, itemLabelAlign: 'left', itemLabelFontSizeMax: 14,
            rotationResistance: -35, rotationSpeedMax: 500,
            pointerAngle: 0,
            lineWidth: 1, lineColor: '#333', borderColor: '#666', borderWidth: 2,
            isInteractive: true, // Nicht manuell drehbar machen
            onRest: this.onWheelRest // Handler als separate Methode
        });
        console.log("Neue Rad-Instanz erstellt.");
        this.cdr.detectChanges(); // Sicherstellen, dass das Rad gezeichnet wird
     } catch (error) {
         console.error("Fehler beim Initialisieren/Aktualisieren des Rads:", error);
     }
  }

  private spinTheWheelToTarget(targetGameId: number, availableGames: Game[]): void {
    const containerEl = this.wheelContainer()?.nativeElement;
    console.log("Drehen...")

    if (!containerEl) {
        console.error("Kann Rad nicht drehen: Container nicht gefunden.");
        this.isSpinning.set(false); // Zurücksetzen, falls etwas schiefgeht
        return;
    }
    if (!this.wheelInstance) {
        console.error("Kann Rad nicht drehen: Keine Rad-Instanz vorhanden.");
        this.isSpinning.set(false);
        return;
    }
    if (!availableGames || availableGames.length === 0) {
        console.error("Kann Rad nicht drehen: Keine Spiele verfügbar.");
        this.isSpinning.set(false);
        return;
    }

    // WICHTIG: Den Index anhand der *aktuell im Rad befindlichen* Items finden.
    // `availableGames` vom Server dient nur zur ID->Index Zuordnung für *diese* Drehung.
    // Finde den Index des Ziel-Spiels in der Liste der *aktuell angezeigten* Spiele
    const currentWheelGames = this.availableGamesForWheel(); // Die Spiele, die gerade im Rad sind
    const targetIndex = currentWheelGames.findIndex(game => game.id === targetGameId);


    if (targetIndex === -1) {
        console.error(`Zielspiel (ID: ${targetGameId}) nicht in der aktuellen Rad-Liste gefunden! Aktuelle Liste:`, currentWheelGames.map(g => g.id));
        this.isSpinning.set(false);
        return;
    }

    try {
        console.log(`Starte Drehung zum Spiel ${currentWheelGames[targetIndex].name} (Index ${targetIndex})`);
        const spinDuration = 5000; // Dauer der Animation
        const revolutions = Math.floor(Math.random() * (10 - 3 + 1)) + 3; // random int between 3 and 10 inclusive
        this.wheelInstance.spinToItem(targetIndex, spinDuration, true, revolutions, 1);
    } catch (error) {
         console.error("Fehler beim Starten der Rad-Drehung:", error);
         this.isSpinning.set(false);
    }

    this.isSpinning.set(false);
     this.cdr.detectChanges();
  }

  // Wird aufgerufen, wenn die Rad-Animation stoppt
  private onWheelRest = (event: any) => {
     console.log('Rad gestoppt bei:', event.currentIndex, event.currentItem);
     // Nur den visuellen Status zurücksetzen.
     // Der Server bestimmt das Ergebnis und sendet 'olympiadeStatusUpdate'.
     this.isSpinning.set(false);
     this.cdr.detectChanges(); // UI aktualisieren (z.B. Button wieder aktivieren)
  }

  private removeWheel(): void {
      if (this.wheelInstance && typeof this.wheelInstance.remove === 'function') {
          try {
              this.wheelInstance.remove();
              console.log("Vorhandene Rad-Instanz entfernt.");
          } catch (e) {
              console.error("Fehler beim Entfernen der Rad-Instanz:", e);
          }
          this.wheelInstance = null;
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
    this.removeWheel(); // Sicherstellen, dass das Rad entfernt wird
  }
}