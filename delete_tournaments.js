import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load variables from .dev.vars
dotenv.config({ path: path.resolve(process.cwd(), '.dev.vars') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .dev.vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // 1. Fetch all tournaments
  const { data: tournaments, error } = await supabase
    .from('tournaments')
    .select('id, name, phase, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching tournaments:", error.message);
    return;
  }

  console.log(`Found ${tournaments.length} tournament(s) in the database:\n`);
  tournaments.forEach((t, i) => {
    console.log(`[${i}] ID: ${t.id}`);
    console.log(`    Name: ${t.name}`);
    console.log(`    Phase: ${t.phase}`);
    console.log(`    Created: ${new Date(t.created_at).toLocaleString()}`);
    console.log('--------------------------------------------------');
  });

  // =========================================================================
  // TO DELETE TOURNAMENTS:
  // Add the IDs of the tournaments you want to delete into the array below.
  // Example: const idsToDelete = ['uuid-1', 'uuid-2'];
  // =========================================================================
  const idsToDelete = []; 

  if (idsToDelete.length === 0) {
    console.log('\n⚠️ No IDs specified for deletion.');
    console.log('To delete tournaments, copy their IDs into the "idsToDelete" array in this script and run it again.');
    return;
  }

  console.log(`\nDeleting ${idsToDelete.length} tournament(s)...`);

  for (const id of idsToDelete) {
    const { error: delErr } = await supabase.from('tournaments').delete().eq('id', id);
    if (delErr) {
      console.error(`❌ Failed to delete tournament ${id}:`, delErr.message);
    } else {
      console.log(`✅ Successfully deleted tournament ${id}`);
    }
  }
}

run();
