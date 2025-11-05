import { AfterViewInit, Component, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

//@ts-ignore
import DiceBox from '@3d-dice/dice-box';

interface KniffelDie {
  die: any;
  isHeld: boolean;
}

export interface ScoreboardRow {
  id: string; // z.B. 'ones', 'threeOfAKind'
  name: string; // z.B. 'Einser', 'Dreierpasch'
  section: 'upper' | 'lower';
  score: number | null; // Der eingetragene Punktestand
  potentialScore: number; // Der mögliche Punktestand in diesem Wurf
  isSet: boolean; // Ist diese Zeile bereits belegt?
}

export interface TotalScores {
  upper: number;
  bonus: number;
  upperTotal: number;
  lowerTotal: number;
  grandTotal: number;
}

@Component({
  selector: 'app-kniffel',
  imports: [CommonModule, RouterModule],
  templateUrl: './kniffel.html',
  styleUrl: './kniffel.css'
})
export class Kniffel implements AfterViewInit {

  private diceBox: any; 
  public rollCount: number = 0;
  public dice: KniffelDie[] = [];

  isRolling: boolean = false;

  public scoreboard: ScoreboardRow[] = [];

  public upperScoreboard: ScoreboardRow[] = [];
  public lowerScoreboard: ScoreboardRow[] = [];

  public totalScores: TotalScores = {
    upper: 0,
    bonus: 0,
    upperTotal: 0,
    lowerTotal: 0,
    grandTotal: 0
  };

  constructor(private cdr: ChangeDetectorRef, private ngZone: NgZone) {}

  ngAfterViewInit(): void {
    this.diceBox = new DiceBox({
      container: '#dice-box',
      assetPath: '/assets/dice-box/',
      scale: 5,
      throwForce: 6,
      theme: 'default-extra',
    });

    this.diceBox.onRollComplete = (rollResult: any) => { 
      console.log('onRollComplete getriggert');

      if (!this.isRolling) { 
        console.log('...wird ignoriert (wahrscheinlich von remove() ausgelöst).');
        return; 
      }
      this.isRolling = false;

      this.ngZone.run(() => {
        const results = this.diceBox.getRollResults();
        console.log('getRollResults() von innen: ', results);
        
        let allRawDice: any[] = [];
        if (results && results.length > 0) {
          for (const group of results) {
            if (group && group.rolls && group.rolls.length > 0) {
              allRawDice = allRawDice.concat(group.rolls);
            }
          }
        }
        allRawDice.sort((a: any, b: any) => a.rollId - b.rollId); 
        if (this.rollCount === 1) {
          this.dice = allRawDice.map(rawDie => ({
            die: rawDie,
            isHeld: false
          }));
        } else {
          const heldDiceBeforeRoll = this.dice.filter(kd => kd.isHeld);
          const heldRollIds = new Set(heldDiceBeforeRoll.map(kd => kd.die.rollId));

          this.dice = allRawDice.map(rawDie => {
            if (heldRollIds.has(rawDie.rollId)) {
              return { die: rawDie, isHeld: true };
            } else {
              return { die: rawDie, isHeld: false };
            }
          });
        }
        
        console.log(`Ergebnis Wurf ${this.rollCount}:`, this.dice.map((kd) => kd.die.value));

        // NEU: Berechne die möglichen Punkte nach jedem Wurf
        this.updatePotentialScores();

        if (this.dice.length === 0) {
             console.error('onRollComplete feuerte, aber nach dem Sammeln waren keine Würfel da.');
        }

        if (this.rollCount === 3) {
          // Alle Würfel auf "gehalten" setzen (UI-Sperre)
          this.dice.forEach(kd => kd.isHeld = true);
          console.log('Letzter Wurf. Ergebnisse:', this.dice.map((kd) => kd.die.value));
        }
        
        this.cdr.detectChanges();
      });
    };

    this.diceBox.init().then(() => {
      console.log('Dice Box ist initialisiert und bereit.');
      this.initializeScoreboard();
    }).catch((e: any) => console.error(e));
  }

  initializeScoreboard(): void {
    this.scoreboard = [
      // Oberer Block
      { id: 'ones', name: 'Einser', section: 'upper', score: null, potentialScore: 0, isSet: false },
      { id: 'twos', name: 'Zweier', section: 'upper', score: null, potentialScore: 0, isSet: false },
      { id: 'threes', name: 'Dreier', section: 'upper', score: null, potentialScore: 0, isSet: false },
      { id: 'fours', name: 'Vierer', section: 'upper', score: null, potentialScore: 0, isSet: false },
      { id: 'fives', name: 'Fünfer', section: 'upper', score: null, potentialScore: 0, isSet: false },
      { id: 'sixes', name: 'Sechser', section: 'upper', score: null, potentialScore: 0, isSet: false },
      // Unterer Block
      { id: 'threeOfAKind', name: 'Dreierpasch', section: 'lower', score: null, potentialScore: 0, isSet: false },
      { id: 'fourOfAKind', name: 'Viererpasch', section: 'lower', score: null, potentialScore: 0, isSet: false },
      { id: 'fullHouse', name: 'Full Maus', section: 'lower', score: null, potentialScore: 0, isSet: false },
      { id: 'smallStraight', name: 'Kleine Straße', section: 'lower', score: null, potentialScore: 0, isSet: false },
      { id: 'largeStraight', name: 'Große Straße', section: 'lower', score: null, potentialScore: 0, isSet: false },
      { id: 'kniffel', name: 'Kniffel', section: 'lower', score: null, potentialScore: 0, isSet: false },
      { id: 'chance', name: 'Chance', section: 'lower', score: null, potentialScore: 0, isSet: false },
    ];
    
    this.upperScoreboard = this.scoreboard.filter(row => row.section === 'upper');
    this.lowerScoreboard = this.scoreboard.filter(row => row.section === 'lower');

    // Setze auch die Gesamtpunkte zurück
    this.totalScores = { upper: 0, bonus: 0, upperTotal: 0, lowerTotal: 0, grandTotal: 0 };
  }

  newGame(): void {
    this.rollCount = 0;
    this.dice = [];
    this.diceBox.clear(); 
    this.isRolling = false;
    console.log('Neues Spiel gestartet.');
    this.cdr.detectChanges();
    this.initializeScoreboard();
  }

  async rollDice(): Promise<void> {
    if (this.rollCount >= 3) {
      console.log('Maximale Anzahl an Würfen erreicht.');
      return;
    }
    
    if (this.isRolling) {
      console.log('Ignoriere Klick, Wurf läuft bereits.');
      return;
    } 

    try {
      this.rollCount++; 
      console.log(`Starte Wurf ${this.rollCount}...`);

      if (this.rollCount === 1) {
        this.isRolling = true; 
        await this.diceBox.roll('5dpip'); 
      } else {
        const diceToReroll = this.dice
          .filter(kd => !kd.isHeld)
          .map(kd => kd.die);


        if (diceToReroll.length > 0) {
          await this.diceBox.remove(diceToReroll);
          this.isRolling = true; 
          await this.diceBox.add(diceToReroll.length + 'dpip');
        } else {
           console.log('Alle Würfel gehalten, kein neuer Wurf.');
           this.rollCount--;
        }
      }
    } catch (e) {
      console.error('Fehler beim Würfeln:', e);
      this.isRolling = false;
    }
  }

  toggleHold(index: number): void {
    if (this.rollCount === 0 || !this.dice[index] || this.isRolling) {
      return;
    }
    
    this.dice[index].isHeld = !this.dice[index].isHeld;
    console.log('Würfel ' + index + ' gehalten:', this.dice[index].isHeld);

    this.cdr.detectChanges(); 
  }

  public selectScore(rowId: string): void {
    if (this.rollCount === 0 || this.isRolling || this.dice.length === 0) {
      return;
    }

    const row = this.scoreboard.find(r => r.id === rowId);

    if (!row || row.isSet) {
      return;
    }

    row.score = row.potentialScore;
    row.isSet = true;

    console.log(`Punkte eingetragen für ${row.name}: ${row.score}`);

    this.calculateTotals();

    this.nextRound();
  }

  private nextRound(): void {
    const allSet = this.scoreboard.every(r => r.isSet);
    if (allSet) {
      console.log('Spiel beendet! Gesamtpunktzahl:', this.totalScores.grandTotal);
      this.dice.forEach(kd => kd.isHeld = true);
      this.rollCount = 3;
      this.isRolling = true;
      this.cdr.detectChanges();
      return;
    }

    this.rollCount = 0;
    this.dice = [];
    this.diceBox.clear();
    
    this.scoreboard.forEach(r => r.potentialScore = 0);
    
    this.cdr.detectChanges();
  }

  private calculateTotals(): void {
    let upperScore = 0;
    this.scoreboard
      .filter(r => r.section === 'upper' && r.isSet)
      .forEach(r => upperScore += r.score || 0);
    
    this.totalScores.upper = upperScore;
    this.totalScores.bonus = (upperScore >= 63) ? 35 : 0;
    this.totalScores.upperTotal = this.totalScores.upper + this.totalScores.bonus;

    let lowerScore = 0;
    this.scoreboard
      .filter(r => r.section === 'lower' && r.isSet)
      .forEach(r => lowerScore += r.score || 0);

    this.totalScores.lowerTotal = lowerScore;
    this.totalScores.grandTotal = this.totalScores.upperTotal + this.totalScores.lowerTotal;
  }

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
          case 'ones':
            row.potentialScore = this.calculateSumOfNumber(diceValues, 1);
            break;
          case 'twos':
            row.potentialScore = this.calculateSumOfNumber(diceValues, 2);
            break;
          case 'threes':
            row.potentialScore = this.calculateSumOfNumber(diceValues, 3);
            break;
          case 'fours':
            row.potentialScore = this.calculateSumOfNumber(diceValues, 4);
            break;
          case 'fives':
            row.potentialScore = this.calculateSumOfNumber(diceValues, 5);
            break;
          case 'sixes':
            row.potentialScore = this.calculateSumOfNumber(diceValues, 6);
            break;
          case 'threeOfAKind':
            row.potentialScore = this.calculateThreeOfAKind(diceValues, counts);
            break;
          case 'fourOfAKind':
            row.potentialScore = this.calculateFourOfAKind(diceValues, counts);
            break;
          case 'fullHouse':
            row.potentialScore = this.calculateFullHouse(counts);
            break;
          case 'smallStraight':
            row.potentialScore = this.calculateSmallStraight(diceValues);
            break;
          case 'largeStraight':
            row.potentialScore = this.calculateLargeStraight(diceValues);
            break;
          case 'kniffel':
            row.potentialScore = this.calculateKniffel(counts);
            break;
          case 'chance':
            row.potentialScore = this.calculateChance(diceValues);
            break;
          default:
            row.potentialScore = 0;
        }
      }
    })
  }

  private getDiceCounts(diceValues: number[]): Map<number, number> {
    const counts = new Map<number, number>();
    for (const val of diceValues) {
      counts.set(val, (counts.get(val) || 0) + 1);
    }
    return counts;
  }

  private calculateSumOfNumber(diceValues: number[], targetNumber: number): number {
    return diceValues
      .filter(val => val === targetNumber)
      .reduce((sum, val) => sum + val, 0);
  }

  private calculateThreeOfAKind(diceValues: number[], counts: Map<number, number>): number {
    for (const count of counts.values()) {
      if (count >= 3) {
        return this.calculateChance(diceValues); // Summe aller Augen
      }
    }
    return 0;
  }

  private calculateFourOfAKind(diceValues: number[], counts: Map<number, number>): number {
    for (const count of counts.values()) {
      if (count >= 4) {
        return this.calculateChance(diceValues);
      }
    }
    return 0;
  }

  private calculateFullHouse(counts: Map<number, number>): number {
    const values = Array.from(counts.values());
    const hasThree = values.includes(3);
    const hasTwo = values.includes(2);
    const hasFive = values.includes(5);

    if ((hasThree && hasTwo) || hasFive) {
      return 25;
    }
    return 0;
  }

  private calculateSmallStraight(diceValues: number[]): number {
    const uniqueDice = new Set(diceValues);
    // 1-2-3-4, 2-3-4-5, oder 3-4-5-6
    if (uniqueDice.has(1) && uniqueDice.has(2) && uniqueDice.has(3) && uniqueDice.has(4)) return 30;
    if (uniqueDice.has(2) && uniqueDice.has(3) && uniqueDice.has(4) && uniqueDice.has(5)) return 30;
    if (uniqueDice.has(3) && uniqueDice.has(4) && uniqueDice.has(5) && uniqueDice.has(6)) return 30;
    return 0;
  }

  private calculateLargeStraight(diceValues: number[]): number {
    const uniqueDice = new Set(diceValues);
    // 1-2-3-4-5 oder 2-3-4-5-6
    if (uniqueDice.has(1) && uniqueDice.has(2) && uniqueDice.has(3) && uniqueDice.has(4) && uniqueDice.has(5)) return 40;
    if (uniqueDice.has(2) && uniqueDice.has(3) && uniqueDice.has(4) && uniqueDice.has(5) && uniqueDice.has(6)) return 40;
    return 0;
  }

  private calculateKniffel(counts: Map<number, number>): number {
    const values = Array.from(counts.values());
    if (values.includes(5)) {
      return 50;
    }
    return 0;
  }

  private calculateChance(diceValues: number[]): number {
    return diceValues.reduce((sum, val) => sum + val, 0);
  }
}