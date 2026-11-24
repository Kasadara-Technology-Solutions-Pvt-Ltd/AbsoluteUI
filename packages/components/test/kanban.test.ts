import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import {
  columnCounts,
  Kanban,
  moveKanbanCard,
  positionOf,
  type KanbanCard,
  type KanbanCardActivateDetail,
  type KanbanCardMoveDetail,
  type KanbanCollapseChangeDetail,
  type KanbanColumn,
  type KanbanColumnMoveDetail,
  type KanbanMoveErrorDetail,
} from '@absoluteui/components/kanban';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const columns: KanbanColumn[] = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'In progress', wipLimit: 2 },
  { id: 'done', label: 'Done' },
];
const cards: KanbanCard[] = [
  { id: 'a', columnId: 'todo', title: 'Write spec', tags: ['docs'] },
  { id: 'b', columnId: 'todo', title: 'Review budget', description: 'Q4 numbers', color: 3 },
  { id: 'c', columnId: 'doing', title: 'Fix login' },
  { id: 'd', columnId: 'done', title: 'Release 1.0', locked: true },
];

// Unit tests load no component CSS: the layout rules that hit testing depends on.
const LAYOUT_CSS = `
.aui-kanban__board { overflow: auto; }
.aui-kanban__row { display: grid; grid-template-columns: var(--aui-kanban-template); gap: 8px; inline-size: max-content; }
.aui-kanban { --aui-kanban-column-width: 200px; --aui-kanban-collapsed-width: 40px; }
.aui-kanban__cell { min-block-size: 80px; padding: 4px; }
.aui-kanban__list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.aui-kanban__list--virtual { max-block-size: 400px; overflow: auto; overflow-anchor: none; }
.aui-kanban__card { display: flex; block-size: 40px; box-sizing: border-box; transform: translate(var(--aui-kanban-drag-x, 0px), var(--aui-kanban-drag-y, 0px)); }
.aui-kanban__card--dragging { pointer-events: none; }
.aui-kanban__instructions, .aui-kanban__sep { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); }
`;

function mount(options: Partial<Parameters<typeof Kanban.create>[1]> = {}): { k: Kanban; host: HTMLDivElement } {
  const host = document.createElement('div');
  host.style.setProperty('inline-size', '900px');
  const style = document.createElement('style');
  style.textContent = LAYOUT_CSS;
  document.body.append(style, host);
  const k = Kanban.create(host, { label: 'Sprint board', columns, cards, locale: 'en-US', ...options });
  return { k, host };
}
const card = (host: HTMLElement, id: string): HTMLElement => host.querySelector<HTMLElement>(`[data-aui-card="${id}"]`)!;
const listOf = (host: HTMLElement, column: string, lane?: string): HTMLElement =>
  host.querySelector<HTMLElement>(`.aui-kanban__cell[data-aui-column="${column}"]${lane === undefined ? '' : `[data-aui-lane="${lane}"]`} .aui-kanban__list`)!;
const ids = (list: HTMLElement): string[] => Array.from(list.querySelectorAll<HTMLElement>('.aui-kanban__card'), (li) => li.dataset.auiCard ?? '');
const button = (host: HTMLElement, action: string): HTMLButtonElement => host.querySelector<HTMLButtonElement>(`[data-aui-action="${action}"]`)!;
const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('kanban model', () => {
  it('moves cards within and across cells, keeping array order', () => {
    const moved = moveKanbanCard(cards, 'a', { columnId: 'doing', laneId: null, index: 0 });
    expect(moved.map((c) => `${c.id}:${c.columnId}`)).toEqual(['b:todo', 'a:doing', 'c:doing', 'd:done']);
    expect(positionOf(moved, 'a', false)).toEqual({ columnId: 'doing', laneId: null, index: 0 });
    const end = moveKanbanCard(cards, 'a', { columnId: 'todo', laneId: null });
    expect(positionOf(end, 'a', false)?.index).toBe(1);
    expect(moveKanbanCard(cards, 'd', { columnId: 'empty', laneId: null }).at(-1)?.id).toBe('d');
    expect(cards[0]?.columnId).toBe('todo');
    expect(columnCounts(cards).get('todo')).toBe(2);
  });

  it('validates options with KANBAN_OPTIONS', () => {
    const bad = (o: object): unknown => {
      try {
        mount(o);
      } catch (e) {
        return e instanceof AbsoluteUIError ? e.code : e;
      }
      return null;
    };
    expect(bad({ columns: [] })).toBe('KANBAN_OPTIONS');
    expect(bad({ cards: [{ id: 'x', columnId: 'nope', title: 'X' }] })).toBe('KANBAN_OPTIONS');
    expect(bad({ cards: [{ id: 'x', columnId: 'todo', title: 'X' }, { id: 'x', columnId: 'todo', title: 'Y' }] })).toBe('KANBAN_OPTIONS');
    expect(bad({ lanes: [{ id: 'l', label: 'L' }] })).toBe('KANBAN_OPTIONS');
    expect(bad({ columns: [{ id: 'a', label: 'A', wipLimit: 0 }], cards: [] })).toBe('KANBAN_OPTIONS');
  });
});

