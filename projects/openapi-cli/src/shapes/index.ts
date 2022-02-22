export type { Body } from './body';
import { BodyLocation } from './body';

export { diffBodyBySchema } from './diffs';
export { generateShapePatches } from './patches';
export { observeBodyShape } from './observations';

export type ShapeLocation = BodyLocation;

export { DocumentedBodies } from './streams/documented-bodies';
export { ShapePatches } from './streams/patches';
