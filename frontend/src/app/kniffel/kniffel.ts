import { Component, AfterViewInit, ChangeDetectorRef } from '@angular/core'; 
import { CommonModule } from '@angular/common';
// NEUER IMPORT
//@ts-ignore
import DiceBox from '@3d-dice/dice-box-threejs';
export interface ScoreboardRow {
  id: string; name: string; section: 'upper' | 'lower';
  score: number | null; potentialScore: number; isSet: boolean;
}
export interface TotalScores {
  upper: number; bonus: number; upperTotal: number;
  lowerTotal: number; grandTotal: number;
}
interface KniffelDie {
  die: { value: number };
  isHeld: boolean;
}

@Component({
  selector: 'app-kniffel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './kniffel.html',
  styleUrl: '/kniffel.css',
})
export class Kniffel implements AfterViewInit {

  private diceBox: any; 
  public rollCount: number = 0;
  public dice: KniffelDie[] = [];
  public scoreboard: ScoreboardRow[] = [];
  public upperScoreboard: ScoreboardRow[] = [];
  public lowerScoreboard: ScoreboardRow[] = [];
  public totalScores: TotalScores = { upper: 0, bonus: 0, upperTotal: 0, lowerTotal: 0, grandTotal: 0 };
  
  public isInitializing: boolean = true;
  public isRolling: boolean = false; 

  constructor(private cdr: ChangeDetectorRef) {}

  async ngAfterViewInit(): Promise<void> {
    this.isInitializing = true;
    this.cdr.detectChanges(); 

    this.diceBox = new DiceBox("#dice-box-physics", {
      assetPath: "/assets/",
      theme_texture: "marble",
      theme_material: "plastic",
      theme_colorset: 'pinkdreams',
      sounds: true,
      sound_dieMaterial: "plastic",
      volume: 10,
      strength: 2,
      shadows: true,
      baseScale: 80,
      light_intensity: 1.0,
      gravity_multiplier: 600
    });

    try {
      await this.diceBox.initialize(); 
      
      console.log('Dice Box (ThreeJS) ist initialisiert und bereit.');
      this.initializeScoreboard();
      this.isInitializing = false; 
    } catch (e) {
      console.error("Fehler beim Initialisieren der DiceBox:", e);
    }
    
    this.cdr.detectChanges();
  }

  initializeScoreboard(): void {
    // (Diese Funktion ist identisch mit V10)
    this.scoreboard = [
      { id: 'ones', name: 'Einser', section: 'upper', score: null, potentialScore: 0, isSet: false },
      { id: 'twos', name: 'Zweier', section: 'upper', score: null, potentialScore: 0, isSet: false },
      { id: 'threes', name: 'Dreier', section: 'upper', score: null, potentialScore: 0, isSet: false },
      { id: 'fours', name: 'Vierer', section: 'upper', score: null, potentialScore: 0, isSet: false },
      { id: 'fives', name: 'Fünfer', section: 'upper', score: null, potentialScore: 0, isSet: false },
      { id: 'sixes', name: 'Sechser', section: 'upper', score: null, potentialScore: 0, isSet: false },
      { id: 'threeOfAKind', name: 'Dreierpasch', section: 'lower', score: null, potentialScore: 0, isSet: false },
      { id: 'fourOfAKind', name: 'Viererpasch', section: 'lower', score: null, potentialScore: 0, isSet: false },
      { id: 'fullHouse', name: 'Full House', section: 'lower', score: null, potentialScore: 0, isSet: false },
      { id: 'smallStraight', name: 'Kleine Straße', section: 'lower', score: null, potentialScore: 0, isSet: false },
      { id: 'largeStraight', name: 'Große Straße', section: 'lower', score: null, potentialScore: 0, isSet: false },
      { id: 'kniffel', name: 'Kniffel', section: 'lower', score: null, potentialScore: 0, isSet: false },
      { id: 'chance', name: 'Chance', section: 'lower', score: null, potentialScore: 0, isSet: false },
    ];
    this.upperScoreboard = this.scoreboard.filter(row => row.section === 'upper');
    this.lowerScoreboard = this.scoreboard.filter(row => row.section === 'lower');
    this.totalScores = { upper: 0, bonus: 0, upperTotal: 0, lowerTotal: 0, grandTotal: 0 };
  }

