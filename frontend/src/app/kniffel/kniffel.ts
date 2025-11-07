// frontend/src/app/kniffel/kniffel.ts

import { Component, AfterViewInit, ChangeDetectorRef, OnDestroy, signal, inject } from '@angular/core'; 
import { CommonModule } from '@angular/common'; // RouterOutlet entfernt (NG8113)
//@ts-ignore
import DiceBox from '@3d-dice/dice-box-threejs';
import { Subscription, take } from 'rxjs';
import { Router } from '@angular/router';

import { 
  KniffelStateService, 
  KniffelGameState, 
  ScoreboardRow 
} from '../kniffel-state'; 
import { AuthService } from '../auth'; 

@Component({
  selector: 'app-kniffel',
  standalone: true,
  imports: [CommonModule], // RouterOutlet entfernt (NG8113)
  templateUrl: './kniffel.html', //
  styleUrls: ['./kniffel.css'], // Korrigierte Groß-/Kleinschreibung (aus V17)
})
export class Kniffel implements AfterViewInit, OnDestroy {

  private diceBox: any; 
  public isRolling: boolean = false;
  
  public isInitializing: boolean = true; 
  public isSaving = signal(false);

  private diceBoxInitialized: boolean = false; 
  private currentDiceThemeSocketId: string | null = null;

  public gameState: KniffelGameState | null = null;
  public amICurrentPlayer: boolean = false;
  public myUserId: number | null = null;
  
  private stateSubscription: Subscription | null = null;
  private lastProcessedNotation: string | null = null; 

  private router = inject(Router);

