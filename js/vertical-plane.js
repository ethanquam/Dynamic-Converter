/**
 * Vertical plane through ref1 and ref2 (contains the 3D line; normal is horizontal).
 * Projects a point orthogonally in plan view; elevation is unchanged.
 */
export function projectOntoVerticalPlane(point, ref1, ref2) {
  const dN = ref2.n - ref1.n;
  const dE = ref2.e - ref1.e;
  const lenSq = dN * dN + dE * dE;

  if (lenSq < 1e-12) {
    return { error: "Reference points must have different Northing/Easting locations." };
  }

  const len = Math.sqrt(lenSq);
  const nN = -dE / len;
  const nE = dN / len;
  const crossTrack = nN * (point.n - ref1.n) + nE * (point.e - ref1.e);

  return {
    n: point.n - crossTrack * nN,
    e: point.e - crossTrack * nE,
    z: point.z,
    crossTrack,
  };
}

export function computePointDistances(p1, p2) {
  const dN = p2.n - p1.n;
  const dE = p2.e - p1.e;
  const dZ = p2.z - p1.z;
  const horizontal = Math.sqrt(dN * dN + dE * dE);
  const vertical = Math.abs(dZ);
  const slope = Math.sqrt(horizontal * horizontal + vertical * vertical);

  return { horizontal, vertical, slope, dZ };
}
