import { Component, effect, inject, Injector, OnDestroy, OnInit, runInInjectionContext, signal, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { OlympiadeState } from '../olympiade-state';
import { CommonModule } from '@angular/common';
import { skipWhile, Subscription, tap, take, skip } from 'rxjs';
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
  cdr = inject(ChangeDetectorRef);

  gameIds = signal<string | null>(null);
  private isActiveSubscription: Subscription | null = null;
  private isLoadingSubscription: Subscription | null = null;
  private isComponentDestroyed = false;

  private isLoading$ = toObservable(this.olyStateService.isLoading, {injector: this.injector});
  private isActive$ = toObservable(this.olyStateService.isActive, {injector: this.injector});

  gameIdSyncEffect = effect(() => {
    const activeIds = this.olyStateService.activeGameIds();
    const idsString = Array.isArray(activeIds) ? activeIds.join(',') : activeIds;
    this.gameIds.set(idsString ? String(idsString) : null);
    console.log('>>> OlyStart Component: gameIds gesetzt auf', this.gameIds());
    if (!this.isComponentDestroyed) {
        this.cdr.detectChanges();
    }
  });

  ngOnInit(): void {
    console.log('OlympiadeStartComponent OnInit: Initialer Service Status:',
                `isLoading=${this.olyStateService.isLoading()}, isActive=${this.olyStateService.isActive()}, gameIds=${this.olyStateService.activeGameIds()}`);

    const setupIsActiveSubscription = () => {
        this.isActiveSubscription?.unsubscribe();

        // Subscription bleibt bestehen, um ggf. auf andere Änderungen zu reagieren,
        // aber die Navigation zu '/oly' wird entfernt.
        this.isActiveSubscription = this.isActive$.pipe(
             skip(1) // Überspringt die initiale Emission
        ).subscribe(isActiveNow => {
            console.log('>>> OlyStart: isActive$ Wert (nach skip(1)) geändert auf:', isActiveNow);
            if (!isActiveNow) { this.router.navigate(['/']); console.log('Olympiade wurde inaktiv, leite zu / weiter'); }
         });
    };

    this.isLoadingSubscription = this.isLoading$.pipe(
      skipWhile(loading => loading === true),
      take(1),
      tap(() => console.log('>>> OlyStart OnInit: Initiales Laden beendet. Richte isActive$-Beobachtung ein.')),
    ).subscribe(() => {
        // Sicherstellen, dass die Olympiade aktiv ist, sonst passiert nichts (Guard sollte das abfangen)
        if (this.olyStateService.isActive()) {
            setupIsActiveSubscription();
        } else {
            // Sollte nicht passieren wegen Guard, aber zur Sicherheit
            console.warn("OlyStart: Olympiade ist nach dem Laden nicht aktiv. Bleibe auf der Seite, aber keine aktive Subscription.");
        }
    });

    if (!this.olyStateService.isLoading()) {
        console.log(">>> OlyStart OnInit: Laden war bereits beendet. Prüfe Aktivität und richte ggf. isActive$-Beobachtung ein.");
        this.isLoadingSubscription?.unsubscribe();
        if (this.olyStateService.isActive()) {
            setupIsActiveSubscription();
        } else {
             // Sollte nicht passieren wegen Guard
             console.warn("OlyStart: Olympiade war bei Init bereits geladen, aber nicht aktiv.");
        }
    }
  }

  finishOlympiade(): void {
    console.log('Beende Olympiade...');
    this.olyStateService.endOlympiade();
    // Navigation zur Homepage hinzugefügt
    this.router.navigate(['/']); // Leitet zur Homepage weiter
  }
  ngOnDestroy(): void {
    this.isComponentDestroyed = true;
    this.isLoadingSubscription?.unsubscribe();
    this.isActiveSubscription?.unsubscribe();
    console.log("OlyStart Component destroyed, subscriptions cleaned up.");
  }
  }