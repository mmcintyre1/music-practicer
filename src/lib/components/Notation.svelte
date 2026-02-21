<script lang="ts">
	import { browser } from '$app/environment';
	import type { KeyName, Mode, ChordDegree } from '$lib/music';
	import { getScaleNotes, getKeyNotes, getVexKeySignature } from '$lib/music';

	interface Props {
		key: KeyName;
		mode: Mode;
		type: 'scale' | 'chords';
		chords?: ChordDegree[];
	}

	let { key: keyName, mode, type, chords = [] }: Props = $props();
	let container = $state<HTMLDivElement | undefined>();

	const NOTE_TO_VEX: Record<string, string> = {
		C: 'c', 'C#': 'c#', Db: 'db', D: 'd', 'D#': 'd#', Eb: 'eb',
		E: 'e', F: 'f', 'F#': 'f#', Gb: 'gb', G: 'g', 'G#': 'g#',
		Ab: 'ab', A: 'a', 'A#': 'a#', Bb: 'bb', B: 'b'
	};

	const ENHARMONIC: Record<string, string> = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };
	const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

	function assignOctaves(notes: string[], startOctave: number): number[] {
		let octave = startOctave;
		const octaves: number[] = [];
		let prevIdx = -1;
		for (const note of notes) {
			const idx = CHROMATIC.indexOf(ENHARMONIC[note] ?? note);
			if (prevIdx !== -1 && idx <= prevIdx) octave++;
			octaves.push(octave);
			prevIdx = idx;
		}
		return octaves;
	}

	// Return the accidental string needed for this note given the key, or null if none
	function accidentalNeeded(note: string, keyNoteSet: Set<string>): string | null {
		if (keyNoteSet.has(note)) return null;
		if (note.includes('#')) return '#';
		if (note.includes('b')) return 'b';
		return 'n'; // natural sign — contradicts a key signature accidental
	}

	function makeStaveNote(VF: any, clef: string, noteNames: string[], octaves: number[], duration: string, keyNoteSet: Set<string>) {
		const { StaveNote, Accidental } = VF;
		const keys = noteNames.map((n, i) => `${NOTE_TO_VEX[n]}/${octaves[i]}`);
		const sn = new StaveNote({ clef, keys, duration });
		noteNames.forEach((n, i) => {
			const acc = accidentalNeeded(n, keyNoteSet);
			if (acc) sn.addModifier(new Accidental(acc), i);
		});
		return sn;
	}

	async function render() {
		if (!browser || !container) return;
		container.innerHTML = '';

		const VF = await import('vexflow');
		const { Renderer, Stave, StaveConnector, Voice, Formatter } = VF;

		const width = container.offsetWidth || 580;
		const staveWidth = width - 40;
		const leftMargin = 20;
		const keySig = getVexKeySignature(keyName, mode);
		const keyNoteSet = getKeyNotes(keyName, mode);

		// Height: grand staff needs ~220px
		const height = 220;
		const renderer = new Renderer(container, Renderer.Backends.SVG);
		renderer.resize(width, height);
		const ctx = renderer.getContext();

		const treble = new Stave(leftMargin, 10, staveWidth);
		treble.addClef('treble').addKeySignature(keySig);
		treble.setContext(ctx).draw();

		const bass = new Stave(leftMargin, 110, staveWidth);
		bass.addClef('bass').addKeySignature(keySig);
		bass.setContext(ctx).draw();

		new StaveConnector(treble, bass).setType('brace').setContext(ctx).draw();
		new StaveConnector(treble, bass).setType('singleLeft').setContext(ctx).draw();

		let trebleNotes: any[] = [];
		let bassNotes: any[] = [];

		if (type === 'scale') {
			const scaleNotes = getScaleNotes(keyName, mode);
			const trebleOctaves = assignOctaves(scaleNotes, 4);
			const bassOctaves = assignOctaves(scaleNotes, 3);

			trebleNotes = scaleNotes.map((n, i) =>
				makeStaveNote(VF, 'treble', [n], [trebleOctaves[i]], 'q', keyNoteSet)
			);
			bassNotes = scaleNotes.map((n, i) =>
				makeStaveNote(VF, 'bass', [n], [bassOctaves[i]], 'q', keyNoteSet)
			);
		} else {
			trebleNotes = chords.map((chord) => {
				const octaves = assignOctaves(chord.notes, 4);
				return makeStaveNote(VF, 'treble', chord.notes, octaves, 'h', keyNoteSet);
			});

			// Bass: root + fifth
			bassNotes = chords.map((chord) => {
				const rootFifth = [chord.notes[0], chord.notes[2] ?? chord.notes[0]];
				const octaves = assignOctaves(rootFifth, 2);
				return makeStaveNote(VF, 'bass', rootFifth, octaves, 'h', keyNoteSet);
			});
		}

		if (trebleNotes.length === 0) return;

		const trebleVoice = new Voice({ num_beats: trebleNotes.length, beat_value: 4 }).setMode(2);
		trebleVoice.addTickables(trebleNotes);

		const bassVoice = new Voice({ num_beats: bassNotes.length, beat_value: 4 }).setMode(2);
		bassVoice.addTickables(bassNotes);

		const formatter = new Formatter();
		formatter.joinVoices([trebleVoice]);
		formatter.joinVoices([bassVoice]);
		formatter.format([trebleVoice, bassVoice], staveWidth - 80);

		trebleVoice.draw(ctx, treble);
		bassVoice.draw(ctx, bass);
	}

	$effect(() => {
		void keyName;
		void mode;
		void type;
		void chords;
		void container;
		if (browser && container) render();
	});
</script>

<div bind:this={container} class="notation"></div>

<style>
	.notation {
		width: 100%;
		margin-top: 0.75rem;
		background: #f5f0e8;
		border-radius: 6px;
		padding: 4px 4px 8px;
		overflow: hidden;
	}

	:global(.notation svg) {
		display: block;
		width: 100%;
		height: auto;
	}
</style>
