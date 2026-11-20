import {
  boundingBox,
  centroid,
  gridInBox,
  medianPoint,
  pairwiseMidpoints,
} from "./geometry";
import type { Candidate, Coordinate } from "./types";

/**
 * Anchors (centroid, median, each participant, pairwise midpoints) followed by
 * a size x size grid over the padded bounding box. Ids are positional
 * ("anchor-N" / "grid-N"), so they are stable and unique even when candidates
 * coincide exactly.
 */
export function generateCandidates(participants: Coordinate[], gridSize: number): Candidate[] {
  if (participants.length === 0) {
    throw new Error("generateCandidates requires at least one participant");
  }
  const anchors: Coordinate[] = [
    centroid(participants),
    medianPoint(participants),
    ...participants,
    ...pairwiseMidpoints(participants),
  ];
  const grid = gridInBox(boundingBox(participants), gridSize);
  return [
    ...anchors.map((coordinate, i): Candidate => ({ id: `anchor-${i}`, coordinate, kind: "ANCHOR" })),
    ...grid.map((coordinate, i): Candidate => ({ id: `grid-${i}`, coordinate, kind: "GRID" })),
  ];
}
