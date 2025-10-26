import { Injectable, signal, inject, WritableSignal, effect, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap, catchError, of, Subscription } from 'rxjs';
import { SocketService } from './socket';

interface OlympiadeStatus {
  isActive: boolean;
  gameIds: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class OlympiadeState implements OnDestroy{
  private http = inject(HttpClient);
  private socketService = inject(SocketService);

  isActive: WritableSignal<boolean> = signal(false);
  activeGameIds: WritableSignal<String | null> = signal(null);
  isLoading: WritableSignal<boolean> = signal(true);

  private stateUpdateSubscription: Subscription | null = null;

  constructor() {
    this.fetchInitialState();

    this.stateUpdateSubscription = this.socketService.listen<OlympiadeStatus>('olympiadeStateUpdate')
    .subscribe((status) => {
      console.log('Olympiade-Status-Update via Socket erhalten:', status);
      this.updateState(status);
      if (!this.isLoading()) {
        this.isLoading.set(false);
      }
    });

    this.socketService.listen<{message: string}>('olympiadeError')
    .subscribe((error) => {
      console.error('Olympiade-Fehler vom Server erhalten:', error.message);
      alert(`Olympiade-Fehler: ${error.message}`);
    });

    effect(() => {
      console.log('Olympiade Active: ${this.isActive()}, Game IDs: ${this.activeGameIds()}');
    });
  }

  fetchInitialState(): void {
    this.isLoading.set(true);
    this.http.get<OlympiadeStatus>('/api/olympiade/status').pipe(
      tap((status) => {
        if (this.isLoading()) {
          this.updateState(status);
        }
      }),
      catchError((error) => {
        console.error('Fehler beim Abrufen des Olympiade-Status:', error);
        if (this.isLoading()) {
          this.updateState({ isActive: false, gameIds: null });
        }
        return of(null);
      })
    ).subscribe(() => {
      if (this.isLoading()) {
        this.isLoading.set(false);
      }
    });
  }

  startOlympiade(gameIds: string): void {
    this.socketService.emit('startOlympiade', { gameIds });
  }

  endOlympiade(): void {
    this.socketService.emit('endOlympiade');
  }

  private updateState(status: OlympiadeStatus | null): void {
    if (status) {
      this.isActive.set(status.isActive);
      this.activeGameIds.set(status.gameIds);
    } else {
      this.isActive.set(false);
      this.activeGameIds.set(null);
    }
  }

  ngOnDestroy(): void {
    if (this.stateUpdateSubscription) {
      this.stateUpdateSubscription.unsubscribe();
    }
  }
}
  