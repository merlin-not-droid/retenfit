import { readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * 폴더 안의 파일 목록 (하위 폴더 포함, 이름순).
 * 이름이 '_'나 '.'으로 시작하는 파일·폴더는 배포하지 않습니다.
 *   예) src/_partials/header.html  → include 전용 조각
 *       src/_drafts/...           → 작업 중인 초안
 */
export function walk(dir, base = dir) {
  const out = [];
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs, base));
    else if (e.isFile()) out.push({ abs, rel: path.relative(base, abs).split(path.sep).join('/') });
  }
  return out;
}

/** 모든 파일 (숨김·밑줄 포함) — 검사용 */
export function walkAll(dir, base = dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkAll(abs, base));
    else if (e.isFile()) out.push({ abs, rel: path.relative(base, abs).split(path.sep).join('/') });
  }
  return out;
}
