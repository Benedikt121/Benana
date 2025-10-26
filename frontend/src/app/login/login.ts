import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-login',
  imports: [RouterLink],
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

  onSubmit() {
    this.errorMessage = null;
    this.successMessage = null;

    if (!this.loginData.username || !this.loginData.password) {
      this.errorMessage = 'Bitte füllen Sie alle Felder aus.';
      return;
    }

    this.http.post('/api/login', this.loginData).subscribe({
      next: (response: any) => {
        this.successMessage = 'Erfolgreich eingeloggt!';
        console.log('Login erfolgreich:', response);

        setTimeout(() => {
          this.router.navigate(['/']);
        }, 1000);
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
