import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigError, cleanVerification, makeSite, normalizeConfig } from '../scripts/lib/config.mjs';
import { collectTags, decodeEntities, extractTitle, segment, serializeTag, transform } from '../scripts/lib/html.mjs';
import { rewriteUrls } from '../scripts/lib/seo.mjs';

test('html: 스크립트·주석 내용은 마크업과 분리', () => {
  const html = '<p>a</p><!-- <a href="/c"> --><script src="/s.js">const x = "<a href=\'/j\'>";</script><style-guide>b</style-guide>';
  const segs = segment(html);
  assert.deepEqual(segs.map((s) => s.type), ['markup', 'comment', 'markup', 'raw', 'markup', 'markup']);
  assert.equal(segs.at(-1).text, '<style-guide>b</style-guide>'); // 사용자 정의 태그는 <style>이 아님
  assert.deepEqual(collectTags(html).map((t) => t.lower), ['p', 'script', 'style-guide']);
});

test('html: 따옴표 안의 > 와 원문 보존', () => {
  const [tag] = collectTags('<img alt="a > b" data-x=\'1\' src=/x.png loading=lazy>');
  assert.equal(tag.get('alt'), 'a > b');
  assert.equal(tag.get('src'), '/x.png');
  assert.equal(tag.get('nothing'), undefined);
  assert.equal(serializeTag(tag, { src: '/y.png' }), '<img alt="a > b" data-x=\'1\' src="/y.png" loading=lazy>');
});

test('html: 제목·엔티티', () => {
  assert.equal(extractTitle('<head><title> A &amp; B\n</title></head><body><svg><title>x</title></svg>'), 'A & B');
  assert.equal(extractTitle('<body><svg><title>아이콘</title></svg></body>'), undefined);
  assert.equal(decodeEntities('&lt;&#39;&#x41;&nbsp;&unknown;'), "<'A &unknown;");
});

test('html: transform은 바꾼 태그만 다시 씀', () => {
  const html = '<A HREF="/a" Class=x>t</A><br/>';
  const out = transform(html, { tag: (n) => (n.lower === 'a' ? serializeTag(n, { href: '/b' }) : undefined) });
  assert.equal(out, '<A HREF="/b" Class=x>t</A><br/>');
});

test('주소 보정: 프로토콜 상대 주소·data URI·이미 붙은 경로는 그대로', () => {
  const site = makeSite('https://u.github.io/repo');
  const html = '<script src="//cdn.example.com/a.js"></script><img src="data:image/png;base64,AA" alt=""><a href="/repo">홈</a><a href="/repository">다른 경로</a>';
  const out = rewriteUrls(html, site, site.url);
  assert.match(out, /src="\/\/cdn\.example\.com\/a\.js"/);
  assert.match(out, /src="data:image\/png;base64,AA"/);
  assert.match(out, /<a href="\/repo">홈<\/a>/);
  assert.match(out, /<a href="\/repo\/repository">다른 경로<\/a>/);
});

test('사이트 주소 계산', () => {
  const site = makeSite('http://u.github.io/repo?x=1#y');
  assert.equal(site.url, 'https://u.github.io/repo/'); // https 강제, 끝 슬래시
  assert.equal(site.basePath, '/repo/');
  assert.equal(site.abs('/assets/og.png'), 'https://u.github.io/repo/assets/og.png');
  assert.equal(site.abs('/repo/assets/og.png'), 'https://u.github.io/repo/assets/og.png');
  assert.equal(site.pageUrl('소개/index.html'), 'https://u.github.io/repo/%EC%86%8C%EA%B0%9C/');
  assert.equal(makeSite('http://localhost:4173/repo/').url, 'http://localhost:4173/repo/'); // 로컬은 http 유지
  assert.throws(() => makeSite('retenfit.kr'), ConfigError);
});

test('설정: 소유 확인 코드·영업시간·잘못된 값', () => {
  assert.equal(cleanVerification('<meta name="naver-site-verification" content="abc123" />', 'naver'), 'abc123');
  assert.equal(cleanVerification('  xyz-_1  ', 'google'), 'xyz-_1');
  assert.throws(() => cleanVerification('<script>', 'google'), ConfigError);

  const c = normalizeConfig({
    siteName: 'S',
    business: { openingHours: [{ days: ['월요일', 'Tue', 'we'], opens: '9:30', closes: '18:00' }] },
  });
  assert.deepEqual(c.business.openingHours[0], { days: ['Monday', 'Tuesday', 'Wednesday'], opens: '09:30', closes: '18:00' });
  assert.throws(() => normalizeConfig({ business: { openingHours: [{ days: ['평일'], opens: '9:00', closes: '18:00' }] } }), ConfigError);
  assert.throws(() => normalizeConfig({ analytics: { ga4: 'UA-1234' } }), ConfigError);
  assert.throws(() => normalizeConfig({ indexNow: { key: 'short' } }), ConfigError);
  assert.equal(normalizeConfig({ indexNow: { key: '' } }).indexNow.enabled, false);
});
