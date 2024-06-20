import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideFileRouter } from '@analogjs/router';
import { withComponentInputBinding, withNavigationErrorHandler } from '@angular/router';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideFileRouter(
      withComponentInputBinding(),
      withNavigationErrorHandler(console.error)
    ),
    provideHttpClient(withFetch()),
    provideClientHydration(),
  ],
};
