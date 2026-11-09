#!/usr/bin/env node
// 내 컴퓨터에서 미리보기:  npm run preview  →  http://localhost:4173/retenfit/
//
// GitHub Pages와 같은 하위 경로(/retenfit/)로 띄우므로, 하위 경로 때문에
// 깨지는 링크·CSS를 배포 전에 미리 확인할 수 있습니다.
//   --no-build  이미 만든 dist/를 그대로 띄우기
//   --live      실제 Supabase에 연결해 시험하기(카카오 로그인·서버 함수가 진짜로 동작합니다).
//               backend-config.js의 mode를 이 미리보기 응답에서만 'supabase'로 바꿔, 소스와 dist는 그대로 둡니다.
//   PORT=8080 npm run preview
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, printBuildSummary, ROOT } from './build.mjs';
import { loadConfig, makeSite } from './lib/config.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.pdf': 'application/pdf', '.webmanifest': 'application/manifest+json',
};

/** GitHub Pages와 같은 규칙으로 파일 찾기: /a/ → a/index.html, /a → a.html 또는 /a/ 로 이동 */
export function createServer({ outDir, basePath, live = false }) {
  const serve = staticHandler({ outDir, basePath });
  if (!live) return http.createServer(serve);
  const configPath = `${basePath}assets/js/backend-config.js`;
  return http.createServer((req, res) => {
    if (new URL(req.url, 'http://localhost').pathname !== configPath) return serve(req, res);
    const config = readFileSync(path.join(outDir, 'assets/js/backend-config.js'), 'utf8');
    res.writeHead(200, { 'content-type': TYPES['.js'], 'cache-control': 'no-store' });
    res.end(config.replace(/^(\s*mode:\s*)'\w+'/m, "$1'supabase'"));
  });
}

/** 정적 파일 응답(로컬 테스트 서버 scripts/dev-backend.mjs도 사용) */
export function staticHandler({ outDir, basePath }) {
  return (req, res) => {
    const send404 = () => {
      const page = path.join(outDir, '404.html');
      res.writeHead(404, { 'content-type': TYPES['.html'] });
      if (existsSync(page)) createReadStream(page).pipe(res);
      else res.end('404');
    };
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      return send404();
    }
    if (`${pathname}/` === basePath) {
      res.writeHead(301, { location: basePath });
      return res.end();
    }
    if (!pathname.startsWith(basePath)) return send404();
    let file = path.join(outDir, pathname.slice(basePath.length));
    if (!file.startsWith(outDir)) return send404();
    if (existsSync(file) && statSync(file).isDirectory()) {
      if (!pathname.endsWith('/')) {
        res.writeHead(301, { location: `${pathname}/` });
        return res.end();
      }
      file = path.join(file, 'index.html');
    } else if (!existsSync(file) && existsSync(`${file}.html`)) {
      file = `${file}.html`;
    }
    if (!existsSync(file) || !statSync(file).isFile() || path.basename(file).startsWith('.')) return send404();
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 4173);
  const config = await loadConfig(path.join(ROOT, 'site.config.mjs'));
  const { basePath } = makeSite(config.siteUrl);
  const localUrl = `http://localhost:${port}${basePath}`;
  const outDir = path.join(ROOT, 'dist');
  if (!process.argv.includes('--no-build')) printBuildSummary(await build({ siteUrl: localUrl }));
  const live = process.argv.includes('--live');
  createServer({ outDir, basePath, live }).listen(port, () => {
    console.log(`\n미리보기: ${localUrl}  (끝내려면 Ctrl+C)${live ? '\n실제 Supabase에 연결되어 있습니다. 카카오 로그인·결제가 진짜로 동작합니다.' : ''}`);
  });
}
