import { bank } from './bank';
import type { Category, Difficulty, Recognition, Word, WordRow } from './types';

export type { Category, Difficulty, Recognition, Word, WordRow } from './types';

export const categories: Category[] = [
 {id:'movies',name:'Indian Movies',description:'Blockbusters, classics & iconic film worlds',icon:'Clapperboard',color:'#e9e6ff'},
 {id:'celebrities',name:'Heroes & Celebrities',description:'Actors, singers, comedians & famous faces',icon:'Star',color:'#fff0d7'},
 {id:'family',name:'Family & Relationships',description:'The people, bonds & words close to home',icon:'UsersRound',color:'#ffe6e3'},
 {id:'places',name:'Indian Cities & Villages',description:'Cities, towns, villages & familiar places',icon:'MapPin',color:'#dff5e9'},
 {id:'food',name:'Food & Cuisine',description:'Regional favourites, snacks, sweets & spices',icon:'Utensils',color:'#ffe9d6'},
 {id:'epics',name:'Hindu Epics & Mythology',description:'Characters from Ramayana, Mahabharata & traditions',icon:'BookOpen',color:'#f3e4ff'},
 {id:'gods',name:'Gods & Goddesses',description:'Deities from diverse Indian traditions',icon:'Sun',color:'#fff0c2'},
 {id:'mythic',name:'Demons & Mythical Beings',description:'Asuras, rakshasas & legendary beings',icon:'Flame',color:'#ffe3df'},
 {id:'agriculture',name:'Agriculture & Rural Life',description:'Crops, farming, tools & village life',icon:'Wheat',color:'#e5f0d7'},
 {id:'objects',name:'Objects & Daily Life',description:'Things you see and use every day',icon:'LampDesk',color:'#e5edf9'},
 {id:'animals',name:'Animals & Nature',description:'Wildlife, pets, plants & the natural world',icon:'PawPrint',color:'#dff3f2'},
 {id:'history',name:'History & Freedom Fighters',description:'Leaders, reformers & chapters of history',icon:'Landmark',color:'#f3e6d8'},
 {id:'sports',name:'Sports & Games',description:'Cricket, kabaddi, athletes & playgrounds',icon:'Trophy',color:'#e6e9ff'},
 {id:'festivals',name:'Festivals & Traditions',description:'Celebrations, rituals & seasonal joy',icon:'Sparkles',color:'#ffe6f0'},
 {id:'professions',name:'Professions & Education',description:'Workplaces, jobs, school & college life',icon:'GraduationCap',color:'#e6f2ff'},
 {id:'arts',name:'Languages & Arts',description:'Languages, dance, music & craft traditions',icon:'Music',color:'#f0e5ff'},
 {id:'transport',name:'Transport',description:'Ways India gets from here to there',icon:'TrainFront',color:'#e2f0ee'},
 {id:'science',name:'Science & Technology',description:'Gadgets, inventions & everyday tech',icon:'Atom',color:'#e7edff'},
 {id:'landmarks',name:'Rivers & Landmarks',description:'Sacred rivers, monuments & natural wonders',icon:'Waves',color:'#dceeff'},
];

const DIFFICULTY: Record<WordRow[4], Difficulty> = { E: 'Easy', M: 'Medium', H: 'Hard' };
const RECOGNITION: Record<WordRow[4], Recognition> = { E: 'Common', M: 'Regional', H: 'Specialist' };
const list = (s: string) => s.split(/[|+]/).map(x => x.trim()).filter(Boolean);

/** Lower-case, accent-free, alphanumeric slug used for stable ids. */
export const slugify = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const starterId = (category: string, name: string) => `${category}-${slugify(name)}`;

function build(): Word[] {
  return categories.flatMap(c => (bank[c.id] ?? []).map(([name, aliases, languages, regions, difficulty, note]): Word => ({
    id: starterId(c.id, name),
    name,
    category: c.id,
    aliases: list(aliases),
    languages: list(languages),
    regions: list(regions),
    difficulty: DIFFICULTY[difficulty],
    recognition: RECOGNITION[difficulty],
    ...(note ? { note } : {}),
  })));
}

export const words: Word[] = build();
export const mixedCategory = { id: 'mixed', name: 'Mixed', description: 'A little bit of everything, randomly mixed', icon: 'Shuffle', color: '#f0ede6' };
export const countByCategory = (list: Word[]): Record<string, number> => list.reduce<Record<string, number>>((acc, w) => { acc[w.category] = (acc[w.category] || 0) + 1; return acc; }, {});