describe('kanban rendering', () => {
  it('renders headed columns, labelled lists, counts, and one tab stop', () => {
    const { host } = mount({ cards: [...cards, { id: 'e', columnId: 'doing', title: 'Deploy' }, { id: 'f', columnId: 'doing', title: 'Monitor' }] });
    const headings = Array.from(host.querySelectorAll('.aui-kanban__column-title[role="heading"]'), (h) => h.getAttribute('aria-level'));
    expect(headings).toEqual(['3', '3', '3']);
    const doing = host.querySelector<HTMLElement>('[data-aui-column="doing"].aui-kanban__column-header')!;
    expect(doing.querySelector('.aui-kanban__count')?.textContent).toBe('3 of 2');
    expect(doing.querySelector('.aui-kanban__over')?.textContent).toBe('Over limit');
    expect(listOf(host, 'todo').getAttribute('aria-label')).toBe('To do');
    expect(ids(listOf(host, 'todo'))).toEqual(['a', 'b']);
    expect(card(host, 'b').getAttribute('aria-posinset')).toBe('2');
    expect(card(host, 'b').getAttribute('aria-setsize')).toBe('2');
    expect(card(host, 'b').textContent).toContain('Q4 numbers');
    expect(card(host, 'b').classList.contains('aui-kanban__card--c3')).toBe(true);
    expect(card(host, 'd').textContent).toContain('Locked');
    expect(host.querySelectorAll('.aui-kanban__card[tabindex="0"]')).toHaveLength(1);
  });

  it('shows empty cells and collapses columns', () => {
    const changes: KanbanCollapseChangeDetail[] = [];
    const { k, host } = mount({ cards: cards.filter((c) => c.columnId !== 'done') });
    host.addEventListener('aui-collapse-change', (e) => changes.push((e as CustomEvent<KanbanCollapseChangeDetail>).detail));
    const empty = host.querySelector<HTMLElement>('.aui-kanban__cell[data-aui-column="done"] .aui-kanban__empty')!;
    expect(empty.hidden).toBe(false);
    const toggle = host.querySelector<HTMLButtonElement>('[data-aui-column="todo"] .aui-kanban__column-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click();
    expect(changes).toEqual([{ kind: 'column', id: 'todo', collapsed: true }]);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(card(host, 'a')).toBeNull();
    expect(host.querySelector('.aui-kanban__cell[data-aui-column="todo"] .aui-kanban__summary')?.textContent).toBe('2 cards');
    expect(k.columns.find((c) => c.id === 'todo')?.collapsed).toBe(true);
  });

  it('renders custom content and hides editing when not editable', () => {
    const { host } = mount({
      editable: false,
      renderCard: (c, { column, doc }) => {
        const s = doc.createElement('strong');
        s.textContent = `${c.title} (${column.label})`;
        return s;
      },
    });
    expect(card(host, 'a').textContent).toContain('Write spec (To do)');
    expect(host.querySelector<HTMLElement>('.aui-kanban__toolbar')?.hidden).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('.aui-kanban__column-handle')?.hidden).toBe(true);
  });
});

