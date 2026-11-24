/**
 * Style-only components for the attribute directives (docs/PLAN-R9-ANGULAR.md D10).
 * Never rendered: `loadStyles()` creates each one once so Angular adds its styles.
 */
import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

@Component({ selector: 'aui-styles-button', template: '', styleUrls: ['../../../components/dist/button/style.css'], encapsulation: ViewEncapsulation.None, changeDetection: ChangeDetectionStrategy.OnPush })
export class ButtonStyles {}

@Component({
  selector: 'aui-styles-form',
  template: '',
  styleUrls: ['../../../components/dist/form/style.css', '../../../components/dist/error-summary/style.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormStyles {}

@Component({ selector: 'aui-styles-menu', template: '', styleUrls: ['../../../components/dist/menu/style.css'], encapsulation: ViewEncapsulation.None, changeDetection: ChangeDetectionStrategy.OnPush })
export class MenuStyles {}

@Component({
  selector: 'aui-styles-context-menu',
  template: '',
  styleUrls: ['../../../components/dist/context-menu/style.css', '../../../components/dist/menu/style.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContextMenuStyles {}

@Component({ selector: 'aui-styles-tooltip', template: '', styleUrls: ['../../../components/dist/tooltip/style.css'], encapsulation: ViewEncapsulation.None, changeDetection: ChangeDetectionStrategy.OnPush })
export class TooltipStyles {}

@Component({ selector: 'aui-styles-popover', template: '', styleUrls: ['../../../components/dist/popover/style.css'], encapsulation: ViewEncapsulation.None, changeDetection: ChangeDetectionStrategy.OnPush })
export class PopoverStyles {}

@Component({ selector: 'aui-styles-hover-card', template: '', styleUrls: ['../../../components/dist/hover-card/style.css'], encapsulation: ViewEncapsulation.None, changeDetection: ChangeDetectionStrategy.OnPush })
export class HoverCardStyles {}

@Component({ selector: 'aui-styles-layout', template: '', styleUrls: ['../../../components/dist/layout/style.css'], encapsulation: ViewEncapsulation.None, changeDetection: ChangeDetectionStrategy.OnPush })
export class LayoutStyles {}

@Component({ selector: 'aui-styles-toast', template: '', styleUrls: ['../../../components/dist/toast/style.css'], encapsulation: ViewEncapsulation.None, changeDetection: ChangeDetectionStrategy.OnPush })
export class ToastStyles {}

@Component({
  selector: 'aui-styles-dialog',
  template: '',
  styleUrls: ['../../../components/dist/dialog/style.css', '../../../components/dist/button/style.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogStyles {}

@Component({
  selector: 'aui-styles-drawer',
  template: '',
  styleUrls: ['../../../components/dist/drawer/style.css', '../../../components/dist/button/style.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DrawerStyles {}

@Component({ selector: 'aui-styles-typography', template: '', styleUrls: ['../../../components/dist/typography/style.css'], encapsulation: ViewEncapsulation.None, changeDetection: ChangeDetectionStrategy.OnPush })
export class TypographyStyles {}

@Component({ selector: 'aui-styles-fieldset', template: '', styleUrls: ['../../../components/dist/fieldset/style.css'], encapsulation: ViewEncapsulation.None, changeDetection: ChangeDetectionStrategy.OnPush })
export class FieldsetStyles {}

@Component({ selector: 'aui-styles-scroll-area', template: '', styleUrls: ['../../../components/dist/scroll-area/style.css'], encapsulation: ViewEncapsulation.None, changeDetection: ChangeDetectionStrategy.OnPush })
export class ScrollAreaStyles {}
