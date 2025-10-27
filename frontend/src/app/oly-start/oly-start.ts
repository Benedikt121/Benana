import { Component, effect, inject, Injector, OnDestroy, OnInit, signal, ChangeDetectorRef, DestroyRef } from '@angular/core'; // DestroyRef importieren
import { Router } from '@angular/router';
import { OlympiadeState } from '../olympiade-state';
import { CommonModule } from '@angular/common';
import { filter, pairwise, startWith, Subscription, tap } from 'rxjs'; // skipWhile, take entfernt
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';

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
  cdr = inject(ChangeDetectorRef);

  private destroyRef = inject(DestroyRef);
  gameIds = signal<string | null>(null);
  private isLoadingSubscription: Subscription | null = null;
  private isLoading$ = toObservable(this.olyStateService.isLoading, { injector: this.injector });
  private isActive$ = toObservable(this.olyStateService.isActive, { injector: this.injector });

  gameIdSyncEffect = effect(() => {
    // ... (Effekt bleibt gleich, ohne detectChanges) ...
    const activeIds = this.olyStateService.activeGameIds();
    const idsString = Array.isArray(activeIds) ? activeIds.join(',') : activeIds;
    const currentSignalValue = this.gameIds(); 
    const newSignalValue = idsString ? String(idsString) : null;
    if (currentSignalValue !== newSignalValue) {
        this.gameIds.set(newSignalValue);
        console.log('>>> OlyStart Component: gameIds gesetzt auf', newSignalValue);
    } else {
        console.log('>>> OlyStart Component: gameIds Wert bleibt:', currentSignalValue);
    }
  });

  ngOnInit(): void {
    console.log('OlympiadeStartComponent OnInit: Initialer Service Status:',
                `isLoading=${this.olyStateService.isLoading()}, isActive=${this.olyStateService.isActive()}, gameIds=${this.olyStateService.activeGameIds()}`);

    this.isActive$.pipe(
      takeUntilDestroyed(this.destroyRef),
      // Wichtig: Gib einen initialen Wert mit, damit pairwise beim ersten echten Wert funktioniert.
      // Wir nehmen den *aktuellen* Status, damit der Vergleich korrekt startet.
      startWith(this.olyStateService.isActive()),
      pairwise(), // Gibt [vorherigerWert, aktuellerWert] aus
      // Reagiere nur, wenn der vorherige Wert 'true' und der aktuelle 'false' ist
      filter(([prevIsActive, currIsActive]) => prevIsActive === true && currIsActive === false)
    ).subscribe(([prevIsActive, currIsActive]) => {
      // Diese Logik wird jetzt nur bei einem Wechsel von true -> false ausgeführt
      console.log(`Olympiade-Status wechselte von ${prevIsActive} zu ${currIsActive}, leite zu / weiter`);
      this.router.navigate(['/']);
    });

    // isLoadingSubscription kann bleiben, wenn du Lade-Feedback brauchst
    this.isLoadingSubscription = this.isLoading$.pipe(
      takeUntilDestroyed(this.destroyRef) // Auch hier anwenden für Konsistenz
    ).subscribe(loading => {
        console.log(">>> OlyStart: isLoading$ Wert geändert auf:", loading);
         // Explizites detectChanges() kann hier helfen, falls sich durch das Ende
         // des Ladens etwas im Template ändern soll (z.B. Ladeanzeige ausblenden),
         // was nicht direkt an ein Signal gebunden ist.
         this.cdr.detectChanges();
    });
  }

  finishOlympiade(): void {
    console.log('Beende Olympiade...');
    this.olyStateService.endOlympiade();
    this.router.navigate(['/']);
  }

  ngOnDestroy(): void {
    console.log("OlyStart Component destroyed, subscriptions cleaned up.");
  }
}