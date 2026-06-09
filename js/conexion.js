// Configuración de las credenciales de tu proyecto de Supabase
// REEMPLAZA estos textos con los datos reales de tu panel de Supabase:
const SUPABASE_URL = "https://lggrowjlxhxfyuvfbiyt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnZ3Jvd2pseGh4Znl1dmZiaXl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MTk5MjQsImV4cCI6MjA5NjA5NTkyNH0.KxOkQds8F7jt_1d2V6A_384LXlgh5lD5a9IZczKKTbA";

// Inicializamos el cliente global de Supabase
// const supabaseCliente = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabaseCliente = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log("Conexión con Supabase inicializada correctamente.");
