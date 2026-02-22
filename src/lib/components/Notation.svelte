<script lang="ts">
	import { browser } from '$app/environment';
	import type { KeyName, Mode, ChordDegree, ArpeggioType } from '$lib/music';
	import {
		getKeyNotes, getVexKeySignature,
		assignOctaves, generateScaleNoteNames, generateArpeggioNoteNames,
		getScaleFingering, voiceLeadChords
	} from '$lib/music';

	interface Props {
		key: KeyName;
		mode: Mode;
		type: 'scale' | 'chords' | 'arpeggio';
		chords?: ChordDegree[];
		direction?: 'up' | 'up-down';
		octaves?: 1 | 2;
		duration?: 'q' | '8';
		timeSignature?: '4/4' | '3/4' | '6/8';
		showFingering?: boolean;
		arpeggioType?: ArpeggioType;
	}

	let {
		key: keyName,
		mode,
		type,
		chords = [],
		direction = 'up',
		octaves = 1,
		duration = 'q',
		timeSignature = '4/4',
		showFingering = false,
		arpeggioType = 'root',
	}: Props = $props();

	let container = $state<HTMLDivElement | undefined>();
	let fullscreen = $state(false);

	const SYSTEM_H = 175;   // px per system row (treble + bass)
	const TREBLE_Y = 10;
	const BASS_Y = 105;
	const MEASURES_PER_ROW = 2;

	// Estimated VexFlow decorator widths for proportional stave sizing
	const CLEF_W = 38;
	const KEY_ACC_W_PER = 11;  // per accidental
	const TIME_SIG_W = 30;

	// Number of accidentals per key (major and minor)
	const MAJOR_ACC: Record<string, number> = {
		C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6,
		F: 1, Bb: 2, Eb: 3, Ab: 4, Db: 5, Gb: 6,
	};
	const MINOR_ACC: Record<string, number> = {
		A: 0, E: 1, B: 2, 'F#': 3, 'C#': 4, 'G#': 5, 'D#': 6,
		D: 1, G: 2, C: 3, F: 4, Bb: 5, Eb: 6,
	};
	function getAccidentalCount(key: KeyName, m: Mode): number {
		return (m === 'major' ? MAJOR_ACC : MINOR_ACC)[key] ?? 0;
	}

	const NOTE_TO_VEX: Record<string, string> = {
		C: 'c', 'C#': 'c#', Db: 'db', D: 'd', 'D#': 'd#', Eb: 'eb',
		E: 'e', F: 'f', 'F#': 'f#', Gb: 'gb', G: 'g', 'G#': 'g#',
		Ab: 'ab', A: 'a', 'A#': 'a#', Bb: 'bb', B: 'b'
	};

	// Notes per measure keyed by "timeSig/duration"
	const NOTES_PER_MEASURE: Record<string, number> = {
		'4/4/q': 4, '4/4/8': 8,
		'3/4/q': 3, '3/4/8': 6,
		'6/8/q': 3, '6/8/8': 6,
	};

	function accidentalNeeded(note: string, keyNoteSet: Set<string>): string | null {
		if (keyNoteSet.has(note)) return null;
		if (note.includes('#')) return '#';
		if (note.includes('b')) return 'b';
		return 'n';
	}

	function makeStaveNote(
		VF: any,
		clef: string,
		noteNames: string[],
		octs: number[],
		dur: string,
		keyNoteSet: Set<string>,
		fingerNums?: number[]
	) {
		const { StaveNote, Accidental, Fingering } = VF;
		const keys = noteNames.map((n, i) => `${NOTE_TO_VEX[n]}/${octs[i]}`);
		const sn = new StaveNote({ clef, keys, duration: dur });
		noteNames.forEach((n, i) => {
			const acc = accidentalNeeded(n, keyNoteSet);
			if (acc) sn.addModifier(new Accidental(acc), i);
		});
		if (fingerNums && Fingering) {
			fingerNums.forEach((f, i) => {
				if (f !== undefined) sn.addModifier(new Fingering(String(f)), i);
			});
		}
		return sn;
	}

	function makeRest(VF: any, clef: string, dur: string) {
		return new VF.StaveNote({ clef, keys: ['b/4'], duration: `${dur}r` });
	}

	async function render() {
		if (!browser || !container) return;
		container.innerHTML = '';

		const VF = await import('vexflow');
		const { Renderer, Stave, StaveConnector, Voice, Formatter, Beam } = VF;

		const width = container.offsetWidth || 580;
		const keySig = getVexKeySignature(keyName, mode);
		const keyNoteSet = getKeyNotes(keyName, mode);
		const numAcc = getAccidentalCount(keyName, mode);

		// ── Chord mode: single-system grand staff, half notes ─────────────────────
		if (type === 'chords') {
			const staveW = width - 40;
			const lm = 20;
			const renderer = new Renderer(container, Renderer.Backends.SVG);
			renderer.resize(width, 220);
			const ctx = renderer.getContext();

			const treble = new Stave(lm, 10, staveW).addClef('treble').addKeySignature(keySig);
			const bass   = new Stave(lm, 110, staveW).addClef('bass').addKeySignature(keySig);
			treble.setContext(ctx).draw();
			bass.setContext(ctx).draw();
			new StaveConnector(treble, bass).setType('brace').setContext(ctx).draw();
			new StaveConnector(treble, bass).setType('singleLeft').setContext(ctx).draw();

			if (chords.length === 0) return;

			// Treble: smooth voice-led inversions (soprano-first comparison)
			const voiced = voiceLeadChords(chords);
			const tNotes = voiced.map((v) =>
				makeStaveNote(VF, 'treble', v.notes, v.octs, 'h', keyNoteSet)
			);

			// Bass: root position (root + fifth), standard left-hand guide
			const bNotes = chords.map((c) => {
				const rf = [c.notes[0], c.notes[2] ?? c.notes[0]];
				const octs = assignOctaves(rf, 2);
				return makeStaveNote(VF, 'bass', rf, octs, 'h', keyNoteSet);
			});

			const tv = new Voice({ num_beats: chords.length, beat_value: 2 }).setMode(2);
			tv.addTickables(tNotes);
			const bv = new Voice({ num_beats: chords.length, beat_value: 2 }).setMode(2);
			bv.addTickables(bNotes);

			const noteW = treble.getNoteEndX() - treble.getNoteStartX() - 10;
			new Formatter().joinVoices([tv]).joinVoices([bv]).format([tv, bv], noteW);
			tv.draw(ctx, treble);
			bv.draw(ctx, bass);
			return;
		}

		// ── Scale / Arpeggio: multi-system rendering ────────────────────────────────
		const notesPerMeasure = NOTES_PER_MEASURE[`${timeSignature}/${duration}`] ?? 4;
		const beatValue = duration === '8' ? 8 : 4;

		let noteSeq: string[];
		let fingerData: { rh: number[]; lh: number[] } | null = null;

		if (type === 'scale') {
			noteSeq = generateScaleNoteNames(keyName, mode, octaves, direction);
			if (showFingering) fingerData = getScaleFingering(keyName, mode, octaves, direction);
		} else {
			const chordNotes = chords[0]?.notes ?? ['C', 'E', 'G'];
			noteSeq = generateArpeggioNoteNames(chordNotes, octaves, direction, arpeggioType);
		}

		const trebleOcts = assignOctaves(noteSeq, 4);
		const bassOcts   = assignOctaves(noteSeq, 3);

		// Split into measures; pad last measure with rests
		const measures: string[][] = [];
		for (let i = 0; i < noteSeq.length; i += notesPerMeasure) {
			measures.push(noteSeq.slice(i, i + notesPerMeasure));
		}

		const numSystems = Math.ceil(measures.length / MEASURES_PER_ROW);
		const totalHeight = numSystems * SYSTEM_H + 20;

		const renderer = new Renderer(container, Renderer.Backends.SVG);
		renderer.resize(width, totalHeight);
		const ctx = renderer.getContext();

		const lm = 15;
		const availW = width - lm;

		let noteIdx = 0;

		for (let sysIdx = 0; sysIdx < numSystems; sysIdx++) {
			const sysY = sysIdx * SYSTEM_H;
			const measStart = sysIdx * MEASURES_PER_ROW;
			const measEnd   = Math.min(measStart + MEASURES_PER_ROW, measures.length);
			const numMeas   = measEnd - measStart;

			// Proportional stave widths: first measure gets extra space for clef + key sig
			// (+ time sig on first system). This equalizes the note area across measures.
			const firstDecW = CLEF_W + numAcc * KEY_ACC_W_PER + (sysIdx === 0 ? TIME_SIG_W : 0);
			const noteAreaEach = (availW - firstDecW) / MEASURES_PER_ROW;

			function staveWidth(mi: number) {
				return (mi === 0 ? firstDecW : 0) + noteAreaEach;
			}
			function staveX(mi: number) {
				return lm + (mi === 0 ? 0 : firstDecW + mi * noteAreaEach);
			}

			// Draw staves first (so we can read noteStartX)
			const trebleStaves: any[] = [];
			const bassStaves:   any[] = [];

			for (let mi = 0; mi < numMeas; mi++) {
				const isFirst = mi === 0;
				const x = staveX(mi);
				const w = staveWidth(mi);

				const ts = new Stave(x, sysY + TREBLE_Y, w);
				const bs = new Stave(x, sysY + BASS_Y,   w);

				if (isFirst) {
					ts.addClef('treble').addKeySignature(keySig);
					bs.addClef('bass').addKeySignature(keySig);
					if (sysIdx === 0) {
						ts.addTimeSignature(timeSignature);
						bs.addTimeSignature(timeSignature);
					}
				}

				ts.setContext(ctx).draw();
				bs.setContext(ctx).draw();
				trebleStaves.push(ts);
				bassStaves.push(bs);
			}

			// Connectors
			if (sysIdx === 0) {
				new StaveConnector(trebleStaves[0], bassStaves[0]).setType('brace').setContext(ctx).draw();
			}
			new StaveConnector(trebleStaves[0], bassStaves[0]).setType('singleLeft').setContext(ctx).draw();

			// Draw notes measure by measure
			for (let mi = 0; mi < numMeas; mi++) {
				const measNotes = measures[measStart + mi];
				const padCount  = notesPerMeasure - measNotes.length;

				const tNotes: any[] = [];
				const bNotes: any[] = [];
				const tBeam: any[] = [];
				const bBeam: any[] = [];

				measNotes.forEach((n, ni) => {
					const gIdx = noteIdx + ni;
					const rhF = (showFingering && fingerData) ? fingerData.rh[gIdx] : undefined;
					const lhF = (showFingering && fingerData) ? fingerData.lh[gIdx] : undefined;
					const tn = makeStaveNote(VF, 'treble', [n], [trebleOcts[gIdx]], duration, keyNoteSet, rhF !== undefined ? [rhF] : undefined);
					const bn = makeStaveNote(VF, 'bass',   [n], [bassOcts[gIdx]],   duration, keyNoteSet, lhF !== undefined ? [lhF] : undefined);
					tNotes.push(tn); tBeam.push(tn);
					bNotes.push(bn); bBeam.push(bn);
				});
				for (let p = 0; p < padCount; p++) {
					tNotes.push(makeRest(VF, 'treble', duration));
					bNotes.push(makeRest(VF, 'bass',   duration));
					// rests excluded from beam arrays
				}

				noteIdx += measNotes.length;

				const tv = new Voice({ num_beats: notesPerMeasure, beat_value: beatValue }).setMode(2);
				tv.addTickables(tNotes);
				const bv = new Voice({ num_beats: notesPerMeasure, beat_value: beatValue }).setMode(2);
				bv.addTickables(bNotes);

				// Create beams BEFORE drawing voices — marks notes as beamed, suppresses flags
				const tBeams = (duration === '8' && Beam && tBeam.length > 1)
					? Beam.generateBeams(tBeam) : [];
				const bBeams = (duration === '8' && Beam && bBeam.length > 1)
					? Beam.generateBeams(bBeam) : [];

				const noteAreaW = trebleStaves[mi].getNoteEndX() - trebleStaves[mi].getNoteStartX() - 10;
				new Formatter().joinVoices([tv]).joinVoices([bv]).format([tv, bv], noteAreaW);
				tv.draw(ctx, trebleStaves[mi]);
				bv.draw(ctx, bassStaves[mi]);

				tBeams.forEach((b: any) => b.setContext(ctx).draw());
				bBeams.forEach((b: any) => b.setContext(ctx).draw());
			}

			// Fill empty stave slot on last system if only 1 measure
			if (numMeas < MEASURES_PER_ROW) {
				const mi = numMeas;
				const ts = new Stave(staveX(mi), sysY + TREBLE_Y, staveWidth(mi));
				const bs = new Stave(staveX(mi), sysY + BASS_Y,   staveWidth(mi));
				ts.setContext(ctx).draw();
				bs.setContext(ctx).draw();
			}
		}
	}

	$effect(() => {
		void keyName; void mode; void type; void chords;
		void direction; void octaves; void duration; void timeSignature;
		void showFingering; void arpeggioType; void container; void fullscreen;
		if (browser && container) render();
	});

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape' && fullscreen) fullscreen = false;
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="notation-outer" class:fullscreen>
	{#if fullscreen}
		<button class="fs-btn fs-close" onclick={() => (fullscreen = false)} title="Close">✕</button>
	{/if}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		bind:this={container}
		class="notation"
		class:clickable={!fullscreen}
		onclick={() => { if (!fullscreen) fullscreen = true; }}
		title={fullscreen ? '' : 'Click to expand'}
	></div>
</div>

<style>
	.notation-outer {
		position: relative;
		margin-top: 0.75rem;
	}

	.notation-outer.fullscreen {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: #f5f0e8;
		overflow-y: auto;
		padding: 2rem 1.5rem;
		margin-top: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.notation-outer.fullscreen .notation {
		width: 100%;
		max-width: 1100px;
	}

	.notation {
		width: 100%;
		background: #f5f0e8;
		border-radius: 6px;
		padding: 4px 4px 8px;
		overflow: hidden;
	}

	.notation.clickable {
		cursor: zoom-in;
	}

	:global(.notation svg) {
		display: block;
		width: 100%;
		height: auto;
	}

	.fs-btn {
		background: #333;
		color: #f5f0e8;
		border: none;
		border-radius: 50%;
		width: 2.2rem;
		height: 2.2rem;
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.fs-close {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 101;
	}
</style>
