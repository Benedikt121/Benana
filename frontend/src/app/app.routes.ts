import { Routes } from '@angular/router';
import { Home } from './home/home';
import { Oly } from './oly/oly';
import { Kniffel } from './kniffel/kniffel';


export const routes: Routes = [

    { path: '', component: Home},

    { path: 'oly', component: Oly},

    { path: 'kniffel', component: Kniffel},



    { path: '**', redirectTo: '' , pathMatch: 'full' }

];