describe('kanban keyboard', () => {
  it('arrow keys move between cards, columns, and ends; Enter activates', async () => {
    const activated: string[] = [];
    const { host } = mount();
    host.addEventListener('aui-card-activate', (e) => activated.push((e as CustomEvent<KanbanCardActivateDetail>).detail.id));
    card(host, 'a').focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(card(host, 'b'));
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(card(host, 'c'));
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(card(host, 'd'));
    await userEvent.keyboard('{Control>}{Home}{/Control}');
    expect(document.activeElement).toBe(card(host, 'a'));
    await userEvent.keyboard('{Enter}');
    expect(activated).toEqual(['a']);
    expect(card(host, 'a').tabIndex).toBe(0);
    expect(card(host, 'd').tabIndex).toBe(-1);
  });

  it('Space picks up, arrows move across columns, Space drops and emits aui-card-move', async () => {
    const moves: KanbanCardMoveDetail[] = [];
    const { k, host } = mount();
    host.addEventListener('aui-card-move', (e) => moves.push((e as CustomEvent<KanbanCardMoveDetail>).detail));
    card(host, 'b').focus();
    await userEvent.keyboard(' ');
    expect(card(host, 'b').classList.contains('aui-kanban__card--held')).toBe(true);
    await userEvent.keyboard('{ArrowRight}');
    expect(ids(listOf(host, 'doing'))).toEqual(['c', 'b']);
    expect(document.activeElement).toBe(card(host, 'b'));
    await userEvent.keyboard('{ArrowUp}');
    expect(ids(listOf(host, 'doing'))).toEqual(['b', 'c']);
    expect(moves).toHaveLength(0);
    await userEvent.keyboard(' ');
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ reason: 'move', id: 'b', from: { columnId: 'todo', laneId: null, index: 1 }, to: { columnId: 'doing', laneId: null, index: 0 } });
    expect(k.positionOf('b')).toEqual({ columnId: 'doing', laneId: null, index: 0 });
    expect(document.activeElement).toBe(card(host, 'b'));
    expect(k.canUndo).toBe(true);
  });

  it('Escape and leaving the card cancel a keyboard move', async () => {
    const { k, host } = mount();
    card(host, 'a').focus();
    await userEvent.keyboard(' {ArrowRight}');
    expect(ids(listOf(host, 'doing'))).toContain('a');
    await userEvent.keyboard('{Escape}');
    expect(ids(listOf(host, 'todo'))).toEqual(['a', 'b']);
    expect(document.activeElement).toBe(card(host, 'a'));
    await userEvent.keyboard(' {ArrowDown}');
    await userEvent.keyboard('{Tab}');
    expect(ids(listOf(host, 'todo'))).toEqual(['a', 'b']);
    expect(k.canUndo).toBe(false);
  });

  it('locked cards cannot be picked up; block policy skips full columns', async () => {
    const { k, host } = mount({ wipPolicy: 'block', cards: [...cards, { id: 'e', columnId: 'doing', title: 'Deploy' }] });
    card(host, 'd').focus();
    await userEvent.keyboard(' ');
    expect(card(host, 'd').classList.contains('aui-kanban__card--held')).toBe(false);
    card(host, 'a').focus();
    await userEvent.keyboard(' {ArrowRight}');
    // "In progress" is full (2 of 2): the card jumps to "Done".
    expect(ids(listOf(host, 'done'))).toContain('a');
    await userEvent.keyboard(' ');
    expect(k.positionOf('a')?.columnId).toBe('done');
    expect(k.moveCard('b', { columnId: 'doing', laneId: null })).toBe(false);
  });

  it('undo and redo with Ctrl+Z / Ctrl+Y and the toolbar', async () => {
    const { k, host } = mount();
    k.moveCard('a', { columnId: 'done', laneId: null, index: 0 });
    expect(k.positionOf('a')?.columnId).toBe('done');
    card(host, 'a').focus();
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(k.positionOf('a')).toEqual({ columnId: 'todo', laneId: null, index: 0 });
    await userEvent.keyboard('{Control>}y{/Control}');
    expect(k.positionOf('a')?.columnId).toBe('done');
    button(host, 'undo').click();
    expect(k.positionOf('a')?.columnId).toBe('todo');
    expect(k.canRedo).toBe(true);
    expect(button(host, 'undo').getAttribute('aria-disabled')).toBe('true');
  });
});

