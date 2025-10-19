import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Oly } from './oly';

describe('Oly', () => {
  let component: Oly;
  let fixture: ComponentFixture<Oly>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Oly]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Oly);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
