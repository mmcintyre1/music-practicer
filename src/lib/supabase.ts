import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

export type Feel = 1 | 2 | 3;
export type Mode = 'major' | 'minor';

export interface ScaleVariation {
	id: number;
	name: string;
	description: string;
	difficulty: 1 | 2 | 3;
	sort_order: number;
}

export interface ChordVoicing {
	id: number;
	name: string;
	description: string;
	sort_order: number;
}

export interface KeySession {
	id: string;
	user_id: string;
	key_name: string;
	mode: Mode;
	practiced_at: string;
	bpm: number | null;
	feel: Feel | null;
	notes: string | null;
}

export interface SessionVariation {
	id: number;
	session_id: string;
	variation_id: number;
	completed: boolean;
}
