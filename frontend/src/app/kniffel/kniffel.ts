// frontend/src/app/kniffel/kniffel.ts

import { Component, AfterViewInit, ChangeDetectorRef, OnDestroy } from '@angular/core'; 
import { CommonModule } from '@angular/common'; // RouterOutlet entfernt (NG8113)
//@ts-ignore
import DiceBox from '@3d-dice/dice-box-threejs';
import { Subscription } from 'rxjs';

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
  
  // NEU: Flag, um die einmalige Initialisierung der Box zu steuern
  private diceBoxInitialized: boolean = false; 

  public gameState: KniffelGameState | null = null;
  public amICurrentPlayer: boolean = false;
  public myUserId: number | null = null;
  
  private stateSubscription: Subscription | null = null;
  private lastProcessedNotation: string | null = null; 

  constructor(
    private cdr: ChangeDetectorRef,
    public kniffelState: KniffelStateService,
    private authService: AuthService
  ) {
    this.myUserId = this.authService.currentUser()?.userId || null;
  }

  // KORREKTUR: 'currentPlayerUsername' Getter hinzugefügt (NG5002)
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
          this.diceBox = new DiceBox("#dice-box-physics", { //
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
            gravity_multiplier: 600
          });

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
    this.isRolling = true; // UI sofort sperren
    this.kniffelState.rollDice(); // Server, bitte würfeln!
  }

  /**
   * Wird aufgerufen, wenn der Spieler auf einen Würfel klickt.
   */
  toggleHold(index: number): void {
    if (!this.amICurrentPlayer || (this.gameState && this.gameState.rollCount === 0) || this.isRolling || this.isInitializing) {
      return;
    }
    this.kniffelState.toggleHold(index);
  }

  /**
   * Wird aufgerufen, wenn der Spieler eine Zeile im Scoreboard auswählt.
   */
  selectScore(row: ScoreboardRow): void {
    if (!this.amICurrentPlayer || row.isSet || (this.gameState && this.gameState.rollCount === 0) || this.isRolling || this.isInitializing) {
      return;
    }
    this.kniffelState.selectScore(row.id);
  }

  /**
   * Wird aufgerufen, wenn der Spieler auf "Neues Spiel" klickt.
   */
  newGame(): void {
    if (this.isInitializing) return;
    this.kniffelState.newGame();
  }
}