/**
 * @absoluteui/angular: Angular integration (SPEC section 22, docs/PLAN-R9-ANGULAR.md).
 * Import components from their subpaths (for example `@absoluteui/angular/text-input`)
 * so applications ship only what they use.
 */
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  effect,
  inject,
  makeEnvironmentProviders,
  PLATFORM_ID,
  provideEnvironmentInitializer,
  untracked,
  type EnvironmentProviders,
  type Provider,
} from '@angular/core';
import { configureAbsoluteUI, onConfigChange, type CommonConfig } from '@absoluteui/core';
import { registerIcons, setIconProvider, type IconDefinition, type IconProvider } from '@absoluteui/icons';
import { startThemeRuntime } from '@absoluteui/theme';
import { AuiConfig, toLayer, type AbsoluteUIConfig } from './config.js';
import { AuiDirectionality, AuiLocale } from './services.js';

export { AuiConfig, type AbsoluteUIConfig } from './config.js';
export { AuiDirectionality, AuiIcons, AuiIds, AuiLocale, AuiPlatform, AuiTheme } from './services.js';

/** Application options for `provideAbsoluteUI`. */
export interface AbsoluteUIOptions extends AbsoluteUIConfig {
  /** Icon library adapter that resolves icon names (SPEC section 7.1). */
  icons?: IconProvider;
  /** Named icons added to the registry. */
  iconSet?: Readonly<Record<string, IconDefinition>>;
  /**
   * Apply theme, density, and animation mode to `<html>` (default true; on the server they
   * are written into the rendered document). `{ applyDirection: true }` also sets `dir`.
   */
  themeRuntime?: boolean | { applyDirection?: boolean };
}

function scopeProviders(factory: () => AuiConfig): Provider[] {
  return [
    { provide: AuiConfig, useFactory: factory },
    { provide: AuiLocale, useFactory: () => new AuiLocale(inject(AuiConfig)) },
    { provide: AuiDirectionality, useFactory: () => new AuiDirectionality(inject(AuiConfig)) },
  ];
}

function scope(config: AbsoluteUIConfig): () => AuiConfig {
  // Validate eagerly so a bad value fails at the provider, not at the first component.
  const layer = toLayer(config);
  return () => new AuiConfig(inject(AuiConfig, { skipSelf: true, optional: true }), layer);
}

function applyToDocument(doc: Document, common: Readonly<CommonConfig>, applyDirection: boolean): void {
  const root = doc.documentElement;
  root.setAttribute('data-aui-theme', common.theme);
  root.setAttribute('data-aui-density', common.density);
  root.setAttribute('data-aui-animation', common.animation);
  if (applyDirection) root.setAttribute('dir', common.direction);
}

/**
 * Application setup:
 * `bootstrapApplication(App, { providers: [provideAbsoluteUI({ timezone: 'Asia/Kolkata', components: { dataTable: { pageSize: 50 } } })] })`.
 * Optional: without it, components use their defaults. In a lazy route's providers it
 * creates a nested scope like `provideAbsoluteUIConfig`.
 */
export function provideAbsoluteUI(options: AbsoluteUIOptions = {}): EnvironmentProviders {
  const { icons, iconSet, themeRuntime = true, ...config } = options;
  const applyDirection = typeof themeRuntime === 'object' && themeRuntime.applyDirection === true;
  return makeEnvironmentProviders([
    ...scopeProviders(scope(config)),
    provideEnvironmentInitializer(() => {
      const aui = inject(AuiConfig);
      if (!aui.isRoot) return;
      if (iconSet) registerIcons(iconSet);
      if (icons) setIconProvider(icons);
      const destroyRef = inject(DestroyRef);
      if (isPlatformBrowser(inject(PLATFORM_ID))) {
        // The application scope is also the page-global layer in the browser (theme runtime,
        // plain AbsoluteUI code). Nested scopes and server rendering never write it.
        configureAbsoluteUI({ common: aui.layer().common, components: aui.layer().components });
        effect(() => {
          const layer = aui.layer();
          untracked(() => {
            configureAbsoluteUI({ common: layer.common, components: layer.components });
          });
        });
        destroyRef.onDestroy(onConfigChange(() => {
          aui.globalChanged();
        }));
        if (themeRuntime !== false) destroyRef.onDestroy(startThemeRuntime({ applyDirection }));
      } else if (themeRuntime !== false) {
        const doc = inject(DOCUMENT);
        applyToDocument(doc, aui.common(), applyDirection);
        effect(() => {
          applyToDocument(doc, aui.common(), applyDirection);
        });
      }
    }),
  ]);
}

/**
 * A nested configuration scope for a route or component subtree:
 * `@Component({ providers: [provideAbsoluteUIConfig({ timezone: 'Europe/Berlin' })] })`.
 * Settings merge over the parent scope and apply to every AbsoluteUI component inside.
 */
export function provideAbsoluteUIConfig(config: AbsoluteUIConfig): Provider[] {
  return scopeProviders(scope(config));
}
