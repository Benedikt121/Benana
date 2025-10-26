import { Component, effect, Inject, inject, Injector, OnDestroy, OnInit, runInInjectionContext, signal } from '@angular/core';
import { Router } from '@angular/router'; // Router importieren
import { OlympiadeState } from '../olympiade-state'; // Service importieren
import { CommonModule } from '@angular/common'; // CommonModule für *ngIf etc.
import { skipWhile, Subscription, tap } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';

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
  injector = inject(Injector);

  gameIds = signal<string | null>(null);
  private statusSubscription: Subscription | null = null;
  private isInitialStatusCheckDone = false;

  private isLoading$ = toObservable(this.olyStateService.isLoading);
  private isActive$ = toObservable(this.olyStateService.isActive);

  gameIdSyncEffect = effect(() => {
    const activeIds = this.olyStateService.activeGameIds();
    this.gameIds.set(String(activeIds));
    console.log('>>> OlyStart Component: gameIds gesetzt auf', activeIds);
  });

  ngOnInit(): void {
    console.log('OlympiadeStartComponent OnInit: Initialer Service Status:',
                `isLoading=${this.olyStateService.isLoading()}, isActive=${this.olyStateService.isActive()}, gameIds=${this.olyStateService.activeGameIds()}`);

    // Beobachte isLoading$, um initialen Ladevorgang zu erkennen
    this.statusSubscription = this.isLoading$.pipe(
      skipWhile(loading => loading === true),
      tap(() => console.log('>>> OlyStart OnInit: Initiales Laden beendet. Beobachte isActive...')),
    ).subscribe(() => {
        // Dieser Teil wird ausgeführt, sobald isLoading$ false wird

        // Fallback-Check direkt nach dem Laden
        if (!this.olyStateService.isActive()) {
            console.warn("OlyStart Fallback (nach Laden): Kein Spiel aktiv trotz Guard-Pass. Leite zu /oly um.");
            // Sicherstellen, dass Navigation im Injection Context läuft
            runInInjectionContext(this.injector, () => {
                 if (this.router.url.startsWith('/olympiade-start')) {
                    this.router.navigate(['/oly']);
                 }
            });
            return;
        }

        if (!this.statusSubscription || this.statusSubscription.closed) {
             // Wenn nicht, neu abonnieren (sollte eigentlich nur einmal passieren)
              this.statusSubscription = this.isActive$.subscribe(isActiveNow => {
                console.log('>>> OlyStart: isActive$ Wert geändert auf:', isActiveNow);
                 // Nur umleiten, wenn der Status auf false WECHSELT
                 // (Die isLoading-Prüfung hier ist redundant, da wir schon nach skipWhile sind)
                if (!isActiveNow) {
                     console.warn("OlyStart: Spiel ist nicht mehr aktiv (via isActive$). Leite zu /oly um.");
                     // Sicherstellen, dass Navigation im Injection Context läuft
                     runInInjectionContext(this.injector, () => {
                         if (this.router.url.startsWith('/olympiade-start')) {
                             this.router.navigate(['/oly']);
                         }
                     });
                 }
              });
         } else {
             // Wenn die Subscription schon läuft, müssen wir isActive$ NICHT erneut abonnieren.
             // Wir müssen aber sicherstellen, dass die Logik für den Wechsel zu 'false' aktiv ist.
             // Die bestehende Subscription auf isActive$ (die im `if` oben erstellt wurde)
             // kümmert sich bereits darum.
             console.log(">>> OlyStart: isActive$ wird bereits beobachtet.");
         }
        // --- Ende dauerhafte Beobachtung ---
    });
  }

  finishOlympiade(): void {
    console.log('Beende Olympiade...');
    this.olyStateService.endOlympiade();
    // Zurück zur Auswahlseite oder Homepage navigieren
    this.router.navigate(['/']);
    // Oder zur Homepage: this.router.navigate(['/']);
  }

  ngOnDestroy(): void {
  }
}