  newGame(): void {
    this.rollCount = 0;
    this.dice = []; 
    this.isRolling = false;
    this.initializeScoreboard();
    console.log('Neues Spiel gestartet.');
    this.cdr.detectChanges();
  }

  async rollDice(): Promise<void> {
    if (this.rollCount >= 3 || this.isRolling) return;

    this.isRolling = true;
    this.rollCount++; 
    console.log(`Starte Wurf ${this.rollCount}...`);

    let notation: string;
    let newRandomValues: number[] = [];

    // Logik, um den Wurf zu bestimmen (simuliert den Server)
    if (this.rollCount === 1) {
      // 1. Wurf: Rein zufällig
      notation = '5d6';
    } else {
      // 2. oder 3. Wurf: Deterministisch
      const heldDice = this.dice.filter(kd => kd.isHeld).map(kd => kd.die.value);
      const newRollCount = 5 - heldDice.length;

      if (newRollCount === 0) {
        console.log('Alle Würfel gehalten, kein neuer Wurf.');
        this.rollCount--;
        this.isRolling = false;
        return;
      }
      
      // Simuliere die neuen zufälligen Würfe
      newRandomValues = this.generateRandomRolls(newRollCount);
      const allValues = [...heldDice, ...newRandomValues];
      notation = `5d6@${allValues.join(',')}`; // z.B. "5d6@6,6,1,2,4"
      
      console.log(`Sende Notation: ${notation}`);
    }

    try {
      // Rufe die NEUE roll-Methode auf und warte darauf
      const rollResult = await this.diceBox.roll(notation);
      
      // Verarbeite die Ergebnisse
      const parsedDice = this.parseResults(rollResult);
      
      // Aktualisiere unseren lokalen Zustand 'this.dice'
      this.updateLocalDiceState(parsedDice);
      
      this.updatePotentialScores();

      if (this.rollCount === 3) {
        this.dice.forEach(kd => kd.isHeld = true); // UI sperren
      }

    } catch (e) {
      console.error('Fehler beim Würfeln:', e);
    }
    
    this.isRolling = false;
    this.cdr.detectChanges(); // UI aktualisieren
  }

  /**
   * NEU: Parst das Ergebnis der 'dice-box-threejs' Bibliothek.
   * BITTE ÜBERPRÜFEN SIE `console.log` FÜR DAS KORREKTE FORMAT.
   */
private parseResults(rollResult: any): { value: number }[] {
    console.log('--- NEUES rollResult Format ---', rollResult);
    
    try {
      // Basierend auf Ihrem Log: { notation: '...', sets: Array(1), ... }
      if (rollResult && Array.isArray(rollResult.sets) && rollResult.sets.length > 0) {
        
        // Wir greifen auf das erste "Set" zu (rollResult.sets[0])
        // und erwarten, dass dort ein 'rolls'-Array enthalten ist.
        const rolls = rollResult.sets[0].rolls; 
        
        if (Array.isArray(rolls)) {
          // 'rolls' ist das Array, das wir suchen, z.B. [{ value: 5, ... }, { value: 2, ... }]
          // Wir extrahieren nur den 'value'
          return rolls.map((r: any) => ({ value: r.value }));
        }
      }
    } catch (e) {
      console.error("Fehler beim Parsen von 'rollResult.sets[0].rolls':", e, rollResult);
    }
    
    // Fallback, falls die Struktur doch anders ist
    console.error("Konnte 'rollResult.sets[0].rolls' nicht finden. Bitte parseResults anpassen.", rollResult);
    return [];
  }

