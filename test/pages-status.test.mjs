import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { tempDir } from './helpers.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'ci', 'pages-status.mjs');
const run = promisify(execFile);

/** 가짜 GitHub API로 pages-status.mjs를 실행하고 GITHUB_OUTPUT을 읽음 */
async function pagesStatus(t, { status, body, event = 'push', ref = 'refs/heads/main' }) {
  const server = http.createServer((req, res) => {
    assert.equal(req.url, '/repos/owner/waxfit/pages');
    assert.equal(req.headers.authorization, 'Bearer test-token');
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body ?? {}));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const dir = tempDir(t);
  const output = path.join(dir, 'output');
  const summary = path.join(dir, 'summary');
  writeFileSync(output, '');
  writeFileSync(summary, '');
  let exitCode = 0;
  let stdout = '';
  try {
    ({ stdout } = await run(process.execPath, [SCRIPT], {
      env: {
        PATH: process.env.PATH,
        GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`,
        GITHUB_REPOSITORY: 'owner/waxfit',
        GITHUB_TOKEN: 'test-token',
        GITHUB_EVENT_NAME: event,
        GITHUB_REF: ref,
        DEFAULT_BRANCH: 'main',
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: summary,
      },
    }));
  } catch (err) {
    exitCode = err.code;
    stdout = err.stdout;
  }
  const outputs = Object.fromEntries(
    readFileSync(output, 'utf8').trim().split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)),
  );
  return { outputs, summary: readFileSync(summary, 'utf8'), stdout, exitCode };
}

test('Pages가 GitHub Actions 방식이면 배포, 실제 주소 사용', async (t) => {
  const r = await pagesStatus(t, { status: 200, body: { build_type: 'workflow', html_url: 'http://waxfit.example.kr/' } });
  assert.deepEqual(r.outputs, { deployable: 'true', site_url: 'https://waxfit.example.kr/' });
});

test('Pages가 꺼져 있으면 배포를 건너뛰고 켜는 방법 안내 (실패 처리 안 함)', async (t) => {
  const r = await pagesStatus(t, { status: 404, body: { message: 'Not Found' } });
  assert.equal(r.exitCode, 0);
  assert.equal(r.outputs.deployable, 'false');
  assert.match(r.summary, /Settings → Pages/);
  assert.match(r.summary, /GitHub Actions/);
});

test("'Deploy from a branch' 방식이면 바꾸라고 안내", async (t) => {
  const r = await pagesStatus(t, { status: 200, body: { build_type: 'legacy', html_url: 'https://owner.github.io/waxfit/' } });
  assert.equal(r.outputs.deployable, 'false');
  assert.match(r.summary, /Deploy from a branch/);
});

test('풀 리퀘스트·다른 브랜치는 배포하지 않음, 권한 오류는 실패', async (t) => {
  assert.equal((await pagesStatus(t, { status: 200, event: 'pull_request' })).outputs.deployable, 'false');
  assert.equal((await pagesStatus(t, { status: 200, ref: 'refs/heads/feature' })).outputs.deployable, 'false');
  const denied = await pagesStatus(t, { status: 403 });
  assert.equal(denied.exitCode, 1);
  assert.match(denied.stdout, /pages: read/);
});
