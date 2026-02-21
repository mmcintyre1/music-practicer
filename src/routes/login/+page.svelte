<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);
	let mode: 'login' | 'signup' = $state('login');

	async function submit() {
		loading = true;
		error = '';

		const fn = mode === 'login'
			? supabase.auth.signInWithPassword({ email, password })
			: supabase.auth.signUp({ email, password });

		const { error: err } = await fn;
		loading = false;

		if (err) {
			error = err.message;
		} else {
			goto('/');
		}
	}
</script>

<div class="login-wrap">
	<h1>Practice Tracker</h1>

	<form onsubmit={(e) => { e.preventDefault(); submit(); }}>
		<label>
			Email
			<input type="email" bind:value={email} required autocomplete="email" />
		</label>
		<label>
			Password
			<input type="password" bind:value={password} required autocomplete={mode === 'login' ? 'current-password' : 'new-password'} />
		</label>

		{#if error}
			<p class="error">{error}</p>
		{/if}

		<button type="submit" disabled={loading}>
			{loading ? '...' : mode === 'login' ? 'Sign in' : 'Create account'}
		</button>
	</form>

	<button class="toggle" onclick={() => { mode = mode === 'login' ? 'signup' : 'login'; error = ''; }}>
		{mode === 'login' ? 'No account? Sign up' : 'Have an account? Sign in'}
	</button>
</div>

<style>
	.login-wrap {
		max-width: 360px;
		margin: 4rem auto;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	h1 {
		font-size: 1.4rem;
		font-weight: 600;
		color: #e8e8e8;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: 0.85rem;
		color: #888;
	}

	input {
		background: #1a1a1a;
		border: 1px solid #2a2a2a;
		border-radius: 6px;
		padding: 0.6rem 0.8rem;
		color: #e8e8e8;
		font-size: 1rem;
	}

	input:focus {
		outline: none;
		border-color: #4a9eff;
	}

	button[type='submit'] {
		background: #4a9eff;
		color: white;
		border: none;
		border-radius: 6px;
		padding: 0.75rem;
		font-size: 1rem;
		font-weight: 500;
		margin-top: 0.25rem;
	}

	button[type='submit']:disabled {
		opacity: 0.5;
	}

	.toggle {
		background: none;
		border: none;
		color: #555;
		font-size: 0.85rem;
		text-align: left;
	}

	.error {
		color: #ff6b6b;
		font-size: 0.85rem;
	}
</style>