  /**
   * NEU: Aktualisiert unseren 'this.dice'-Status basierend auf den Wurfergebnissen.
   */
  private updateLocalDiceState(parsedDice: { value: number }[]): void {
    if (this.rollCount === 1) {
      // 1. Wurf: Alle sind neu
      this.dice = parsedDice.map(d => ({
        die: d,
        isHeld: false
      }));
    } else {
      // 2./3. Wurf: Mische gehaltene und neue
      const heldDice = this.dice.filter(kd => kd.isHeld);
      const newDice = parsedDice
        .filter(d => !heldDice.some(hd => hd.die.value === d.value)) // Simpel, funktioniert nicht bei Paschs
        .map(d => ({ die: d, isHeld: false }));
        
      // Robusterer Ansatz: Wir wissen, dass 'parsedDice' der *komplette* neue Zustand ist
      this.dice = parsedDice.map(d => {
        // Finde den Würfel in unserem *alten* Zustand, um 'isHeld' zu übernehmen
        // Dies ist eine Vereinfachung, die davon ausgeht, dass die Werte übereinstimmen
        const oldDie = this.dice.find(kd => kd.die.value === d.value && kd.isHeld);
        return {
          die: d,
          isHeld: !!oldDie // War dieser Würfel gehalten?
        };
      });
      
      // Korrekter Ansatz (V8-Logik angepasst):
      const heldDiceBeforeRoll = this.dice.filter(kd => kd.isHeld);
      const newDiceValues = parsedDice.map(d => d.value);

      this.dice = newDiceValues.map(val => {
          // Versuche, einen gehaltenen Würfel mit diesem Wert zu finden
          const heldMatchIndex = heldDiceBeforeRoll.findIndex(hd => hd.die.value === val);
          if (heldMatchIndex > -1) {
              // Ja, das ist einer unserer gehaltenen Würfel.
              // Entferne ihn aus dem Pool, damit er nicht doppelt verwendet wird.
              return heldDiceBeforeRoll.splice(heldMatchIndex, 1)[0];
          } else {
              // Nein, das ist ein neuer Würfel.
              return { die: { value: val }, isHeld: false };
          }
      });
    }
    // Sortiere, um die Anzeige konsistent zu halten (optional)
    this.dice.sort((a, b) => a.die.value - b.die.value);
  }

  /**
   * NEU: Simuliert serverseitiges Würfeln
   */
  private generateRandomRolls(count: number): number[] {
    const rolls: number[] = [];
    for (let i = 0; i < count; i++) {
      rolls.push(Math.floor(Math.random() * 6) + 1);
    }
    return rolls;
  }

  toggleHold(index: number): void {
    if (this.rollCount === 0 || this.rollCount === 3 || !this.dice[index] || this.isRolling) {
      return;
    }
    this.dice[index].isHeld = !this.dice[index].isHeld;
    console.log('Würfel ' + index + ' gehalten:', this.dice[index].isHeld);
    this.cdr.detectChanges(); 
  }

  selectScore(rowId: string): void {
    if (this.rollCount === 0 || this.isRolling || this.dice.length === 0) return;
    const row = this.scoreboard.find(r => r.id === rowId);
    if (!row || row.isSet) return;

    row.score = row.potentialScore;
    row.isSet = true;
    this.calculateTotals();
    this.nextRound(); // Bereitet die nächste Runde vor
  }

  private nextRound(): void {
    const allSet = this.scoreboard.every(r => r.isSet);
    if (allSet) {
      console.log('Spiel beendet!');
      this.rollCount = 3; // Spiel sperren
      this.isRolling = true;
      this.cdr.detectChanges();
      return;
    }
    this.rollCount = 0;
    this.dice = [];
    this.scoreboard.forEach(r => r.potentialScore = 0);
    this.cdr.detectChanges();
  }

  private calculateTotals(): void {
    // (Diese Funktion ist identisch mit V10)
    let upperScore = 0;
    this.upperScoreboard
      .filter(r => r.isSet)
      .forEach(r => upperScore += r.score || 0);
    this.totalScores.upper = upperScore;
    this.totalScores.bonus = (upperScore >= 63) ? 35 : 0;
    this.totalScores.upperTotal = this.totalScores.upper + this.totalScores.bonus;
    let lowerScore = 0;
    this.lowerScoreboard
      .filter(r => r.isSet)
      .forEach(r => lowerScore += r.score || 0);
    this.totalScores.lowerTotal = lowerScore;
    this.totalScores.grandTotal = this.totalScores.upperTotal + this.totalScores.lowerTotal;
  }

