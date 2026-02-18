import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(
  "https://fkebzmrjkqtcsfkwcexp.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrZWJ6bXJqa3F0Y3Nma3djZXhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNDQ0NTEsImV4cCI6MjA4NjkyMDQ1MX0.F-64YNS64CgQ7cHETsXlcDNYUTrN_1UVAExl8fvHiv0"
);
