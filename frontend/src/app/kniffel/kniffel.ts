import { AfterViewInit, Component } from '@angular/core';

//@ts-ignore
import DiceBox from '@3d-dice/dice-box';

@Component({
  selector: 'app-kniffel',
  imports: [],
  templateUrl: './kniffel.html',
  styleUrl: './kniffel.css'
})
export class Kniffel implements AfterViewInit {
  private diceBox: DiceBox;
  public wurfErgebnis: any = null;
  
  ngAfterViewInit(): void {
    
    this.diceBox = new DiceBox({
      // HIER IST DIE KORREKTUR:
      // Übergib den String-Selektor für die ID, die wir im HTML vergeben haben.
      container: '#diceBoxContainer', 
      
      assetPath: '/assets/dice-box/', 
      scale: 7,
      theme: 'default'
    });

    // Der Rest bleibt gleich
    this.diceBox.init().then(() => {
      console.log('Dice Box ist initialisiert!');
    });

    this.diceBox.onRollComplete = (results: any) => {
      console.log('Wurf abgeschlossen:', results);
      this.wurfErgebnis = results;
    }
  }

  wuerfeln(): void {
    if (this.diceBox) {
      this.wurfErgebnis = null;
      this.diceBox.roll('1d20');
    }
  }
}
