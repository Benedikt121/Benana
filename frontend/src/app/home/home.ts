import { Component, HostListener, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../auth.spec';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home',
  imports: [RouterLink, CommonModule],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class Home {

  private canCreateHeart: boolean = true;

authService = inject(AuthService);

  constructor() { }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent) {
    this.createHeart(e.clientX, e.clientY);
  }

  @HostListener('document:touchmove', ['$event'])
  onTouchMove(e: TouchEvent) {
    e.preventDefault(); 
    
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      this.createHeart(touch.clientX, touch.clientY);
    }
  }

  private createHeart(x: number, y: number) {
    // Only create a heart if the cooldown is over
    if (!this.canCreateHeart) {
      return;
    }

    this.canCreateHeart = false;
    setTimeout(() => {
      this.canCreateHeart = true;
    }, 50); 

    const body = document.body;
    const heart = document.createElement('span');
    
    heart.className = 'mouse-heart';

    heart.style.left = x + 'px';
    heart.style.top = y + 'px';
    

    const size = Math.random() * 20; 
    heart.style.width = 10 + size + 'px';
    heart.style.height = 10 + size + 'px';
    
    const transformValue = Math.random() * 360;
    heart.style.transform = `rotate(${transformValue}deg)`;
    
    body.appendChild(heart);
    
    setTimeout(() => {
      heart.remove();
    }, 1000);
  }

  logout() {
    this.authService.logout();
  }
}
