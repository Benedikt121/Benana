import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../auth';

@Component({
  selector: 'app-login',
  imports: [RouterLink, CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login {
  loginData = {
    username: '',
    password: ''
  };

  errorMessage: string | null = null;
  successMessage: string | null = null;

  http = inject(HttpClient);
  router = inject(Router);
  authService = inject(AuthService);

  onSubmit() {
    this.errorMessage = null;
    this.successMessage = null;

    if (!this.loginData.username || !this.loginData.password) {
      this.errorMessage = 'Bitte füllen Sie alle Felder aus.';
      return;
    }

    this.http.post<{ message: string, userId: number, username: string, dice_config: any }>('/api/login', this.loginData).subscribe({
      next: (response: any) => {
        this.successMessage = 'Erfolgreich eingeloggt!';
        console.log('Login erfolgreich:', response);

        this.authService.login({
          userId: response.userId,
          username: response.username,
          dice_config: response.dice_config
        });

        setTimeout(() => {
          this.router.navigate(['/']);
        }, 500);
      },
      
      error: (error) => {
        if (error.status === 401) {
          this.errorMessage = 'Ungültiger Benutzername oder Passwort.';
        } else {
          this.errorMessage = 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.';
        }
        console.error('Login fehlgeschlagen:', error);
      }
    });
  }
}
