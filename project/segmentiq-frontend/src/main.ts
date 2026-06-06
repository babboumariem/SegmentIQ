// src/main.ts
import { bootstrapApplication }    from '@angular/platform-browser';
import { provideAnimationsAsync }  from '@angular/platform-browser/animations/async';
import { provideHttpClient }       from '@angular/common/http';
import { AppComponent }            from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    provideAnimationsAsync(),
    provideHttpClient(),
  ],
}).catch(err => console.error(err));
