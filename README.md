# Phenn Map Annotation Tool

A TypeScript-based map annotation tool for the Phenn role-playing game world. Allows tracing and annotating a hand-drawn map with coastlines, towers, settlements, and roads.

*Phenn* is a role-playing game in development. See [this blog](https://www.schlaugh.com/phenn) for more information.

## Features

- **Coastline Drawing**: Trace the coastline by clicking points on the map. Close the loop to complete.
- **Towers**: Place towers of 9 different types (Aquagen, Aerogen, Petrogen, Biogen, Thermogen, Photogen, Keraunogen, Kinegen, Piezogen) with configurable power levels.
- **Settlements**: Add named settlements with variable sizes (size 0 = hollow circle, 1-5 = filled circles).
- **Roads**: Connect settlements with roads (safe = solid line, unsafe = dotted line).
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
│   │   ├── CoastlineMode.ts   # Coastline drawing
│   │   ├── TowerMode.ts       # Tower placement
│   │   ├── SettlementMode.ts  # Settlement placement
│   │   └── RoadMode.ts        # Road connections
│   ├── utils/
│   │   └── persistence.ts  # JSON save/load
│   └── data/
│       └── coastline.json  # Saved annotation data (optional)
```

## Implementation Status

### Completed

- [x] Project setup (Vite, TypeScript, Leaflet)
- [x] Map display with pan/zoom
- [x] Background image toggle
- [x] Coastline mode - add points, close loop
- [x] Tower mode - place towers with type and power selection
- [x] Settlement mode - place settlements with name and size
- [x] Road mode - connect settlements with safe/unsafe roads
- [x] Ocean/continent fill when background hidden
- [x] Undo support (Ctrl+Z)
- [x] JSON export/import persistence

### Planned

- [ ] Coastline editing - modify existing coastline segments
- [ ] Tower/settlement dragging - move existing markers
- [ ] Delete individual annotations
- [ ] Road properties editing
