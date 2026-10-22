import type { WordRow } from '../types';
import { agriculture } from './agriculture';
import { animals } from './animals';
import { arts } from './arts';
import { celebrities } from './celebrities';
import { epics } from './epics';
import { family } from './family';
import { festivals } from './festivals';
import { food } from './food';
import { gods } from './gods';
import { history } from './history';
import { landmarks } from './landmarks';
import { movies } from './movies';
import { mythic } from './mythic';
import { objects } from './objects';
import { places } from './places';
import { professions } from './professions';
import { science } from './science';
import { sports } from './sports';
import { transport } from './transport';

/** One file per category. The key must match a category id in ../words.ts. */
export const bank: Record<string, WordRow[]> = {
  movies, celebrities, family, places, food, epics, gods, mythic, agriculture, objects,
  animals, history, sports, festivals, professions, arts, transport, science, landmarks,
};
