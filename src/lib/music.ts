export const KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Db'] as const;
export type KeyName = (typeof KEYS)[number];

const KEY_SEMITONES: Record<KeyName, number> = {
	C: 0, G: 7, D: 2, A: 9, E: 4, B: 11,
	'F#': 6, F: 5, Bb: 10, Eb: 3, Ab: 8, Db: 1
};

const CHROMATIC_SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHROMATIC_FLATS  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const FLAT_KEYS = new Set<KeyName>(['F', 'Bb', 'Eb', 'Ab', 'Db']);

const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11, 12];
const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10, 12];

// Degree offsets within octave (without the repeated root)
const MAJOR_DEGREE_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_DEGREE_OFFSETS = [0, 2, 3, 5, 7, 8, 10];

type Quality = 'major' | 'minor' | 'dim' | 'dom7';

// Natural triad quality for each scale degree
const MAJOR_DEGREE_QUALITY: Quality[] = ['major', 'minor', 'minor', 'major', 'major', 'minor', 'dim'];
// Minor V is major because we use harmonic minor for the dominant chord
const MINOR_DEGREE_QUALITY: Quality[] = ['minor', 'dim', 'major', 'minor', 'major', 'major', 'major'];

const MAJOR_DEGREE_LABELS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const MINOR_DEGREE_LABELS = ['i', 'ii°', 'III', 'iv', 'V', 'VI', 'VII'];

const QUALITY_INTERVALS: Record<Quality, number[]> = {
	major: [0, 4, 7],
	minor: [0, 3, 7],
	dim:   [0, 3, 6],
	dom7:  [0, 4, 7, 10]
};

export type Mode = 'major' | 'minor';

export interface ChordDegree {
	degree: string;
	root: string;
	notes: string[];
}

export function getScaleNotes(key: KeyName, mode: Mode): string[] {
	const root = KEY_SEMITONES[key];
	const chromatic = FLAT_KEYS.has(key) ? CHROMATIC_FLATS : CHROMATIC_SHARPS;
	const intervals = mode === 'major' ? MAJOR_INTERVALS : MINOR_INTERVALS;
	return intervals.map((i) => chromatic[(root + i) % 12]);
}

// Set of note names present in this key (for key signature accidental logic)
export function getKeyNotes(key: KeyName, mode: Mode): Set<string> {
	return new Set(getScaleNotes(key, mode).slice(0, 7));
}

// VexFlow key signature string
export function getVexKeySignature(key: KeyName, mode: Mode): string {
	if (mode === 'major') return key;
	// Db minor = C# minor (enharmonic equivalent, VexFlow doesn't have Dbm)
	if (key === 'Db') return 'C#m';
	return `${key}m`;
}

function getChordByDegree(
	key: KeyName,
	mode: Mode,
	degreeIdx: number,
	forceQuality?: Quality
): ChordDegree {
	const chromatic = FLAT_KEYS.has(key) ? CHROMATIC_FLATS : CHROMATIC_SHARPS;
	const root = KEY_SEMITONES[key];
	const offsets = mode === 'major' ? MAJOR_DEGREE_OFFSETS : MINOR_DEGREE_OFFSETS;
	const qualities = mode === 'major' ? MAJOR_DEGREE_QUALITY : MINOR_DEGREE_QUALITY;
	const labels = mode === 'major' ? MAJOR_DEGREE_LABELS : MINOR_DEGREE_LABELS;

	const degreeRoot = (root + offsets[degreeIdx]) % 12;
	const quality = forceQuality ?? qualities[degreeIdx];
	const label = forceQuality === 'dom7' && !labels[degreeIdx].includes('V')
		? `${labels[degreeIdx]}7`
		: forceQuality === 'dom7' ? 'V7' : labels[degreeIdx];

	return {
		degree: label,
		root: chromatic[degreeRoot],
		notes: QUALITY_INTERVALS[quality].map((i) => chromatic[(degreeRoot + i) % 12])
	};
}

export interface ProgressionDef {
	id: string;
	name: string;
	degrees: Array<{ idx: number; quality?: Quality }>;
}

export const PROGRESSIONS: ProgressionDef[] = [
	{
		id: 'I-IV-V7',
		name: 'I – IV – V7',
		degrees: [{ idx: 0 }, { idx: 3 }, { idx: 4, quality: 'dom7' }]
	},
	{
		id: 'I-V-vi-IV',
		name: 'I – V – vi – IV',
		degrees: [{ idx: 0 }, { idx: 4 }, { idx: 5 }, { idx: 3 }]
	},
	{
		id: 'ii-V-I',
		name: 'ii – V – I',
		degrees: [{ idx: 1 }, { idx: 4, quality: 'dom7' }, { idx: 0 }]
	},
	{
		id: 'I-vi-IV-V',
		name: 'I – vi – IV – V',
		degrees: [{ idx: 0 }, { idx: 5 }, { idx: 3 }, { idx: 4 }]
	}
];

export function getProgressionChords(key: KeyName, mode: Mode, progId: string): ChordDegree[] {
	const prog = PROGRESSIONS.find((p) => p.id === progId) ?? PROGRESSIONS[0];
	return prog.degrees.map((d) => getChordByDegree(key, mode, d.idx, d.quality));
}

export const FEEL_LABELS: Record<number, string> = {
	1: 'Struggle',
	2: 'OK',
	3: 'Solid'
};
