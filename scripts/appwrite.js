(function () {
    'use strict';
    const config = window.CITYVET_CONFIG;
    const ready = Boolean(config &&
        /^https:\/\//.test(config.endpoint) &&
        !config.endpoint.includes('<REGION>') &&
        config.projectId !== 'PASTE_YOUR_PROJECT_ID' &&
        config.projectId && window.Appwrite);

    const client = ready ? new window.Appwrite.Client()
        .setEndpoint(config.endpoint)
        .setProject(config.projectId) : null;
    const account = ready ? new window.Appwrite.Account(client) : null;
    const teams = ready ? new window.Appwrite.Teams(client) : null;
    const tablesDB = ready ? new window.Appwrite.TablesDB(client) : null;
    const functions = ready ? new window.Appwrite.Functions(client) : null;
    const storage = ready ? new window.Appwrite.Storage(client) : null;
    async function operate(action, payload={}) {
        if (!ready) throw new Error('Appwrite is not configured.');
        const result = await functions.createExecution({
            functionId: config.functions.operations,
            body: JSON.stringify({action,...payload}),
            async: false
        });
        const status = Number(result.responseStatusCode || 0);
        const id = result.$id ? ` Execution: ${result.$id}.` : '';
        let body;
        try { body = JSON.parse(result.responseBody || ''); }
        catch {
            const reason = result.status === 'failed' ? 'The CityVetHub Function could not start. Check that the latest Appwrite deployment is Active and its root entrypoint is index.js.' :
                status ? `Function returned HTTP ${status} with no usable JSON.` :
                'Function returned no usable JSON response.';
            throw new Error(reason + id + ' Check Appwrite Console > Functions > cityvethub-operations > Executions.');
        }
        if (!body || body.ok !== true || status >= 400 || result.status === 'failed') {
            const message = typeof body?.error === 'string' && body.error.trim() ? body.error :
                typeof body?.message === 'string' && body.message.trim() ? body.message :
                `Backend returned ${status ? 'HTTP '+status : 'an unsuccessful response'} without details.`;
            throw new Error(message + id + ' Check the matching Function execution for details.');
        }
        return body.data;
    }

    async function context() {
        if (!ready) throw new Error('Appwrite is not configured. Edit scripts/config.js and register your website domain in Appwrite Console.');
        const user = await account.get();
        // Team memberships are the authority for staff privileges. Never trust
        // the role dropdown, account preferences, or client-visible JavaScript.
        const memberships = await teams.list();
        const ids = new Set(memberships.teams.map(team => team.$id));
        const role = ids.has(config.teams.admin) ? 'admin'
            : ids.has(config.teams.officer) ? 'officer'
            : user.prefs?.requestedRole === 'officer' ? 'pending_officer'
            : 'owner';
        return { user, role };
    }

    async function login(email, password) {
        if (!ready) throw new Error('Appwrite is not configured. Open scripts/config.js first.');
        return account.createEmailPasswordSession({ email, password });
    }

    async function register({ name, email, password, requestedRole }) {
        if (!ready) throw new Error('Appwrite is not configured. Open scripts/config.js first.');
        if (!['owner', 'officer'].includes(requestedRole)) throw new Error('Choose a valid registration type.');
        // A user can request an officer account, but cannot self-grant Team membership.
        await account.create({ userId: window.Appwrite.ID.unique(), name, email, password });
        await account.createEmailPasswordSession({ email, password });
        try {
            await account.updatePrefs({ prefs: { requestedRole } });
        } catch (error) {
            // Account creation succeeded even if preferences could not be saved.
            throw new Error('Your account was created, but setup was incomplete. Sign in and contact an administrator. ' + readableError(error));
        }
        if (requestedRole === 'officer') {
            // A trusted Appwrite Function blocks the Auth user until CVO approval.
            // If that operation fails, sign out rather than treating this account
            // as a regular Pet Owner. The administrator can review the user.
            try { await operate('blockPendingOfficer'); }
            catch (error) {
                try { await logout(); } catch {}
                throw new Error('Field Officer account was created but access could not be safely disabled. Ask the CVO to verify its pending status. ' + readableError(error));
            }
            return {role:'pending_officer'};
        }
        return context();
    }

    async function logout() {
        if (!ready) return;
        await account.deleteSession({ sessionId: 'current' });
    }

    function destination(role) {
        return role === 'pending_officer' ? './pending.html' : './index.html';
    }

    function readableError(error) {
        const kind = error?.type || '';
        if (kind === 'user_invalid_credentials') return 'Invalid email or password.';
        if (kind === 'user_already_exists') return 'An account already exists with that email. Please sign in.';
        if (kind === 'user_rate_limit_exceeded' || error?.code === 429) return 'Too many attempts. Please try again later.';
        // Not every 401 means an expired session: Appwrite also returns 401
        // when a signed-in user attempts to grant or access a forbidden resource.
        if (error?.code === 401) {
            const actualSessionError = ['user_jwt_invalid', 'user_session_not_found', 'user_invalid_token'].includes(kind);
            if (actualSessionError) return 'Your session has expired. Please sign in again.';
            return 'Appwrite denied this action (401). This may be a permissions issue, not an expired session. ' + (error?.message || 'Check Appwrite file and Function permissions.');
        }
        if (error?.code === 404 && /function/i.test(kind + ' ' + String(error?.message || '')))
            return 'CityVetHub backend Function is not deployed or could not be found. Check Appwrite Functions > cityvethub-operations > Deployments.';
        if (error?.code === 503) return 'The Appwrite service is temporarily unavailable. Retry after checking its status.';
        // Appwrite messages are plain text, never inject them using innerHTML.
        return error?.message || 'Something went wrong. Please try again.';
    }

    window.CityVet = Object.freeze({ version:'4.19.0', ready, client, config, account, teams, tablesDB, storage, functions, operate, context, login, register, logout, destination, readableError });
})();
