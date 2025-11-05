import { TestBed } from '@angular/core/testing';

import { KniffelState } from './kniffel-state';

describe('KniffelState', () => {
  let service: KniffelState;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(KniffelState);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
