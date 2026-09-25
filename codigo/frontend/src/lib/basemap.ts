import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec'

/**
 * A gazette-grey basemap on OpenFreeMap vector tiles (OpenMapTiles schema,
 * no API key). Land is paper, water a cool wash, borders are ink; nothing on
 * the base competes with the confidence inks drawn on top.
 */
const PAPER_DEEP = '#dfe6e3'
const WATER = '#aecbd8'
const INK = '#15212c'
const INK_2 = '#384552'
const ROAD = '#f8f9f7'
const ROAD_CASE = '#c6cfcb'

export const ECUADOR_BOUNDS: [[number, number], [number, number]] = [
  [-81.1, -5.1],
  [-75.1, 1.5],
]

export function gazetteBasemap(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      base: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
        attribution:
          '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> · © <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> · Datos © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      },
    },
    layers: [
      { id: 'paper', type: 'background', paint: { 'background-color': PAPER_DEEP } },
      {
        id: 'water',
        type: 'fill',
        source: 'base',
        'source-layer': 'water',
        paint: { 'fill-color': WATER },
      },
      {
        id: 'rivers',
        type: 'line',
        source: 'base',
        'source-layer': 'waterway',
        minzoom: 8,
        filter: ['==', ['get', 'class'], 'river'],
        paint: { 'line-color': WATER, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 14, 2.4] },
      },
      {
        id: 'roads-case',
        type: 'line',
        source: 'base',
        'source-layer': 'transportation',
        minzoom: 9,
        filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'], true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ROAD_CASE, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.2, 16, 9] },
      },
      {
        id: 'roads-minor',
        type: 'line',
        source: 'base',
        'source-layer': 'transportation',
        minzoom: 12,
        filter: ['match', ['get', 'class'], ['minor', 'service'], true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ROAD, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 16, 5] },
      },
      {
        id: 'roads',
        type: 'line',
        source: 'base',
        'source-layer': 'transportation',
        minzoom: 5,
        filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'], true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ROAD,
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 9, 1, 16, 7],
        },
      },
      {
        id: 'province-borders',
        type: 'line',
        source: 'base',
        'source-layer': 'boundary',
        filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
        paint: {
          'line-color': INK,
          'line-opacity': 0.45,
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 12, 1.2],
          'line-dasharray': [3, 2],
        },
      },
      {
        id: 'country-borders',
        type: 'line',
        source: 'base',
        'source-layer': 'boundary',
        filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
        paint: { 'line-color': INK, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1, 10, 2] },
      },
      {
        id: 'place-labels',
        type: 'symbol',
        source: 'base',
        'source-layer': 'place',
        minzoom: 5,
        filter: ['match', ['get', 'class'], ['city', 'town'], true, false],
        layout: {
          'text-field': ['coalesce', ['get', 'name:es'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 10, 13, 14, 15],
          'text-max-width': 8,
        },
        paint: {
          'text-color': INK_2,
          'text-halo-color': PAPER_DEEP,
          'text-halo-width': 1.4,
        },
      },
      {
        id: 'suburb-labels',
        type: 'symbol',
        source: 'base',
        'source-layer': 'place',
        minzoom: 12,
        filter: ['match', ['get', 'class'], ['suburb', 'neighbourhood', 'village'], true, false],
        layout: {
          'text-field': ['coalesce', ['get', 'name:es'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-max-width': 8,
        },
        paint: { 'text-color': INK_2, 'text-halo-color': PAPER_DEEP, 'text-halo-width': 1.2 },
      },
    ],
  }
}
