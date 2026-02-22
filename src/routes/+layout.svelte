<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	let { children } = $props();
	let user = $state<any>(null);

	onMount(async () => {
		const { data: { user: u } } = await supabase.auth.getUser();
		user = u;
		const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
			user = session?.user ?? null;
		});
		return () => subscription.unsubscribe();
	});

	async function signOut() {
		await supabase.auth.signOut();
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
			<div class="nav-auth">
				{#if user}
					<span class="nav-user" title={user.email}>{user.email}</span>
					<button onclick={signOut}>Sign out</button>
				{:else}
					<span class="nav-guest">Guest</span>
					<a href="/login" class="nav-signin">Sign in</a>
				{/if}
			</div>
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

	.nav-auth {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.nav-user {
		font-size: 0.78rem;
		color: #555;
		max-width: 150px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.nav-guest {
		font-size: 0.78rem;
		color: #555;
	}

	.nav-signin {
		font-size: 0.82rem;
		color: #4a9eff;
		text-decoration: none;
	}

	nav button {
		background: none;
		border: none;
		color: #555;
		font-size: 0.85rem;
	}

	main {
		padding-bottom: 3rem;
	}
</style>
