import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OlyStart } from './oly-start';

describe('OlyStart', () => {
  let component: OlyStart;
  let fixture: ComponentFixture<OlyStart>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OlyStart]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OlyStart);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
