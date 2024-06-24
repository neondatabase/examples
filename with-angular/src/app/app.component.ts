import { isPlatformBrowser } from '@angular/common';
import { Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  isBrowser: boolean;
  postgresVersion = '';
  title = 'with-angular';
  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }
  async ngOnInit() {
    if (this.isBrowser) {
      const fetchCall = await fetch('/api/data');
      const fetchResp = await fetchCall.json();
      this.postgresVersion = fetchResp.version;
    }
  }
}
