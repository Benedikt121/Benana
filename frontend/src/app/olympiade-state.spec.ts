import { TestBed } from '@angular/core/testing';

import { OlympiadeState } from './olympiade-state';

describe('OlympiadeState', () => {
  let service: OlympiadeState;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(OlympiadeState);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
