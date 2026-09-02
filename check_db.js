import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: cats, error: err1 } = await supabase.from('menu_categories').select('*');
  const { data: rests, error: err2 } = await supabase.from('restaurants').select('*');
  
  console.log("Categories:", cats);
  console.log("Restaurants:", rests);
}

main().catch(console.error);
