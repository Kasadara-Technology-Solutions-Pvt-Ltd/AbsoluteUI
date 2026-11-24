import { Dashboard, type DashboardMode, type DashboardOptions } from '@absoluteui/components/dashboard';
import type { Controller } from '../internal/bridge.js';

/**
 * @internal Gives Dashboard the `update()` the Angular bridge expects (Dashboard has none):
 * a changed `definition` goes to `setDefinition()` only when it differs (as JSON) from the
 * current definition, a changed `mode` goes to `setMode()`, and any other option change
 * destroys and re-creates the dashboard on the same host. A re-created dashboard keeps the
 * current definition and mode (edit only while `editable`); undo history, the saved
 * definition, the page, and kiosk mode start fresh. Events are dispatched on the host, so
 * the bridge's listeners survive re-creation.
 */
export class DashboardController implements Controller<DashboardOptions> {
  readonly #host: HTMLElement;
  #options: DashboardOptions;
  #dashboard: Dashboard;

  constructor(host: HTMLElement, options: DashboardOptions) {
    this.#host = host;
    this.#options = { ...options };
    this.#dashboard = Dashboard.create(host, options);
  }

  /** The dashboard currently rendered on the host. */
  get dashboard(): Dashboard {
    return this.#dashboard;
  }

  update(changes: Partial<DashboardOptions>): void {
    const current = this.#dashboard;
    const recreate = Object.keys(changes).some((k) => k !== 'definition' && k !== 'mode');
    this.#options = { ...this.#options, ...changes };
    if (recreate) {
      const definition: unknown = 'definition' in changes ? changes.definition : current.definition;
      const wanted: DashboardMode = changes.mode ?? current.mode;
      const mode: DashboardMode = wanted === 'edit' && this.#options.editable !== true ? 'view' : wanted;
      current.destroy();
      this.#dashboard = Dashboard.create(this.#host, { ...this.#options, definition, mode });
      return;
    }
    if ('definition' in changes && JSON.stringify(changes.definition) !== JSON.stringify(current.definition)) {
      current.setDefinition(changes.definition);
    }
    if (changes.mode !== undefined && changes.mode !== current.mode) current.setMode(changes.mode);
  }

  destroy(): void {
    this.#dashboard.destroy();
  }
}
