import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-register',
  imports: [RouterLink, CommonModule, FormsModule],
  templateUrl: './register.html',
  styleUrl: './register.css'
})
export class Register {

  registerData = {
    username: '',
    password: ''
  };

  errorMessage: string | null = null;
  successMessage: string | null = null;

  http = inject(HttpClient);
  router = inject(Router);
  
  onSubmit() {
    this.errorMessage = null;
    this.successMessage = null;

    this.http.post('/api/register', this.registerData).subscribe({
      next: () => {
        this.successMessage = 'Registration successful! You can now log in.';
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 2000);
      },
      error: (err) => {
        if (err.status === 401) {
          this.errorMessage = 'Username existiert bereits. Bitte wählen Sie einen anderen.';
      } else {
          this.errorMessage = 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.';
      }
      console.error('Registrierungsfehler: ', err);
    }
  });}
}
