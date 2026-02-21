<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase';
	import type { KeySession } from '$lib/supabase';
	import { KEYS, FEEL_LABELS, type Mode } from '$lib/music';

	let user = $state<any>(null);
	let sessions = $state<KeySession[]>([]);
	let loading = $state(true);
	let gridMode = $state<Mode>('major');

	let lastByKey = $derived.by(() => {
		const map: Record<string, KeySession> = {};
		for (const s of sessions) {
			const k = `${s.key_name}-${s.mode}`;
			if (!map[k]) map[k] = s;
		}
		return map;
	});

	let recent = $derived(sessions.slice(0, 20));

	onMount(async () => {
		const { data: { user: u } } = await supabase.auth.getUser();
		if (!u) { goto('/login'); return; }
		user = u;
		const { data } = await supabase
			.from('key_sessions')
			.select('*')
			.eq('user_id', u.id)
			.order('practiced_at', { ascending: false });
		if (data) sessions = data;
		loading = false;
	});

	function daysSince(dateStr: string): number {
		return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
	}

	function feelColor(feel: number | null): string {
		if (feel === 3) return '#2d6a2d';
		if (feel === 2) return '#5a4a1a';
		if (feel === 1) return '#5a1a1a';
		return '#222';
	}
</script>

<div class="page">
	<h1>Dashboard</h1>

	{#if loading}
		<p class="muted">Loading...</p>
	{:else}
		<section class="card">
			<div class="grid-header">
				<h2>Key coverage</h2>
				<div class="mode-toggle">
					<button class:selected={gridMode === 'major'} onclick={() => (gridMode = 'major')}>Major</button>
					<button class:selected={gridMode === 'minor'} onclick={() => (gridMode = 'minor')}>Minor</button>
				</div>
			</div>
			<div class="key-grid">
				{#each KEYS as k}
					{@const last = lastByKey[`${k}-${gridMode}`]}
					{@const days = last ? daysSince(last.practiced_at) : null}
					<div
						class="key-cell"
						style:background={feelColor(last?.feel ?? null)}
						style:border-color={days !== null && days <= 3 ? '#4a9eff' : '#333'}
					>
						<span class="key-name">{k}</span>
						{#if days !== null}
							<span class="days">{days}d ago</span>
							{#if last?.bpm}<span class="bpm">{last.bpm} bpm</span>{/if}
						{:else}
							<span class="days never">–</span>
						{/if}
					</div>
				{/each}
			</div>
			<div class="legend">
				<span style:background="#5a1a1a" class="swatch"></span> Struggle
				<span style:background="#5a4a1a" class="swatch" style:margin-left="0.75rem"></span> OK
				<span style:background="#2d6a2d" class="swatch" style:margin-left="0.75rem"></span> Solid
				<span style:background="#222" class="swatch" style:margin-left="0.75rem"></span> Never
			</div>
		</section>

		{@const gaps = KEYS.filter((k) => {
			const last = lastByKey[`${k}-${gridMode}`];
			return !last || daysSince(last.practiced_at) >= 7;
		})}
		{#if gaps.length > 0}
			<section class="card">
				<h2>Needs attention — {gridMode} (7+ days)</h2>
				<div class="gap-list">
					{#each gaps as k}
						{@const last = lastByKey[`${k}-${gridMode}`]}
						<span class="gap-key">
							{k}
							<em>{last ? `${daysSince(last.practiced_at)}d` : 'never'}</em>
						</span>
					{/each}
				</div>
			</section>
		{/if}

		<section class="card">
			<h2>Recent sessions</h2>
			{#if recent.length === 0}
				<p class="muted">No sessions yet. Log one from Today.</p>
			{:else}
				<table>
					<thead>
						<tr>
							<th>Date</th>
							<th>Key</th>
							<th>BPM</th>
							<th>Feel</th>
						</tr>
					</thead>
					<tbody>
						{#each recent as s}
							<tr>
								<td>{new Date(s.practiced_at).toLocaleDateString()}</td>
								<td>{s.key_name} {s.mode}</td>
								<td>{s.bpm ?? '—'}</td>
								<td class="feel" data-feel={s.feel}>{s.feel ? FEEL_LABELS[s.feel] : '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>
	{/if}
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 1.25rem; }
	h1 { font-size: 1.4rem; font-weight: 600; }
	h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: #555; margin-bottom: 0; }

	.card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 10px; padding: 1.1rem 1.25rem; }

	.grid-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.mode-toggle { display: flex; gap: 0.4rem; }
	.mode-toggle button {
		background: #222; border: 1px solid #333; border-radius: 6px;
		color: #666; padding: 0.25rem 0.7rem; font-size: 0.78rem;
	}
	.mode-toggle button.selected { background: #1e3a5f; border-color: #4a9eff; color: #e8e8e8; }

	.key-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.4rem; margin-bottom: 0.75rem; }

	.key-cell {
		border: 1px solid #333; border-radius: 6px; padding: 0.5rem 0.3rem;
		display: flex; flex-direction: column; align-items: center; gap: 2px;
	}

	.key-name { font-size: 0.9rem; font-weight: 600; color: #e8e8e8; }
	.days { font-size: 0.65rem; color: #888; }
	.days.never { color: #444; }
	.bpm { font-size: 0.6rem; color: #666; }

	.legend { display: flex; align-items: center; gap: 0.35rem; font-size: 0.75rem; color: #555; }
	.swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; }

	.gap-list { display: flex; flex-wrap: wrap; gap: 0.5rem; }
	.gap-key {
		background: #222; border: 1px solid #3a2020; border-radius: 6px;
		padding: 0.3rem 0.7rem; font-size: 0.85rem; color: #e8a020;
		display: flex; gap: 0.4rem; align-items: center;
	}
	.gap-key em { font-style: normal; color: #555; font-size: 0.75rem; }

	table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
	th { text-align: left; color: #444; font-weight: 500; padding: 0.3rem 0.5rem 0.5rem 0; border-bottom: 1px solid #2a2a2a; }
	td { padding: 0.4rem 0.5rem 0.4rem 0; border-bottom: 1px solid #1f1f1f; color: #aaa; }
	td.feel[data-feel='3'] { color: #4caf50; }
	td.feel[data-feel='2'] { color: #e8a020; }
	td.feel[data-feel='1'] { color: #ff6b6b; }

	.muted { color: #444; font-size: 0.85rem; }
</style>
