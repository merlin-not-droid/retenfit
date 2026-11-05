#!/usr/bin/env node
// GitHub Actions 전용: 이 저장소의 GitHub Pages 설정을 확인합니다.
//
// 출력(GITHUB_OUTPUT)
//   deployable = true | false
//   site_url   = 실제 Pages 주소 (커스텀 도메인을 연결했으면 그 도메인)
//
// Pages가 꺼져 있거나 'Deploy from a branch' 방식이면 배포를 건너뛰고,
// 무엇을 눌러야 하는지 Actions 화면(요약)에 한국어로 안내합니다.
import { appendFileSync } from 'node:fs';

const env = process.env;
const repo = env.GITHUB_REPOSITORY;
const api = env.GITHUB_API_URL || 'https://api.github.com';
const server = env.GITHUB_SERVER_URL || 'https://github.com';
const settingsUrl = `${server}/${repo}/settings/pages`;

const setOutput = (key, value) => {
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}\n`);
  console.log(`${key}=${value}`);
};
const summary = (lines) => {
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
};
const skip = (reason, steps = []) => {
  setOutput('deployable', 'false');
  setOutput('site_url', '');
  console.log(`::warning title=배포 건너뜀::${reason}`);
  summary(['### ⏭️ 배포를 건너뛰었습니다', '', reason, ...(steps.length ? ['', ...steps] : [])]);
};

const SWITCH_TO_ACTIONS = [
  `1. 저장소의 [Settings → Pages](${settingsUrl})를 엽니다.`,
  '2. **Build and deployment → Source**에서 **GitHub Actions**를 고릅니다. (다른 설정은 필요 없습니다)',
  '3. Actions 탭에서 이 실행을 **Re-run all jobs** 하거나, 아무 변경이나 main에 push 하면 배포됩니다.',
];

async function getPages() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(`${api}/repos/${repo}/pages`, {
        headers: {
          authorization: `Bearer ${env.GITHUB_TOKEN}`,
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status < 500) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, attempt * 3000));
  }
  throw lastError;
}

async function main() {
  if (env.GITHUB_EVENT_NAME === 'pull_request') {
    setOutput('deployable', 'false');
    setOutput('site_url', '');
    console.log('풀 리퀘스트는 빌드·검사만 하고 배포하지 않습니다.');
    return;
  }
  const branch = (env.GITHUB_REF || '').replace(/^refs\/heads\//, '');
  if (env.DEFAULT_BRANCH && branch !== env.DEFAULT_BRANCH) {
    skip(`기본 브랜치(${env.DEFAULT_BRANCH})가 아닌 '${branch}'에서는 배포하지 않습니다.`);
    return;
  }
  if (!repo || !env.GITHUB_TOKEN) throw new Error('GITHUB_REPOSITORY / GITHUB_TOKEN 환경 변수가 필요합니다.');

  const res = await getPages();
  if (res.status === 404) {
    skip('GitHub Pages가 아직 켜져 있지 않습니다. (빌드와 검사는 정상적으로 끝났습니다)', SWITCH_TO_ACTIONS);
    return;
  }
  if (!res.ok) {
    const hint = res.status === 403 ? ' 워크플로의 permissions에 pages: read가 있는지 확인하세요.' : '';
    console.log(`::error title=Pages 설정 확인 실패::GitHub API가 HTTP ${res.status}를 돌려주었습니다.${hint}`);
    process.exit(1);
  }
  const info = await res.json();
  if (info.build_type && info.build_type !== 'workflow') {
    skip(
      "GitHub Pages가 'Deploy from a branch' 방식으로 되어 있습니다. 이 방식이면 빌드·검사를 거치지 않은 저장소 파일이 그대로 공개됩니다.",
      SWITCH_TO_ACTIONS,
    );
    return;
  }
  const url = new URL(info.html_url);
  if (url.protocol === 'http:') url.protocol = 'https:';
  setOutput('deployable', 'true');
  setOutput('site_url', url.href);
  summary([`### 🚀 배포 주소: ${url.href}`]);
}

main().catch((err) => {
  console.log(`::error title=Pages 설정 확인 실패::${err.message}`);
  process.exit(1);
});
