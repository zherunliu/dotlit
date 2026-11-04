# Dotlit

A world travel map for tracking visits and plans. Record visits by city-level area in China and by country or territory elsewhere. Add ratings and notes, search for attractions, and export your map.

## Run locally

Requires Node.js 22.12 or later and pnpm 11. Tested with Node.js 24.

```sh
pnpm install
pnpm dev
```

Open the local URL printed in the terminal. Vite starts on port 4310 and tries the next available port if it is occupied.

```sh
pnpm test
pnpm build
pnpm preview
```

Serve the production build from `dist/` using any static HTTP server. The app loads its own bundled assets and runs entirely in the browser.

## Use the map

- Click China on the world map to open the province and city view. Click any other country or territory to edit its record. Visited Chinese cities also appear in color on the world map.
- Diamonds mark selected attractions. Search by name, alias, province, or city. Select a result to zoom to its location.
- A place can be both visited and planned. Visited places require a whole-number rating from 1 to 5 stars. Planned places get a pin. Select **Save** to apply your changes.
- Records live in `localStorage` under `dotlit.travel.v1`, scoped to the current browser and site origin. Clearing site data deletes those records.
- Export a JSON backup to keep your records or move them to another browser or device. The file includes the format version, map version, and export time.
- Review an import before confirming replacement. Legacy China-only backups replace only the China records. Files with invalid data, unknown or duplicate IDs, or incompatible versions are rejected.
- If browser storage fails, the current page keeps your records in memory so you can export a backup.
- Export the world map, China map, or selected province as a 3200 × 2080 PNG. The image includes boundaries and rating colors. China and province exports also include province names.

## Map coverage and data sources

Dotlit includes 238 countries and territories outside China, 391 recordable regions in China, and 204 selected attractions. The 180 attractions in China cover all 34 province-level areas on the map. Exploration progress counts recordable regions. Attraction markers are used for locating places.

- World boundaries come from the [Natural Earth 1:50m v5.1.2 country dataset](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/).
- Attraction coordinates come from [Wikidata](https://www.wikidata.org/). Each attraction panel links to its source entry.
- [DataV.GeoAtlas](https://datav.aliyun.com/portal/school/atlas/area_selector) provides mainland China, Hong Kong, and Macao boundaries, islands, and the maritime inset. The national file reports a last-modified date of June 29, 2021. The provincial files are historical snapshots captured at download time. The original DataV and Amap usage terms apply.
- Taiwan city and county boundaries come from the [National Land Surveying and Mapping Center dataset](https://data.gov.tw/dataset/7442), via the [taiwan-atlas 2021.9.20 release](https://github.com/dkaoster/taiwan-atlas). The original data uses the Open Government Data License, version 1.0. The MIT license for the conversion code is in `public/data/taiwan-atlas-LICENSE.txt`.

The boundaries are historical snapshots for travel visualization. Use a dedicated map for navigation or measurement. Taiwan's unprojected TWD97 coordinates are treated as approximately equivalent to WGS84 at this map scale. The data preparation step assigns the Kinmen islands to one recordable region and excludes offshore Taiwan geometry south of 21° N from the city and county layer. Provincial outlines are merged from simplified city-level geometry so the two layers share edges.

The repository includes the map and attraction data for development and builds. See `public/data/sources.json` for the China boundary sources and versions.

To regenerate the datasets, run:

```sh
pnpm data:prepare
node scripts/prepare-world.mjs
node scripts/prepare-attractions.mjs
```

The scripts retrieve source data from DataV, jsDelivr, Natural Earth, and Wikidata, and reuse downloads cached in `.cache/maps/`. Check region IDs and backup compatibility before changing a dataset version.

## Stack

React, TypeScript, Vite, D3 Geo, D3 Zoom, D3 Selection, SVG, and browser APIs for canvas rendering, files, blobs, and local storage. Vitest covers record rules, backups, and geographic data. Mapshaper prepares boundaries during development. The pnpm workspace configuration disables build scripts for unused native dependencies.
