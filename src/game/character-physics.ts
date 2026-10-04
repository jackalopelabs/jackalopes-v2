// Movement uses the same compact capsule for local and remote characters.
// Larger combat hit volumes remain sensors and are excluded from movement queries.
export const CHARACTER_CAPSULE = { halfHeight: 0.85, radius: 0.35 } as const
