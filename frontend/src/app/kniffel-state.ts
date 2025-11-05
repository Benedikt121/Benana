import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { SocketService } from './socket'; //
import { AuthService } from './auth'; //

export interface ScoreboardRow {
  id: string; name: string; section: 'upper' | 'lower';
  score: number | null; potentialScore: number; isSet: boolean;
}
export interface TotalScores {
  upper: number; bonus: number; upperTotal: number;
  lowerTotal: number; grandTotal: number;
}
export interface KniffelDie {
  die: { value: number };
  isHeld: boolean;
}
export interface KniffelPlayer {
  userId: number;
  username: string;
  socketId: string;
}
export interface KniffelGameState {
  isActive: boolean;
  players: KniffelPlayer[];
  scoreboards: { [userId: string]: ScoreboardRow[] };
  totalScores: { [userId: string]: TotalScores };
  currentPlayerSocketId: string | null;
  currentDice: KniffelDie[];
  rollCount: number;
  lastRollNotation: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class KniffelStateService {

  private readonly _kniffelState = new BehaviorSubject<KniffelGameState | null>(null);
  
  readonly kniffelState$ = this._kniffelState.asObservable();

  private readonly _kniffelGameSaved = new Subject<void>();
  readonly kniffelGameSaved$ = this._kniffelGameSaved.asObservable();

  constructor(private socketService: SocketService, private authService: AuthService) {
    this.socketService.listen<KniffelGameState>('kniffel:stateUpdate').subscribe((data) => {
      this._kniffelState.next(data);
    });

    this.socketService.listen<void>('kniffel:gameSaved').subscribe(() => {
      this._kniffelGameSaved.next();
    })
  }

  joinGame() {
    const userData = this.authService.currentUser();
    if (userData) {
      this.socketService.emit('kniffel:joinGame', {
        userId: userData.userId,
        username: userData.username
      });
    }
  }

  rollDice() {
    this.socketService.emit('kniffel:rollDice');
  }

  toggleHold(index: number) {
    this.socketService.emit('kniffel:toggleHold', { index });
  }

  selectScore(rowId: string) {
    this.socketService.emit('kniffel:selectScore', { rowId });
  }

  newGame() {
    this.socketService.emit('kniffel:newGame');
  }
  
  saveGame() {
    this.socketService.emit('kniffel:saveGame');
  }

  public getMySocketId(): string {
    return this.socketService.getSocketId();
  }
}