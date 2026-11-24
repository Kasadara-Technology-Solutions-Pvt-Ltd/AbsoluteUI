/**
 * Component tokens (SPEC section 10.2): per-component overrides that fall back to a global
 * role token. A component token is unset by default, so `--aui-button-radius` resolves to
 * `var(--aui-radius-md)` until a theme defines it. Stylesheets reference them through
 * `aui.ctoken('button', 'radius')`; unknown names fail the build.
 */
import type { ContrastPair } from './tokens.js';

export type ComponentTokenKind = 'color' | 'dimension' | 'shadow' | 'font-weight' | 'font-family';

export interface ComponentTokenSpec {
  /** Global token used while the component token is unset. */
  readonly fallback: string;
  readonly kind: ComponentTokenKind;
  readonly usage: string;
}

export interface ComponentTokenGroup {
  readonly tokens: Readonly<Record<string, ComponentTokenSpec>>;
  /**
   * Contrast pairs the component renders. Names are component token names
   * (`button-primary-fg`) or global tokens; the compliance engine resolves each through
   * its fallback, so the same pairs apply whether or not a theme overrides them.
   */
  readonly contrastPairs: readonly ContrastPair[];
}

const t = (fallback: string, kind: ComponentTokenKind, usage: string): ComponentTokenSpec => ({ fallback, kind, usage });

const controlField = (label: string): Readonly<Record<string, ComponentTokenSpec>> => ({
  radius: t('radius-md', 'dimension', `${label} corner radius`),
  bg: t('color-surface', 'color', `${label} background`),
  'border-color': t('color-border-strong', 'color', `${label} boundary`),
  'padding-x': t('control-padding-x', 'dimension', `${label} inline padding`),
});

const fieldPairs = (c: string): readonly ContrastPair[] => [
  { foreground: 'color-text', background: `${c}-bg`, kind: 'text', usage: 'Entered value' },
  { foreground: 'color-text-muted', background: `${c}-bg`, kind: 'text', usage: 'Placeholder' },
  { foreground: `${c}-border-color`, background: `${c}-bg`, kind: 'non-text', usage: 'Control boundary against its fill' },
  { foreground: `${c}-border-color`, background: 'color-surface', kind: 'non-text', usage: 'Control boundary on surfaces' },
  { foreground: 'color-focus-ring', background: `${c}-bg`, kind: 'non-text', usage: 'Focus indicator' },
];

const popupTokens = (label: string): Readonly<Record<string, ComponentTokenSpec>> => ({
  'popup-radius': t('radius-md', 'dimension', `${label} listbox corner radius`),
  'popup-shadow': t('shadow-md', 'shadow', `${label} listbox elevation`),
  'option-radius': t('radius-sm', 'dimension', `${label} option corner radius`),
});

const chartPalette: Readonly<Record<string, ComponentTokenSpec>> = Object.fromEntries(
  [1, 2, 3, 4, 5, 6, 7, 8].map((n) => [String(n), t(`color-chart-${String(n)}`, 'color', `Series color, palette slot ${String(n)} (lines, bars, slices, markers)`)]),
);

