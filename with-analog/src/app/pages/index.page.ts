import { load } from './index.server';
import { Component } from '@angular/core';
import { injectLoad } from '@analogjs/router';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  standalone: true,
  template: `{{ data()['version'] }}`,
})
export default class BlogComponent {
  data = toSignal(injectLoad<typeof load>(), { requireSync: true });
}
