import { Component, HostListener } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class Home {
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
    const body = document.body;
    const heart = document.createElement('span');
    
    heart.style.left = x + 'px';
    heart.style.top = y + 'px';
    
    const size = Math.random() * 20;
    heart.style.width = 20 + size + 'px';
    heart.style.height = 20 + size + 'px';
    
    const transformValue = Math.random() * 360;
    heart.style.transform = `rotate(${transformValue}deg)`;
    
    body.appendChild(heart);
    
    setTimeout(() => {
      heart.remove();
    }, 1000);
  }
}
