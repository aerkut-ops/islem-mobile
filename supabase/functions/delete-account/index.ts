import { withSupabase } from 'npm:@supabase/server';

const DELETE_ACCOUNT_CONFIRMATION = 'DELETE_MY_ACCOUNT';

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed.' }, { status: 405 });
    }

    const body = await request.json().catch(() => null);
    if (body?.confirmation !== DELETE_ACCOUNT_CONFIRMATION) {
      return Response.json({ error: 'Account deletion was not confirmed.' }, { status: 400 });
    }

    const userId = context.userClaims?.sub || context.userClaims?.id;
    if (!userId) {
      return Response.json({ error: 'Authenticated user was not found.' }, { status: 401 });
    }

    const { error } = await context.supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
      console.error('Account deletion failed.', { code: error.code, status: error.status });
      return Response.json({ error: 'Account could not be deleted.' }, { status: 500 });
    }

    return Response.json({ deleted: true });
  }),
};
