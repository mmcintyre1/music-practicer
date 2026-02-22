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

// --- Sequence generators ---

// Sharps-only chromatic scale for semitone index lookups
const CHROM_S = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
// Enharmonic flat→sharp map for index lookups
const ENAR_MAP: Record<string,string> = { Db:'C#', Eb:'D#', Gb:'F#', Ab:'G#', Bb:'A#' };

/** Assign octave numbers to a sequence of note names (no octave suffix).
 *  Handles ascending, descending, and mixed sequences correctly. */
export function assignOctaves(notes: string[], startOctave: number): number[] {
	let octave = startOctave;
	const result: number[] = [];
	let prevIdx = -1;
	for (const note of notes) {
		const idx = CHROM_S.indexOf(ENAR_MAP[note] ?? note);
		if (prevIdx !== -1) {
			const diff = idx - prevIdx;
			if (diff < -6) octave++;      // ascending wrap: B(11)→C(0)
			else if (diff > 6) octave--;  // descending wrap: C(0)→B(11)
		}
		result.push(octave);
		prevIdx = idx;
	}
	return result;
}

/** Generate ascending (and optional descending) scale note names for rendering. */
export function generateScaleNoteNames(
	key: KeyName,
	mode: Mode,
	octaves: 1 | 2,
	direction: 'up' | 'up-down'
): string[] {
	const base = getScaleNotes(key, mode); // 8 notes: root … root+oct
	const unique = base.slice(0, 7);       // 7 unique pitch-class names
	const up = octaves === 1 ? [...base] : [...unique, ...base]; // 8 or 15
	if (direction === 'up') return up;
	const down = [...up.slice(0, -1)].reverse(); // descend without duplicating top
	return [...up, ...down];
}

export type ArpeggioType = 'root' | 'first-inv' | 'second-inv' | 'broken';

/** Generate arpeggio note names from a chord's note array. */
export function generateArpeggioNoteNames(
	chordNotes: string[],
	octaves: 1 | 2,
	direction: 'up' | 'up-down',
	type: ArpeggioType
): string[] {
	const inverted =
		type === 'first-inv'  ? rotateNotes(chordNotes, 1) :
		type === 'second-inv' ? rotateNotes(chordNotes, 2) :
		[...chordNotes];
	const notes3 = inverted.slice(0, 3);

	let up: string[];
	if (type === 'broken') {
		// 1-3-5-3 repeating cell, close on root
		const cell = [notes3[0], notes3[1], notes3[2], notes3[1]];
		up = octaves === 1 ? [...cell, notes3[0]] : [...cell, ...cell, notes3[0]];
	} else {
		// Cycle through the 3 notes for each octave, close on starting note
		up = [];
		for (let o = 0; o < octaves; o++) up.push(...notes3);
		up.push(notes3[0]);
	}

	if (direction === 'up') return up;
	const down = [...up.slice(0, -1)].reverse();
	return [...up, ...down];
}

// --- Fingering ---

export interface FingeringData {
	rh: number[];
	lh: number[];
}

// Standard 1-octave ascending fingerings (8 entries: root … root+oct).
// Source: widely-used method book conventions (Alfred, Schaum, Hanon).
const SCALE_FINGERINGS: Record<string, FingeringData> = {
	'C-major':  { rh: [1,2,3,1,2,3,4,5], lh: [5,4,3,2,1,3,2,1] },
	'G-major':  { rh: [1,2,3,1,2,3,4,5], lh: [5,4,3,2,1,3,2,1] },
	'D-major':  { rh: [1,2,3,1,2,3,4,5], lh: [5,4,3,2,1,3,2,1] },
	'A-major':  { rh: [1,2,3,1,2,3,4,5], lh: [5,4,3,2,1,3,2,1] },
	'E-major':  { rh: [1,2,3,1,2,3,4,5], lh: [5,4,3,2,1,3,2,1] },
	'B-major':  { rh: [1,2,3,1,2,3,4,5], lh: [4,3,2,1,4,3,2,1] },
	'F#-major': { rh: [2,3,4,1,2,3,1,2], lh: [4,3,2,1,3,2,1,4] },
	'F-major':  { rh: [1,2,3,4,1,2,3,4], lh: [5,4,3,2,1,3,2,1] },
	'Bb-major': { rh: [4,1,2,3,1,2,3,4], lh: [3,2,1,4,3,2,1,3] },
	'Eb-major': { rh: [3,1,2,3,4,1,2,3], lh: [3,2,1,4,3,2,1,3] },
	'Ab-major': { rh: [3,4,1,2,3,1,2,3], lh: [3,2,1,4,3,2,1,3] },
	'Db-major': { rh: [2,3,1,2,3,4,1,2], lh: [3,2,1,4,3,2,1,3] },
	'C-minor':  { rh: [1,2,3,1,2,3,4,5], lh: [5,4,3,2,1,3,2,1] },
	'G-minor':  { rh: [1,2,3,1,2,3,4,5], lh: [5,4,3,2,1,3,2,1] },
	'D-minor':  { rh: [1,2,3,1,2,3,4,5], lh: [5,4,3,2,1,3,2,1] },
	'A-minor':  { rh: [1,2,3,1,2,3,4,5], lh: [5,4,3,2,1,3,2,1] },
	'E-minor':  { rh: [1,2,3,1,2,3,4,5], lh: [5,4,3,2,1,3,2,1] },
	'B-minor':  { rh: [1,2,3,1,2,3,4,5], lh: [4,3,2,1,3,2,1,4] },
	'F#-minor': { rh: [1,2,3,1,2,3,4,5], lh: [4,3,2,1,3,2,1,4] },
	'F-minor':  { rh: [1,2,3,4,1,2,3,4], lh: [5,4,3,2,1,3,2,1] },
	'Bb-minor': { rh: [4,1,2,3,1,2,3,4], lh: [3,2,1,4,3,2,1,3] },
	'Eb-minor': { rh: [3,1,2,3,4,1,2,3], lh: [3,2,1,4,3,2,1,3] },
	'Ab-minor': { rh: [3,4,1,2,3,1,2,3], lh: [3,2,1,4,3,2,1,3] },
	'Db-minor': { rh: [2,3,1,2,3,4,1,2], lh: [3,2,1,4,3,2,1,3] },
};

