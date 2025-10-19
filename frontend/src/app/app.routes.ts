import { Routes } from '@angular/router';
import { Home } from './home/home';
import { Oly } from './oly/oly';
import { Kniffel } from './kniffel/kniffel';
import { Login } from './login/login';
import { Register } from './register/register';


export const routes: Routes = [

    { path: '', component: Home},

    { path: 'oly', component: Oly},

    { path: 'kniffel', component: Kniffel},

    { path: 'login', component: Login},

    { path: 'register', component: Register},

    { path: '**', redirectTo: '' , pathMatch: 'full' }

];
