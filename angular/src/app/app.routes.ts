import { Routes } from '@angular/router';
import { ShellComponent } from './shell/shell.component';

// The seven pages of the reference (app-plan.md, "Exact routes"); each loads on demand.
export const routes: Routes = [
  {
    path: '', component: ShellComponent, children: [
      { path: '', title: 'Dashboard · SignFlow', loadComponent: () => import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent) },
      { path: 'documents', title: 'Documents · SignFlow', loadComponent: () => import('./pages/documents/documents.component').then((m) => m.DocumentsComponent) },
      { path: 'templates', title: 'Templates · SignFlow', loadComponent: () => import('./pages/templates/templates.component').then((m) => m.TemplatesComponent) },
    ],
  },
  { path: 'new', title: 'New document · SignFlow', loadComponent: () => import('./pages/new-document/new-document.component').then((m) => m.NewDocumentComponent) },
  { path: 'prepare', loadComponent: () => import('./pages/prepare/prepare.component').then((m) => m.PrepareComponent) },
  { path: 'prepare/:documentId', loadComponent: () => import('./pages/prepare/prepare.component').then((m) => m.PrepareComponent) },
  { path: 'sign', loadComponent: () => import('./pages/sign/sign.component').then((m) => m.SignComponent) },
  { path: 'sign/:documentId', loadComponent: () => import('./pages/sign/sign.component').then((m) => m.SignComponent) },
  { path: 'completed', loadComponent: () => import('./pages/completed/completed.component').then((m) => m.CompletedComponent) },
  { path: 'completed/:documentId', loadComponent: () => import('./pages/completed/completed.component').then((m) => m.CompletedComponent) },
  { path: '**', redirectTo: '' },
];