/** Return finger numbers for an ascending (and optional descending) scale,
 *  extended to 2 octaves if requested. */
export function getScaleFingering(
	key: KeyName,
	mode: Mode,
	octaves: 1 | 2,
	direction: 'up' | 'up-down'
): FingeringData {
	const base = SCALE_FINGERINGS[`${key}-${mode}`] ?? SCALE_FINGERINGS['C-major'];
	// Extend to 2 octaves: first 7 of 1-oct pattern + full 8-entry pattern = 15
	const rhUp = octaves === 1 ? [...base.rh] : [...base.rh.slice(0, 7), ...base.rh];
	const lhUp = octaves === 1 ? [...base.lh] : [...base.lh.slice(0, 7), ...base.lh];
	if (direction === 'up') return { rh: rhUp, lh: lhUp };
	// Descending: reverse ascending (drop the shared top note)
	const rhDown = [...rhUp.slice(0, -1)].reverse();
	const lhDown = [...lhUp.slice(0, -1)].reverse();
	return { rh: [...rhUp, ...rhDown], lh: [...lhUp, ...lhDown] };
}

// --- Voice leading ---

/** Choose the inversion of each chord that minimises total voice movement,
 *  comparing voices top-down (soprano first) for classical smooth voice leading.
 *  Returns {notes, octs} pairs ready for VexFlow. */
export function voiceLeadChords(chords: ChordDegree[]): Array<{ notes: string[]; octs: number[] }> {
	if (chords.length === 0) return [];

	function semitone(note: string): number {
		return CHROM_S.indexOf(ENAR_MAP[note] ?? note);
	}
	function getPitches(notes: string[], octs: number[]): number[] {
		return notes.map((n, i) => octs[i] * 12 + semitone(n));
	}

	const result: Array<{ notes: string[]; octs: number[] }> = [];
	let prevDesc: number[] | null = null;

	for (const chord of chords) {
		const notes = chord.notes;
		const n = notes.length;
		let bestNotes = notes;
		let bestOcts = assignOctaves(notes, 4);
		let bestScore = Infinity;

		for (let rot = 0; rot < n; rot++) {
			const inv = rotateNotes(notes, rot);
			for (const startOct of [3, 4]) {
				const octs = assignOctaves(inv, startOct);
				const pitches = getPitches(inv, octs);

				// Skip voicings that are too low or too high for treble right hand
				if (pitches[0] < 40 || pitches[pitches.length - 1] > 79) continue;

				let score: number;
				if (prevDesc === null) {
					// First chord: strongly prefer root position at octave 4
					score = rot * 1000 + Math.abs(startOct - 4) * 500;
				} else {
					// Compare voices top-down (soprano first) — standard voice leading analysis
					const newDesc = [...pitches].sort((a, b) => b - a);
					const len = Math.min(prevDesc.length, newDesc.length);
					score = 0;
					for (let j = 0; j < len; j++) {
						score += Math.abs(newDesc[j] - prevDesc[j]);
					}
				}

				if (score < bestScore) {
					bestScore = score;
					bestNotes = inv;
					bestOcts = octs;
				}
			}
		}

		result.push({ notes: bestNotes, octs: bestOcts });
		prevDesc = [...getPitches(bestNotes, bestOcts)].sort((a, b) => b - a);
	}

	return result;
}

// --- Computed voicings ---

export interface VoicingSet {
	name: string;
	chords: Array<{ degree: string; notes: string[] }>;
}

function rotateNotes(notes: string[], n: number): string[] {
	const len = notes.length;
	const by = n % len;
	return [...notes.slice(by), ...notes.slice(0, by)];
}

export function computeVoicings(chords: ChordDegree[]): VoicingSet[] {
	return [
		{
			name: 'Root position',
			chords: chords.map((c) => ({ degree: c.degree, notes: [...c.notes] }))
		},
		{
			name: '1st inversion',
			chords: chords.map((c) => ({ degree: c.degree, notes: rotateNotes(c.notes, 1) }))
		},
		{
			name: '2nd inversion',
			chords: chords.map((c) => ({ degree: c.degree, notes: rotateNotes(c.notes, 2) }))
		}
	];
}
