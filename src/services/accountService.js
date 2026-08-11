import { isSupabaseConfigured, supabase } from './supabaseClient';

const DELETE_ACCOUNT_CONFIRMATION = 'DELETE_MY_ACCOUNT';

export async function deleteCurrentAccount() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Account service is unavailable.');
  }

  const { data, error } = await supabase.functions.invoke('delete-account', {
    body: { confirmation: DELETE_ACCOUNT_CONFIRMATION },
  });

  if (error) {
    throw error;
  }
  if (!data?.deleted) {
    throw new Error('Account could not be deleted.');
  }

  const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
  if (signOutError) {
    throw signOutError;
  }
}