export const componentTokens: Readonly<Record<string, ComponentTokenGroup>> = {
  button: {
    tokens: {
      radius: t('radius-md', 'dimension', 'Button corner radius'),
      height: t('control-height-md', 'dimension', 'Medium button height (and icon-only width)'),
      'padding-x': t('control-padding-x', 'dimension', 'Medium button inline padding'),
      'font-weight': t('font-weight-medium', 'font-weight', 'Label weight'),
      bg: t('color-surface', 'color', 'Default button background'),
      fg: t('color-text', 'color', 'Default button label'),
      'border-color': t('color-border-strong', 'color', 'Default button boundary'),
      'primary-bg': t('color-primary', 'color', 'Primary button background and boundary'),
      'primary-fg': t('color-on-primary', 'color', 'Primary button label'),
    },
    contrastPairs: [
      { foreground: 'button-fg', background: 'button-bg', kind: 'text', usage: 'Default button label' },
      { foreground: 'button-border-color', background: 'color-surface', kind: 'non-text', usage: 'Default button boundary' },
      { foreground: 'button-primary-fg', background: 'button-primary-bg', kind: 'text', usage: 'Primary button label' },
      { foreground: 'button-primary-bg', background: 'color-surface', kind: 'non-text', usage: 'Primary button boundary' },
      { foreground: 'color-focus-ring', background: 'color-surface', kind: 'non-text', usage: 'Button focus indicator' },
    ],
  },
  'text-input': {
    tokens: { ...controlField('Text input'), height: t('control-height-md', 'dimension', 'Text input height') },
    contrastPairs: fieldPairs('text-input'),
  },
  textarea: { tokens: controlField('Textarea'), contrastPairs: fieldPairs('textarea') },
  select: {
    tokens: { ...controlField('Select trigger'), height: t('control-height-md', 'dimension', 'Select trigger height'), ...popupTokens('Select') },
    contrastPairs: fieldPairs('select'),
  },
  combobox: {
    tokens: {
      ...controlField('Combobox input'),
      height: t('control-height-md', 'dimension', 'Combobox input height (and toggle width)'),
      ...popupTokens('Combobox'),
    },
    contrastPairs: fieldPairs('combobox'),
  },
  'multi-select': {
    tokens: {
      ...controlField('Multi select control'),
      'padding-x': t('space-1', 'dimension', 'Multi select control inline padding (around chips)'),
      height: t('control-height-md', 'dimension', 'Multi select minimum height (and toggle width)'),
      ...popupTokens('Multi select'),
      'chip-bg': t('color-surface-sunken', 'color', 'Selected value chip background'),
      'chip-fg': t('color-text', 'color', 'Selected value chip label'),
      'chip-radius': t('radius-sm', 'dimension', 'Selected value chip corner radius'),
    },
    contrastPairs: [
      ...fieldPairs('multi-select'),
      { foreground: 'multi-select-chip-fg', background: 'multi-select-chip-bg', kind: 'text', usage: 'Chip label' },
    ],
  },
  checkbox: {
    tokens: {
      size: t('icon-size-md', 'dimension', 'Box size'),
      radius: t('radius-sm', 'dimension', 'Box corner radius'),
      'border-color': t('color-border-strong', 'color', 'Unchecked box boundary'),
      'checked-bg': t('color-primary', 'color', 'Checked and indeterminate fill'),
      'mark-fg': t('color-on-primary', 'color', 'Check mark'),
    },
    contrastPairs: [
      { foreground: 'checkbox-border-color', background: 'color-surface', kind: 'non-text', usage: 'Unchecked box boundary' },
      { foreground: 'checkbox-checked-bg', background: 'color-surface', kind: 'non-text', usage: 'Checked box fill' },
      { foreground: 'checkbox-mark-fg', background: 'checkbox-checked-bg', kind: 'non-text', usage: 'Check mark on the checked fill' },
    ],
  },
  'radio-group': {
    tokens: {
      size: t('icon-size-md', 'dimension', 'Radio size'),
      'border-color': t('color-border-strong', 'color', 'Unchecked radio boundary'),
      'checked-bg': t('color-primary', 'color', 'Checked radio fill'),
      'dot-fg': t('color-on-primary', 'color', 'Checked radio dot'),
    },
    contrastPairs: [
      { foreground: 'radio-group-border-color', background: 'color-surface', kind: 'non-text', usage: 'Unchecked radio boundary' },
      { foreground: 'radio-group-checked-bg', background: 'color-surface', kind: 'non-text', usage: 'Checked radio fill' },
      { foreground: 'radio-group-dot-fg', background: 'radio-group-checked-bg', kind: 'non-text', usage: 'Dot on the checked fill' },
    ],
  },
  switch: {
    tokens: {
      'track-width': t('switch-width', 'dimension', 'Track width'),
      'track-height': t('switch-height', 'dimension', 'Track height (the thumb scales with it)'),
      radius: t('radius-pill', 'dimension', 'Track corner radius'),
      'track-bg': t('color-surface-sunken', 'color', 'Unchecked track fill'),
      'checked-bg': t('color-primary', 'color', 'Checked track fill'),
      'thumb-bg': t('color-border-strong', 'color', 'Unchecked thumb'),
      'thumb-checked-bg': t('color-on-primary', 'color', 'Checked thumb'),
    },
    contrastPairs: [
      { foreground: 'switch-thumb-bg', background: 'switch-track-bg', kind: 'non-text', usage: 'Unchecked thumb on its track' },
      { foreground: 'color-border-strong', background: 'switch-track-bg', kind: 'non-text', usage: 'Unchecked track boundary' },
      { foreground: 'switch-checked-bg', background: 'color-surface', kind: 'non-text', usage: 'Checked track on surfaces' },
      { foreground: 'switch-thumb-checked-bg', background: 'switch-checked-bg', kind: 'non-text', usage: 'Checked thumb on its track' },
    ],
  },
  card: {
    tokens: {
      radius: t('radius-md', 'dimension', 'Card and surface corner radius'),
      bg: t('color-surface', 'color', 'Card background'),
      'border-color': t('color-border', 'color', 'Card boundary (decorative)'),
      padding: t('space-inset', 'dimension', 'Header, body, and footer padding'),
      shadow: t('shadow-sm', 'shadow', 'Raised surface elevation'),
    },
    contrastPairs: [
      { foreground: 'color-text', background: 'card-bg', kind: 'text', usage: 'Card text' },
      { foreground: 'color-text-muted', background: 'card-bg', kind: 'text', usage: 'Card subtitle' },
      { foreground: 'color-link', background: 'card-bg', kind: 'text', usage: 'Card link' },
    ],
  },
  dialog: {
    tokens: {
      radius: t('radius-lg', 'dimension', 'Dialog corner radius'),
      bg: t('color-surface', 'color', 'Dialog background'),
      shadow: t('shadow-lg', 'shadow', 'Dialog elevation'),
      padding: t('space-5', 'dimension', 'Dialog inline padding'),
      backdrop: t('color-backdrop', 'color', 'Modal backdrop'),
    },
    contrastPairs: [
      { foreground: 'color-text', background: 'dialog-bg', kind: 'text', usage: 'Dialog text' },
      { foreground: 'color-text-muted', background: 'dialog-bg', kind: 'text', usage: 'Dialog description' },
    ],
  },
  drawer: {
    tokens: {
      bg: t('color-surface', 'color', 'Drawer background'),
      shadow: t('shadow-lg', 'shadow', 'Drawer elevation'),
      padding: t('space-5', 'dimension', 'Drawer inline padding'),
      backdrop: t('color-backdrop', 'color', 'Modal backdrop'),
    },
    contrastPairs: [
      { foreground: 'color-text', background: 'drawer-bg', kind: 'text', usage: 'Drawer text' },
      { foreground: 'color-text-muted', background: 'drawer-bg', kind: 'text', usage: 'Drawer description' },
    ],
  },
  tabs: {
    tokens: {
      'tab-padding-x': t('space-4', 'dimension', 'Tab inline padding'),
      'tab-fg': t('color-text-muted', 'color', 'Unselected tab label'),
      'tab-selected-fg': t('color-text', 'color', 'Selected tab label'),
      'indicator-color': t('color-primary', 'color', 'Selected tab indicator'),
      'indicator-width': t('border-width-strong', 'dimension', 'Selected tab indicator thickness'),
    },
    contrastPairs: [
      { foreground: 'tabs-tab-fg', background: 'color-surface', kind: 'text', usage: 'Unselected tab label' },
      { foreground: 'tabs-tab-fg', background: 'color-bg', kind: 'text', usage: 'Unselected tab label on the page background' },
      { foreground: 'tabs-tab-selected-fg', background: 'color-surface', kind: 'text', usage: 'Selected tab label' },
      { foreground: 'tabs-indicator-color', background: 'color-surface', kind: 'non-text', usage: 'Selected tab indicator' },
      { foreground: 'tabs-indicator-color', background: 'color-bg', kind: 'non-text', usage: 'Selected tab indicator on the page background' },
    ],
  },
  menu: {
    tokens: {
      radius: t('radius-md', 'dimension', 'Menu corner radius'),
      bg: t('color-surface', 'color', 'Menu background'),
      shadow: t('shadow-md', 'shadow', 'Menu elevation'),
      'item-radius': t('radius-sm', 'dimension', 'Menu item corner radius'),
      'item-height': t('control-height-sm', 'dimension', 'Menu item height'),
    },
    contrastPairs: [
      { foreground: 'color-text', background: 'menu-bg', kind: 'text', usage: 'Menu item label' },
      { foreground: 'color-text-muted', background: 'menu-bg', kind: 'text', usage: 'Menu item description and shortcut' },
      { foreground: 'color-error-fg', background: 'menu-bg', kind: 'text', usage: 'Danger menu item' },
    ],
  },
  tooltip: {
    tokens: {
      radius: t('radius-sm', 'dimension', 'Tooltip corner radius'),
      bg: t('color-inverse', 'color', 'Tooltip background'),
      fg: t('color-on-inverse', 'color', 'Tooltip text'),
      shadow: t('shadow-md', 'shadow', 'Tooltip elevation'),
    },
    contrastPairs: [{ foreground: 'tooltip-fg', background: 'tooltip-bg', kind: 'text', usage: 'Tooltip text' }],
  },
  popover: {
    tokens: {
      radius: t('radius-md', 'dimension', 'Popover corner radius'),
      bg: t('color-surface', 'color', 'Popover background'),
      'border-color': t('color-border', 'color', 'Popover boundary (decorative)'),
      shadow: t('shadow-md', 'shadow', 'Popover elevation'),
    },
    contrastPairs: [{ foreground: 'color-text', background: 'popover-bg', kind: 'text', usage: 'Popover text' }],
  },
  toast: {
    tokens: {
      radius: t('radius-md', 'dimension', 'Toast corner radius'),
      bg: t('color-surface', 'color', 'Toast background'),
      shadow: t('shadow-md', 'shadow', 'Toast elevation'),
    },
    contrastPairs: [
      { foreground: 'color-text', background: 'toast-bg', kind: 'text', usage: 'Toast text' },
      { foreground: 'color-info-fg', background: 'toast-bg', kind: 'non-text', usage: 'Info toast icon and boundary' },
      { foreground: 'color-success-fg', background: 'toast-bg', kind: 'non-text', usage: 'Success toast icon and boundary' },
      { foreground: 'color-warning-fg', background: 'toast-bg', kind: 'non-text', usage: 'Warning toast icon and boundary' },
      { foreground: 'color-error-fg', background: 'toast-bg', kind: 'non-text', usage: 'Error toast icon and boundary' },
    ],
  },
  alert: {
    tokens: {
      radius: t('radius-md', 'dimension', 'Alert corner radius'),
      'border-width': t('border-width', 'dimension', 'Alert boundary thickness'),
    },
    contrastPairs: [],
  },
  badge: {
    tokens: {
      radius: t('radius-pill', 'dimension', 'Badge corner radius'),
      'padding-x': t('space-2', 'dimension', 'Medium badge inline padding'),
      'font-weight': t('font-weight-medium', 'font-weight', 'Badge label weight'),
    },
    contrastPairs: [
      { foreground: 'color-text', background: 'color-surface-sunken', kind: 'text', usage: 'Neutral subtle badge label' },
      { foreground: 'color-text', background: 'color-info-subtle', backdrop: 'color-surface', kind: 'text', usage: 'Info subtle badge label' },
      { foreground: 'color-text', background: 'color-success-subtle', backdrop: 'color-surface', kind: 'text', usage: 'Success subtle badge label' },
      { foreground: 'color-text', background: 'color-warning-subtle', backdrop: 'color-surface', kind: 'text', usage: 'Warning subtle badge label' },
      { foreground: 'color-text', background: 'color-error-subtle', backdrop: 'color-surface', kind: 'text', usage: 'Error subtle badge label' },
      { foreground: 'color-text', background: 'color-surface', kind: 'text', usage: 'Outline badge label' },
    ],
  },
  avatar: {
    tokens: {
      bg: t('color-surface-sunken', 'color', 'Initials and icon background'),
      fg: t('color-text', 'color', 'Initials and icon color'),
      'square-radius': t('radius-md', 'dimension', 'Square avatar corner radius'),
    },
    contrastPairs: [{ foreground: 'avatar-fg', background: 'avatar-bg', kind: 'text', usage: 'Avatar initials' }],
  },
  carousel: {
    tokens: {
      radius: t('radius-md', 'dimension', 'Slide viewport corner radius'),
      indicator: t('color-primary', 'color', 'Slide picker dots'),
    },
    contrastPairs: [{ foreground: 'carousel-indicator', background: 'color-surface', kind: 'non-text', usage: 'Slide picker dots' }],
  },
  chat: {
    tokens: {
      'user-bg': t('color-selected', 'color', 'User message bubble background'),
      'user-fg': t('color-selected-text', 'color', 'User message text'),
      'assistant-bg': t('color-surface-sunken', 'color', 'Assistant, tool, and assistant avatar background'),
      'assistant-fg': t('color-text', 'color', 'Assistant and tool message text'),
      'code-bg': t('color-surface', 'color', 'Code block and inline code background'),
      'bubble-radius': t('radius-lg', 'dimension', 'Message bubble corner radius'),
    },
    contrastPairs: [
      { foreground: 'chat-user-fg', background: 'chat-user-bg', kind: 'text', usage: 'User message text' },
      { foreground: 'chat-assistant-fg', background: 'chat-assistant-bg', kind: 'text', usage: 'Assistant message text' },
      { foreground: 'color-link', background: 'chat-assistant-bg', kind: 'text', usage: 'Links in assistant messages' },
      { foreground: 'color-text', background: 'chat-code-bg', kind: 'text', usage: 'Code in messages' },
      { foreground: 'color-text-muted', background: 'chat-code-bg', kind: 'text', usage: 'Code block language label' },
      { foreground: 'color-text-muted', background: 'color-surface', kind: 'text', usage: 'Author, time, and day separators' },
      { foreground: 'color-error-fg', background: 'color-surface', kind: 'text', usage: 'Message error' },
      { foreground: 'color-focus-ring', background: 'color-surface', kind: 'non-text', usage: 'Chat focus indicators' },
    ],
  },
  discussion: {
    tokens: {
      indent: t('space-5', 'dimension', 'Indentation of one reply level'),
      'thread-line': t('color-border', 'color', 'Guide line along nested replies'),
      'mention-bg': t('color-selected', 'color', 'Mention chip background'),
      'mention-fg': t('color-selected-text', 'color', 'Mention chip text'),
    },
    contrastPairs: [
      { foreground: 'discussion-mention-fg', background: 'discussion-mention-bg', kind: 'text', usage: 'Mention chips' },
      { foreground: 'color-text-muted', background: 'color-surface', kind: 'text', usage: 'Time, replying-to, edited marker, and deleted placeholder' },
      { foreground: 'color-link', background: 'color-surface', kind: 'text', usage: 'Links in comments' },
      { foreground: 'color-error-fg', background: 'color-surface', kind: 'text', usage: 'Load errors' },
      { foreground: 'color-focus-ring', background: 'color-surface', kind: 'non-text', usage: 'Discussion focus indicators' },
    ],
  },
  'prompt-input': { tokens: controlField('Prompt input'), contrastPairs: fieldPairs('prompt-input') },
  diagram: {
    tokens: {
      'canvas-bg': t('color-surface-sunken', 'color', 'Diagram canvas background'),
      'node-bg': t('color-surface', 'color', 'Diagram node and edge label fill'),
      'node-border': t('color-border-strong', 'color', 'Diagram node outline'),
      'edge-color': t('color-border-strong', 'color', 'Diagram connector lines and arrowheads'),
      'grid-color': t('color-border', 'color', 'Diagram grid dots (decorative)'),
    },
    contrastPairs: [
      { foreground: 'color-text', background: 'diagram-node-bg', kind: 'text', usage: 'Diagram node and edge labels' },
      { foreground: 'diagram-node-border', background: 'diagram-canvas-bg', kind: 'non-text', usage: 'Diagram node outline' },
      { foreground: 'diagram-edge-color', background: 'diagram-canvas-bg', kind: 'non-text', usage: 'Diagram connectors and arrowheads' },
      { foreground: 'color-selected-text', background: 'color-selected', kind: 'text', usage: 'Selected diagram node' },
      { foreground: 'color-focus-ring', background: 'diagram-canvas-bg', kind: 'non-text', usage: 'Focused diagram node or connector' },
    ],
  },
  collapsible: {
    tokens: {
      radius: t('radius-md', 'dimension', 'Bordered collapsible corner radius'),
      'border-color': t('color-border', 'color', 'Bordered collapsible boundary (decorative)'),
    },
    contrastPairs: [
      { foreground: 'color-text', background: 'color-surface', kind: 'text', usage: 'Collapsible trigger and content' },
      { foreground: 'color-focus-ring', background: 'color-surface', kind: 'non-text', usage: 'Collapsible trigger focus indicator' },
    ],
  },
  'scroll-area': {
    tokens: {
      'fade-size': t('space-6', 'dimension', 'Length of the edge fade where more content exists'),
    },
    contrastPairs: [{ foreground: 'color-focus-ring', background: 'color-surface', kind: 'non-text', usage: 'Scroll area focus indicator' }],
  },
  slider: {
    tokens: {
      track: t('color-border-strong', 'color', 'Unfilled track'),
      fill: t('color-primary', 'color', 'Filled track and thumb boundary'),
    },
    contrastPairs: [
      { foreground: 'slider-fill', background: 'color-surface', kind: 'non-text', usage: 'Slider thumb boundary and filled track' },
      { foreground: 'slider-track', background: 'color-surface', kind: 'non-text', usage: 'Slider unfilled track' },
      { foreground: 'color-focus-ring', background: 'color-surface', kind: 'non-text', usage: 'Slider thumb focus indicator' },
    ],
  },
  rating: {
    tokens: {
      fill: t('color-warning-fg', 'color', 'Filled rating symbols'),
      empty: t('color-border-strong', 'color', 'Empty rating symbol outline'),
    },
    contrastPairs: [
      { foreground: 'rating-fill', background: 'color-surface', kind: 'non-text', usage: 'Rating filled symbols' },
      { foreground: 'rating-empty', background: 'color-surface', kind: 'non-text', usage: 'Rating empty symbol outline' },
      { foreground: 'color-focus-ring', background: 'color-surface', kind: 'non-text', usage: 'Rating focus indicator' },
    ],
  },
  'signature-pad': {
    tokens: {
      ink: t('color-text', 'color', 'Default pen color'),
      bg: t('color-surface', 'color', 'Drawing surface'),
      guide: t('color-border-strong', 'color', 'Signature baseline and pad boundary'),
    },
    contrastPairs: [
      { foreground: 'signature-pad-ink', background: 'signature-pad-bg', kind: 'non-text', usage: 'Signature strokes against the pad' },
      { foreground: 'signature-pad-guide', background: 'signature-pad-bg', kind: 'non-text', usage: 'Signature pad boundary and baseline' },
      { foreground: 'color-text-muted', background: 'signature-pad-bg', kind: 'text', usage: 'Signature pad placeholder' },
    ],
  },
  'tag-group': {
    tokens: {
      radius: t('radius-pill', 'dimension', 'Tag corner radius'),
      bg: t('color-surface', 'color', 'Tag background'),
      'border-color': t('color-border-strong', 'color', 'Tag boundary'),
    },
    contrastPairs: [
      { foreground: 'color-text', background: 'tag-group-bg', kind: 'text', usage: 'Tag label' },
      { foreground: 'tag-group-border-color', background: 'color-surface', kind: 'non-text', usage: 'Tag boundary' },
      { foreground: 'color-focus-ring', background: 'color-surface', kind: 'non-text', usage: 'Tag focus indicator' },
    ],
  },
  kbd: {
    tokens: {
      radius: t('radius-sm', 'dimension', 'Keycap corner radius'),
      bg: t('color-surface-sunken', 'color', 'Keycap background'),
      'border-color': t('color-border-strong', 'color', 'Keycap boundary'),
    },
    contrastPairs: [{ foreground: 'color-text', background: 'kbd-bg', kind: 'text', usage: 'Keycap label' }],
  },
  'virtual-list': {
    tokens: {
      radius: t('radius-md', 'dimension', 'Virtual list corner radius'),
      'border-color': t('color-border', 'color', 'Virtual list boundary (decorative)'),
    },
    contrastPairs: [
      { foreground: 'color-text', background: 'color-surface', kind: 'text', usage: 'Virtual list item text' },
      { foreground: 'color-selected-text', background: 'color-selected', kind: 'text', usage: 'Selected virtual list item' },
      { foreground: 'color-selected-indicator', background: 'color-selected', kind: 'non-text', usage: 'Selected item bar' },
      { foreground: 'color-focus-ring', background: 'color-surface', kind: 'non-text', usage: 'Focused virtual list item' },
    ],
  },
  splitter: {
    tokens: {
      size: t('space-3', 'dimension', 'Separator thickness (pointer target)'),
      'line-color': t('color-border', 'color', 'Separator line (decorative)'),
      'grip-color': t('color-border-strong', 'color', 'Separator grip and hovered line'),
    },
    contrastPairs: [
      { foreground: 'splitter-grip-color', background: 'color-surface', kind: 'non-text', usage: 'Splitter grip' },
      { foreground: 'color-focus-ring', background: 'color-surface', kind: 'non-text', usage: 'Focused separator' },
    ],
  },
  'code-viewer': {
    tokens: {
      bg: t('color-surface', 'color', 'Code background'),
      'gutter-bg': t('color-surface-sunken', 'color', 'Line number gutter and toolbar background'),
      'line-number': t('color-text-muted', 'color', 'Line numbers'),
      keyword: t('color-link', 'color', 'Keywords, literals, and Markdown headings'),
      string: t('color-success-fg', 'color', 'Strings and inline code'),
      number: t('color-error-fg', 'color', 'Numbers, colors, and entities'),
      comment: t('color-text-muted', 'color', 'Comments'),
      function: t('color-info-fg', 'color', 'Function names and decorators'),
      type: t('color-info-fg', 'color', 'Type names'),
      tag: t('color-error-fg', 'color', 'HTML tags and CSS selectors'),
      attr: t('color-link', 'color', 'Attributes, properties, and JSON keys'),
      variable: t('color-error-fg', 'color', 'Shell and SQL variables'),
      'added-bg': t('color-success-subtle', 'color', 'Added diff lines'),
      'removed-bg': t('color-error-subtle', 'color', 'Removed diff lines'),
      'highlight-bg': t('color-warning-subtle', 'color', 'Highlighted lines'),
      'highlight-indicator': t('color-warning-fg', 'color', 'Highlighted line bar'),
      'font-size': t('font-size-sm', 'dimension', 'Code font size'),
      radius: t('radius-md', 'dimension', 'Code viewer corner radius'),
    },
    contrastPairs: [
      { foreground: 'code-viewer-line-number', background: 'code-viewer-gutter-bg', kind: 'text', usage: 'Line numbers' },
      { foreground: 'color-text', background: 'code-viewer-gutter-bg', kind: 'text', usage: 'Code viewer toolbar text' },
      { foreground: 'code-viewer-highlight-indicator', background: 'code-viewer-highlight-bg', backdrop: 'code-viewer-bg', kind: 'non-text', usage: 'Highlighted line bar' },
      ...['bg', 'added-bg', 'removed-bg', 'highlight-bg'].flatMap((bg): ContrastPair[] =>
        ['color-text', 'code-viewer-keyword', 'code-viewer-string', 'code-viewer-number', 'code-viewer-comment', 'code-viewer-function', 'code-viewer-type', 'code-viewer-tag', 'code-viewer-attr', 'code-viewer-variable'].map((fg): ContrastPair => ({
          foreground: fg,
          background: `code-viewer-${bg}`,
          ...(bg === 'bg' ? {} : { backdrop: 'code-viewer-bg' }),
          kind: 'text',
          usage: `Code ${fg.replace('code-viewer-', '')} text on the ${bg === 'bg' ? 'code background' : bg.replace('-bg', ' line background')}`,
        })),
      ),
    ],
  },
  timeline: {
    tokens: {
      'line-color': t('color-border-strong', 'color', 'Timeline connector line'),
      'marker-size': t('icon-size-md', 'dimension', 'Timeline marker (icon) size'),
      'marker-neutral': t('color-text-muted', 'color', 'Timeline marker of a neutral item'),
      'marker-info': t('color-info-fg', 'color', 'Timeline marker of an info item'),
      'marker-success': t('color-success-fg', 'color', 'Timeline marker of a success item'),
      'marker-warning': t('color-warning-fg', 'color', 'Timeline marker of a warning item'),
      'marker-error': t('color-error-fg', 'color', 'Timeline marker of an error item'),
    },
    contrastPairs: [
      { foreground: 'color-text', background: 'color-surface', kind: 'text', usage: 'Timeline item title' },
      { foreground: 'color-text-muted', background: 'color-surface', kind: 'text', usage: 'Timeline time, status, and description' },
      { foreground: 'timeline-marker-neutral', background: 'color-surface', kind: 'non-text', usage: 'Timeline neutral marker' },
      { foreground: 'timeline-marker-info', background: 'color-surface', kind: 'non-text', usage: 'Timeline info marker' },
      { foreground: 'timeline-marker-success', background: 'color-surface', kind: 'non-text', usage: 'Timeline success marker' },
      { foreground: 'timeline-marker-warning', background: 'color-surface', kind: 'non-text', usage: 'Timeline warning marker' },
      { foreground: 'timeline-marker-error', background: 'color-surface', kind: 'non-text', usage: 'Timeline error marker' },
      { foreground: 'color-focus-ring', background: 'color-surface', kind: 'non-text', usage: 'Timeline focus indicator' },
    ],
  },
  'image-viewer': {
    tokens: {
      'stage-bg': t('color-surface-sunken', 'color', 'Image viewer stage behind the image'),
      'crop-border': t('color-focus-ring', 'color', 'Crop area outline and handles'),
      'crop-overlay': t('color-backdrop', 'color', 'Dimmed image outside the crop area'),
      'thumb-selected': t('color-primary', 'color', 'Ring of the current thumbnail'),
      radius: t('radius-md', 'dimension', 'Image viewer corner radius'),
    },
    contrastPairs: [
      { foreground: 'color-text', background: 'color-surface', kind: 'text', usage: 'Image viewer counter, caption, and tools' },
      { foreground: 'color-text-muted', background: 'image-viewer-stage-bg', kind: 'text', usage: 'Image viewer loading and error text' },
      { foreground: 'image-viewer-crop-border', background: 'image-viewer-stage-bg', kind: 'non-text', usage: 'Crop area outline' },
      { foreground: 'image-viewer-thumb-selected', background: 'color-surface', kind: 'non-text', usage: 'Current thumbnail ring' },
      { foreground: 'color-focus-ring', background: 'image-viewer-stage-bg', kind: 'non-text', usage: 'Image viewer stage focus indicator' },
    ],
  },
  'file-manager': {
    tokens: {
      'border-color': t('color-border', 'color', 'File manager outline, toolbar, and pane borders'),
      'drop-bg': t('color-info-subtle', 'color', 'Folder or pane under a drag'),
      'drop-border': t('color-focus-ring', 'color', 'Outline of the drop target'),
      'tile-radius': t('radius-md', 'dimension', 'Grid view tile corner radius'),
    },
    contrastPairs: [
      { foreground: 'color-text', background: 'color-surface', kind: 'text', usage: 'File names' },
      { foreground: 'color-text-muted', background: 'color-surface', kind: 'text', usage: 'Size, modified, and type columns; status bar' },
      { foreground: 'color-selected-text', background: 'color-selected', kind: 'text', usage: 'Selected entry' },
      { foreground: 'color-text', background: 'file-manager-drop-bg', backdrop: 'color-surface', kind: 'text', usage: 'File name in a drop target' },
      { foreground: 'file-manager-drop-border', background: 'color-surface', kind: 'non-text', usage: 'Drop target outline' },
      { foreground: 'color-selected-indicator', background: 'color-selected', kind: 'non-text', usage: 'Selected entry indicator' },
      { foreground: 'color-focus-ring', background: 'color-surface', kind: 'non-text', usage: 'Active entry and list focus indicator' },
    ],
  },
  'empty-state': {
    tokens: {
      'icon-color': t('color-text-muted', 'color', 'Empty state icon'),
      'icon-size': t('icon-size-xl', 'dimension', 'Empty state icon size (md; sm and lg scale from it)'),
    },
    contrastPairs: [
      { foreground: 'color-text', background: 'color-surface', kind: 'text', usage: 'Empty state title' },
      { foreground: 'color-text-muted', background: 'color-surface', kind: 'text', usage: 'Empty state description' },
    ],
  },
  'tree-view': {
    tokens: {
      radius: t('radius-md', 'dimension', 'Tree view corner radius'),
      'border-color': t('color-border', 'color', 'Tree view boundary (decorative)'),
      indent: t('space-5', 'dimension', 'Indent per tree level'),
    },
    contrastPairs: [
      { foreground: 'color-text', background: 'color-surface', kind: 'text', usage: 'Tree node label' },
      { foreground: 'color-text-muted', background: 'color-surface', kind: 'non-text', usage: 'Twisty and node icon' },
      { foreground: 'color-selected-text', background: 'color-selected', kind: 'text', usage: 'Selected tree node' },
      { foreground: 'color-selected-indicator', background: 'color-selected', kind: 'non-text', usage: 'Selected node bar' },
      { foreground: 'color-border-strong', background: 'color-surface', kind: 'non-text', usage: 'Unchecked node checkbox' },
      { foreground: 'color-on-primary', background: 'color-primary', kind: 'non-text', usage: 'Check mark on the checked fill' },
      { foreground: 'color-error-fg', background: 'color-surface', kind: 'text', usage: 'Load error message' },
      { foreground: 'color-focus-ring', background: 'color-surface', kind: 'non-text', usage: 'Focused node and drop indicator' },
    ],
  },
  'tree-select': {
    tokens: {
      ...controlField('Tree select control'),
      'padding-x': t('space-1', 'dimension', 'Tree select control inline padding (around tags)'),
      height: t('control-height-md', 'dimension', 'Tree select minimum height (and button width)'),
      'popup-radius': t('radius-md', 'dimension', 'Tree select popup corner radius'),
      'popup-shadow': t('shadow-md', 'shadow', 'Tree select popup elevation'),
      'tag-bg': t('color-surface-sunken', 'color', 'Selected value tag background'),
      'tag-radius': t('radius-sm', 'dimension', 'Selected value tag corner radius'),
    },
    contrastPairs: [
      ...fieldPairs('tree-select'),
      { foreground: 'color-text', background: 'tree-select-tag-bg', kind: 'text', usage: 'Tag label' },
    ],
  },
  'command-palette': {
    tokens: {
      radius: t('radius-lg', 'dimension', 'Command palette corner radius'),
      bg: t('color-surface', 'color', 'Command palette background'),
      shadow: t('shadow-lg', 'shadow', 'Command palette elevation'),
      backdrop: t('color-backdrop', 'color', 'Modal backdrop'),
      'option-radius': t('radius-sm', 'dimension', 'Result corner radius'),
    },
    contrastPairs: [
      { foreground: 'color-text', background: 'command-palette-bg', kind: 'text', usage: 'Command label and query' },
      { foreground: 'color-text-muted', background: 'command-palette-bg', kind: 'text', usage: 'Section headers, descriptions, and placeholder' },
      { foreground: 'color-selected-text', background: 'color-selected', kind: 'text', usage: 'Active result' },
      { foreground: 'color-focus-ring', background: 'command-palette-bg', kind: 'non-text', usage: 'Search field focus indicator' },
    ],
  },
  tour: {
    tokens: {
      radius: t('radius-lg', 'dimension', 'Tour step panel corner radius'),
      bg: t('color-surface', 'color', 'Tour step panel background'),
      shadow: t('shadow-lg', 'shadow', 'Tour step panel elevation'),
      backdrop: t('color-backdrop', 'color', 'Dimmed page around the spotlight'),
      'spotlight-radius': t('radius-md', 'dimension', 'Spotlight cut-out corner radius'),
      'spotlight-ring': t('color-focus-ring', 'color', 'Ring around the spotlighted element'),
      'dot-color': t('color-border-strong', 'color', 'Progress dot of a step not yet reached'),
      'dot-active': t('color-primary', 'color', 'Progress dot of the current step'),
    },
    contrastPairs: [
      { foreground: 'color-text', background: 'tour-bg', kind: 'text', usage: 'Tour step title and content' },
      { foreground: 'color-text-muted', background: 'tour-bg', kind: 'text', usage: 'Tour progress text' },
      { foreground: 'tour-spotlight-ring', background: 'color-surface', kind: 'non-text', usage: 'Spotlight ring around the target' },
      { foreground: 'tour-dot-active', background: 'tour-bg', kind: 'non-text', usage: 'Current progress dot' },
      { foreground: 'color-focus-ring', background: 'tour-bg', kind: 'non-text', usage: 'Tour panel focus indicator' },
    ],
  },
  'data-table': {
    tokens: {
      radius: t('radius-md', 'dimension', 'Table region corner radius'),
      bg: t('color-surface', 'color', 'Table background'),
      'border-color': t('color-border', 'color', 'Table region boundary (decorative)'),
      'header-bg': t('color-surface-sunken', 'color', 'Header row background'),
      'row-border-color': t('color-border', 'color', 'Row separators (decorative)'),
    },
    contrastPairs: [
      { foreground: 'color-text', background: 'data-table-bg', kind: 'text', usage: 'Cell text' },
      { foreground: 'color-text', background: 'data-table-header-bg', kind: 'text', usage: 'Header text' },
      { foreground: 'color-focus-ring', background: 'data-table-header-bg', kind: 'non-text', usage: 'Focused sort button' },
    ],
  },
  'data-grid': {
    tokens: {
      radius: t('radius-md', 'dimension', 'Grid corner radius'),
      bg: t('color-surface', 'color', 'Grid background'),
      'border-color': t('color-border', 'color', 'Grid boundary (decorative)'),
      'header-bg': t('color-surface-sunken', 'color', 'Header background'),
      'row-border-color': t('color-border', 'color', 'Row separators (decorative)'),
      'panel-shadow': t('shadow-md', 'shadow', 'Filter panel elevation'),
    },
    contrastPairs: [
      { foreground: 'color-text', background: 'data-grid-bg', kind: 'text', usage: 'Cell text' },
      { foreground: 'color-text', background: 'data-grid-header-bg', kind: 'text', usage: 'Header text' },
      { foreground: 'color-focus-ring', background: 'data-grid-bg', kind: 'non-text', usage: 'Focused cell' },
      { foreground: 'color-focus-ring', background: 'data-grid-header-bg', kind: 'non-text', usage: 'Focused header' },
      { foreground: 'color-primary', background: 'data-grid-header-bg', kind: 'non-text', usage: 'Active filter button' },
    ],
  },
  // Shared by every chart (R20-15): `--aui-chart-1` ... `--aui-chart-8`, `--aui-chart-grid-color`, ...
  chart: {
    tokens: {
      ...chartPalette,
      'grid-color': t('color-chart-grid', 'color', 'Gridlines (decorative)'),
      'axis-color': t('color-chart-axis', 'color', 'Axis lines, zero lines, and the crosshair'),
      'text-color': t('color-text-muted', 'color', 'Tick labels and axis titles'),
      'label-color': t('color-text', 'color', 'Value labels on bars, slices, and points'),
      'label-halo-color': t('color-surface', 'color', 'Halo behind value and annotation labels'),
      'font-family': t('font-family-sans', 'font-family', 'Chart text'),
      'font-size': t('font-size-xs', 'dimension', 'Plot text (tick labels, axis titles, value labels)'),
      'title-font-size': t('font-size-md', 'dimension', 'Chart title'),
      'legend-font-size': t('font-size-sm', 'dimension', 'Legend text'),
      'legend-gap': t('space-3', 'dimension', 'Gap between legend entries'),
      'line-width': t('border-width-strong', 'dimension', 'Series line width'),
      'tooltip-bg': t('color-surface', 'color', 'Tooltip background'),
      'tooltip-fg': t('color-text', 'color', 'Tooltip text'),
      'tooltip-border-color': t('color-border-strong', 'color', 'Tooltip boundary'),
      'tooltip-radius': t('radius-md', 'dimension', 'Tooltip corner radius'),
      'control-radius': t('radius-sm', 'dimension', 'Corner radius of the data-table toggle and container, zoom toolbar buttons, and legend buttons'),
      'tooltip-shadow': t('shadow-md', 'shadow', 'Tooltip elevation'),
    },
    contrastPairs: [
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((n): ContrastPair => ({ foreground: `chart-${String(n)}`, background: 'color-surface', kind: 'non-text', usage: `Chart series ${String(n)} on surfaces` })),
      { foreground: 'chart-axis-color', background: 'color-surface', kind: 'non-text', usage: 'Chart axis lines on surfaces' },
      { foreground: 'chart-text-color', background: 'color-surface', kind: 'text', usage: 'Chart tick labels and axis titles' },
      { foreground: 'chart-label-color', background: 'chart-label-halo-color', kind: 'text', usage: 'Chart value labels on their halo' },
      { foreground: 'chart-tooltip-fg', background: 'chart-tooltip-bg', kind: 'text', usage: 'Chart tooltip text' },
    ],
  },
  'candlestick-chart': {
    tokens: {
      'up-color': t('color-success-fg', 'color', 'Rising candles (outline of a hollow body), OHLC bars, and volume'),
      'down-color': t('color-error-fg', 'color', 'Falling candles (filled body), OHLC bars, and volume'),
    },
    contrastPairs: [
      { foreground: 'candlestick-chart-up-color', background: 'color-surface', kind: 'non-text', usage: 'Rising candle on surfaces' },
      { foreground: 'candlestick-chart-down-color', background: 'color-surface', kind: 'non-text', usage: 'Falling candle on surfaces' },
    ],
  },
};

/** Flat component token names (`button-radius`), in registry order. */
export const componentTokenNames: readonly string[] = Object.entries(componentTokens).flatMap(([c, g]) => Object.keys(g.tokens).map((p) => `${c}-${p}`));

/** Look up a component token by its flat name. */
export function getComponentToken(name: string): (ComponentTokenSpec & { readonly component: string; readonly property: string }) | undefined {
  for (const [component, group] of Object.entries(componentTokens)) {
    if (!name.startsWith(`${component}-`)) continue;
    const property = name.slice(component.length + 1);
    const spec = group.tokens[property];
    if (spec) return { ...spec, component, property };
  }
  return undefined;
}

/** SCSS map `$aui-component-tokens: (component: (property: fallback))` for `aui.ctoken()`. */
export function componentTokensToScss(): string {
  const lines = ['// Generated from @absoluteui/theme component tokens. Do not edit.', '$aui-component-tokens: ('];
  for (const [component, group] of Object.entries(componentTokens)) {
    lines.push(`  '${component}': (`);
    for (const [property, spec] of Object.entries(group.tokens)) lines.push(`    '${property}': '${spec.fallback}',`);
    lines.push('  ),');
  }
  lines.push(');', '');
  return lines.join('\n');
}
