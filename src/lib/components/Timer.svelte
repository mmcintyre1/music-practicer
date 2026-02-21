<script lang="ts">
	import { onDestroy } from 'svelte';

	interface Props {
		defaultMinutes: number;
	}

	let { defaultMinutes }: Props = $props();

	let totalSeconds = $state(defaultMinutes * 60);
	let remaining = $state(defaultMinutes * 60);
	let running = $state(false);
	let done = $state(false);
	let intervalId: ReturnType<typeof setInterval> | null = null;

	function tick() {
		if (remaining <= 1) {
			remaining = 0;
			running = false;
			done = true;
			clearInterval(intervalId!);
			intervalId = null;
			return;
		}
		remaining--;
	}

	function start() {
		if (remaining <= 0) return;
		running = true;
		done = false;
		intervalId = setInterval(tick, 1000);
	}

	function pause() {
		running = false;
		if (intervalId) { clearInterval(intervalId); intervalId = null; }
	}

	function reset() {
		pause();
		remaining = totalSeconds;
		done = false;
	}

	let mins = $derived(String(Math.floor(remaining / 60)).padStart(2, '0'));
	let secs = $derived(String(remaining % 60).padStart(2, '0'));
	let pct = $derived(Math.round(((totalSeconds - remaining) / totalSeconds) * 100));

	onDestroy(() => { if (intervalId) clearInterval(intervalId); });
</script>

<div class="timer" class:done>
	<div class="time-row">
		<span class="time">{mins}:{secs}</span>
		<div class="controls">
			{#if !running}
				<button class="ctrl-btn start" onclick={start} disabled={remaining === 0}>
					{done ? 'Done' : 'Start'}
				</button>
			{:else}
				<button class="ctrl-btn" onclick={pause}>Pause</button>
			{/if}
			<button class="ctrl-btn reset" onclick={reset}>↺</button>
		</div>
	</div>
	<div class="bar-track">
		<div class="bar-fill" style:width="{pct}%"></div>
	</div>
</div>

<style>
	.timer {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.time-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.time {
		font-size: 1.6rem;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		color: #e8e8e8;
		letter-spacing: 0.05em;
	}

	.done .time { color: #4caf50; }

	.controls {
		display: flex;
		gap: 0.4rem;
	}

	.ctrl-btn {
		background: #2a2a2a;
		border: 1px solid #3a3a3a;
		border-radius: 6px;
		color: #aaa;
		padding: 0.3rem 0.8rem;
		font-size: 0.82rem;
	}

	.ctrl-btn.start {
		background: #1e3a5f;
		border-color: #4a9eff;
		color: #e8e8e8;
	}

	.ctrl-btn.reset { color: #555; }
	.ctrl-btn:disabled { opacity: 0.4; }

	.bar-track {
		height: 3px;
		background: #2a2a2a;
		border-radius: 2px;
		overflow: hidden;
	}

	.bar-fill {
		height: 100%;
		background: #4a9eff;
		border-radius: 2px;
		transition: width 1s linear;
	}

	.done .bar-fill { background: #4caf50; }
</style>
