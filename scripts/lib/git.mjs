import { execFileSync } from 'node:child_process';

const insideRepo = new Map();

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function isRepo(cwd) {
  if (!insideRepo.has(cwd)) {
    let ok = false;
    try {
      ok = git(['rev-parse', '--is-inside-work-tree'], cwd) === 'true';
    } catch {
      ok = false;
    }
    insideRepo.set(cwd, ok);
  }
  return insideRepo.get(cwd);
}

/**
 * 파일들 중 가장 최근 커밋 시각 (ISO 8601). sitemap의 <lastmod>로 씁니다.
 * 커밋 이력이 없으면 null — 이 경우 lastmod를 비워 둡니다
 * (빌드할 때마다 바뀌는 파일 수정 시각을 쓰면 검색엔진에 "매번 바뀜"으로 잘못 알리게 됨).
 */
export function lastCommitDate(files, cwd) {
  if (!files.length || !isRepo(cwd)) return null;
  try {
    return git(['log', '-1', '--format=%cI', '--', ...files], cwd) || null;
  } catch {
    return null;
  }
}

export function isShallow(cwd) {
  if (!isRepo(cwd)) return false;
  try {
    return git(['rev-parse', '--is-shallow-repository'], cwd) === 'true';
  } catch {
    return false;
  }
}
