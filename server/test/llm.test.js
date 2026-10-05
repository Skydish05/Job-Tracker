import './setup.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// A local stand-in for the Gemini generateContent API, so the request we build and
// the response parsing are tested without a key or network access.
let mock;
let lastRequest;
let mockMode = 'ok';
let generateCoverLetter;

const profile = {
  name: 'Min',
  skills: 'react, sql',
  target_roles: 'junior developer',
  experience: 'entry',
  summary: 'Information Systems student.',
};
const job = { title: 'Junior Developer', company: 'Acme', description: 'Build dashboards with React.' };

before(async () => {
  mock = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      lastRequest = { method: req.method, url: req.url, headers: req.headers, body: JSON.parse(body) };
      if (mockMode === 'error') {
        res.writeHead(500, { 'content-type': 'application/json' }).end('{"error":"boom"}');
        return;
      }
      const parts = mockMode === 'empty' ? [] : [{ text: '  Dear Acme team, I am excited to apply.  ' }];
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ candidates: [{ content: { role: 'model', parts } }] }));
    });
  });
  await new Promise((resolve) => mock.listen(0, resolve));

  process.env.GEMINI_API_URL = `http://localhost:${mock.address().port}/v1beta`;
  process.env.GEMINI_MODEL = 'test-model';
  process.env.GEMINI_API_KEY = 'test-key';
  ({ generateCoverLetter } = await import('../services/llmService.js'));
});

after(() => mock.close());

test('sends a well-formed generateContent request and returns the model text', async () => {
  mockMode = 'ok';
  const result = await generateCoverLetter(profile, job);

  assert.equal(result.source, 'ai');
  assert.equal(result.text, 'Dear Acme team, I am excited to apply.'); // trimmed
  assert.equal(result.warning, null);

  assert.equal(lastRequest.method, 'POST');
  assert.equal(lastRequest.url, '/v1beta/models/test-model:generateContent');
  assert.equal(lastRequest.headers['x-goog-api-key'], 'test-key');
  assert.equal(lastRequest.headers['content-type'], 'application/json');

  const { body } = lastRequest;
  assert.ok(body.generationConfig.maxOutputTokens > 0);
  const system = body.systemInstruction.parts[0].text;
  assert.match(system, /opening paragraph/);
  assert.match(system, /Never invent/);
  assert.equal(body.contents.length, 1);
  assert.equal(body.contents[0].role, 'user');
  const prompt = body.contents[0].parts[0].text;
  for (const expected of ['Junior Developer', 'Acme', 'Build dashboards with React.', 'react, sql', 'Information Systems student.']) {
    assert.ok(prompt.includes(expected), `prompt is missing: ${expected}`);
  }
});

test('falls back to a labelled template when the API errors', async () => {
  mockMode = 'error';
  const result = await generateCoverLetter(profile, job);
  assert.equal(result.source, 'template');
  assert.match(result.warning, /AI request failed/);
  assert.match(result.text, /Junior Developer/);
});

test('falls back when the model returns no text', async () => {
  mockMode = 'empty';
  const result = await generateCoverLetter(profile, job);
  assert.equal(result.source, 'template');
  assert.match(result.warning, /Empty response/);
});
