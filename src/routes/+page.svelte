<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import type { ScaleVariation, KeySession, Feel } from '$lib/supabase';
	import {
		KEYS, type KeyName, type Mode, type ArpeggioType,
		getScaleNotes, getProgressionChords, computeVoicings,
		PROGRESSIONS, FEEL_LABELS
	} from '$lib/music';
	import Notation from '$lib/components/Notation.svelte';
	import Timer from '$lib/components/Timer.svelte';

	// --- Types ---
	type Tab = 'scales' | 'chords' | 'arpeggio' | 'repertoire';
	type PieceStatus = 'new' | 'working' | 'polishing' | 'done';

	interface Piece {
		id: string;
		title: string;
		composer: string | null;
		status: PieceStatus;
		started_at: string;
		last_practiced_at: string | null;
		notes: string | null;
	}

	// --- Auth + global ---
	let user = $state<any>(null);

	// --- Tab ---
	let selectedTab = $state<Tab>('scales');

	// --- Key / mode ---
	let selectedKey = $state<KeyName>('C');
	let selectedMode = $state<Mode>('major');
	let lastSessions = $state<Record<string, KeySession>>({});

	// --- Scales tab ---
	let variations = $state<ScaleVariation[]>([]);
	let completedVariations = $state<Set<number>>(new Set());
	let bpm = $state('');
	let feel = $state<Feel | null>(null);
	let saving = $state(false);
	let saved = $state(false);

	// --- Chords tab ---
	let selectedProgression = $state(PROGRESSIONS[0].id);

	// --- Notation config (shared across Scales + Arpeggio tabs) ---
	let notationOctaves   = $state<1 | 2>(1);
	let notationDirection = $state<'up' | 'up-down'>('up');
	let notationDuration  = $state<'q' | '8'>('q');
	let notationTimeSig   = $state<'4/4' | '3/4' | '6/8'>('4/4');
	let notationFingering = $state(false);

	// --- Arpeggio tab ---
	let selectedArpeggioType = $state<ArpeggioType>('root');

	// --- Repertoire tab ---
	let pieces = $state<Piece[]>([]);
	let showAddForm = $state(false);
	let newTitle = $state('');
	let newComposer = $state('');
	let addingPiece = $state(false);

	// --- Derived ---
	let scaleNotes = $derived(getScaleNotes(selectedKey, selectedMode));
	let chords = $derived(getProgressionChords(selectedKey, selectedMode, selectedProgression));
	let voicings = $derived(computeVoicings(chords));
	let lastSession = $derived(lastSessions[`${selectedKey}-${selectedMode}`] ?? null);
	// Tonic chord (I/i) used for arpeggio display
	let arpeggioChord = $derived(getProgressionChords(selectedKey, selectedMode, 'I-IV-V7')[0]);

	// Group pieces by status for display
	const STATUS_ORDER: PieceStatus[] = ['new', 'working', 'polishing', 'done'];
	let piecesByStatus = $derived(
		STATUS_ORDER.map((s) => ({ status: s, items: pieces.filter((p) => p.status === s) })).filter(
			(g) => g.items.length > 0
		)
	);

	// --- Lifecycle ---
	onMount(async () => {
		const {
			data: { user: u }
		} = await supabase.auth.getUser();
		user = u;
		await loadVariations(); // public — works for guests
		if (user) {
			await Promise.all([loadLastSessions(), loadPieces()]);
			selectedKey = suggestKey();
		}
	});

	async function loadVariations() {
		const { data } = await supabase.from('scale_variations').select('*').order('sort_order');
		if (data) variations = data;
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
			if (!seen.has(k)) { seen.add(k); lastSessions[k] = s; }
		}
	}

	async function loadPieces() {
		const { data } = await supabase
			.from('pieces')
			.select('*')
			.eq('user_id', user.id)
			.order('started_at', { ascending: false });
		if (data) pieces = data;
	}

	function suggestKey(): KeyName {
		let best: KeyName = 'C';
		let bestDays = -1;
		for (const k of KEYS) {
			const s = lastSessions[`${k}-major`];
			const days = s ? Math.floor((Date.now() - new Date(s.practiced_at).getTime()) / 86400000) : 9999;
			if (days > bestDays) { bestDays = days; best = k; }
		}
		return best;
	}

	// --- Scales actions ---
	function toggleVariation(id: number) {
		const next = new Set(completedVariations);
		if (next.has(id)) next.delete(id); else next.add(id);
		completedVariations = next;
	}

	async function saveSession() {
		if (!user || !feel) return;
		saving = true;
		const { data: session, error } = await supabase
			.from('key_sessions')
			.insert({ user_id: user.id, key_name: selectedKey, mode: selectedMode, bpm: bpm ? parseInt(bpm) : null, feel })
			.select().single();
		if (error || !session) { saving = false; return; }
		if (completedVariations.size > 0) {
			await supabase.from('session_variations').insert(
				[...completedVariations].map((vid) => ({ session_id: session.id, variation_id: vid, completed: true }))
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

	// --- Repertoire actions ---
	async function addPiece() {
		if (!user || !newTitle.trim()) return;
		addingPiece = true;
		const { data } = await supabase
			.from('pieces')
			.insert({ user_id: user.id, title: newTitle.trim(), composer: newComposer.trim() || null, status: 'new' })
			.select().single();
		if (data) pieces = [data, ...pieces];
		newTitle = '';
		newComposer = '';
		showAddForm = false;
		addingPiece = false;
	}

	const NEXT_STATUS: Record<PieceStatus, PieceStatus> = {
		new: 'working', working: 'polishing', polishing: 'done', done: 'new'
	};

	async function cycleStatus(piece: Piece) {
		const next = NEXT_STATUS[piece.status];
		await supabase.from('pieces').update({ status: next }).eq('id', piece.id);
		pieces = pieces.map((p) => (p.id === piece.id ? { ...p, status: next } : p));
	}

	async function deletePiece(id: string) {
		await supabase.from('pieces').delete().eq('id', id);
		pieces = pieces.filter((p) => p.id !== id);
	}

	const STATUS_LABEL: Record<PieceStatus, string> = {
		new: 'New', working: 'Working', polishing: 'Polishing', done: 'Done'
	};
</script>

<div class="page">
	<h1>Today's Practice</h1>

	<!-- Key selector — always visible -->
	<section class="card">
		<h2>Key</h2>
		<div class="key-grid">
			{#each KEYS as k}
				{@const last = lastSessions[`${k}-major`]}
				{@const days = last ? Math.floor((Date.now() - new Date(last.practiced_at).getTime()) / 86400000) : null}
				<button
					class="key-btn"
					class:selected={selectedKey === k}
					class:stale={days === null || days > 7}
					onclick={() => { selectedKey = k; selectedMode = 'major'; }}
				>
					{k}
					{#if days !== null}<span class="days">{days}d</span>{/if}
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

	<!-- Section tabs -->
	<div class="section-tabs">
		<button class="sec-tab" class:active={selectedTab === 'scales'} onclick={() => (selectedTab = 'scales')}>
			Scales
		</button>
		<button class="sec-tab" class:active={selectedTab === 'chords'} onclick={() => (selectedTab = 'chords')}>
			Chords
		</button>
		<button class="sec-tab" class:active={selectedTab === 'arpeggio'} onclick={() => (selectedTab = 'arpeggio')}>
			Arpeggio
		</button>
		<button class="sec-tab" class:active={selectedTab === 'repertoire'} onclick={() => (selectedTab = 'repertoire')}>
			Repertoire
		</button>
	</div>

	<!-- Persistent timer — lives outside all tab conditionals so it never resets -->
	<section class="card timer-card">
		<Timer defaultMinutes={10} />
	</section>

	<!-- ===== SCALES TAB ===== -->
	{#if selectedTab === 'scales'}
		<section class="card">
			<h2>{selectedKey} {selectedMode} scale</h2>
			<div class="notes-row">
				{#each scaleNotes as note}
					<span class="note">{note}</span>
				{/each}
			</div>

			<!-- Notation config controls -->
			<div class="notation-config">
				<div class="cfg-group">
					<span class="cfg-label">Octaves</span>
					<button class="cfg-btn" class:on={notationOctaves === 1} onclick={() => (notationOctaves = 1)}>1</button>
					<button class="cfg-btn" class:on={notationOctaves === 2} onclick={() => (notationOctaves = 2)}>2</button>
				</div>
				<div class="cfg-group">
					<span class="cfg-label">Direction</span>
					<button class="cfg-btn" class:on={notationDirection === 'up'} onclick={() => (notationDirection = 'up')}>Up</button>
					<button class="cfg-btn" class:on={notationDirection === 'up-down'} onclick={() => (notationDirection = 'up-down')}>↑↓</button>
				</div>
				<div class="cfg-group">
					<span class="cfg-label">Notes</span>
					<button class="cfg-btn" class:on={notationDuration === 'q'} onclick={() => (notationDuration = 'q')}>♩</button>
					<button class="cfg-btn" class:on={notationDuration === '8'} onclick={() => (notationDuration = '8')}>♪</button>
				</div>
				<div class="cfg-group">
					<span class="cfg-label">Time</span>
					<button class="cfg-btn" class:on={notationTimeSig === '4/4'} onclick={() => (notationTimeSig = '4/4')}>4/4</button>
					<button class="cfg-btn" class:on={notationTimeSig === '3/4'} onclick={() => (notationTimeSig = '3/4')}>3/4</button>
					<button class="cfg-btn" class:on={notationTimeSig === '6/8'} onclick={() => (notationTimeSig = '6/8')}>6/8</button>
				</div>
				<div class="cfg-group">
					<span class="cfg-label">Fingering</span>
					<button class="cfg-btn" class:on={!notationFingering} onclick={() => (notationFingering = false)}>Off</button>
					<button class="cfg-btn" class:on={notationFingering} onclick={() => (notationFingering = true)}>On</button>
				</div>
			</div>

			<Notation
				key={selectedKey}
				mode={selectedMode}
				type="scale"
				octaves={notationOctaves}
				direction={notationDirection}
				duration={notationDuration}
				timeSignature={notationTimeSig}
				showFingering={notationFingering}
			/>
		</section>

		<section class="card">
			<h2>Variations &amp; arpeggios</h2>
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

		{#if user}
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
		{:else}
			<div class="guest-prompt"><a href="/login">Sign in</a> to save your practice sessions.</div>
		{/if}

	<!-- ===== CHORDS TAB ===== -->
	{:else if selectedTab === 'chords'}
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
			<h2>Voicings</h2>
			<table class="voicing-table">
				<thead>
					<tr>
						<th></th>
						{#each chords as chord}
							<th>{chord.degree}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each voicings as v}
						<tr>
							<td class="inv-label">{v.name}</td>
							{#each v.chords as c}
								<td class="inv-notes">{c.notes.join('-')}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</section>

	<!-- ===== ARPEGGIO TAB ===== -->
	{:else if selectedTab === 'arpeggio'}
		<section class="card">
			<h2>{selectedKey} {selectedMode} — {arpeggioChord.degree} arpeggio</h2>
			<p class="chord-notes-hint">{arpeggioChord.notes.join(' – ')}</p>

			<!-- Arpeggio type selector -->
			<div class="arp-types">
				<button class="arp-btn" class:selected={selectedArpeggioType === 'root'}       onclick={() => (selectedArpeggioType = 'root')}>Root</button>
				<button class="arp-btn" class:selected={selectedArpeggioType === 'first-inv'}  onclick={() => (selectedArpeggioType = 'first-inv')}>1st inv</button>
				<button class="arp-btn" class:selected={selectedArpeggioType === 'second-inv'} onclick={() => (selectedArpeggioType = 'second-inv')}>2nd inv</button>
				<button class="arp-btn" class:selected={selectedArpeggioType === 'broken'}     onclick={() => (selectedArpeggioType = 'broken')}>Broken</button>
			</div>

			<!-- Notation config controls (same as Scales) -->
			<div class="notation-config">
				<div class="cfg-group">
					<span class="cfg-label">Octaves</span>
					<button class="cfg-btn" class:on={notationOctaves === 1} onclick={() => (notationOctaves = 1)}>1</button>
					<button class="cfg-btn" class:on={notationOctaves === 2} onclick={() => (notationOctaves = 2)}>2</button>
				</div>
				<div class="cfg-group">
					<span class="cfg-label">Direction</span>
					<button class="cfg-btn" class:on={notationDirection === 'up'} onclick={() => (notationDirection = 'up')}>Up</button>
					<button class="cfg-btn" class:on={notationDirection === 'up-down'} onclick={() => (notationDirection = 'up-down')}>↑↓</button>
				</div>
				<div class="cfg-group">
					<span class="cfg-label">Notes</span>
					<button class="cfg-btn" class:on={notationDuration === 'q'} onclick={() => (notationDuration = 'q')}>♩</button>
					<button class="cfg-btn" class:on={notationDuration === '8'} onclick={() => (notationDuration = '8')}>♪</button>
				</div>
				<div class="cfg-group">
					<span class="cfg-label">Time</span>
					<button class="cfg-btn" class:on={notationTimeSig === '4/4'} onclick={() => (notationTimeSig = '4/4')}>4/4</button>
					<button class="cfg-btn" class:on={notationTimeSig === '3/4'} onclick={() => (notationTimeSig = '3/4')}>3/4</button>
					<button class="cfg-btn" class:on={notationTimeSig === '6/8'} onclick={() => (notationTimeSig = '6/8')}>6/8</button>
				</div>
			</div>

			<Notation
				key={selectedKey}
				mode={selectedMode}
				type="arpeggio"
				chords={[arpeggioChord]}
				octaves={notationOctaves}
				direction={notationDirection}
				duration={notationDuration}
				timeSignature={notationTimeSig}
				arpeggioType={selectedArpeggioType}
			/>
		</section>

	<!-- ===== REPERTOIRE TAB ===== -->
	{:else}
		{#if !user}
			<div class="guest-prompt"><a href="/login">Sign in</a> to track your repertoire.</div>
		{/if}
		<section class="card" class:hidden={!user}>
			<div class="rep-header">
				<h2>Pieces</h2>
				<button class="add-btn" onclick={() => (showAddForm = !showAddForm)}>
					{showAddForm ? 'Cancel' : '+ Add piece'}
				</button>
			</div>

			{#if showAddForm}
				<form class="add-form" onsubmit={(e) => { e.preventDefault(); addPiece(); }}>
					<input
						class="text-input"
						type="text"
						bind:value={newTitle}
						placeholder="Title"
						required
					/>
					<input
						class="text-input"
						type="text"
						bind:value={newComposer}
						placeholder="Composer (optional)"
					/>
					<button type="submit" class="save-btn" disabled={!newTitle.trim() || addingPiece}>
						{addingPiece ? 'Adding...' : 'Add'}
					</button>
				</form>
			{/if}

			{#if pieces.length === 0 && !showAddForm}
				<p class="muted">No pieces yet. Add one to get started.</p>
			{/if}

			{#each piecesByStatus as group}
				<div class="piece-group">
					<span class="group-label">{STATUS_LABEL[group.status]}</span>
					<ul class="piece-list">
						{#each group.items as piece}
							<li class="piece-row">
								<div class="piece-info">
									<strong>{piece.title}</strong>
									{#if piece.composer}<span class="composer">{piece.composer}</span>{/if}
								</div>
								<div class="piece-actions">
									<button
										class="status-badge status-{piece.status}"
										onclick={() => cycleStatus(piece)}
										title="Tap to advance status"
									>{STATUS_LABEL[piece.status]}</button>
									<button class="del-btn" onclick={() => deletePiece(piece.id)}>×</button>
								</div>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</section>
	{/if}
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

	.timer-card { padding: 0.9rem 1.25rem; }

	/* Key grid */
	.key-grid {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 0.4rem;
		margin-bottom: 0.75rem;
	}

	.key-btn {
		background: #222; border: 1px solid #333; border-radius: 6px;
		color: #aaa; padding: 0.4rem 0.2rem; font-size: 0.85rem;
		display: flex; flex-direction: column; align-items: center; gap: 2px;
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

	/* Section tabs */
	.section-tabs {
		display: flex;
		gap: 0;
		background: #1a1a1a;
		border: 1px solid #2a2a2a;
		border-radius: 10px;
		overflow: hidden;
	}

	.sec-tab {
		flex: 1;
		background: none;
		border: none;
		color: #555;
		padding: 0.65rem 0.5rem;
		font-size: 0.9rem;
		font-weight: 500;
		border-right: 1px solid #2a2a2a;
	}

	.sec-tab:last-child { border-right: none; }
	.sec-tab.active { background: #1e3a5f; color: #e8e8e8; }

	/* Notes row */
	.notes-row { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
	.note {
		background: #222; border: 1px solid #333; border-radius: 4px;
		padding: 0.25rem 0.6rem; font-size: 0.9rem; font-family: monospace;
	}

	/* Notation config controls */
	.notation-config {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		margin: 0.75rem 0 0;
		padding: 0.65rem 0.75rem;
		background: #161616;
		border: 1px solid #252525;
		border-radius: 7px;
	}

	.cfg-group { display: flex; align-items: center; gap: 0.3rem; }

	.cfg-label { font-size: 0.72rem; color: #444; margin-right: 0.15rem; white-space: nowrap; }

	.cfg-btn {
		background: #222; border: 1px solid #333; border-radius: 4px;
		color: #555; padding: 0.2rem 0.5rem; font-size: 0.75rem;
	}
	.cfg-btn.on { background: #1e3a5f; border-color: #4a9eff; color: #c8d8f0; }

	/* Arpeggio type selector */
	.arp-types { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
	.arp-btn {
		background: #222; border: 1px solid #333; border-radius: 6px;
		color: #666; padding: 0.3rem 0.75rem; font-size: 0.82rem;
	}
	.arp-btn.selected { background: #1e3a5f; border-color: #4a9eff; color: #e8e8e8; }

	.chord-notes-hint { font-size: 0.82rem; color: #555; font-family: monospace; margin-bottom: 0.6rem; }

	/* Chord tabs */
	.prog-tabs { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.9rem; }
	.prog-tab {
		background: #222; border: 1px solid #333; border-radius: 6px;
		color: #666; padding: 0.3rem 0.7rem; font-size: 0.8rem;
	}
	.prog-tab.selected { background: #1e3a5f; border-color: #4a9eff; color: #e8e8e8; }

	.chords-row { display: flex; gap: 1rem; margin-bottom: 0.75rem; }
	.chord { display: flex; flex-direction: column; gap: 2px; }
	.degree { font-size: 0.7rem; color: #555; text-transform: uppercase; }
	.chord-root { font-size: 1.1rem; font-weight: 600; color: #4a9eff; }
	.chord-notes { font-size: 0.75rem; color: #666; font-family: monospace; }

	/* Voicings table */
	.voicing-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
	.voicing-table th {
		text-align: center; color: #4a9eff; font-weight: 600;
		padding: 0.3rem 0.4rem; border-bottom: 1px solid #2a2a2a;
	}
	.voicing-table th:first-child { text-align: left; color: #444; }
	.voicing-table td { padding: 0.35rem 0.4rem; border-bottom: 1px solid #1f1f1f; }
	.inv-label { color: #555; font-size: 0.78rem; white-space: nowrap; }
	.inv-notes { font-family: monospace; color: #aaa; text-align: center; }

	/* Variations */
	.variation-list { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }
	.variation-list label { display: flex; align-items: flex-start; gap: 0.75rem; font-size: 0.9rem; cursor: pointer; }
	.variation-list input[type='checkbox'] { margin-top: 2px; width: 16px; height: 16px; accent-color: #4a9eff; flex-shrink: 0; }
	.variation-list span { display: flex; flex-direction: column; gap: 1px; }
	.variation-list strong { color: #ccc; }
	.variation-list em { font-size: 0.78rem; color: #555; font-style: normal; }

	/* Log */
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

	/* Repertoire */
	.rep-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
	.rep-header h2 { margin-bottom: 0; }

	.add-btn {
		background: #222; border: 1px solid #333; border-radius: 6px;
		color: #888; padding: 0.3rem 0.8rem; font-size: 0.82rem;
	}

	.add-form { display: flex; flex-direction: column; gap: 0.6rem; margin-bottom: 1rem; }
	.text-input {
		background: #222; border: 1px solid #333; border-radius: 6px;
		padding: 0.55rem 0.8rem; color: #e8e8e8; font-size: 0.95rem; width: 100%;
	}
	.text-input:focus { outline: none; border-color: #4a9eff; }

	.piece-group { margin-bottom: 1rem; }
	.piece-group:last-child { margin-bottom: 0; }

	.group-label {
		font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em;
		color: #444; display: block; margin-bottom: 0.4rem;
	}

	.piece-list { list-style: none; display: flex; flex-direction: column; gap: 0.4rem; }

	.piece-row {
		display: flex; justify-content: space-between; align-items: center;
		padding: 0.5rem 0; border-bottom: 1px solid #222;
	}

	.piece-info { display: flex; flex-direction: column; gap: 2px; }
	.piece-info strong { font-size: 0.92rem; color: #ddd; }
	.composer { font-size: 0.78rem; color: #555; }

	.piece-actions { display: flex; align-items: center; gap: 0.5rem; }

	.status-badge {
		border: none; border-radius: 4px; padding: 0.2rem 0.6rem;
		font-size: 0.72rem; font-weight: 600; cursor: pointer;
	}

	.status-new      { background: #1e3a5f; color: #4a9eff; }
	.status-working  { background: #3a2a00; color: #e8a020; }
	.status-polishing { background: #1a3a1a; color: #4caf50; }
	.status-done     { background: #2a2a2a; color: #555; }

	.del-btn {
		background: none; border: none; color: #3a3a3a;
		font-size: 1.1rem; line-height: 1; padding: 0.1rem 0.3rem;
	}
	.del-btn:hover { color: #ff6b6b; }

	.muted { color: #444; font-size: 0.85rem; }

	.hidden { display: none; }

	.guest-prompt {
		font-size: 0.85rem;
		color: #555;
		text-align: center;
		padding: 0.75rem;
	}
	.guest-prompt a { color: #4a9eff; text-decoration: none; }
</style>
