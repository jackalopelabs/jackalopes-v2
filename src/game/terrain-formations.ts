export type TerrainFormation = {
  position: [number, number, number]
  scale: number
  height: number
  zone: 'forest' | 'desert'
}

/** Shared scenery placement for the game and route collision regression checks. */
export function terrainFormations(adventureStyle = false): TerrainFormation[] {
  return [
    // Forest perimeter features (near the tree line)
    { position: [0, -0.5, -90], scale: 3.0, height: 10, zone: 'forest' },
    { position: [90, -0.5, 0], scale: 2.5, height: 8, zone: 'forest' },
    { position: [0, -0.5, 90], scale: 3.0, height: 10, zone: 'forest' },
    { position: [-90, -0.5, 0], scale: 2.5, height: 8, zone: 'forest' },

    // Digital Desert rock formations (scattered mesas and buttes)
    { position: [130, -0.5, 0], scale: 4.0, height: 18, zone: 'desert' },
    { position: [-130, -0.5, 0], scale: 4.0, height: 18, zone: 'desert' },
    { position: [0, -0.5, 130], scale: 4.0, height: 18, zone: 'desert' },
    { position: [0, -0.5, -130], scale: 4.0, height: 18, zone: 'desert' },

    // Desert corner formations
    { position: [120, -0.5, 120], scale: 3.5, height: 15, zone: 'desert' },
    { position: [-120, -0.5, 120], scale: 3.5, height: 15, zone: 'desert' },
    { position: [120, -0.5, -120], scale: 3.5, height: 15, zone: 'desert' },
    { position: [-120, -0.5, -120], scale: 3.5, height: 15, zone: 'desert' },

    // Smaller desert outcrops
    { position: [160, -0.5, 60], scale: 2.5, height: 10, zone: 'desert' },
    { position: [-160, -0.5, -60], scale: 2.5, height: 10, zone: 'desert' },
    { position: [60, -0.5, -160], scale: 2.5, height: 10, zone: 'desert' },
    { position: [-60, -0.5, 160], scale: 2.5, height: 10, zone: 'desert' },

    // Mesa formations near the valley edge (these will look like cliffs)
    { position: [200, -0.5, 0], scale: 5.0, height: 25, zone: 'desert' },
    { position: [-200, -0.5, 0], scale: 5.0, height: 25, zone: 'desert' },
    { position: [0, -0.5, 200], scale: 5.0, height: 25, zone: 'desert' },
    // This solid mesa must stay clear of the cave's rabbit-hole chimney.
    { position: [adventureStyle ? 65 : 0, -0.5, -200], scale: 5.0, height: 25, zone: 'desert' },

    // Diagonal edge formations
    { position: [150, -0.5, 150], scale: 4.5, height: 22, zone: 'desert' },
    { position: [-150, -0.5, -150], scale: 4.5, height: 22, zone: 'desert' },
    { position: [-150, -0.5, 150], scale: 4.5, height: 22, zone: 'desert' },
    { position: [150, -0.5, -150], scale: 4.5, height: 22, zone: 'desert' },
  ]
}

export const NORTH_MOUNTAIN_RANGE = {
  position: [0, 0, -150] as [number, number, number], count: 8, spread: 200,
  baseScale: 1.5, scaleVariation: .4, heightVariation: .5,
}
