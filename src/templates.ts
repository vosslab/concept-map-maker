// Template data module for the Concept Map Maker.
//
// Provides pre-filled example concept maps so a first-time user can load a
// real map in one click. Pure data -- no Solid or DOM imports.

import type { CmapDocument } from "./types";

// One entry in the template gallery shown on the empty-state panel.
export interface TemplateEntry {
  id: string;
  label: string;
  description: string;
  doc: CmapDocument;
}

//============================================
// Template definitions
//============================================

// Honeybees template: organism, behavior, and environment relationships.
const honeybee_doc: CmapDocument = {
  format: "concept-map-maker",
  version: 1,
  title: "Honeybees",
  triples: [
    { id: "t1", from: "Honeybee", verb: "lives in", to: "Hive" },
    { id: "t2", from: "Honeybee", verb: "collects", to: "Nectar" },
    { id: "t3", from: "Nectar", verb: "is converted to", to: "Honey" },
    { id: "t4", from: "Honeybee", verb: "performs", to: "Waggle dance" },
    { id: "t5", from: "Waggle dance", verb: "communicates", to: "Food location" },
    { id: "t6", from: "Honeybee", verb: "pollinates", to: "Flower" },
    { id: "t7", from: "Flower", verb: "produces", to: "Nectar" },
    { id: "t8", from: "Hive", verb: "is managed by", to: "Queen bee" },
  ],
  overrides: {},
  theme: { shape: "rounded", palette: "earth" },
};

// Water cycle template: evaporation, condensation, and precipitation relationships.
const water_cycle_doc: CmapDocument = {
  format: "concept-map-maker",
  version: 1,
  title: "Water cycle",
  triples: [
    { id: "t1", from: "Sun", verb: "heats", to: "Water" },
    { id: "t2", from: "Water", verb: "undergoes", to: "Evaporation" },
    { id: "t3", from: "Evaporation", verb: "produces", to: "Water vapor" },
    { id: "t4", from: "Water vapor", verb: "rises into", to: "Atmosphere" },
    { id: "t5", from: "Atmosphere", verb: "cools to cause", to: "Condensation" },
    { id: "t6", from: "Condensation", verb: "forms", to: "Cloud" },
    { id: "t7", from: "Cloud", verb: "releases", to: "Precipitation" },
    { id: "t8", from: "Precipitation", verb: "returns water to", to: "Ocean" },
    { id: "t9", from: "Ocean", verb: "is source of", to: "Water" },
  ],
  overrides: {},
  theme: { shape: "rounded", palette: "earth" },
};

// Photosynthesis template: inputs, process, and outputs of photosynthesis.
const photosynthesis_doc: CmapDocument = {
  format: "concept-map-maker",
  version: 1,
  title: "Photosynthesis",
  triples: [
    { id: "t1", from: "Plant", verb: "absorbs", to: "Sunlight" },
    { id: "t2", from: "Plant", verb: "takes in", to: "Carbon dioxide" },
    { id: "t3", from: "Plant", verb: "takes in", to: "Water" },
    { id: "t4", from: "Sunlight", verb: "powers", to: "Photosynthesis" },
    { id: "t5", from: "Carbon dioxide", verb: "is used in", to: "Photosynthesis" },
    { id: "t6", from: "Water", verb: "is used in", to: "Photosynthesis" },
    { id: "t7", from: "Photosynthesis", verb: "produces", to: "Glucose" },
    { id: "t8", from: "Photosynthesis", verb: "releases", to: "Oxygen" },
    { id: "t9", from: "Glucose", verb: "provides", to: "Energy" },
  ],
  overrides: {},
  theme: { shape: "rounded", palette: "earth" },
};

//============================================
// Exported template list
//============================================

// All available templates in display order.
export const TEMPLATES: TemplateEntry[] = [
  {
    id: "honeybees",
    label: "Honeybees",
    description:
      "Honeybees -- a simple biology example linking organism, behavior, and environment",
    doc: honeybee_doc,
  },
  {
    id: "water-cycle",
    label: "Water cycle",
    description:
      "Water cycle -- an earth science example showing evaporation, condensation, and precipitation",
    doc: water_cycle_doc,
  },
  {
    id: "photosynthesis",
    label: "Photosynthesis",
    description:
      "Photosynthesis -- a cell biology example connecting sunlight, gas exchange, and glucose production",
    doc: photosynthesis_doc,
  },
];
