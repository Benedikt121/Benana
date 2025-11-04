import { AfterViewInit, Component, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

//@ts-ignore
import DiceBox from '@3d-dice/dice-box';

interface KniffelDie {
  die: any;
  isHeld: boolean;
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
  
  // ====================================================================
  // ÄNDERUNG: 'dice' ist jetzt ein Array von 'KniffelDie'
  public dice: KniffelDie[] = [];
  // 'heldIndices' wird ENTFERNT
  // private heldIndices: boolean[] = [false, false, false, false, false]; // <-- WEG DAMIT
  // ====================================================================

  isRolling: boolean = false;

  constructor(private cdr: ChangeDetectorRef, private ngZone: NgZone) {}

  ngAfterViewInit(): void {
    this.diceBox = new DiceBox({
      container: '#dice-box',
      assetPath: '/assets/dice-box/',
      scale: 8,
      throwForce: 6,
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

        // ====================================================================
        // ÄNDERUNG: Wir bauen 'this.dice' jetzt intelligent neu auf,
        // um den 'isHeld'-Status zu erhalten.
        // ====================================================================
        if (this.rollCount === 1) {
          // Bei Wurf 1 ist es einfach: Alle sind neu und nicht gehalten
          this.dice = allRawDice.map(rawDie => ({
            die: rawDie,
            isHeld: false
          }));
        } else {
          // Bei Wurf 2 oder 3 müssen wir die gehaltenen Würfel identifizieren
          const heldDiceBeforeRoll = this.dice.filter(kd => kd.isHeld);
          const heldRollIds = new Set(heldDiceBeforeRoll.map(kd => kd.die.rollId));

          this.dice = allRawDice.map(rawDie => {
            if (heldRollIds.has(rawDie.rollId)) {
              // Dieser Würfel war gehalten. Status beibehalten.
              return { die: rawDie, isHeld: true };
            } else {
              // Dies ist ein neuer Würfel.
              return { die: rawDie, isHeld: false };
            }
          });
        }
        // ====================================================================
        
        console.log(`Ergebnis Wurf ${this.rollCount}:`, this.dice.map((kd) => kd.die.value));

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
    }).catch((e: any) => console.error(e));
  }

  newGame(): void {
    this.rollCount = 0;
    this.dice = []; // 'heldIndices' muss nicht mehr zurückgesetzt werden
    this.diceBox.clear(); 
    this.isRolling = false;
    console.log('Neues Spiel gestartet.');
    this.cdr.detectChanges();
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
        // 'heldIndices' muss nicht mehr zurückgesetzt werden
        this.isRolling = true; 
        await this.diceBox.roll('5d6'); 
      } else {
        // ====================================================================
        // ÄNDERUNG: Wir filtern 'this.dice' basierend auf 'kd.isHeld'
        const diceToReroll = this.dice
          .filter(kd => !kd.isHeld) // Finde die *Wrapper*, die nicht gehalten werden
          .map(kd => kd.die);      // Hole die *rohen Würfelobjekte* für die remove-Funktion
        // ====================================================================

        if (diceToReroll.length > 0) {
          await this.diceBox.remove(diceToReroll);
          this.isRolling = true; 
          await this.diceBox.add(diceToReroll.length + 'd6');
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
    
    // ====================================================================
    // ÄNDERUNG: Wir schalten den Status direkt am Objekt um
    this.dice[index].isHeld = !this.dice[index].isHeld;
    console.log('Würfel ' + index + ' gehalten:', this.dice[index].isHeld);
    // ====================================================================

    this.cdr.detectChanges(); 
  }
}