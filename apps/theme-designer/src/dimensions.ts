// SPEC section 10.1 design dimensions mapped to the tokens that implement them. Every
// dimension is listed, with the tokens that configure it or a note when the dimension is
// configured elsewhere in the designer (densities, responsive, component overrides).
import { optionalTokenNames, requiredTokenNames, scrollbarTokenNames } from '@absoluteui/theme';

export interface Dimension {
  readonly id: string;
  readonly label: string;
  /** Tokens edited in this group, in display order. */
  readonly tokens: readonly string[];
  /** Where the dimension is configured when it is not a plain token group. */
  readonly note?: string;
}

const pick = (re: RegExp, pool: readonly string[] = requiredTokenNames): string[] => pool.filter((n) => re.test(n));
const exact = (...names: string[]): string[] => names.filter((n) => requiredTokenNames.includes(n) || optionalTokenNames.includes(n));

export const dimensions: readonly Dimension[] = [
  { id: 'surfaces', label: 'Surface hierarchy', tokens: exact('color-bg', 'color-surface', 'color-surface-sunken', 'color-inverse', 'color-on-inverse') },
  {
    id: 'colors',
    label: 'Colors',
    tokens: exact('color-text', 'color-text-muted', 'color-primary', 'color-on-primary', 'color-secondary', 'color-link', 'color-border', 'color-border-strong'),
  },
  { id: 'semantic', label: 'Semantic colors', tokens: pick(/^color-(success|error|danger|warning|info|on-success|on-danger)/) },
  { id: 'hover', label: 'Hover states', tokens: exact('color-hover', 'color-primary-hover', 'color-danger-fill-hover') },
  { id: 'active', label: 'Active states', tokens: exact('color-active', 'color-primary-active') },
  { id: 'selected', label: 'Selected states', tokens: pick(/^color-selected/) },
  { id: 'disabled', label: 'Disabled states', tokens: exact('color-disabled-bg', 'color-text-disabled') },
  { id: 'focus', label: 'Focus indicators', tokens: exact('color-focus-ring', 'focus-ring-width', 'focus-ring-offset') },
  { id: 'backdrop', label: 'Overlay backdrop', tokens: exact('color-backdrop') },
  { id: 'dataviz', label: 'Data visualization palettes', tokens: pick(/^color-chart-/) },
  { id: 'fonts', label: 'Typography: font stacks', tokens: pick(/^font-family-/) },
  { id: 'type-scale', label: 'Type scale', tokens: pick(/^font-size-/) },
  { id: 'line-height', label: 'Line height', tokens: pick(/^line-height-/) },
  { id: 'font-weight', label: 'Font weight', tokens: pick(/^font-weight-/) },
  { id: 'spacing', label: 'Spacing', tokens: pick(/^space-/) },
  { id: 'controls', label: 'Control heights', tokens: [...pick(/^control-/), ...exact('touch-target-min')] },
  { id: 'borders', label: 'Border widths', tokens: pick(/^border-width/) },
  { id: 'border-styles', label: 'Border styles', tokens: [], note: 'Boundaries are always solid so they survive forced colors and print; style is not a token.' },
  { id: 'radii', label: 'Radii', tokens: pick(/^radius-/) },
  { id: 'elevation', label: 'Elevation and shadows', tokens: pick(/^shadow-/) },
  { id: 'icons', label: 'Icon sizing', tokens: pick(/^icon-size-/) },
  { id: 'motion', label: 'Transitions and animation duration', tokens: pick(/^duration-/) },
  { id: 'easing', label: 'Easing', tokens: pick(/^easing-/) },
  {
    id: 'layout',
    label: 'Layout widths',
    tokens: pick(/^(container-width-|dialog-width-|drawer-width-|popover-max-height|tooltip-max-width|toast-width|switch-|progress-height)/),
  },
  { id: 'scrollbar', label: 'Scrollbar appearance', tokens: [...scrollbarTokenNames], note: 'Standard scrollbar-color and scrollbar-width; unset keeps native scrollbars.' },
  { id: 'density', label: 'Component density', tokens: [], note: 'Edited under Densities (compact and spacious overrides).' },
  { id: 'responsive', label: 'Responsive token variations', tokens: [], note: 'Edited under Responsive (min-width breakpoint overrides).' },
  { id: 'component', label: 'Component-specific styling tokens', tokens: [], note: 'Edited under Components (18 components, falling back to global tokens).' },
];

/** Global tokens not placed in any group (kept empty by a unit-style check in the e2e suite). */
export function ungroupedTokens(): string[] {
  const grouped = new Set(dimensions.flatMap((d) => d.tokens));
  return requiredTokenNames.filter((n) => !grouped.has(n));
}

export const isColorToken = (name: string): boolean => name.startsWith('color-') || name === 'scrollbar-thumb' || name === 'scrollbar-track';
