#!/usr/bin/env node
// 로컬 테스트 서버: 사이트 + 가짜 카카오 로그인 + 가짜 정기결제 + 운영자 분석 데이터
//
//   node scripts/dev-backend.mjs        →  http://localhost:4174/waxfit/
//
// - 실제 카카오 로그인·실제 결제는 일어나지 않습니다(이름만 넣는 가짜 로그인, 가짜 카드).
// - 결제 규칙은 운영 서버와 같은 파일(supabase/functions/_shared)을 그대로 씁니다.
// - '운영자' 이름으로 로그인하면 운영자 분석을 볼 수 있습니다. 가상 구독 매장 36곳이 미리 들어 있습니다.
// - 시간 넘기기(정기결제 확인): POST /__dev/api/clock {"days": 31}
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { addDays, todayKST } from '../supabase/functions/_shared/billing-core.js';
import { handleBilling, runRenewals } from '../supabase/functions/_shared/billing-handler.js';
import { memoryStore } from '../supabase/functions/_shared/memory-store.js';
import { build, printBuildSummary, ROOT } from './build.mjs';
import { loadConfig, makeSite } from './lib/config.mjs';
import { seedDemo } from './lib/dev-seed.mjs';
import { staticHandler } from './serve.mjs';

export const ADMIN_NICKNAME = '운영자';

export async function createDevBackend({ outDir = null, basePath = '/waxfit/', seed = true, startToday = todayKST() } = {}) {
  const store = memoryStore();
  const users = new Map();
  const sessions = new Map();
  let today = startToday;
  const pay = async ({ billingKey }) =>
    billingKey === 'dev-fail' ? { ok: false, error: '테스트 카드: 한도 초과' } : { ok: true, pgTxId: `dev-tx-${randomUUID().slice(0, 8)}` };
  const userFor = (nickname) => {
    if (!users.has(nickname)) {
      const user = { id: randomUUID(), nickname, email: '' };
      users.set(nickname, user);
      if (nickname === ADMIN_NICKNAME) store.addAdmin(user.id);
    }
    return users.get(nickname);
  };
  userFor(ADMIN_NICKNAME);
  if (seed) await seedDemo({ store, today });

  const serveStatic = outDir ? staticHandler({ outDir, basePath }) : null;
  const send = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const readJson = (req) =>
    new Promise((resolve) => {
      let s = '';
      req.on('data', (c) => (s += c));
      req.on('end', () => {
        try {
          resolve(JSON.parse(s || '{}'));
        } catch {
          resolve({});
        }
      });
    });

  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    // 사이트의 결제 설정 파일을 '로컬 테스트' 모드로 바꿔서 응답
    if (url.pathname === `${basePath}assets/js/backend-config.js`) {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
      return res.end("export default { mode: 'dev' };\n");
    }
    if (!url.pathname.startsWith('/__dev/api/')) return serveStatic ? serveStatic(req, res) : send(res, 404, { error: 'not found' });
    const route = url.pathname.slice('/__dev/api/'.length);
    try {
      if (route === 'login' && req.method === 'POST') {
        const name = String((await readJson(req)).nickname ?? '').trim().slice(0, 20);
        if (!name) return send(res, 400, { error: '이름을 입력하세요.' });
        const token = randomUUID();
        sessions.set(token, userFor(name));
        return send(res, 200, { token, user: userFor(name) });
      }
      const user = sessions.get(req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '');
      if (!user) return send(res, 401, { error: '로그인이 필요합니다.' });
      if (route === 'billing' && req.method === 'POST') {
        const { action, ...body } = await readJson(req);
        const r = await handleBilling({ action, body, user, today, store, pay });
        return send(res, r.status, r.body);
      }
      if (route === 'metrics' && req.method === 'POST') {
        await store.putMetrics(user.id, today, (await readJson(req)).data ?? {});
        return send(res, 200, { ok: true });
      }
      if (route === 'admin' && req.method === 'GET') {
        if (!(await store.isAdmin(user.id))) return send(res, 403, { error: '운영자만 볼 수 있습니다.' });
        return send(res, 200, store.dump());
      }
      if (route === 'clock' && req.method === 'POST') {
        const days = Math.min(400, Math.max(0, Number((await readJson(req)).days) || 0));
        const runs = [];
        for (let i = 0; i < days; i += 1) {
          today = addDays(today, 1);
          const r = await runRenewals({ today, store, pay });
          if (r.charged || r.failed || r.ended) runs.push(r);
        }
        return send(res, 200, { today, runs });
      }
      return send(res, 404, { error: '알 수 없는 요청입니다.' });
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  };
  return { handler, store, get today() { return today; } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 4174);
  const config = await loadConfig(path.join(ROOT, 'site.config.mjs'));
  const { basePath } = makeSite(config.siteUrl);
  const outDir = path.join(ROOT, 'dist');
  printBuildSummary(await build({ siteUrl: `http://localhost:${port}${basePath}` }));
  const dev = await createDevBackend({ outDir, basePath });
  http.createServer(dev.handler).listen(port, () => {
    console.log(`\n로컬 테스트 서버: http://localhost:${port}${basePath}  (가짜 로그인·가짜 결제, 운영자 로그인 이름: ${ADMIN_NICKNAME})`);
  });
}
