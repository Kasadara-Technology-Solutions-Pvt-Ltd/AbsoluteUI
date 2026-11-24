# Data Grid accessories

> Package: `@absoluteui/components/data-grid/accessories` | Styles: Menu, Context Menu, Dialog, Button, Tooltip | Since 0.8.0 | Status: R11

Optional parts of the [Data Grid](data-grid.md), passed in its `accessories` option. They attach when the grid is created (the grid must be in the document), and a grid that uses none ships none of them.

| Accessory | What it adds |
|---|---|
| `columnMenu(options?)` | The header menu: sorting, filter, pinning, grouping, hiding, Groups and Columns submenus. `items(column, defaults)` changes the entries. |
| `contextMenu(options?)` | The cell menu: copy (with or without headers), cut, paste, notes, pin row, Move row, Send to, Groups, Columns, Export. `items(target, defaults)` changes the entries; `export: { excel, pdf }` adds those formats. |
| `columnChooser()` | A dialog that shows, hides, and reorders columns at once (`open()`). |
| `sideBar(options?)` | Columns and Filters panels beside the rows (`panels`, `position`, `open`, `width`). |
| `statusBar(options?)` | Row counts, the selected count, aggregates of the cell ranges, and panels of your own. |
| `toolbar(options)` | Built-in buttons and buttons or menus of your own, next to the search box and the group and pivot panels. |
| `tooltips(options?)` | Delay, truncated-only, and hover-only modes for column `tooltip`s. |
| `find(options?)` | A search field over the displayed cells; F3 and Shift+F3 move between matches. |
| `notes(options)` | Cell notes stored by your application (`store: { get, set, index }`, `author`); Shift+F2 opens the note dialog. |

## Usage

```ts
import { DataGrid } from '@absoluteui/components/data-grid';
import { columnMenu, contextMenu, find, statusBar } from '@absoluteui/components/data-grid/accessories';

interface Person {
  id: string;
  name: string;
  age: number;
}

const host = document.createElement('div');
host.style.setProperty('block-size', '300px');
document.body.append(host);
DataGrid.create<Person>(host, {
  label: 'People',
  rows: [{ id: '1', name: 'Ada', age: 36 }, { id: '2', name: 'Ben', age: 29 }],
  rowId: (r) => r.id,
  cellSelection: true,
  accessories: [columnMenu(), contextMenu(), find(), statusBar()],
  columns: [
    { id: 'name', header: 'Name', field: 'name', filter: 'text' },
    { id: 'age', header: 'Age', field: 'age', type: 'number' },
  ],
});
```

## Behavior

- Entries that do not apply are left out of the menus; actions taken from a menu behave like their keyboard and pointer counterparts. Shift+F10 or the ContextMenu key opens the menu of the focused header or cell; outside headers and cells the browser's menu stays.
- Your own menu entries are `{ id, label, action, disabled, shortcut, icon, items }`; toolbar buttons are `{ id, label, icon, action }` or `items` for a menu. Labels are text, never HTML.
- Find matches cells of the displayed rows (all pages; rows of collapsed groups are not searched); `findShortcut: true` opts into Ctrl+F.
- The grid stores no notes: the store you pass decides where they live. An empty note deletes.
- Status bar and custom panels refresh after every change; aggregates appear while the cell ranges cover two cells or more.
