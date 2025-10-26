import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { OlympiadeState } from './olympiade-state';
import { map, skipWhile } from 'rxjs/operators';
import { toObservable } from '@angular/core/rxjs-interop'; // Wichtig für Signals

export const olympiadeGuard: CanActivateFn = (route, state) => {
  const olyStateService = inject(OlympiadeState);
  const router = inject(Router);

  // Konvertiere das isLoading Signal in ein Observable
  const isLoading$ = toObservable(olyStateService.isLoading);

  return isLoading$.pipe(
    // Warte, bis der initiale Ladevorgang abgeschlossen ist
    skipWhile(loading => loading === true),
    map(() => {
      console.log(`>>> Guard Check: isLoading=${olyStateService.isLoading()}, isActive=${olyStateService.isActive()}`);
      if (olyStateService.isActive()) {
        // Wenn aktiv, leite zu /olympiade-start um
        console.log('Olympiade aktiv, leite um zu /olympiade-start');
        return router.parseUrl('/olympiade-start'); // Gibt UrlTree zurück für Umleitung
      } else {
        // Wenn inaktiv, erlaube Zugriff auf /oly
        console.log('Olympiade inaktiv, Zugriff auf /oly erlaubt');
        return true;
      }
    })
  );
};