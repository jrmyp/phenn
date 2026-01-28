# Phenn Map Annotation Tool

A TypeScript-based map annotation tool for the Phenn role-playing game world. Allows tracing and annotating a hand-drawn map with coastlines, towers, settlements, and roads.

*Phenn* is a role-playing game in development. See [this blog](https://www.schlaugh.com/phenn) for more information.

## Features

- **Coastline Drawing & Editing**: Trace the coastline by clicking points, close the loop, then edit with replace segment, remove point, or move point modes.
- **Towers**: Place towers of 9 different types (Aquagen, Aerogen, Petrogen, Biogen, Thermogen, Photogen, Keraunogen, Kinegen, Piezogen) with configurable power levels. Click to select and edit type/power in sidebar. Ctrl+drag to move, Shift+click to delete.
- **Settlements**: Add settlements with variable sizes (size 0 = hollow "Empty" marker, 1-5 = filled circles). Click to select and edit name/size in sidebar. Ctrl+drag to move, Shift+click to delete.
- **Roads**: Connect settlements with roads (safe = solid line, unsafe = dotted line). Click road to select and edit properties in sidebar. Add waypoints with Alt+click to guide Bézier curves. Switch between Default (straight), Curves, and Nudge view modes. In Nudge view, frontier/tripoint tiles are shown around waypoints (blue=frontier, purple=tripoint), with a "Snap to Frontier" button to move waypoints to matching tiles. Shift+click to delete.
- **Harmonic Simulator**: Visualize the 9-dimensional harmonic field across the map. Uses barrier-based contribution model where nearby towers can block distant ones. Select layer types (individual dimensions, total, dominant, contributors, stability) with configurable hyperparameters. Click to inspect field values and see contributing towers with connection lines. The stability layer shows contested boundaries between tower pairs using line projections.
- **Mesh Refinement**: Alt+click cycles refinement levels: fine (cyan, 150px/10px) → finer (gold, 50px/3px) → remove. Allows detailed boundary inspection.
- **Nudge Engine**: In Settlement mode, compare lore (canonical) status with simulated status. Set stability/balance properties for settlements, then switch to Nudge view to see which nearby areas match. Green=stability match, Blue=balance match, Purple=both match. Settlement markers show overall match status (green/yellow/red). Ctrl+drag settlements toward matching areas.
- **Background Toggle**: Show/hide the reference map image; when hidden, displays ocean (pale blue) and continent (cream) fill.
- **Undo**: Ctrl+Z to undo actions.
- **Persistence**: Save annotations to JSON file.

## Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Tech Stack

- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast build tooling and dev server
- **Leaflet** - Map rendering with CRS.Simple for custom image coordinates

## Project Structure

```
phenn/
├── index.html              # Main HTML with sidebar layout
├── package.json
├── tsconfig.json
├── vite.config.ts
├── DESIGN.md               # Design document
├── src/
│   ├── main.ts             # Application entry point
│   ├── styles/
│   │   └── main.css        # Application styles
│   ├── assets/
│   │   └── map_v1.jpeg     # Background map image
│   ├── config/
│   │   └── constants.ts    # Map dimensions, colors, sizes
│   ├── types/
│   │   └── index.ts        # TypeScript interfaces
│   ├── state/
│   │   └── AppState.ts     # Observable store with undo
│   ├── map/
│   │   └── MapManager.ts   # Leaflet initialization
│   ├── annotations/
│   │   ├── CoastlineMode.ts   # Coastline drawing/editing
│   │   ├── TowerMode.ts       # Tower placement
│   │   ├── SettlementMode.ts  # Settlement placement
│   │   ├── RoadMode.ts        # Road connections
│   │   └── SimulatorMode.ts   # Harmonic field visualization
│   ├── utils/
│   │   └── persistence.ts  # JSON save/load
│   └── data/
│       └── coastline.json  # Saved annotation data
```

## Implementation Status

### Completed

- [x] Project setup (Vite, TypeScript, Leaflet)
- [x] Map display with pan/zoom
- [x] Background image toggle
- [x] Coastline mode - add points, close loop
- [x] Coastline editing - replace segments, remove points, move points
- [x] Tower mode - place towers with type and power selection
- [x] Settlement mode - place settlements with name and size
- [x] Road mode - connect settlements with safe/unsafe roads
- [x] Ocean/continent fill when background hidden
- [x] Undo support (Ctrl+Z)
- [x] JSON export/import persistence
- [x] Tower/settlement selection and editing via sidebar
- [x] Tower/settlement dragging (Ctrl+drag)
- [x] Delete annotations (Shift+click)
- [x] Settlement canonical status (lore) editing
- [x] Nudge Engine - visualize lore vs simulation match around settlements
