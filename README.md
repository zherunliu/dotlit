# Dotlit

A travel map for recording visits by city in China and by country or territory elsewhere.

## Quick start

Requires Node.js 22.12+ and pnpm 11.

```sh
pnpm install
pnpm dev
```

Open the URL printed in the terminal. Run `pnpm build` to generate a static site in `dist/`.

## Features

- Mark visits with star ratings and notes, or pin places you plan to visit.
- Search 204 attractions, including 180 in China, and zoom to their locations.
- Keep records in your browser, back them up as JSON, or export the map as a PNG.

## Data sources

- World boundaries from [Natural Earth](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/).
- China boundaries from [DataV.GeoAtlas](https://datav.aliyun.com/portal/school/atlas/area_selector) and [taiwan-atlas](https://github.com/dkaoster/taiwan-atlas). See [source details](public/data/sources.json).
- Attraction coordinates from [Wikidata](https://www.wikidata.org/).