  public hexToRgb(hex: string): string {
    if (!hex) hex = '#FFFFFF';
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      const r = parseInt(result[1], 16);
      const g = parseInt(result[2], 16);
      const b = parseInt(result[3], 16);
      return `${r}, ${g}, ${b}`; // z.B. "255, 100, 50"
    }
    return '255, 255, 255'; // Fallback
  }

  public getContrastColor(hex: string): string {
    if (!hex) hex = '#FFFFFF';
    const rgb = this.hexToRgb(hex).split(',').map(Number);
    const r = rgb[0];
    const g = rgb[1];
    const b = rgb[2];
    
    // Formel zur Berechnung der wahrgenommenen Helligkeit (Luminanz)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
  }

  constructor(
    private cdr: ChangeDetectorRef,
    public kniffelState: KniffelStateService,
    private authService: AuthService
  ) {
    this.myUserId = this.authService.currentUser()?.userId || null;
  }

  public get currentPlayerUsername(): string {
    if (!this.gameState || !this.gameState.currentPlayerSocketId) {
      return 'jemanden'; // Fallback
    }
    const player = this.gameState?.players.find(p => p.socketId === this.gameState?.currentPlayerSocketId);
    return player ? player.username : 'unbekannt';
  }

  ngAfterViewInit(): void {
    this.isInitializing = true;
    this.cdr.detectChanges(); 

    this.stateSubscription = this.kniffelState.kniffelState$.subscribe(async (state) => {

      const oldState = this.gameState;
      this.gameState = state;
      
      if (state && !this.diceBoxInitialized) {

        this.diceBoxInitialized = true;
        
        this.cdr.detectChanges();
        await Promise.resolve();
        
        try {
          const defaultConfig = {
                    assetPath: "/assets/",
                    sounds: true,
                    volume: 30,
                    sound_dieMaterial: 'plastic',
                    theme_material: "plastic",
                    theme_colorset: 'pinkdreams', // Dein Standard
                    theme_texture: 'marble',
                    strength: 2.5,
                    shadows: true,
                    baseScale: 70,
                    light_intensity: 1.0,
                    gravity_multiplier: 600,
                    theme_customColorset: null
                };

                console.log("Lade DiceBox mit initialem Standard-Design:", defaultConfig);
                this.diceBox = new DiceBox("#dice-box-physics", defaultConfig);
                await this.diceBox.initialize(); 
                
                console.log('Dice Box (ThreeJS) ist initialisiert und bereit.');
                this.isInitializing = false;

                this.updateDiceTheme(state);
        
        } catch (e) {
          console.error("Fehler beim Initialisieren der DiceBox:", e);

        }

      } else if (state && this.diceBoxInitialized) {
        this.amICurrentPlayer = state.currentPlayerSocketId === this.kniffelState.getMySocketId();

        if (oldState?.currentPlayerSocketId !== state.currentPlayerSocketId) {
                console.log("Spieler hat gewechselt, aktualisiere Würfel-Theme...");
                this.updateDiceTheme(state); // <--- NEUE FUNKTION aufrufen
            }
        
        if (state.lastRollNotation && state.lastRollNotation !== this.lastProcessedNotation) {
          console.log(`Spiele deterministischen Wurf ab: ${state.lastRollNotation}`);
          this.isRolling = true;
          this.diceBox.roll(state.lastRollNotation).then(() => {
            this.isRolling = false;
            this.cdr.detectChanges();
          });
          this.lastProcessedNotation = state.lastRollNotation;
        } else if (state.rollCount === 0 && this.lastProcessedNotation !== null) {
          this.lastProcessedNotation = null;
        }

        if (!state.lastRollNotation) {
            this.isRolling = false;
        }
      }
      
      this.cdr.detectChanges();
    });

    this.kniffelState.joinGame();
  }

  private updateDiceTheme(state: KniffelGameState | null) {
      if (!state || !state.currentPlayerSocketId || !this.diceBox) {
          return; // Nichts zu tun, wenn Spiel noch nicht bereit ist
      }

      // Verhindern, dass das Theme unnötig neu geladen wird, wenn derselbe Spieler dranbleibt
      if (state.currentPlayerSocketId === this.currentDiceThemeSocketId) {
          return;
      }

      const currentPlayer = state.players.find(p => p.socketId === state.currentPlayerSocketId);
      
      let configUpdate: any = {};

      if (currentPlayer && currentPlayer.diceConfig) {
          const userConfig = currentPlayer.diceConfig;
          
          configUpdate = {
              theme_material: userConfig.theme_material || 'plastic',
              theme_texture: userConfig.theme_texture || 'marble'
          };

          if (userConfig.theme_customColorset) {
              configUpdate.theme_colorset = null;
              configUpdate.theme_customColorset = userConfig.theme_customColorset;
          } else if (userConfig.theme_colorset) {
              configUpdate.theme_colorset = userConfig.theme_colorset;
              configUpdate.theme_customColorset = null;
          } else {
              // Fallback, falls die Config des Spielers ungültig ist
              configUpdate.theme_colorset = 'pinkdreams';
              configUpdate.theme_customColorset = null;
          }
          console.log(`Aktualisiere Würfel-Design für ${currentPlayer.username}:`, configUpdate);

      } else {
          // Fallback, falls der Spieler (aus irgendeinem Grund) keine Config hat
          console.warn("Aktiver Spieler hat keine Würfel-Konfiguration, verwende Standard.");
          configUpdate = {
              theme_colorset: 'pinkdreams',
              theme_customColorset: null,
              theme_texture: 'marble',
              theme_material: 'plastic'
          };
      }
      
      this.diceBox.updateConfig(configUpdate);
      this.currentDiceThemeSocketId = state.currentPlayerSocketId; // Socket-ID des aktuellen Themes merken
  }


  ngOnDestroy(): void {
    this.stateSubscription?.unsubscribe();
  }

  rollDice(): void {
    if (!this.amICurrentPlayer || (this.gameState && this.gameState.rollCount >= 3) || this.isRolling || this.isInitializing) {
      return;
    }
    this.isRolling = true;
    this.kniffelState.rollDice();
  }

  toggleHold(index: number): void {
    if (!this.amICurrentPlayer || (this.gameState && this.gameState.rollCount === 0) || this.isRolling || this.isInitializing) {
      return;
    }
    this.kniffelState.toggleHold(index);
  }

  selectScore(row: ScoreboardRow): void {
    if (!this.amICurrentPlayer || row.isSet || (this.gameState && this.gameState.rollCount === 0) || this.isRolling || this.isInitializing) {
      return;
    }
    this.kniffelState.selectScore(row.id);
  }

  newGame(): void {
    if (this.isInitializing) return;
    this.kniffelState.newGame();
  }

  saveGameAndExit(): void {
    if (this.isSaving()) return;
    this.isSaving.set(true);

    this.kniffelState.kniffelGameSaved$.pipe(
      take(1)
    ).subscribe(() => {
      this.router.navigate(['/']);
    });
    this.kniffelState.saveGame();
  }
}