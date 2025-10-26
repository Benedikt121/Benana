import { TestBed } from '@angular/core/testing';
import { CanActivateFn } from '@angular/router';

import { olympiadeGuard } from './olympiade-guard';

describe('olympiadeGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) => 
      TestBed.runInInjectionContext(() => olympiadeGuard(...guardParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });
});
