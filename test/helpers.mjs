import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixture');
export const PROJECT_URL = 'https://example-user.github.io/demo/';
export const DOMAIN_URL = 'https://demo.example.com/';

/** 테스트가 끝나면 지워지는 임시 폴더 */
export function tempDir(t, prefix = 'waxfit-test-') {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** 픽스처를 임시 폴더로 복사 (원본을 고치지 않고 변형해 보기 위해) */
export function copyFixture(t) {
  const root = tempDir(t);
  cpSync(FIXTURE, root, { recursive: true });
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
