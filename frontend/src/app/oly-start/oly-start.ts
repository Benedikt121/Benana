import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router'; // Router importieren
import { OlympiadeState } from '../olympiade-state'; // Service importieren
import { CommonModule } from '@angular/common'; // CommonModule für *ngIf etc.

@Component({
  selector: 'app-olympiade-start',
  standalone: true, // Sicherstellen, dass es standalone ist
  imports: [CommonModule], // CommonModule importieren
  template: `
    <h2>Olympiade läuft!</h2>
    <p>Ausgewählte Spiel-IDs: {{ gameIds() }}</p>
    <button (click)="finishOlympiade()">Olympiade Beenden</button>
  `,
  styles: ``
})
export class OlyStart implements OnInit {
  route = inject(ActivatedRoute);
  router = inject(Router);
  olyStateService = inject(OlympiadeState);

  gameIds = signal<string | null>(null);

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      this.gameIds.set(params.get('games'));
    });
  }

  finishOlympiade(): void {
    console.log('Beende Olympiade...');
    this.olyStateService.endOlympiade();
    // Zurück zur Auswahlseite oder Homepage navigieren
    this.router.navigate(['/']);
    // Oder zur Homepage: this.router.navigate(['/']);
  }
}