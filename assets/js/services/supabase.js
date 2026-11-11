// Supabase client with an explicit LocalStorage fallback for offline demos.
let supabaseClient = null;
let clientPromise = null;

function getConfig() {
    return {
        url: localStorage.getItem('SUPABASE_URL') || '',
        key: localStorage.getItem('SUPABASE_ANON_KEY') || ''
    };
}

export function isSupabaseConfigured() {
    const { url, key } = getConfig();
    return Boolean(url && key);
}

export async function getSupabaseClient() {
    if (supabaseClient) return supabaseClient;
    if (!isSupabaseConfigured()) return null;
    if (clientPromise) return clientPromise;

    clientPromise = (async () => {
        const { url, key } = getConfig();
        const sdk = window.supabase || await import('https://esm.sh/@supabase/supabase-js@2');
        const createClient = sdk.createClient || sdk.default?.createClient;
        if (!createClient) throw new Error('Supabase SDK could not be loaded.');
        supabaseClient = createClient(url, key);
        return supabaseClient;
    })().catch(error => {
        clientPromise = null;
        console.error('Failed to initialize Supabase; using LocalStorage:', error);
        return null;
    });

    return clientPromise;
}

export const useMock = () => !isSupabaseConfigured();

export function configureSupabase(url, key) {
    if (url && key) {
        localStorage.setItem('SUPABASE_URL', url);
        localStorage.setItem('SUPABASE_ANON_KEY', key);
        window.location.reload();
    } else {
        localStorage.removeItem('SUPABASE_URL');
        localStorage.removeItem('SUPABASE_ANON_KEY');
        window.location.reload();
    }
}
