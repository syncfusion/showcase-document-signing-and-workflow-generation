import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { removeLegacyKeys } from './app/shared/session/sessionStore';
import { preloadSignatureFonts } from './app/viewer/viewerShared';

// The Syncfusion license is activated before start and build by `npx syncfusion-license activate`, which reads the
// SYNCFUSION_LICENSE environment variable (syncfusion-angular-license, license-registration.md); no key is kept in source.

// Saved state from the earlier version of this sample never resurfaces (data-contract.md, session keys).
try { removeLegacyKeys(window.sessionStorage, window.localStorage); } catch { /* storage blocked */ }
// Typed signatures render on a canvas, which needs the handwriting fonts loaded first.
preloadSignatureFonts();

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
