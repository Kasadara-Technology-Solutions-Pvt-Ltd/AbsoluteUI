import { Directive, input, type InputSignal } from '@angular/core';
import { Container, Flex, Grid, Stack, type ContainerOptions, type FlexOptions, type GridOptions, type LayoutHandle, type StackOptions } from '@absoluteui/components/layout';
import { ComponentBridge, defined } from '../internal/bridge.js';
import { LayoutStyles } from '../internal/style-sheets.js';
import { loadStyles } from '../internal/styles.js';

/**
 * Angular bindings for layout primitives. They style the host in place; children
 * stay Angular-managed. The CSS classes (`aui-stack`, `aui-grid`, ...) also work directly.
 */
@Directive({ selector: '[auiStack]', exportAs: 'auiStack' })
export class AuiStack extends ComponentBridge<LayoutHandle<StackOptions>, StackOptions> {
  readonly gap: InputSignal<StackOptions['gap']> = input<StackOptions['gap']>();
  readonly align: InputSignal<StackOptions['align']> = input<StackOptions['align']>();

  constructor() {
    super();
    loadStyles(LayoutStyles);
    this.init({ create: (host, o) => Stack.apply(host, o), options: () => defined<StackOptions>({ gap: this.gap(), align: this.align() }) });
  }
}

@Directive({ selector: '[auiFlex]', exportAs: 'auiFlex' })
export class AuiFlex extends ComponentBridge<LayoutHandle<FlexOptions>, FlexOptions> {
  readonly gap: InputSignal<FlexOptions['gap']> = input<FlexOptions['gap']>();
  readonly align: InputSignal<FlexOptions['align']> = input<FlexOptions['align']>();
  readonly justify: InputSignal<FlexOptions['justify']> = input<FlexOptions['justify']>();
  readonly wrap: InputSignal<FlexOptions['wrap'] | undefined> = input<FlexOptions['wrap']>();
  readonly direction: InputSignal<FlexOptions['direction'] | undefined> = input<FlexOptions['direction']>(undefined, { alias: 'flexDirection' });

  constructor() {
    super();
    loadStyles(LayoutStyles);
    this.init({
      create: (host, o) => Flex.apply(host, o),
      options: () => defined<FlexOptions>({ gap: this.gap(), align: this.align(), justify: this.justify(), wrap: this.wrap(), direction: this.direction() }),
    });
  }
}

@Directive({ selector: '[auiGrid]', exportAs: 'auiGrid' })
export class AuiGrid extends ComponentBridge<LayoutHandle<GridOptions>, GridOptions> {
  readonly columns: InputSignal<GridOptions['columns'] | undefined> = input<GridOptions['columns']>();
  readonly minColumnWidth: InputSignal<GridOptions['minColumnWidth']> = input<GridOptions['minColumnWidth']>();
  readonly gap: InputSignal<GridOptions['gap']> = input<GridOptions['gap']>();

  constructor() {
    super();
    loadStyles(LayoutStyles);
    this.init({
      create: (host, o) => Grid.apply(host, o),
      options: () => defined<GridOptions>({ columns: this.columns(), minColumnWidth: this.minColumnWidth(), gap: this.gap() }),
    });
  }
}

@Directive({ selector: '[auiContainer]', exportAs: 'auiContainer' })
export class AuiContainer extends ComponentBridge<LayoutHandle<ContainerOptions>, ContainerOptions> {
  readonly size: InputSignal<ContainerOptions['size'] | undefined> = input<ContainerOptions['size']>();

  constructor() {
    super();
    loadStyles(LayoutStyles);
    this.init({ create: (host, o) => Container.apply(host, o), options: () => defined<ContainerOptions>({ size: this.size() }) });
  }
}
