import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Kniffel } from './kniffel';

describe('Kniffel', () => {
  let component: Kniffel;
  let fixture: ComponentFixture<Kniffel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Kniffel]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Kniffel);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
