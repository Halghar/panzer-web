/**
 * Sample vehicle blueprints. In a real project, these come from JSON files,
 * one per Data Card. For the starter we keep them in TS so the types are
 * checked.
 *
 * Range thresholds and penetration values are illustrative — verify against
 * the actual GMT Data Cards before using in production.
 */

import type { VehicleData } from './types';

export const T34_76_M43: VehicleData = {
  id: 't34_76_m43',
  name: 'T-34/76 M43',
  nation: 'soviet',
  size: 0,
  armor: { front: 18, rear: 9 },
  movementSpeed: 5,
  weapons: [
    {
      name: '76.2mm F-34',
      caliber: '76.2mm',
      fieldOfFire: 'turret',
      stabilization: 0,
      ammo: [
        {
          type: 'AP',
          ranges: { P: 3, S: 8, M: 13, L: 19, E: 26 },
          penetration: { P: 19, S: 17, M: 14, L: 11, E: 8 },
        },
        {
          type: 'HE',
          ranges: { P: 3, S: 8, M: 13, L: 19, E: 26 },
          penetration: { P: 0, S: 0, M: 0, L: 0, E: 0 },
        },
      ],
    },
  ],
};

export const PZKPFW_IVH: VehicleData = {
  id: 'pzkpfw_ivh',
  name: 'PzKpfw IVH',
  nation: 'german',
  size: 0,
  armor: { front: 18, rear: 8 },
  movementSpeed: 5,
  weapons: [
    {
      name: '7.5cm KwK 40 L/48',
      caliber: '75mm',
      fieldOfFire: 'turret',
      stabilization: 0,
      ammo: [
        {
          type: 'AP',
          ranges: { P: 3, S: 9, M: 14, L: 20, E: 27 },
          penetration: { P: 25, S: 22, M: 18, L: 15, E: 11 },
        },
      ],
    },
  ],
};

export const VEHICLE_BLUEPRINTS: Record<string, VehicleData> = {
  [T34_76_M43.id]: T34_76_M43,
  [PZKPFW_IVH.id]: PZKPFW_IVH,
};