describe('kanban events and saving', () => {
  it('a cancelled aui-card-move leaves the card', () => {
    const { k, host } = mount();
    host.addEventListener('aui-card-move', (e) => {
      e.preventDefault();
    });
    expect(k.moveCard('a', { columnId: 'done', laneId: null })).toBe(false);
    expect(ids(listOf(host, 'todo'))).toEqual(['a', 'b']);
  });

  it('moveCard failures roll back and emit aui-move-error', async () => {
    const errors: KanbanMoveErrorDetail[] = [];
    let reject: (e: Error) => void = () => undefined;
    const { k, host } = mount({
      moveCard: () =>
        new Promise<void>((_, r) => {
          reject = r;
        }),
    });
    host.addEventListener('aui-move-error', (e) => errors.push((e as CustomEvent<KanbanMoveErrorDetail>).detail));
    expect(k.moveCard('b', { columnId: 'done', laneId: null })).toBe(true);
    await tick();
    expect(k.pending).toEqual(['b']);
    expect(card(host, 'b').getAttribute('aria-busy')).toBe('true');
    expect(card(host, 'b').textContent).toContain('Saving');
    expect(k.undo()).toBe(false);
    reject(new Error('409'));
    await tick();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.id).toBe('b');
    expect(k.positionOf('b')).toEqual({ columnId: 'todo', laneId: null, index: 1 });
    expect(k.pending).toEqual([]);
    expect(k.canUndo).toBe(false);
  });

  it('moveCard times out and receives the signal', async () => {
    let signal: AbortSignal | null = null;
    const { k, host } = mount({
      requestTimeoutMs: 100,
      moveCard: (_move, s) => {
        signal = s;
        return new Promise<void>(() => undefined);
      },
    });
    const errors: unknown[] = [];
    host.addEventListener('aui-move-error', (e) => errors.push((e as CustomEvent<KanbanMoveErrorDetail>).detail.error));
    k.moveCard('a', { columnId: 'done', laneId: null });
    await tick(200);
    expect((signal as AbortSignal | null)?.aborted).toBe(true);
    expect((errors[0] as DOMException).name).toBe('TimeoutError');
    expect(k.positionOf('a')?.columnId).toBe('todo');
  });

  it('successful saves keep the move and pass all cards', async () => {
    const saved: KanbanCardMoveDetail[] = [];
    const { k } = mount({
      moveCard: async (move) => {
        saved.push(move);
        await tick(5);
      },
    });
    k.moveCard('a', { columnId: 'doing', laneId: null });
    await tick(30);
    expect(saved[0]?.cards.find((c) => c.id === 'a')?.columnId).toBe('doing');
    expect(k.positionOf('a')?.columnId).toBe('doing');
    expect(k.pending).toEqual([]);
  });
});

describe('kanban pointer', () => {
  it('single pointer: Move, then a click on the target card', () => {
    const { k, host } = mount();
    card(host, 'a').click();
    button(host, 'move').click();
    expect(button(host, 'move').getAttribute('aria-pressed')).toBe('true');
    expect(card(host, 'a').classList.contains('aui-kanban__card--picked')).toBe(true);
    card(host, 'c').click();
    expect(ids(listOf(host, 'doing'))).toEqual(['a', 'c']);
    expect(k.positionOf('a')?.columnId).toBe('doing');
    expect(button(host, 'move').getAttribute('aria-pressed')).toBe('false');
  });

  it('single pointer: a click on an empty cell moves the card to its end', () => {
    const { k, host } = mount();
    card(host, 'b').click();
    button(host, 'move').click();
    host.querySelector<HTMLElement>('.aui-kanban__cell[data-aui-column="done"]')!.click();
    expect(k.positionOf('b')).toEqual({ columnId: 'done', laneId: null, index: 1 });
  });

  it('drags a card to another column with real pointer events', async () => {
    const moves: KanbanCardMoveDetail[] = [];
    const { k, host } = mount();
    host.addEventListener('aui-card-move', (e) => moves.push((e as CustomEvent<KanbanCardMoveDetail>).detail));
    await userEvent.dragAndDrop(card(host, 'a'), card(host, 'c'), { targetPosition: { x: 20, y: 36 } });
    expect(moves).toHaveLength(1);
    expect(k.positionOf('a')?.columnId).toBe('doing');
    expect(card(host, 'a').style.getPropertyValue('--aui-kanban-drag-x')).toBe('');
  });
});

