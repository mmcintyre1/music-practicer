<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase';
	import type { ScaleVariation, ChordVoicing, KeySession, Feel } from '$lib/supabase';
	import { KEYS, type KeyName, type Mode, getScaleNotes, getProgressionChords, PROGRESSIONS, FEEL_LABELS } from '$lib/music';
	import Notation from '$lib/components/Notation.svelte';

	let user = $state<any>(null);
	let variations = $state<ScaleVariation[]>([]);
	let voicings = $state<ChordVoicing[]>([]);
	let lastSessions = $state<Record<string, KeySession>>({});

	let selectedKey = $state<KeyName>('C');
	let selectedMode = $state<Mode>('major');

	let bpm = $state('');
	let feel = $state<Feel | null>(null);
	let completedVariations = $state<Set<number>>(new Set());
	let saving = $state(false);
	let saved = $state(false);

	let selectedProgression = $state(PROGRESSIONS[0].id);

	let scaleNotes = $derived(getScaleNotes(selectedKey, selectedMode));
	let chords = $derived(getProgressionChords(selectedKey, selectedMode, selectedProgression));
	let currentProgression = $derived(PROGRESSIONS.find((p) => p.id === selectedProgression)!);
	let lastSession = $derived(lastSessions[`${selectedKey}-${selectedMode}`] ?? null);

	onMount(async () => {
		const { data: { user: u } } = await supabase.auth.getUser();
		if (!u) { goto('/login'); return; }
		user = u;
		await Promise.all([loadVariations(), loadVoicings(), loadLastSessions()]);
		selectedKey = suggestKey();
	});

	async function loadVariations() {
		const { data } = await supabase
			.from('scale_variations')
			.select('*')
			.order('sort_order');
		if (data) variations = data;
	}

	async function loadVoicings() {
		const { data } = await supabase
			.from('chord_voicings')
			.select('*')
			.order('sort_order');
		if (data) voicings = data;
	}

	async function loadLastSessions() {
		const { data } = await supabase
			.from('key_sessions')
			.select('*')
			.eq('user_id', user.id)
			.order('practiced_at', { ascending: false });

		if (!data) return;

		const seen = new Set<string>();
		for (const s of data) {
			const k = `${s.key_name}-${s.mode}`;
			if (!seen.has(k)) {
				seen.add(k);
				lastSessions[k] = s;
			}
		}
	}

	function suggestKey(): KeyName {
		let best: KeyName = 'C';
		let bestDays = -1;

		for (const k of KEYS) {
			const session = lastSessions[`${k}-major`];
			const days = session
				? Math.floor((Date.now() - new Date(session.practiced_at).getTime()) / 86400000)
				: 9999;
			if (days > bestDays) {
				bestDays = days;
				best = k;
			}
		}
		return best;
	}

	function toggleVariation(id: number) {
		const next = new Set(completedVariations);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		completedVariations = next;
	}

	async function saveSession() {
		if (!feel) return;
		saving = true;

		const { data: session, error } = await supabase
			.from('key_sessions')
			.insert({
				user_id: user.id,
				key_name: selectedKey,
				mode: selectedMode,
				bpm: bpm ? parseInt(bpm) : null,
				feel
			})
			.select()
			.single();

		if (error || !session) { saving = false; return; }

		if (completedVariations.size > 0) {
			await supabase.from('session_variations').insert(
				[...completedVariations].map((vid) => ({
					session_id: session.id,
					variation_id: vid,
					completed: true
				}))
			);
		}

		lastSessions[`${selectedKey}-${selectedMode}`] = session;
		saving = false;
		saved = true;
		bpm = '';
		feel = null;
		completedVariations = new Set();
		setTimeout(() => (saved = false), 2000);
	}
</script>

