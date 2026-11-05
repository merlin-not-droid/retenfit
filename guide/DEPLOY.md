# GitHub로 배포하기

배포 방식: **GitHub Actions → GitHub Pages** (무료, HTTPS 자동)
`main` 브랜치에 push 하면 테스트 → 빌드 → 배포 전 검사 → 배포 → 검색엔진 변경 알림이 자동으로 이어집니다.

---

## 1. 저장소 만들기

1. <https://github.com/new> 에서 저장소를 만듭니다.
   - 이름: `waxfit` → 주소가 `https://<아이디>.github.io/waxfit/` 이 됩니다.
   - 공개 범위: **Public** (무료 계정은 공개 저장소만 Pages를 쓸 수 있습니다)
   - README·.gitignore 추가는 체크하지 않습니다(빈 저장소).
2. 이 폴더를 올립니다.

```bash
git remote add origin https://github.com/<아이디>/waxfit.git
```

```bash
git push -u origin main
```

> 저장소 이름을 `<아이디>.github.io` 로 만들면 하위 경로 없이 `https://<아이디>.github.io/` 에서 열립니다.
> 하위 경로가 없어야 네이버 등록·robots.txt가 온전히 동작하므로, 자체 도메인을 쓰지 않을 거라면 이 방법이 낫습니다. (설정 파일은 고칠 필요 없음 — 주소는 자동으로 읽습니다)

## 2. GitHub Pages 켜기 (처음 한 번)

1. 저장소 **Settings → Pages**
2. **Build and deployment → Source** 를 **GitHub Actions** 로 선택

이것만 하면 됩니다. ‘Deploy from a branch’를 고르면 빌드·검사를 거치지 않은 저장소 파일(README 등)이 그대로 공개되므로 쓰지 마세요.
Pages를 켜기 전에 push 했다면, 워크플로가 빌드·검사만 하고 배포를 건너뛰면서 실행 요약에 위 안내를 띄웁니다. 켠 뒤 **Actions → 사이트 배포 → Re-run all jobs** 를 누르면 됩니다.

## 3. 배포 확인

**Actions** 탭에서 ‘사이트 배포’ 실행을 엽니다.

| 단계 | 하는 일 | 실패하면 |
|---|---|---|
| 빌드·검사 | 테스트, Pages 설정 확인, 빌드, 배포 전 검사 | 로그의 ✖ 항목과 파일·줄 번호를 보고 고친 뒤 다시 push |
| GitHub Pages 배포 | `dist/`를 공개 | Settings → Pages 설정 확인 |
| 검색엔진 변경 알림 | 바뀐 페이지만 IndexNow로 전송 | 경고만 남고 배포에는 영향 없음 |

배포 주소는 ‘GitHub Pages 배포’ 단계 옆에 표시됩니다.

## 4. 자체 도메인 연결 (권장)

`github.io` 주소로도 운영할 수 있지만 서비스라면 자체 도메인을 권합니다.

- 브랜드 신뢰도: `waxfit.kr` 같은 주소가 검색 결과에서 더 믿음직합니다.
- 검색 등록: 하위 경로(`/waxfit/`) 사이트는 robots.txt가 무시되고, 네이버 서치어드바이저·다음 웹마스터도구 등록이 제한될 수 있습니다.
- 이전 가능: 나중에 호스팅을 바꿔도 주소와 검색 기록이 유지됩니다.

### 절차

1. 도메인 구입 (가비아·후이즈·Cloudflare 등, `.kr`·`.co.kr`·`.com` 등). 사기 전에 [KIPRIS](https://www.kipris.or.kr) 에서 ‘왁스핏’ 상표를 확인해 두세요.
2. 도메인 업체의 DNS 설정에서 다음을 추가합니다.

   | 종류 | 이름(호스트) | 값 |
   |---|---|---|
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | CNAME | `www` | `<아이디>.github.io` |

   (IPv6를 지원하는 업체라면 AAAA `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` 도 추가)
3. 저장소 **Settings → Pages → Custom domain** 에 `waxfit.kr` 입력 → Save
   (GitHub Actions 배포는 `CNAME` 파일이 필요 없습니다.)
4. DNS 확인이 끝나면 **Enforce HTTPS** 체크 (인증서 발급까지 최대 하루)
5. 도메인 탈취 방지: GitHub 계정 **Settings → Pages → Add a domain** 에서 TXT 레코드로 도메인 소유를 인증해 두세요.
6. Actions에서 다시 실행하면 새 주소로 빌드됩니다. 사이트 주소는 Pages 설정에서 자동으로 읽으므로 `site.config.mjs`는 그대로 둬도 됩니다(내 컴퓨터 빌드용 값만 바꾸면 됨).
7. 기존 `github.io/waxfit/` 주소는 GitHub이 새 도메인으로 자동 이동시킵니다. 검색 등록은 새 도메인으로 다시 합니다 → [SEARCH.md](SEARCH.md)

## 5. 고친 내용 배포하기

- GitHub 웹사이트: 파일 열기 → 연필 아이콘 → 수정 → **Commit changes** → 자동 배포
- 내 컴퓨터: 고친 뒤 `npm run build && npm run check` 로 확인하고 push

다른 브랜치에서 작업하고 Pull Request를 열면, 배포 없이 빌드·검사만 해서 결과를 PR에 표시합니다.

## 문제 해결

| 증상 | 해결 |
|---|---|
| 실행 요약에 ‘GitHub Pages가 아직 켜져 있지 않습니다’ | 2단계 진행 후 Re-run |
| ‘Deploy from a branch 방식으로 되어 있습니다’ | Source를 GitHub Actions로 변경 |
| 배포 전 검사 실패 | 로그의 ✖ 항목 수정 (`TODO` 자리표시, 없는 링크, 이미지 alt 등) |
| 화면이 바뀌지 않음 | 배포 후 1~2분 기다린 뒤 강력 새로고침(Ctrl+Shift+R) |
| CSS·이미지가 깨짐 | 링크를 `/assets/...`처럼 루트 기준이나 상대 경로로 썼는지 확인 (자바스크립트에서 만든 주소는 자동 보정되지 않으니 상대 경로 사용) |
