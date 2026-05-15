const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function createSupabaseClient(options = {}) {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase env variables missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }

  return createClient(supabaseUrl, supabaseKey, options);
}

module.exports = {
  createSupabaseClient
};