describe('kanban swimlanes and columns', () => {
  const lanes = [
    { id: 'web', label: 'Web' },
    { id: 'app', label: 'Mobile' },
  ];
  const laneCards: KanbanCard[] = [
    { id: 'w1', columnId: 'todo', laneId: 'web', title: 'Header' },
    { id: 'm1', columnId: 'todo', laneId: 'app', title: 'Splash' },
    { id: 'm2', columnId: 'doing', laneId: 'app', title: 'Push' },
  ];

  it('renders lanes as labelled sections and moves across them by keyboard', async () => {
    const { k, host } = mount({ lanes, cards: laneCards });
    const section = host.querySelector<HTMLElement>('section.aui-kanban__lane[data-aui-lane="app"]')!;
    expect(section.getAttribute('aria-labelledby')).toBeTruthy();
    expect(listOf(host, 'todo', 'app').getAttribute('aria-label')).toBe('To do, Mobile');
    card(host, 'w1').focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(card(host, 'm1'));
    await userEvent.keyboard(' {ArrowUp} ');
    expect(k.positionOf('m1')).toEqual({ columnId: 'todo', laneId: 'web', index: 1 });
    expect(() => k.moveCard('m1', { columnId: 'todo', laneId: null })).toThrow(AbsoluteUIError);
  });

  it('collapses swimlanes', () => {
    const { host } = mount({ lanes, cards: laneCards });
    const toggle = host.querySelector<HTMLButtonElement>('[data-aui-lane="app"] .aui-kanban__lane-toggle')!;
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(card(host, 'm1')).toBeNull();
  });

  it('reorders columns by keyboard and emits aui-column-move', async () => {
    const moved: KanbanColumnMoveDetail[] = [];
    const { k, host } = mount();
    host.addEventListener('aui-column-move', (e) => moved.push((e as CustomEvent<KanbanColumnMoveDetail>).detail));
    const handle = host.querySelector<HTMLButtonElement>('[data-aui-column="todo"] .aui-kanban__column-handle')!;
    expect(handle.getAttribute('aria-label')).toBe('Move column To do');
    handle.focus();
    await userEvent.keyboard(' {ArrowRight}{ArrowRight}');
    expect(document.activeElement).toBe(handle);
    await userEvent.keyboard(' ');
    expect(moved[0]).toMatchObject({ id: 'todo', from: 0, to: 2, order: ['doing', 'done', 'todo'] });
    expect(k.columns.map((c) => c.id)).toEqual(['doing', 'done', 'todo']);
    k.undo();
    expect(k.columns.map((c) => c.id)).toEqual(['todo', 'doing', 'done']);
    handle.focus();
    await userEvent.keyboard(' {ArrowRight}{Escape}');
    expect(k.columns.map((c) => c.id)).toEqual(['todo', 'doing', 'done']);
  });
});

describe('kanban virtualization and lifecycle', () => {
  const many: KanbanCard[] = Array.from({ length: 500 }, (_, i) => ({ id: `t${String(i)}`, columnId: 'todo', title: `Task ${String(i)}` }));

  it('renders only the cards in view of a large cell and focuses far cards', async () => {
    const { k, host } = mount({ cards: many });
    const list = listOf(host, 'todo');
    expect(list.classList.contains('aui-kanban__list--virtual')).toBe(true);
    const rendered = ids(list);
    expect(rendered.length).toBeLessThan(60);
    expect(card(host, 't0').getAttribute('aria-setsize')).toBe('500');
    k.focusCard('t400');
    await tick(50);
    expect(document.activeElement).toBe(card(host, 't400'));
    expect(card(host, 't400').getAttribute('aria-posinset')).toBe('401');
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(card(host, 't401'));
  });

  it('honours global configuration, update(), and destroy()', () => {
    configureAbsoluteUI({ components: { kanban: { headingLevel: 2 } } });
    const { k, host } = mount();
    expect(host.querySelector('.aui-kanban__column-title')?.getAttribute('aria-level')).toBe('2');
    k.update({ cards: [{ id: 'z', columnId: 'done', title: 'Only' }] });
    expect(ids(listOf(host, 'done'))).toEqual(['z']);
    expect(k.cards).toHaveLength(1);
    k.destroy();
    expect(host.childElementCount).toBe(0);
    expect(host.classList.contains('aui-kanban')).toBe(false);
  });
});
