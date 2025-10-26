import { Component, effect, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router'; // Router importieren
import { OlympiadeState } from '../olympiade-state'; // Service importieren
import { CommonModule } from '@angular/common'; // CommonModule für *ngIf etc.

@Component({
  selector: 'app-olympiade-start',
  standalone: true, // Sicherstellen, dass es standalone ist
  imports: [CommonModule], // CommonModule importieren
  template: './oly-start.html',
  styles: 'oly-startWith.css'
})
export class OlyStart implements OnInit {
  router = inject(Router);
  olyStateService = inject(OlympiadeState);

  gameIds = signal<string | null>(null);

  gameIdSyncEffect = effect(() => {
    const activeIds = this.olyStateService.activeGameIds();
    this.gameIds.set(String(activeIds));
    console.log('>>> OlyStart Component: gameIds gesetzt auf', activeIds);
  });

  private statusEffect = effect(() => {
    const isActive = this.olyStateService.isActive();
    const isLoading = this.olyStateService.isLoading();
    console.log(`>>> OlyStart Component: Olympiade Status geändert - isActive: ${isActive}, isLoading: ${isLoading}`);

    if (!isLoading && !isActive) {
      console.log('>>> OlyStart Component: Olympiade ist inaktiv und nicht am Laden.');
      if (this.router.url.startsWith('/olympiade-start')) {
        this.router.navigate(['/oly']);
      } 
    }
  });

  ngOnInit(): void {
    console.log('OlyStart Component initialisiert. Initialer Status: isActive =', this.olyStateService.isActive(),
    ', isLoading =', this.olyStateService.isLoading(), ', gameIds =', this.olyStateService.activeGameIds());

    if (!this.olyStateService.isLoading() && !this.olyStateService.isActive()) {
      console.log('>>> OlyStart Component ngOnInit: Olympiade ist inaktiv und nicht am Laden. Navigiere zu /oly');
      this.router.navigate(['/oly']);
    }


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