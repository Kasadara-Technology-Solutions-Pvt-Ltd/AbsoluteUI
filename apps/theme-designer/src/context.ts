// Shared designer context: the store, the mode being edited and previewed, and
// cross-panel navigation (a compliance finding jumps to the token it names).
import type { ThemeMode } from '@absoluteui/theme';
import type { Store } from './store.js';

export type Panel = 'tokens' | 'components' | 'charts' | 'densities' | 'responsive' | 'seeds' | 'files';

export interface DesignerContext {
  readonly store: Store;
  mode(): ThemeMode;
  setMode(mode: ThemeMode): void;
  onModeChange(listener: (mode: ThemeMode) => void): void;
  /** Show a left-panel section. */
  showPanel(panel: Panel): void;
  /** Open the editor row for a global or component token and focus it. */
  revealToken(name: string): void;
}

export const modeLabels: Readonly<Record<ThemeMode, string>> = { light: 'Light', dark: 'Dark', 'high-contrast': 'High contrast' };
