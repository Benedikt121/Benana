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

  public gameState: KniffelGameState | null = null;
  public amICurrentPlayer: boolean = false;
  public myUserId: number | null = null;
  
  private stateSubscription: Subscription | null = null;
  private lastProcessedNotation: string | null = null; 

  private router = inject(Router);

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
            theme_colorset: 'pinkdreams',
            theme_texture: 'marble',
            strength: 2.5,
            shadows: true,
            baseScale: 70,
            light_intensity: 1.0,
            gravity_multiplier: 600,
            theme_customColorset: null
            };

          const userConfig = this.authService.getDiceConfig();
          
          let finalConfig = { ...defaultConfig };

          if (userConfig) {
            finalConfig.theme_material = userConfig.theme_material || defaultConfig.theme_material;
            finalConfig.theme_texture = userConfig.theme_texture || defaultConfig.theme_texture;

            if (userConfig.theme_customColorset) {
              finalConfig.theme_colorset = '';
              finalConfig.theme_customColorset = userConfig.theme_customColorset;
            } else if (userConfig.theme_colorset) {
              finalConfig.theme_colorset = userConfig.theme_colorset;
              finalConfig.theme_customColorset = null;
            }
          }

          console.log("Lade DiceBox mit Konfiguration: ", finalConfig);

          this.diceBox = new DiceBox("#dice-box-physics", finalConfig);

          await this.diceBox.initialize(); 
          
          console.log('Dice Box (ThreeJS) ist initialisiert und bereit.');
          this.isInitializing = false;
        
        } catch (e) {
          console.error("Fehler beim Initialisieren der DiceBox:", e);

        }

      } else if (state && this.diceBoxInitialized) {
        this.amICurrentPlayer = state.currentPlayerSocketId === this.kniffelState.getMySocketId();
        
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