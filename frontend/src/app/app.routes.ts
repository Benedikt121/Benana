import { Routes } from '@angular/router';
import { Home } from './home/home';
import { Oly } from './oly/oly';
import { Kniffel } from './kniffel/kniffel';
import { Login } from './login/login';
import { Register } from './register/register';
import { OlyStart } from './oly-start/oly-start';
import { olympiadeGuard } from './olympiade-guard';
import { Profile } from './profile/profile';


export const routes: Routes = [

    { path: '', component: Home},

    { path: 'oly', component: Oly, canActivate: [olympiadeGuard]},

    { path: 'kniffel', component: Kniffel},

    { path: 'login', component: Login},

    { path: 'register', component: Register},

    { path: 'olympiade-start', component: OlyStart},

    { path : 'profil/:id', component: Profile },

    { path: '**', redirectTo: '' , pathMatch: 'full' }

];
