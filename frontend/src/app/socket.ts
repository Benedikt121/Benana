import { Injectable, OnDestroy } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';


@Injectable({
  providedIn: 'root'
})
export class SocketService implements OnDestroy {
  private socket: Socket;

  constructor() {
    // Stellt die Verbindung zum Backend her (gleicher Host/Port wie die Angular App)
    // Passe dies an, wenn dein Backend woanders läuft (z.B. http://localhost:3000)
    console.log('Verbinde zu Socket.IO Endpoint:', environment.socketEndpoint);
    this.socket = io(environment.socketEndpoint, {
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket']
    });

    this.socket.on('connect', () => {
      console.log('Socket.IO verbunden:', this.socket.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket.IO getrennt:', reason);
    });

    this.socket.on('connect_error', (err) => {
        console.error('Socket.IO Verbindungsfehler:', err.message);
    });
  }

  // Generische Methode, um auf Events vom Server zu lauschen
  listen<T>(eventName: string): Observable<T> {
    return new Observable((subscriber) => {
      this.socket.on(eventName, (data: T) => {
        subscriber.next(data);
      });

      // Cleanup-Logik, wenn das Observable abbestellt wird
      return () => {
        this.socket.off(eventName);
      };
    });
  }

  // Generische Methode, um Events an den Server zu senden
  emit<T>(eventName: string, data?: T): void {
    this.socket.emit(eventName, data);
  }

  // Wird aufgerufen, wenn der Service zerstört wird (z.B. beim Schließen der App)
  ngOnDestroy(): void {
    if (this.socket) {
      this.socket.disconnect();
      console.log('Socket.IO Verbindung geschlossen.');
    }
  }

  public getSocketId(): string | any {
    return this.socket.id;
  }
}
