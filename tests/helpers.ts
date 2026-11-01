import { parseScenario } from '../src/scenario/parse';
import type { RawScenario } from '../src/scenario/types';
import type { Storyboard } from '../src/storyboard/types';
import rawJson from './fixtures/synthetic.asset.json';
import boardJson from './fixtures/synthetic.storyboard.json';

export const syntheticEpisode = () => parseScenario(rawJson as RawScenario);
export const syntheticBoard = (): Storyboard => structuredClone(boardJson) as Storyboard;
