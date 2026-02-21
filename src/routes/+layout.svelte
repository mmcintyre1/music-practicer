<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	let { children } = $props();

	async function signOut() {
		await supabase.auth.signOut();
		goto('/login');
	}
</script>

<svelte:head>
	<title>Practice Tracker</title>
	<meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<div class="app">
	{#if $page.url.pathname !== '/login'}
		<nav>
			<a href="/" class:active={$page.url.pathname === '/'}>Today</a>
			<a href="/dashboard" class:active={$page.url.pathname === '/dashboard'}>Dashboard</a>
			<button onclick={signOut}>Sign out</button>
		</nav>
	{/if}
	<main>
		{@render children()}
	</main>
</div>

<style>
	:global(*, *::before, *::after) {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}

	:global(body) {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		background: #0f0f0f;
		color: #e8e8e8;
		min-height: 100vh;
	}

	:global(button) {
		cursor: pointer;
	}

	.app {
		max-width: 680px;
		margin: 0 auto;
		padding: 0 1rem;
	}

	nav {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 1rem 0;
		border-bottom: 1px solid #2a2a2a;
		margin-bottom: 1.5rem;
	}

	nav a {
		color: #888;
		text-decoration: none;
		font-size: 0.95rem;
		font-weight: 500;
	}

	nav a.active {
		color: #e8e8e8;
	}

	nav button {
		margin-left: auto;
		background: none;
		border: none;
		color: #555;
		font-size: 0.85rem;
	}

	main {
		padding-bottom: 3rem;
	}
</style>