  // --- Alle Berechnungsfunktionen (identisch zu V10) ---
  
  private updatePotentialScores(): void {
    if (this.rollCount === 0 || this.dice.length === 0) {
      this.scoreboard.forEach(row => row.potentialScore = 0);
      return;
    }
    const diceValues = this.dice.map(kd => kd.die.value);
    const counts = this.getDiceCounts(diceValues);
    this.scoreboard.forEach(row => {
      if (!row.isSet) {
        switch (row.id) {
          case 'ones': row.potentialScore = this.calculateSumOfNumber(diceValues, 1); break;
          case 'twos': row.potentialScore = this.calculateSumOfNumber(diceValues, 2); break;
          case 'threes': row.potentialScore = this.calculateSumOfNumber(diceValues, 3); break;
          case 'fours': row.potentialScore = this.calculateSumOfNumber(diceValues, 4); break;
          case 'fives': row.potentialScore = this.calculateSumOfNumber(diceValues, 5); break;
          case 'sixes': row.potentialScore = this.calculateSumOfNumber(diceValues, 6); break;
          case 'threeOfAKind': row.potentialScore = this.calculateThreeOfAKind(diceValues, counts); break;
          case 'fourOfAKind': row.potentialScore = this.calculateFourOfAKind(diceValues, counts); break;
          case 'fullHouse': row.potentialScore = this.calculateFullHouse(counts); break;
          case 'smallStraight': row.potentialScore = this.calculateSmallStraight(diceValues); break;
          case 'largeStraight': row.potentialScore = this.calculateLargeStraight(diceValues); break;
          case 'kniffel': row.potentialScore = this.calculateKniffel(counts); break;
          case 'chance': row.potentialScore = this.calculateChance(diceValues); break;
          default: row.potentialScore = 0;
        }
      }
    });
  }
  private getDiceCounts(diceValues: number[]): Map<number, number> {
    const counts = new Map<number, number>();
    for (const val of diceValues) {
      counts.set(val, (counts.get(val) || 0) + 1);
    }
    return counts;
  }
  private calculateSumOfNumber(diceValues: number[], targetNumber: number): number {
    return diceValues.filter(val => val === targetNumber).reduce((sum, val) => sum + val, 0);
  }
  private calculateThreeOfAKind(diceValues: number[], counts: Map<number, number>): number {
    for (const count of counts.values()) {
      if (count >= 3) return this.calculateChance(diceValues);
    }
    return 0;
  }
  private calculateFourOfAKind(diceValues: number[], counts: Map<number, number>): number {
    for (const count of counts.values()) {
      if (count >= 4) return this.calculateChance(diceValues);
    }
    return 0;
  }
  private calculateFullHouse(counts: Map<number, number>): number {
    const values = Array.from(counts.values());
    if ((values.includes(3) && values.includes(2)) || values.includes(5)) return 25;
    return 0;
  }
  private calculateSmallStraight(diceValues: number[]): number {
    const uniqueDice = new Set(diceValues);
    if (uniqueDice.has(1) && uniqueDice.has(2) && uniqueDice.has(3) && uniqueDice.has(4)) return 30;
    if (uniqueDice.has(2) && uniqueDice.has(3) && uniqueDice.has(4) && uniqueDice.has(5)) return 30;
    if (uniqueDice.has(3) && uniqueDice.has(4) && uniqueDice.has(5) && uniqueDice.has(6)) return 30;
    return 0;
  }
  private calculateLargeStraight(diceValues: number[]): number {
    const uniqueDice = new Set(diceValues);
    if (uniqueDice.has(1) && uniqueDice.has(2) && uniqueDice.has(3) && uniqueDice.has(4) && uniqueDice.has(5)) return 40;
    if (uniqueDice.has(2) && uniqueDice.has(3) && uniqueDice.has(4) && uniqueDice.has(5) && uniqueDice.has(6)) return 40;
    return 0;
  }
  private calculateKniffel(counts: Map<number, number>): number {
    if (Array.from(counts.values()).includes(5)) return 50;
    return 0;
  }
  private calculateChance(diceValues: number[]): number {
    return diceValues.reduce((sum, val) => sum + val, 0);
  }
}