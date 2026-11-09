import { copyFileSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixture');
export const PROJECT_URL = 'https://example-user.github.io/demo/';
export const DOMAIN_URL = 'https://demo.example.com/';

/** 테스트가 끝나면 지워지는 임시 폴더 */
export function tempDir(t, prefix = 'retenfit-test-') {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  // rmSync(recursive)는 Node 24(Windows) 비ASCII 경로에서 강제 종료되므로 비동기 rm 사용 (scripts/build.mjs 참고)
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

/** 폴더 통째 복사. cpSync(recursive)도 Node 24(Windows) 비ASCII 경로에서 강제 종료되어 직접 구현 */
export function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const e of readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else copyFileSync(a, b);
  }
}

/** 픽스처를 임시 폴더로 복사 (원본을 고치지 않고 변형해 보기 위해) */
export function copyFixture(t) {
  const root = tempDir(t);
  copyDir(FIXTURE, root);
  return root;
}

export const read = (dir, rel) => readFileSync(path.join(dir, rel), 'utf8');

export function write(dir, rel, content) {
  const file = path.join(dir, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/** 문자열에서 패턴이 몇 번 나오는지 */
export const countOf = (text, needle) => text.split(needle).length - 1;

export function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}
