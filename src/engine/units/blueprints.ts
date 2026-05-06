/**
 * Vehicle blueprints. Each entry mirrors its GMT Data Card.
 *
 * Penetration, range, and armor values marked TODO should be cross-referenced
 * against the actual GMT Vehicle Data Cards before use in play.
 */

import type { VehicleData } from './types';

/** S-3B: SU-76M M43 — values from Data Card */
export const SU76M_M43: VehicleData = {
  id: 'su76m_m43',
  name: 'SU-76M M43',
  nation: 'soviet',
  size: -1,
  gun: '76.2mm L/43',
  Tt: 0,
  Sb: 0,
  St: 'O',
  RoF: 'N',
  ammoCard: 'A3',
  fieldOfFire: 'frontFixed',
  movementType: 'T',
  movementSlow: 6,
  movementFast: 10,
  weight: 10.2,
  buValue: 43,
  ammo: [
    {
      type: 'AP',
      label: '76.2mm-KE',
      ranges:      { P: 3,  S: 6,  M: 10, L: 14, E: 17 },
      penetration: { P: 19, S: 17, M: 15, L: 13, E: 12 },
      damage: { ND: 1, DM: [2, 4], KO: [5, 8], BU: [9, 10] },
    },
    {
      type: 'HVAP',
      label: '76.2mm-KE',
      availability: 'late-43',
      ranges:      { P: 3,  S: 5,  M: 9,  L: 13, E: 15 },
      penetration: { P: 23, S: 21, M: 19, L: 15, E: 13 },
      damage: { ND: 1, DM: [2, 4], KO: [5, 8], BU: [9, 10] },
    },
    {
      type: 'GP',
      label: '76.2mm',
      ranges:    { P: 5, S: 9, M: 16, L: 23, E: 27 },
      firepower: { P: 5, S: 4, M: 3,  L: 3,  E: 2  },
    },
  ],
  armor: {
    GPD: '2P',
    frontOrRear: {
      level: { TF: 8, TR: 0, HF: 14, HR: 4 },
      rise:  { TF: 8, TR: 0, HF: 18, HR: 4 },
      fall:  { TF: 7, TR: 0, HF: 11, HR: 4 },
    },
    frontSideOrRearSide: {
      level: { TF: 9,  TS: 4, TR: 0, HF: 17, HS: 4, HR: 5 },
      rise:  { TF: 10, TS: 4, TR: 0, HF: 22, HS: 4, HR: 5 },
      fall:  { TF: 9,  TS: 4, TR: 0, HF: 13, HS: 4, HR: 5, Dk: 7 },
    },
  },
};

/** T-34/76 M43 — TODO: verify against GMT Data Card */
export const T34_76_M43: VehicleData = {
  id: 't34_76_m43',
  name: 'T-34/76 M43',
  nation: 'soviet',
  size: 0,
  gun: '76.2mm F-34',
  Tt: 0,
  Sb: 0,
  St: 'O',
  RoF: 'N',
  ammoCard: 'A3',
  fieldOfFire: 'turret',
  movementType: 'T',
  movementSlow: 6,
  movementFast: 10,
  weight: 30.9,
  buValue: 40,
  ammo: [
    {
      type: 'AP',
      label: '76.2mm-KE',
      ranges:      { P: 3,  S: 8,  M: 13, L: 19, E: 26 },
      penetration: { P: 19, S: 17, M: 14, L: 11, E: 8  },
      damage: { ND: 0, DM: [1, 3], KO: [4, 9], BU: [10, 10] },
    },
    {
      type: 'GP',
      label: '76.2mm',
      ranges:    { P: 3, S: 8,  M: 13, L: 19, E: 26 },
      firepower: { P: 5, S: 4,  M: 3,  L: 3,  E: 2  },
    },
  ],
  armor: {
    GPD: '3P',
    frontOrRear: {
      level: { TF: 18, TR: 9, HF: 18, HR: 9 },
      rise:  { TF: 18, TR: 9, HF: 22, HR: 9 },
      fall:  { TF: 16, TR: 8, HF: 14, HR: 8 },
    },
    frontSideOrRearSide: {
      level: { TF: 18, TS: 9, TR: 9, HF: 18, HS: 9, HR: 9 },
      rise:  { TF: 18, TS: 9, TR: 9, HF: 22, HS: 9, HR: 9 },
      fall:  { TF: 16, TS: 8, TR: 8, HF: 14, HS: 8, HR: 8, Dk: 5 },
    },
  },
};

/** PzKpfw IVH — TODO: verify against GMT Data Card */
export const PZKPFW_IVH: VehicleData = {
  id: 'pzkpfw_ivh',
  name: 'PzKpfw IVH',
  nation: 'german',
  size: 0,
  gun: '7.5cm KwK 40 L/48',
  Tt: 0,
  Sb: 0,
  St: 'O',
  RoF: 'N',
  ammoCard: 'A1',
  fieldOfFire: 'turret',
  movementType: 'T',
  movementSlow: 5,
  movementFast: 9,
  weight: 25.0,
  buValue: 41,
  ammo: [
    {
      type: 'AP',
      label: '75mm-KE',
      ranges:      { P: 3,  S: 9,  M: 14, L: 20, E: 27 },
      penetration: { P: 25, S: 22, M: 18, L: 15, E: 11 },
      damage: { ND: 0, DM: [1, 3], KO: [4, 9], BU: [10, 10] },
    },
    {
      type: 'GP',
      label: '75mm',
      ranges:    { P: 4, S: 8,  M: 14, L: 20, E: 27 },
      firepower: { P: 6, S: 5,  M: 4,  L: 3,  E: 2  },
    },
  ],
  armor: {
    GPD: '3P',
    frontOrRear: {
      level: { TF: 18, TR: 8, HF: 18, HR: 8 },
      rise:  { TF: 18, TR: 8, HF: 22, HR: 8 },
      fall:  { TF: 16, TR: 7, HF: 14, HR: 7 },
    },
    frontSideOrRearSide: {
      level: { TF: 18, TS: 8, TR: 8, HF: 18, HS: 8, HR: 8 },
      rise:  { TF: 18, TS: 8, TR: 8, HF: 22, HS: 8, HR: 8 },
      fall:  { TF: 16, TS: 7, TR: 7, HF: 14, HS: 7, HR: 7, Dk: 4 },
    },
  },
};

export const VEHICLE_BLUEPRINTS: Record<string, VehicleData> = {
  [SU76M_M43.id]:   SU76M_M43,
  [T34_76_M43.id]:  T34_76_M43,
  [PZKPFW_IVH.id]:  PZKPFW_IVH,
};
