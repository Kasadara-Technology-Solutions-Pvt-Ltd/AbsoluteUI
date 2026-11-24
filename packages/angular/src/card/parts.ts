/**
 * Projected parts of `<aui-card>` (docs/PLAN-R9-ANGULAR.md M3):
 *
 * ```html
 * <aui-card title="Customer" subtitle="Since 2019">
 *   <aui-card-media><img src="..." alt=""></aui-card-media>
 *   <aui-card-content>...</aui-card-content>
 *   <aui-card-footer><button auiButton>Open</button></aui-card-footer>
 * </aui-card>
 * ```
 *
 * The parts stay Angular-managed; the card places them. Import `AUI_CARD` to get the card and its parts.
 */
import { Directive } from '@angular/core';

@Directive({ selector: 'aui-card-content' })
export class AuiCardContent {}

@Directive({ selector: 'aui-card-footer' })
export class AuiCardFooter {}

@Directive({ selector: 'aui-card-media' })
export class AuiCardMedia {}