<div class="page">
	<h1>Today's Practice</h1>

	<section class="card">
		<h2>Key</h2>
		<div class="key-grid">
			{#each KEYS as k}
				{@const last = lastSessions[`${k}-major`]}
				{@const days = last
					? Math.floor((Date.now() - new Date(last.practiced_at).getTime()) / 86400000)
					: null}
				<button
					class="key-btn"
					class:selected={selectedKey === k}
					class:stale={days === null || days > 7}
					onclick={() => { selectedKey = k; selectedMode = 'major'; }}
				>
					{k}
					{#if days !== null}
						<span class="days">{days}d</span>
					{/if}
				</button>
			{/each}
		</div>
		<div class="mode-toggle">
			<button class:selected={selectedMode === 'major'} onclick={() => (selectedMode = 'major')}>Major</button>
			<button class:selected={selectedMode === 'minor'} onclick={() => (selectedMode = 'minor')}>Minor</button>
		</div>
	</section>

	{#if lastSession}
		<div class="last-session">
			Last: {new Date(lastSession.practiced_at).toLocaleDateString()}
			{#if lastSession.bpm} · {lastSession.bpm} BPM{/if}
			{#if lastSession.feel} · {FEEL_LABELS[lastSession.feel]}{/if}
		</div>
	{:else}
		<div class="last-session">Never practiced — give it a go!</div>
	{/if}

	<section class="card">
		<h2>{selectedKey} {selectedMode} scale</h2>
		<div class="notes-row">
			{#each scaleNotes as note}
				<span class="note">{note}</span>
			{/each}
		</div>
		<Notation key={selectedKey} mode={selectedMode} type="scale" />
	</section>

	<section class="card">
		<h2>Chord progression</h2>
		<div class="prog-tabs">
			{#each PROGRESSIONS as prog}
				<button
					class="prog-tab"
					class:selected={selectedProgression === prog.id}
					onclick={() => (selectedProgression = prog.id)}
				>{prog.name}</button>
			{/each}
		</div>
		<div class="chords-row">
			{#each chords as chord}
				<div class="chord">
					<span class="degree">{chord.degree}</span>
					<span class="chord-root">{chord.root}</span>
					<span class="chord-notes">{chord.notes.join(' ')}</span>
				</div>
			{/each}
		</div>
		<Notation key={selectedKey} mode={selectedMode} type="chords" {chords} />
	</section>

	<section class="card">
		<h2>Voicings to try</h2>
		<ul class="voicing-list">
			{#each voicings as v}
				<li><strong>{v.name}</strong> — {v.description}</li>
			{/each}
		</ul>
	</section>

	<section class="card">
		<h2>Scale variations</h2>
		<ul class="variation-list">
			{#each variations as v}
				<li>
					<label>
						<input
							type="checkbox"
							checked={completedVariations.has(v.id)}
							onchange={() => toggleVariation(v.id)}
						/>
						<span>
							<strong>{v.name}</strong>
							<em>{v.description}</em>
						</span>
					</label>
				</li>
			{/each}
		</ul>
	</section>

	<section class="card log-card">
		<h2>Log this session</h2>
		<div class="log-row">
			<label>
				BPM
				<input type="number" bind:value={bpm} placeholder="e.g. 80" min="20" max="300" />
			</label>
			<div class="feel-group">
				<span>Feel</span>
				{#each [1, 2, 3] as f}
					<button class="feel-btn" class:selected={feel === f} onclick={() => (feel = f as Feel)}>
						{FEEL_LABELS[f]}
					</button>
				{/each}
			</div>
		</div>
		<button class="save-btn" disabled={!feel || saving} onclick={saveSession}>
			{saving ? 'Saving...' : saved ? 'Saved!' : 'Save session'}
		</button>
	</section>
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 1.25rem; }

	h1 { font-size: 1.4rem; font-weight: 600; }

	h2 {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #555;
		margin-bottom: 0.75rem;
	}

	.card {
		background: #1a1a1a;
		border: 1px solid #2a2a2a;
		border-radius: 10px;
		padding: 1.1rem 1.25rem;
	}

	.key-grid {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 0.4rem;
		margin-bottom: 0.75rem;
	}

	.key-btn {
		background: #222;
		border: 1px solid #333;
		border-radius: 6px;
		color: #aaa;
		padding: 0.4rem 0.2rem;
		font-size: 0.85rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}

	.key-btn.selected { background: #1e3a5f; border-color: #4a9eff; color: #e8e8e8; }
	.key-btn.stale { color: #e8a020; }
	.key-btn.stale.selected { color: #e8e8e8; }

	.days { font-size: 0.65rem; color: #555; }
	.key-btn.stale .days { color: #e8a020; }

	.mode-toggle { display: flex; gap: 0.5rem; }
	.mode-toggle button {
		background: #222; border: 1px solid #333; border-radius: 6px;
		color: #666; padding: 0.35rem 0.9rem; font-size: 0.85rem;
	}
	.mode-toggle button.selected { background: #1e3a5f; border-color: #4a9eff; color: #e8e8e8; }

	.last-session { font-size: 0.82rem; color: #555; margin-top: -0.5rem; }

	.notes-row { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
	.note {
		background: #222; border: 1px solid #333; border-radius: 4px;
		padding: 0.25rem 0.6rem; font-size: 0.9rem; font-family: monospace;
	}

	.prog-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 0.9rem;
	}

	.prog-tab {
		background: #222;
		border: 1px solid #333;
		border-radius: 6px;
		color: #666;
		padding: 0.3rem 0.7rem;
		font-size: 0.8rem;
	}

	.prog-tab.selected {
		background: #1e3a5f;
		border-color: #4a9eff;
		color: #e8e8e8;
	}

	.chords-row { display: flex; gap: 1rem; margin-bottom: 0.75rem; }
	.chord { display: flex; flex-direction: column; gap: 2px; }
	.degree { font-size: 0.7rem; color: #555; text-transform: uppercase; }
	.chord-root { font-size: 1.1rem; font-weight: 600; color: #4a9eff; }
	.chord-notes { font-size: 0.75rem; color: #666; font-family: monospace; }

	.voicing-list { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.85rem; color: #aaa; }
	.voicing-list strong { color: #ccc; }

	.variation-list { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }
	.variation-list label { display: flex; align-items: flex-start; gap: 0.75rem; font-size: 0.9rem; cursor: pointer; }
	.variation-list input[type='checkbox'] { margin-top: 2px; width: 16px; height: 16px; accent-color: #4a9eff; flex-shrink: 0; }
	.variation-list span { display: flex; flex-direction: column; gap: 1px; }
	.variation-list strong { color: #ccc; }
	.variation-list em { font-size: 0.78rem; color: #555; font-style: normal; }

	.log-card { display: flex; flex-direction: column; gap: 1rem; }
	.log-row { display: flex; gap: 1.5rem; align-items: flex-end; flex-wrap: wrap; }
	.log-row label { display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.85rem; color: #666; }
	.log-row input {
		background: #222; border: 1px solid #333; border-radius: 6px;
		padding: 0.5rem 0.75rem; color: #e8e8e8; font-size: 1rem; width: 90px;
	}

	.feel-group { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: #666; }
	.feel-btn { background: #222; border: 1px solid #333; border-radius: 6px; color: #666; padding: 0.4rem 0.75rem; font-size: 0.82rem; }
	.feel-btn.selected { background: #1e3a5f; border-color: #4a9eff; color: #e8e8e8; }

	.save-btn {
		background: #4a9eff; color: white; border: none; border-radius: 8px;
		padding: 0.75rem 1.5rem; font-size: 1rem; font-weight: 500; width: 100%;
	}
	.save-btn:disabled { opacity: 0.4; }
</style>
