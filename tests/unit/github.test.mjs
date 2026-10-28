import test from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubClient } from '../../src/github.mjs';

test('GitHub client requests fixed trusted issue resources with bounded credentials', async () => {
  const calls = [];
  const client = createGitHubClient({ token: 'secret-token', fetchImpl: async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ state: 'open', title: 'Title', body: 'Body', merged: false }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  } });
  await client.getItem({ repository: 'owner/repo', number: 7, kind: 'issue' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.github.com/repos/owner/repo/issues/7');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.headers.authorization, 'Bearer secret-token');
  assert.equal(calls[0].options.redirect, 'manual');
  assert.equal(calls[0].options.signal instanceof AbortSignal, true);
});

test('GitHub client uses correct closure endpoints and validates response identities', async () => {
  const calls = [];
  const client = createGitHubClient({ token: 'token', fetchImpl: async (url, options) => {
    calls.push({ url: String(url), options });
    if (options.method === 'PATCH') return new Response('{"state":"closed"}', { status: 200 });
    return new Response('{"id":13,"body":"posted","user":{"login":"github-actions[bot]","type":"Bot"}}', { status: 201 });
  } });
  const comment = await client.createComment({ repository: 'o/r', number: 2, body: 'posted' });
  assert.equal(comment.id, 13);
  await client.closeItem({ repository: 'o/r', number: 2, kind: 'pull_request' });
  await client.closeItem({ repository: 'o/r', number: 2, kind: 'issue' });
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(JSON.parse(calls[0].options.body).body, 'posted');
  assert.match(calls[1].url, /pulls\/2$/);
  assert.match(calls[2].url, /issues\/2$/);
});

test('GitHub client rejects redirects, malformed and oversized bodies without leaking details', async () => {
  let behavior = 'redirect';
  const client = createGitHubClient({ token: 'never-log-this', fetchImpl: async () => {
    if (behavior === 'redirect') return new Response(null, { status: 302, headers: { location: 'https://evil.example/' } });
    if (behavior === 'malformed') return new Response('private response text', { status: 200 });
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('x'.repeat(2_000_000)));
      controller.close();
    } }), { status: 200 });
  } });
  for (const next of ['redirect', 'malformed', 'oversized']) {
    behavior = next;
    await assert.rejects(client.getItem({ repository: 'o/r', number: 1, kind: 'issue' }), (error) => {
      assert.equal(error.message.includes('never-log-this'), false);
      assert.equal(error.message.includes('private response text'), false);
      return true;
    });
  }
});

test('GitHub client applies timeout and caller cancellation safely', async () => {
  const never = (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('private abort')), { once: true });
  });
  const timeoutClient = createGitHubClient({ token: 'token', timeoutMs: 10, fetchImpl: never });
  await assert.rejects(timeoutClient.getItem({ repository: 'o/r', number: 1, kind: 'issue' }), /failed safely/);
  const caller = new AbortController();
  const callerClient = createGitHubClient({ token: 'token', signal: caller.signal, fetchImpl: never });
  const request = callerClient.getItem({ repository: 'o/r', number: 1, kind: 'issue' });
  caller.abort();
  await assert.rejects(request, /failed safely/);
});

test('GitHub comment pagination is same-origin and includes every page', async () => {
  const urls = [];
  const client = createGitHubClient({ token: 'token', fetchImpl: async (url) => {
    urls.push(String(url));
    const page = urls.length === 1
      ? [{ id: 1, body: 'one', user: { login: 'contributor', type: 'User' } }]
      : [{ id: 2, body: 'two', user: { login: 'github-actions[bot]', type: 'Bot' } }];
    return new Response(JSON.stringify(page), { status: 200, headers: {
      link: urls.length === 1 ? '<https://api.github.com/repos/o/r/issues/4/comments?page=2>; rel="next"' : '',
    } });
  } });
  const comments = await client.listComments({ repository: 'o/r', number: 4 });
  assert.deepEqual(comments.map((comment) => comment.id), [1, 2]);
  assert.equal(urls.length, 2);
});

test('GitHub client rejects cross-origin pagination before issuing another request', async () => {
  let calls = 0;
  const client = createGitHubClient({ token: 'token', fetchImpl: async () => {
    calls++;
    return new Response('[]', { status: 200, headers: { link: '<https://evil.example/repo?page=2>; rel="next"' } });
  } });
  await assert.rejects(client.listComments({ repository: 'o/r', number: 4 }), /failed safely/);
  assert.equal(calls, 1);
});
