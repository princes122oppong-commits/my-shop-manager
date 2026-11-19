import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/invite-user.js';

function createResponse() {
    return {
        statusCode: 200,
        headers: {},
        body: '',
        status(code) { this.statusCode = code; return this; },
        setHeader(name, value) { this.headers[name] = value; },
        end(body) { this.body = body; },
        json() { return JSON.parse(this.body); }
    };
}

test('invite endpoint enforces method, authentication, payload, and organization-admin checks', async t => {
    const savedEnvironment = {
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        APP_BASE_URL: process.env.APP_BASE_URL
    };
    const originalFetch = globalThis.fetch;
    t.after(() => {
        for (const [key, value] of Object.entries(savedEnvironment)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        globalThis.fetch = originalFetch;
    });

    Object.assign(process.env, {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon-test-key',
        SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key',
        APP_BASE_URL: 'https://example.vercel.app'
    });

    const getResponse = createResponse();
    await handler({ method: 'GET', headers: {} }, getResponse);
    assert.equal(getResponse.statusCode, 405);

    const noAuthResponse = createResponse();
    await handler({ method: 'POST', headers: {}, body: {} }, noAuthResponse);
    assert.equal(noAuthResponse.statusCode, 401);

    const invalidBodyResponse = createResponse();
    await handler({ method: 'POST', headers: { authorization: 'Bearer user-token' }, body: {} }, invalidBodyResponse);
    assert.equal(invalidBodyResponse.statusCode, 400);

    globalThis.fetch = async url => {
        if (String(url).endsWith('/auth/v1/user')) {
            return new Response(JSON.stringify({ id: 'user-1' }), { status: 200 });
        }
        if (String(url).includes('/rest/v1/organization_members?')) {
            return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        throw new Error(`Unexpected request: ${url}`);
    };

    const unauthorizedResponse = createResponse();
    await handler({
        method: 'POST',
        headers: { authorization: 'Bearer valid-user-token' },
        body: {
            name: 'Staff Member', email: 'staff@example.com', role: 'cashier',
            organizationId: '11111111-1111-4111-8111-111111111111',
            branchId: '22222222-2222-4222-8222-222222222222', salary: 0
        }
    }, unauthorizedResponse);
    assert.equal(unauthorizedResponse.statusCode, 403);
    assert.match(unauthorizedResponse.json().error, /owner or administrator/i);
});
