import {DEFAULTS,SEGMENTS,CSV_FIELDS,CSV_AI_FIELDS,clone,demoCustomers,salonModel,economics,segmentFor,segmentCounts,recommendations,evaluatePlan,planKey,planAudience,parseCSV,importCustomers,daysBetween} from './core.js';
import {AI_DEFAULTS,returnRecommendations,crossSellRecommendations} from './ai.js';
import {initializeDashboard,promotionGroups,selectProposal,recordDecision,today} from './dashboard.js';
import {renderDashboard,calculationDetails} from './dashboard-view.js';
import {renderPlanner,renderPlanResult,offerLabel} from './planner-view.js';
import {renderGrowth} from './growth-view.js';
import {growthModel,deterministicSplit,GROWTH_DEFAULTS} from './growth.js';
import {checkAccess,gateCopy,isDemo,syncDaily} from '../../../assets/js/access.js';
import {askConfirm} from '../../../assets/js/confirm-dialog.js';
import {isAdopted,markAdopted} from '../../../assets/js/monthly-record.js';
import {buildSalonRecommendation,metricsSnapshot,planFromEvaluation,recommendationMessage,startEngineRun} from './recommend.js';
import {readShop,renderRecommend,renderSales,shopFields} from './recommend-view.js';

const $=s=>document.querySelector(s);
const money=n=>Number.isFinite(n)?Math.round(n).toLocaleString('ko-KR')+'원':'—';
const num=n=>Number.isFinite(n)?Math.round(n).toLocaleString('ko-KR'):'—';
const pct=n=>Number.isFinite(n)?n.toFixed(1)+'%':'—';
const capPct=n=>pct(Math.floor(n*10)/10);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M14 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
  sparkle:'<path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7L12 3ZM20 2v4M18 4h4"/>',
  settings:'<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3" fill="currentColor" stroke-width="1"/><circle cx="16" cy="17" r="3" fill="currentColor" stroke-width="1"/>',
  data:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  down:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  gift:'<path d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13"/><path d="M12 8C3 8 4 1 8 3c3 1 4 5 4 5Zm0 0c9 0 8-7 4-5-3 1-4 5-4 5Z"/>',
  wallet:'<path d="M20 7H5a2 2 0 0 1 0-4h13v4M4 6v13a2 2 0 0 0 2 2h14V7M16 11h5v6h-5z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  trend:'<path d="m3 17 6-6 4 4 8-11M15 4h6v6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h5"/>',
  search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  scissors:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8 8 12 12M8 16 20 4"/>',
  leaf:'<path d="M20 3C9 2 2 7 5 15s16 7 15-12ZM5 20 15 9"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  save:'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2ZM7 3v6h9V3M7 21v-8h10v8"/>'
};
const icon=(key,cls='')=>`<svg class="icon ${cls}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[key]||icons.sparkle}</svg>`;
const demo=isDemo();
const STORAGE='retenfit:salon:v1';
const MARK='<svg class="mark" viewBox="180 126 288 398" fill="none" stroke="currentColor" stroke-width="46" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="324" cy="270" r="110"/><path d="M214 270V490"/><path d="M324 380L434 490"/><circle cx="324" cy="270" r="41" fill="currentColor" stroke="none"/></svg>';
const CHECKOUT='../../checkout/?service=salon';
function freshState(){const asOf=today();return {settings:{...clone(DEFAULTS),asOf,month:asOf.slice(0,7)},customers:demoCustomers(asOf),source:'sample',plans:[]};}
let state=freshState();
let gate=null,realDataReady=true;
/** 달이 바뀌면 기준 달을 넘깁니다. 샘플 매장은 손님 날짜도 함께 새로 만듭니다 */
function rollMonth(){const now=today(),s=state.settings;if(s.asOf>=now)return;const newMonth=now.slice(0,7)!==s.month;s.asOf=now;s.month=now.slice(0,7);if(state.source==='sample'&&newMonth){state.customers=demoCustomers(now);state.visitData=null;}}
function finishState(){state.aiSettings={...AI_DEFAULTS,...state.aiSettings};state.monthlyPlans??=[];initializeDashboard(state);}
async function boot(){
 try{
  if(!demo){
   try{gate=await checkAccess();}catch{gate={ok:true};}
   try{const saved=JSON.parse(localStorage.getItem(STORAGE));if(saved?.settings?.services?.length)state=saved;}catch{}
  }
  rollMonth();finishState();
  const route=/^#\/(\w+)/.exec(location.hash)?.[1];if(titles[route])tab=route;
  render();
  if(!demo&&gate?.ok&&state.source!=='sample')syncDaily({key:'retenfit:salon:last-sync',today:today(),snapshot:()=>metricsSnapshot(state,recommendation())}).catch(()=>{});
 }catch(e){$('#app').innerHTML=`<main class="boot-error"><h1>대시보드를 열지 못했습니다</h1><p>${esc(e.message)}</p><button class="btn btn-line" onclick="location.reload()">다시 시도</button></main>`;}
}
const diagnosisAnswers={},dashboardChoices={};
let tab='recommend',customerFilter='all',search='',currentPlan=null,upload=null,importError='',customerPage=0,aiMode='return',aiSelected='',aiLimit=10;
const save=()=>{if(demo)return;try{localStorage.setItem(STORAGE,JSON.stringify(state));}catch{toast('저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.');}};
let toastTimer;
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3500);}
function navTo(next){tab=next;history.replaceState(null,'',`#/${next}`);render();window.scrollTo({top:0,behavior:'instant'});document.getElementById('content')?.focus({preventScroll:true});}
function recommendation(){const rec=buildSalonRecommendation(state);if(rec.recordChanged)save();return rec;}
const findEval=id=>recommendation().plan.selected.find(e=>e.device.id===id);
const titles={recommend:['이번 달 추천','매장 기록과 지난달 결과로 이번 달에 할 일을 다시 계산했습니다.'],overview:['재방문 현황','멀어지는 단골과 이번 달 혜택 후보, 매장이 감당할 수 있는 범위를 봅니다.'],customers:['고객 목록','방문 횟수와 최근 방문일로 나눈 고객군별 목록입니다.'],ai:['고객별 제안','손님별 방문 주기로 먼저 연락할 손님과 펌 상담을 권할 손님을 찾습니다.'],planner:['프로모션 설계','혜택과 숫자를 정하고, 시술 1회에 얼마가 남는지 확인합니다.'],sales:['매출 분석','월별 매출과 이번 달 예상 손익을 봅니다.'],growth:['관계·계절 전략','고객 단계와 계절에 맞는 혜택, 비교군 실험을 관리합니다.'],settings:['매장 설정','추천과 손익 계산의 기준이 되는 매장 숫자입니다.'],data:['고객 데이터','고객별 기록을 CSV로 가져오고 내보냅니다.']};
const NAV=[['recommend','이번 달 추천'],['overview','재방문 현황'],['customers','고객 목록'],['ai','고객별 제안'],['planner','프로모션 설계'],['sales','매출 분석'],['growth','관계·계절 전략'],['settings','매장 설정'],['data','고객 데이터']];
function banner(){
  if(demo)return `<div class="banner welcome"><p><b>샘플 매장 미리보기</b>입니다. 눌러 볼 수 있지만 저장되지는 않습니다.</p><a class="btn btn-primary btn-sm" href="${CHECKOUT}">결제하기</a></div>`;
  if(state.source==='sample')return `<div class="banner info"><p><b>샘플 데이터</b>(가상 손님 ${state.customers.length}명)를 보고 있습니다. 실제 매장 결과가 아닙니다.</p><button type="button" class="btn btn-line btn-sm" data-action="start-own">내 매장 데이터로 시작</button></div>`;
  if(!state.customers.length)return `<div class="banner welcome"><p>아직 고객 기록이 없습니다. 고객 데이터를 올리면 추천이 내 매장 기준으로 바뀝니다.</p><button type="button" class="btn btn-primary btn-sm" data-tab="data">고객 데이터 올리기</button></div>`;
  return '';
}
function shell(){
  const s=state.settings,own=state.source!=='sample';
  return `<div class="dash"><aside class="dash-side">
    <a class="dash-brand" href="../../" aria-label="리텐핏 처음 화면으로">${MARK}<span>리텐핏<small>미용실</small></span></a>
    <div class="dash-shop">${esc(s.salon)}</div>
    <nav class="dash-nav" aria-label="주 메뉴">${NAV.map(([key,label])=>`<a href="#/${key}" data-tab="${key}" ${tab===key?'aria-current="page"':''}>${label}${key==='planner'&&state.plans.length?`<span class="nav-count">${state.plans.length}</span>`:''}</a>`).join('')}</nav>
    <div class="dash-side-foot"><button type="button" data-action="guide">계산 기준 보기</button></div>
  </aside>
  <div class="dash-body">
    <header class="dash-top"><strong>${titles[tab][0]}</strong><span class="data-state ${own&&!demo?'real':''}">${demo?'샘플 매장 미리보기':own?'내 매장 데이터':'샘플 데이터'}</span></header>
    <div class="banner-area">${banner()}</div>
    <main id="content" class="dash-main" tabindex="-1"><div class="page-heading"><div><h1>${titles[tab][0]}</h1><p>${titles[tab][1]}</p></div><div class="heading-actions">${tab==='overview'?`<button class="btn secondary" data-tab="settings">매장 정보 수정</button><button class="btn primary" data-tab="planner">프로모션 설계로 이동</button>`:tab==='customers'?`<button class="btn secondary" data-action="export-customers">고객 요약 내보내기</button>`:tab==='settings'?'<span class="badge green">저장하면 추천에 반영됩니다</span>':tab==='data'?`<button class="btn secondary" data-action="template">CSV 양식 받기</button>`:''}</div></div><div id="view"></div><footer class="page-footer"><span>리텐핏 미용실 · 고객 기록은 이 기기의 브라우저에만 저장됩니다</span><span>입력값 기반 계산입니다. 고객 반응과 수익을 보장하지 않습니다.</span></footer></main></div></div>`;
}
function renderGate(){
  const copy=gateCopy(gate.reason);
  $('#app').innerHTML=`<div class="dash" style="grid-template-columns:1fr"><main class="dash-main" id="content"><div class="page-heading"><div><h1>구독 후 이용할 수 있습니다</h1><p>${copy.help}</p></div></div><a class="btn btn-primary" href="${CHECKOUT}">${copy.cta}</a> <a class="btn btn-ghost" href="../">서비스 소개 보기</a></main></div>`;
  document.title='구독 안내 | 리텐핏 미용실';
}
function render(){
  if(gate&&!gate.ok)return renderGate();
  $('#app').innerHTML=shell();
  document.title=`${titles[tab][0]} | 리텐핏 미용실`;
  $('#view').innerHTML=({recommend:()=>renderRecommend(state,recommendation()),sales:()=>renderSales(state),overview,growth:()=>renderGrowth(state),customers,ai:aiPage,planner,settings,dataPage})[tab==='data'?'dataPage':tab]();
  if(tab==='planner')updatePlanResult();
}
function overview(){return renderDashboard(state,diagnosisAnswers,dashboardChoices);}
function stat(label,value,note,ic,sub,cls=''){return `<article class="stat-card"><div class="stat-top"><span>${label}</span>${icon(ic)}</div><strong class="stat-value ${cls}">${value}</strong><p>${note}</p><span class="stat-caption">${sub}</span></article>`;}
function benefitText(r){return r.type==='gift'?'홈케어 제품 1개':r.type==='points'?`${r.points}% 적립`:`${r.discount}% 할인`;}
function recCard(r){return `<article class="card rec-card ${r.ready?'':'blocked'}"><div class="card-head"><span class="badge ${SEGMENTS[r.id].color}">${SEGMENTS[r.id].short}</span><span class="small muted">동의 ${r.eligible}명</span></div><h3>${r.title}</h3><div class="rec-benefit">${r.e.service.name} <strong>${benefitText(r)}</strong></div><p>${r.reason}</p><div class="rec-bottom"><div><span>1회 잔여이익</span><strong class="${r.e.safe?'':'negative'}">${money(r.e.residual)}</strong></div><button class="circle-btn" data-action="choose" data-id="${r.id}" aria-label="${SEGMENTS[r.id].short} 혜택 설계">${icon('arrow')}</button></div>${!r.ready?`<div class="inline-warning">${r.blockedReason}</div>`:''}</article>`;}
function aiData(){const s=state.settings;const held=new Set((state.experiments||[]).filter(x=>x.month===s.month).flatMap(x=>x.control));const returns=returnRecommendations(state.customers,s,state.aiSettings,state.growthSettings).filter(r=>!held.has(r.id));const cross=crossSellRecommendations(state.customers,s,state.aiSettings,state.growthSettings);cross.rows=cross.rows.filter(r=>!held.has(r.id));return {returns,cross,rows:aiMode==='return'?returns:cross.rows};}
function aiPage(){
  const s=state.settings,d=aiData(),rows=d.rows;
  const selected=rows.find(r=>r.id===aiSelected)||rows[0];if(selected)aiSelected=selected.id;
  return `<div class="ai-mode-tabs" role="group" aria-label="제안 종류"><button data-action="ai-mode" data-id="return" class="${aiMode==='return'?'selected':''}">재방문 지연 고객 <span>${d.returns.length}명</span></button><button data-action="ai-mode" data-id="cross" class="${aiMode==='cross'?'selected':''}">커트 고객에게 펌 제안 <span>${d.cross.rows.length}명</span></button></div>
    <div class="ai-method-bar"><div><strong>${aiMode==='return'?'개인별 재방문 시점 추정':'유사 고객 기반 시술 추천'}</strong><p>${aiMode==='return'?'개인 방문 간격과 같은 시술 고객의 중앙값을 결합해 예상 재방문일을 계산합니다.':'커트 횟수·커트 평균 결제액·방문 간격이 가까운 고객을 찾아 펌 이용 이력을 살펴봅니다.'}</p></div><span class="badge ${aiMode==='return'?'green':d.cross.modelReady?'green':'orange'}">${aiMode==='return'?'주기 추정 + 비용 검증':d.cross.modelReady?`참고 이력 ${d.cross.poolSize}명`:'이력 보완 필요'}</span></div>
    <div class="ai-controls"><label>재방문 지연 허용일 <select data-ai="graceDays">${[0,7,14,30].map(n=>`<option value="${n}" ${state.aiSettings.graceDays===n?'selected':''}>${n}일</option>`).join('')}</select></label><label>커트 최소 이용 횟수 <select data-ai="minCuts">${[2,3,4,5].map(n=>`<option value="${n}" ${state.aiSettings.minCuts===n?'selected':''}>${n}회</option>`).join('')}</select></label><label>유사 고객 수 <select data-ai="neighbors">${[5,7,10,15].map(n=>`<option value="${n}" ${state.aiSettings.neighbors===n?'selected':''}>${n}명</option>`).join('')}</select></label><span>마케팅 동의가 확인된 고객만 표시</span></div>
    ${rows.length?`<div class="ai-layout"><section class="card ai-list"><div class="section-heading tight"><div><h2>${aiMode==='return'?'먼저 안부를 전할 고객':'스타일 상담을 제안할 고객'} <span class="count-pill">${rows.length}</span></h2><p>${aiMode==='return'?'지연 정도와 방문 관계를 반영한 검토 순서':'유사 고객의 펌 이용 이력을 반영한 검토 순서'}</p></div></div>${rows.slice(0,aiLimit).map(r=>`<button class="ai-customer ${selected.id===r.id?'selected':''}" data-action="ai-select" data-id="${esc(r.id)}"><span class="ai-customer-main"><strong>${esc(r.id)} <small>${r.kind==='return'?`${r.customer.visits}회 방문`:`커트만 ${r.customer.history.cut}회`}</small></strong><span>${r.kind==='return'?`예상 재방문일 ${r.next} · ${r.overdue}일 지연`:`유사 고객 ${r.peers.length}명 중 ${r.positivePeers}명 펌 경험`}</span></span><span class="ai-customer-end"><strong>${r.ready?r.e.service.name+' '+r.discount+'%':'추가 확인'}</strong><small>${r.kind==='return'?r.estimation.evidence:r.ready?'관심 확인 후 제안':'근거·조건 보완'}</small></span></button>`).join('')}${rows.length>aiLimit?`<button class="btn secondary full" data-action="ai-more">나머지 ${rows.length-aiLimit}명 더 보기</button>`:''}</section><aside class="card ai-detail">${aiDetail(selected)}</aside></div>`:`<section class="card empty-state"><h3>${aiMode==='return'?'현재 기준에서 재방문 지연 고객이 없습니다.':'커트만 이용한 고객을 확인할 시술 이력이 필요합니다.'}</h3><p>고객 데이터의 시술별 횟수·개인 방문 간격·커트 평균 결제액을 보완하거나 위 기준을 조정해 주세요.</p><button class="btn secondary" data-tab="data">고객 데이터 준비하기</button></section>`}
    <details class="card details ai-explainer"><summary>어떤 근거로 고르나요?</summary><div class="rules-grid"><div><span class="badge blue">방문 주기 추정</span><p>개인 평균 방문 간격과 같은 선호 시술 고객의 중앙값을 가중 평균합니다. 방문 이력이 많을수록 개인 간격을 더 반영합니다. 기준 이력이 없으면 매장에 입력한 주기를 사용하고 ‘설정값 참고’로 표시합니다.</p></div><div><span class="badge purple">유사 고객 분석</span><p>커트 횟수·커트 평균 결제액·개인 방문 간격 3개 값을 정규화한 뒤 가까운 고객 k명을 찾는 최근접 이웃 방식입니다. 가까운 이력에 더 높은 가중치를 줍니다. 고객 이름·성별·외모는 분석하지 않습니다.</p></div><div><span class="badge green">실행 조건 검증</span><p>대상 고객에게 적합한 시술과 혜택 후보를 만든 뒤 재료비·인건비·고정비·예산으로 할인 수준을 제한합니다. 이미 저장한 안에 같은 고객이 있으면 중복 혜택을 막습니다.</p></div></div><p>이 화면은 브라우저에서 실행하는 통계 추정과 최근접 이웃 모델로 계산합니다. 손님 기록을 밖으로 보내지 않습니다. 펌 경험 비중은 현재 고객 이력의 연관성이며 미래 구매 확률이나 할인에 따른 전환율이 아닙니다. 실제 효과는 캠페인 실행 후 방문·구매 결과로 검증해야 합니다.</p><p>펌 추천은 시술 관심을 확인할 고객을 고르는 기능입니다. 모발 상태·시술 가능 여부는 디자이너가 상담하여 판단합니다. 유사 고객 최소 10명, 펌 이용·미이용 각 3명 이상이 있어야 자동 제안을 활성화합니다.</p></details>`;
}
function aiDetail(r){
  const c=r.customer;
  return `<div class="card-head"><span class="badge ${r.kind==='return'?'orange':'purple'}">${r.kind==='return'?'재방문 회복':'시술 경험 확장'}</span><span class="small muted">고객 ${esc(c.id)}</span></div><h2>${r.kind==='return'?'다시 방문할 이유를 전합니다':'다음 스타일에 대한 대화를 엽니다'}</h2><p class="ai-reason">${esc(r.reason)}</p><div class="ai-evidence-grid">${r.kind==='return'?`<div><span>마지막 방문일</span><strong>${c.last}</strong></div><div><span>추정 방문 간격</span><strong>${r.estimation.cycle}일</strong></div><div><span>예상 재방문일</span><strong>${r.next}</strong></div><div><span>현재 지연 기간</span><strong class="orange-text">${r.overdue}일</strong></div>`:`<div><span>커트 이용 횟수</span><strong>${c.history.cut}회</strong></div><div><span>펌 이용 횟수</span><strong>${c.history.perm}회</strong></div><div><span>커트 평균 결제액</span><strong>${money(c.cutAvg)}</strong></div><div><span>펌 경험이 있는 유사 고객</span><strong>${r.positivePeers} / ${r.peers.length}명</strong></div>`}</div><div class="ai-offer"><span>이 고객에게 검토할 혜택</span><h3>${r.e.service.name} ${r.discount}% 할인</h3><p>${r.kind==='return'?'14일 안에 사용 · 이전 선호 시술 기준':'첫 펌 이용 시 · 스타일 상담 후 적용 · 30일 안에 사용'}</p><div><span>고객 결제금액</span><strong>${money(r.e.paid)}</strong></div><div><span>비용 차감 후 잔여이익</span><strong>${money(r.e.residual)}</strong></div><div><span>배분된 목표이익</span><strong>${money(r.e.target)}</strong></div></div>${!r.ready?`<div class="alert danger">${r.caution||'현재 비용·이익 기준에서 권할 할인 여력이 부족합니다. 매장 설정을 확인하세요.'}</div>`:''}<button class="btn primary full" data-action="ai-plan" data-id="${esc(r.id)}" ${!r.ready?'disabled':''}>이 고객의 프로모션 설계</button><p class="small muted center">추천 초안 · 점주 검토 후 적용 · 자동 발송 없음</p>${r.kind==='return'?`<div class="ai-basis"><h3>방문 주기 추정 근거</h3><div><span>개인 평균 간격</span><strong>${r.estimation.ownCycle?r.estimation.ownCycle+'일':'미입력'}</strong></div><div><span>같은 시술 고객 ${r.estimation.samples}명 중앙값</span><strong>${r.estimation.groupMedian?r.estimation.groupMedian+'일':'없음'}</strong></div><div><span>개인 이력 반영 비중</span><strong>${pct(r.estimation.weight*100)}</strong></div><p>예상일은 예약 확정일이 아닙니다. 개인의 실제 방문 의도는 확인이 필요합니다.</p></div>`:`<details class="ai-basis"><summary>유사 고객의 실제 비교 항목</summary><div class="table-wrap"><table class="compact"><thead><tr><th>고객 ID</th><th>커트</th><th>방문 간격</th><th>펌 경험</th></tr></thead><tbody>${r.peers.map(p=>`<tr><td>${esc(p.id)}</td><td>${p.cutCount}회</td><td>${p.cycle}일</td><td>${p.hasPerm?'있음':'없음'}</td></tr>`).join('')}</tbody></table></div><p>거리 가중 펌 경험 비중 ${pct(r.weighted*100)}. 미래 구매 확률이 아닙니다. 반영 변수는 커트 횟수·커트 평균 결제액·방문 간격입니다.</p></details>`}`;
}
function chooseAI(id){
  const r=aiData().rows.find(x=>x.id===id);if(!r?.ready)return;
  currentPlan={key:`ai-${r.kind}-${r.id}`,type:'discount',execution:'contact',month:state.settings.month,segment:r.segment,audienceIds:[r.id],aiKind:r.kind,aiReason:r.reason,service:r.service,discount:r.discount,points:0,gift:0,giftName:'홈케어 제품',giftRetail:15000,count:1,expiry:r.kind==='return'?14:30,conditions:r.kind==='return'?'재방문 안내 · 1인 1회 · 중복 혜택 불가':'첫 펌 이용 · 스타일 상담 후 적용 · 1인 1회'};
  navTo('planner');
}
function customers(){
  const s=state.settings,counts=segmentCounts(state.customers,s);
  const filtered=state.customers.filter(c=>(customerFilter==='all'||segmentFor(c,s)===customerFilter)&&c.id.toLowerCase().includes(search.toLowerCase()));
  const pages=Math.max(1,Math.ceil(filtered.length/15));customerPage=Math.min(customerPage,pages-1);
  return `
  <div class="customer-chips"><button class="filter-chip ${customerFilter==='all'?'selected':''}" data-action="filter-local" data-id="all">전체 <strong>${state.customers.length}</strong></button>${Object.entries(counts).map(([k,v])=>`<button class="filter-chip ${customerFilter===k?'selected':''}" data-action="filter-local" data-id="${k}"><span class="dot bg-${SEGMENTS[k].color}"></span>${SEGMENTS[k].short} <strong>${v.all}</strong></button>`).join('')}</div>
  <section class="card customer-table"><div class="section-heading tight"><div><h2>${customerFilter==='all'?'전체 고객':SEGMENTS[customerFilter].name} <span class="count-pill">${filtered.length}</span></h2><p>분석 기준일 ${s.asOf} · 고객 이름·전화번호 없이 매장 고객 ID로 분석합니다.</p></div><label class="search-field"><input id="customer-search" placeholder="고객 ID 검색" value="${esc(search)}" aria-label="고객 ID 검색"></label></div><div class="table-wrap"><table><thead><tr><th>고객 ID</th><th>고객군</th><th>완료 방문</th><th>최근 방문</th><th>평균 결제액</th><th>선호 시술</th><th>마케팅 동의</th><th>맞춤 제안</th></tr></thead><tbody>${filtered.slice(customerPage*15,(customerPage+1)*15).map(c=>{const seg=segmentFor(c,s);return `<tr><td><strong>${esc(c.id)}</strong></td><td><span class="badge ${SEGMENTS[seg].color}">${SEGMENTS[seg].short}</span></td><td>${c.visits}회</td><td>${c.last?`${c.last}<small class="table-sub">${daysBetween(c.last,s.asOf)}일 전</small>`:'첫 방문 예정'}</td><td>${c.visits?money(c.avg):'이력 없음'}</td><td>${s.services.find(v=>v.id===c.service)?.name||'—'}</td><td><span class="${c.consent?'green-text':'muted'}">${c.consent?'확인됨':'미확인'}</span></td><td><button class="table-action" data-action="choose" data-id="${seg}" aria-label="${esc(c.id)} 고객군의 제안 보기">혜택 보기</button></td></tr>`;}).join('')||'<tr><td colspan="8" class="empty">조건에 맞는 고객이 없습니다.</td></tr>'}</tbody></table></div><div class="table-footer"><span>${filtered.length?customerPage*15+1:0}–${Math.min((customerPage+1)*15,filtered.length)} / ${filtered.length}명</span><div><button class="btn small-btn secondary" data-action="page-prev" ${customerPage===0?'disabled':''}>이전</button><span>${customerPage+1} / ${pages}</span><button class="btn small-btn secondary" data-action="page-next" ${customerPage===pages-1?'disabled':''}>다음</button></div></div></section>
  <details class="card details"><summary>고객 분류 기준과 마케팅 근거</summary><p>첫 방문 예정 → 재방문 지연 → 단골 → 고단가 → 일반 순서로 확인하여 중복 분류하지 않습니다. 기본값은 사업주가 조정할 수 있는 설계 가설입니다. 고객별 제안 화면에서는 개인별 방문 주기와 시술 이력으로 한 단계 더 자세히 분석합니다.</p><div class="rules-grid">${Object.entries(SEGMENTS).map(([k,v])=>`<div><span class="badge ${v.color}">${v.short}</span><p>${v.description}${k==='loyal'?` (현재 ${s.loyaltyVisits}회)` :k==='dormant'?` (현재 방문 주기의 ${s.dormantMultiple}배)`:''}</p></div>`).join('')}</div><p class="small muted">실제 고객의 선호나 구매 의도를 확정한 분류가 아닙니다. 선호 시술, 할인 민감도, 재방문 시점은 점주가 현장 지식으로 보완합니다. 마케팅 동의가 미확인인 고객은 추천 대상 수에서 제외합니다.</p></details>`;
}
function selectRec(id){
  const r=recommendations(state.settings,state.customers).find(r=>r.id===id);
  currentPlan={segment:r.id,type:r.type,execution:'contact',aiReason:r.reason,reason:r.reason,month:state.settings.month,service:r.service,discount:r.discount,points:r.points,gift:r.gift,giftName:r.giftName||'홈케어 제품',giftRetail:r.giftRetail||15000,count:Math.max(1,r.count),expiry:r.expiry,conditions:r.conditions};
  navTo('planner');
}
function planner(){
  if(!currentPlan)currentPlan=selectProposal(promotionGroups(state)[0].recommended);
  return renderPlanner(state,currentPlan);
}
function planResult(){return renderPlanResult(state,currentPlan);}
function updatePlanResult(){
  if(!$('#plan-results')||!currentPlan)return;
  $('#plan-results').innerHTML=planResult();
  const eligible=planAudience(currentPlan,state.customers,state.settings);
  $('#plan-audience').innerHTML=`<div class="audience-note">${icon('users')} <strong>${eligible.length}명</strong>에게 제안 가능 <span>${currentPlan.execution==='counter'?'계산대에서 직접 권하기 · 자동 연락 없음':'마케팅 수신 동의가 확인된 고객만 연락 대상으로 표시'}</span></div><details class="sf-why"><summary>선택 대상 고객 ID 확인 · ${Math.min(eligible.length,currentPlan.count)}명</summary><p>${eligible.slice(0,currentPlan.count).map(c=>esc(c.id)).join(' · ')||'선택 가능한 고객이 없습니다.'}</p></details>`;
  if($('#plan-chosen-numbers'))$('#plan-chosen-numbers').textContent=offerLabel(currentPlan);
  if($('#plan-proposal-state'))$('#plan-proposal-state').textContent=currentPlan.manuallyEdited?'원장이 조정한 후보':'이번 달 고객·비용 기준으로 미리 계산했습니다';
  if($('#plan-math')){const expanded=$('#plan-math details')?.open;$('#plan-math').innerHTML=calculationDetails(currentPlan,state.settings);if(expanded)$('#plan-math details').open=true;}
}
function refreshDashboard(){
  const scroll=window.scrollY,open=[...document.querySelectorAll('details[data-panel][open]')].map(el=>el.dataset.panel);
  render();open.forEach(key=>{const el=document.querySelector(`details[data-panel="${key}"]`);if(el)el.open=true;});window.scrollTo(0,scroll);
}
function chooseDashboard(id){
  const p=promotionGroups(state).flatMap(g=>g.proposals).find(p=>p.offerId===id);
  if(!p)return;
  currentPlan=selectProposal(p);navTo('planner');
}
function showMessageDraft(p){
  const recipients=planAudience({...p,execution:'contact'},state.customers,state.settings).slice(0,p.count);
  const service=state.settings.services.find(v=>v.id===p.service).name;
  const message=`(광고) ${state.settings.salon}\n다음 방문을 준비하실 때 참고해 주세요. ${service} ${offerLabel(p)} 혜택을 안내드립니다.\n안내일부터 ${p.expiry}일 이내 · ${p.conditions}\n예약 전 담당 디자이너와 상담해 주세요.\n[매장 연락처 및 수신거부 안내 입력]`;
  $('#guide').innerHTML=`<div class="dialog-head"><h3>원장이 검토하는 문자 초안</h3><button class="circle-btn" data-action="close-guide" aria-label="닫기">${icon('close')}</button></div><div class="dialog-content"><span class="badge orange">자동 발송·예약 적용 없음</span><p>연락 대상으로 표시 가능한 수신 동의 고객 ${recipients.length}명: ${recipients.map(c=>esc(c.id)).join(' · ')||'없음'}</p><label class="field">문자 문구 초안<textarea id="message-draft" rows="9" readonly>${esc(message)}</textarea></label><p>원장이 내용·대상·기한과 매장 연락처를 확인하고 보낼지 결정해 주세요.</p><button class="btn primary" data-action="copy-message">초안 복사</button></div>`;$('#guide').showModal();
}
function field(label,key,value,unit='',type='number',opts=''){return `<label class="field">${label}<div class="input-unit"><input name="${key}" type="${type}" value="${esc(value)}" ${type==='number'?'min="0"':''} ${opts}>${unit?`<span>${unit}</span>`:''}</div></label>`;}
function settings(){
  const s=state.settings,m=salonModel(s);
  return `<form id="settings-form"><div class="settings-layout"><div><section class="card"><div class="section-heading tight"><div><h2>매장 운영 정보</h2><p>매출과 비용은 모두 부가세 제외 기준으로 일관되게 입력해 주세요.</p></div></div><div class="form-grid three">${field('매장 이름','salon',s.salon,'','text','required maxlength="40"')}${field('계획 월','month',s.month,'','month','required')}${field('고객 분석 기준일','asOf',s.asOf,'','date','required')}</div><div class="form-grid three">${field('시술하는 디자이너 수','stylists',s.stylists,'명','number','step="1" required max="100"')}${field('월 영업일','days',s.days,'일','number','step="1" required max="31"')}${field('하루 시술 가능 시간','hours',s.hours,'시간','number','step="0.5" required max="24"')}</div><p class="small muted">예약표에서 판매 가능한 디자이너 시간을 입력합니다. 휴게시간은 빼고, 원장님이 시술한다면 디자이너 수와 보수에 포함하세요.</p></section>
    <section class="card"><div class="section-heading tight"><div><h2>고정비와 수수료</h2><p>기본급과 매출연동 수당을 중복 입력하지 않도록 확인하세요.</p></div></div><div class="form-grid three">${field('디자이너 1인 월 고정급','stylistSalary',s.stylistSalary,'원','number','step="100000" required')}${field('보조 직원 수','assistants',s.assistants,'명','number','step="1" required')}${field('보조 직원 1인 월 고정급','assistantSalary',s.assistantSalary,'원','number','step="100000" required')}${field('월 임차료','rent',s.rent,'원','number','step="100000" required')}${field('기타 월 고정비','otherFixed',s.otherFixed,'원','number','step="10000" required')}${field('결제·예약 수수료율','fee',s.fee,'%','number','step="0.1" max="30" required')}${field('매출연동 인건비율','commission',s.commission,'%','number','step="0.1" max="80" required')}</div><p class="small muted">기타 고정비에는 공과금, 보험료, 감가상각 등 매장에 해당하는 비용을 포함합니다. 매출연동 인건비는 할인 후 매출에 적용합니다. 소득세·대출 원금은 계산에 포함하지 않습니다.</p></section>
    <section class="card"><div class="section-heading tight"><div><h2>시술별 가격과 판매 계획</h2><p>월 예상 건수는 지난 실적과 예약을 바탕으로 직접 입력합니다.</p></div></div><div class="service-settings">${s.services.map(v=>`<div class="service-form"><div class="service-label"><h3>${v.name}</h3></div><div class="form-grid three">${field('시술 가격',`${v.id}_price`,v.price,'원','number','step="1000" required')}${field('1회 재료비',`${v.id}_material`,v.material,'원','number','step="500" required')}${field('디자이너 점유시간',`${v.id}_minutes`,v.minutes,'분','number','step="5" required')}${field('월 예상 시술 건수',`${v.id}_volume`,v.volume,'건','number','step="1" required')}${field('주변 동일 시술 참고 가격',`${v.id}_competitor`,v.competitor,'원','number','step="1000"')}${field('통상 재방문 주기',`${v.id}_cycle`,v.cycle,'일','number','step="1" required')}</div></div>`).join('')}</div><p class="small muted">점유시간은 디자이너 자원을 실제로 차지하는 시간입니다. 다른 고객과 병행 가능한 방치시간은 매장의 운영 방식에 맞춰 조정하세요. 주변 가격은 길이·기장 추가·디자이너 등급 등 동일 조건으로 수동 조사합니다.</p></section>
    ${shopFields(state)}<section class="card"><div class="section-heading tight"><div><h2>이번 달 운영 목표</h2><p>매장의 목표와 관계 기준에 맞춰 추천이 달라집니다.</p></div></div><div class="form-grid two">${field('월 목표이익','targetProfit',s.targetProfit,'원','number','step="100000" required')}${field('월 혜택 비용 예산','budget',s.budget,'원','number','step="10000" required')}${field('단골 분류 방문 기준','loyaltyVisits',s.loyaltyVisits,'회','number','step="1" required')}${field('재방문 지연 기준','dormantMultiple',s.dormantMultiple,'배','number','step="0.1" required')}</div></section></div>
    <aside class="settings-summary card"><h2>현재 저장된 기준</h2><div class="setting-summary-item"><span>월 고정비</span><strong>${money(m.fixed)}</strong></div><div class="setting-summary-item"><span>월 예상 매출</span><strong>${money(m.sales)}</strong></div><div class="setting-summary-item"><span>월 예상 시술</span><strong>${m.visits}건</strong></div><div class="setting-summary-item"><span>예상 시술 가동률</span><strong>${pct(m.utilization*100)}</strong></div><div class="setting-summary-item"><span>분당 고정비 배분</span><strong>${money(m.fixedPerMinute)}</strong></div><p class="small muted">월 고정비를 예상 시술시간으로 나눕니다. 시술 건수가 줄면 건당 고정비 부담이 커집니다.</p><button class="btn primary full" type="submit">저장하고 추천 다시 계산</button><div id="settings-errors" role="alert"></div><button type="button" class="text-btn center full" data-action="reset-settings">예시 설정으로 되돌리기</button></aside></div></form>`;
}
function dataPage(){
  return `<div class="data-layout"><section><div class="card upload-card"><h2>고객 데이터 올리기</h2><p class="muted">고객별로 정리한 CSV를 올리면 방문 이력에 맞춰 추천이 달라집니다. 매달 올리면 지난달 실행 결과가 자동으로 계산됩니다.</p><label class="btn primary upload-btn">CSV 파일 선택<input id="csv-file" type="file" accept=".csv,text/csv" class="file-input"></label><p class="small muted">이름·전화번호 없이 고객 ID와 이용 이력만 넣어 주세요. 파일 내용은 이 기기의 브라우저에만 저장되고 서버로 보내지 않습니다.</p><span class="small muted">UTF-8 CSV · 최대 2MB / 1,000명 · 고객 1명당 1행</span>${importError?`<div class="alert danger" role="alert">${esc(importError)}</div>`:''}<div class="data-status"><span class="dot bg-green"></span>${state.source==='sample'?'가상 고객':'가져온 고객'} ${state.customers.length}명 분석 중<button class="text-btn" data-tab="customers">목록 확인</button></div></div><div id="upload-preview">${upload?uploadPreview():''}</div>
    <section class="card"><div class="section-heading tight"><div><h2>기본 분석에는 6가지 정보가 필요합니다</h2><p>고객군 분류와 동의 대상 수를 계산하는 데 사용합니다.</p></div><button class="text-btn" data-action="template">양식 받기</button></div><div class="table-wrap"><table class="compact"><thead><tr><th>항목</th><th>입력 예시</th><th>활용</th></tr></thead><tbody><tr><td>고객 ID</td><td>C001</td><td>매장에서 관리하는 일관된 식별값</td></tr><tr><td>누적 완료 방문 수</td><td>5</td><td>첫 방문·단골 구분</td></tr><tr><td>최근 완료 방문일</td><td>2026-10-03</td><td>재방문 지연 판단</td></tr><tr><td>평균 결제액</td><td>85000</td><td>고객 단가와 관계 수준 파악</td></tr><tr><td>선호 시술</td><td>펌</td><td>방문 주기와 시술 관심사</td></tr><tr><td>마케팅 동의</td><td>true / false</td><td>제안 가능한 고객 수 계산</td></tr></tbody></table></div><p class="small muted">첫 방문 예정 고객은 방문 수 0, 최근 방문일 공란, 평균 결제액 0으로 입력하세요. 동의 여부를 알 수 없으면 false로 입력합니다.</p></section><section class="card"><h2>고객별 제안에는 시술 이력을 더해주세요</h2><p class="small muted">선호 시술이 커트라는 정보만으로 ‘커트만 이용한 고객’이라고 판단하지 않습니다. 아래 항목은 CSV 머리글 이름으로 자동 연결합니다.</p><div class="table-wrap"><table class="compact"><thead><tr><th>선택 항목</th><th>CSV 머리글</th></tr></thead><tbody>${CSV_AI_FIELDS.map(([key,label])=>`<tr><td>${label}</td><td>${key}</td></tr>`).join('')}</tbody></table></div><p class="small muted">커트·펌·염색·클리닉 완료 횟수는 네 항목을 함께 입력하세요. 한 방문에 여러 시술을 했다면 각 시술에 1회씩 기록합니다. 개인 평균 간격은 완료 방문 사이 일수의 평균이며 취소·노쇼는 제외합니다. 원본 예약 파일에 없는 값은 매장 기록으로 집계해야 합니다.</p><p class="small muted">시술 이력 항목이 없는 기존 양식도 가져올 수 있습니다. 이때 커트만 이용했는지 알 수 없는 고객은 펌 추천에서 제외합니다. 재방문 추정은 확보된 고객군 이력 또는 매장 설정값을 사용합니다.</p></section></section>
    <aside><section class="card naver-card"><h2>네이버예약 기록 활용 방법</h2><ol class="steps"><li><strong>사업자 페이지에서 내역 받기</strong><p>예약자관리의 ‘내려받기’ 또는 ‘상세 내려받기’에서 엑셀 파일을 받습니다.</p></li><li><strong>매장 기록과 고객별로 정리하기</strong><p>취소·노쇼를 제외한 이용 완료 내역을 사용합니다. 결제액·방문 이력·동의 상태는 매장 기록으로 보완하세요.</p></li><li><strong>양식에 맞춰 CSV로 저장하기</strong><p>고객별로 집계한 뒤 CSV UTF-8로 저장해 가져옵니다. 이 화면은 원본 엑셀의 자동 연동이나 자동 집계를 제공하지 않습니다.</p></li></ol><a class="text-btn" href="https://help.naver.com/service/11712/contents/7582?lang=ko&osType=COMMONOS" target="_blank" rel="noopener noreferrer">네이버 공식 내려받기 안내</a></section><section class="card"><h3>데이터를 연결할 때 알아둘 점</h3><p class="muted">네이버 내려받기 파일은 일부 정보가 마스킹됩니다. 마스킹된 이름·번호만으로 같은 고객을 확정하거나 가려진 정보를 복원하지 않습니다.</p><p class="muted">고객별 분석에는 매장이 관리하는 안정적인 고객 ID와 적법하게 확보한 이력이 필요합니다. 실제 파일에서 제공되지 않는 항목은 별도로 보완해야 합니다.</p><div class="subtle-note">고객 메시지를 자동으로 보내지 않습니다. 기기를 바꾸면 기록이 옮겨지지 않으니 고객 요약을 내보내 보관해 주세요.</div></section><button class="btn secondary full" data-action="demo-data">가상 고객 데이터로 되돌리기</button></aside></div>`;
}
function uploadPreview(){
  return `<section class="card import-preview"><div class="section-heading tight"><div><h2>열을 연결해 주세요</h2><p>${esc(upload.name)} · ${upload.parsed.rows.length}행</p></div></div><div class="form-grid two">${CSV_FIELDS.map(([key,label])=>`<label class="field">${label}<select data-mapping="${key}">${upload.parsed.headers.map((h,i)=>`<option value="${i}" ${String(upload.mapping[key])===String(i)?'selected':''}>${esc(h)||'(빈 머리글)'}</option>`).join('')}</select></label>`).join('')}</div><div class="table-wrap"><table class="compact"><thead><tr>${upload.parsed.headers.slice(0,8).map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${upload.parsed.rows.slice(0,3).map(row=>`<tr>${row.slice(0,8).map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="small muted">최대 3행 미리보기 · 같은 고객 ID는 갱신하고 새로운 ID는 추가합니다. 기존 선택 기록을 보존하고, 변경된 비용·대상 조건은 다시 검증합니다.</p><div id="import-errors" role="alert"></div><button class="btn primary" data-action="import">검증하고 가져오기</button></section>`;
}
function showGuide(){
  $('#guide').innerHTML=`<div class="dialog-head"><span class="brand-text">계산 기준</span><button class="circle-btn" data-action="close-guide" aria-label="닫기">${icon('close')}</button></div><div class="dialog-content"><h3>이번 달 추천</h3><p>매장 진단, 고객 기록, 시술별 손익으로 어디서 이익이 새는지와 손님을 막는 심리 장벽을 계산하고, 예산과 예약 여유 안에서 2~4개를 고릅니다. 매달 지난달 추천과 실행 여부, 비교군 결과를 반영해 다시 계산합니다.</p><h3>손익 계산</h3><p>고정비 배분액 = 월 고정비 ÷ 월 예상 시술시간 × 해당 시술 점유시간</p><p>1회 잔여이익 = 할인 후 결제액 − 수수료·매출연동 인건비 − 재료비 − 적립금 충당액 − 증정품 매입원가 − 고정비 배분액</p><p>할인 한도는 이 잔여이익이 시술시간에 비례해 배분한 월 목표이익 이상이 되는 범위입니다. 저장할 때 월 혜택 예산, 대상 고객 수, 시술 건수, 전체 월 목표이익도 확인합니다.</p><p>모든 금액은 부가세 제외 기준입니다. 고정급과 매출연동 인건비는 각각 입력합니다. 적립금은 전부 사용한다고 가정합니다.</p><div class="alert neutral">입력한 시술 건수와 비용이 맞는다는 전제의 계획입니다. 고객 반응과 매출 증가를 보장하지 않습니다. 네이버 자동 연동과 고객 메시지 발송은 없습니다.</div></div>`;
  $('#guide').showModal();
}
function download(filename,rows){
  const cell=v=>{let text=String(v??'');if(/^[=+@\-]/.test(text)&&typeof v!=='number')text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  const csv='\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('CSV 파일을 내려받았습니다.');
}
function customerRows(customers){return [[...CSV_FIELDS.map(x=>x[2]),...CSV_AI_FIELDS.map(x=>x[0])],...customers.map(c=>[c.id,c.visits,c.last,c.avg,state.settings.services.find(v=>v.id===c.service).name,c.consent,c.history?.cut??'',c.history?.perm??'',c.history?.color??'',c.history?.care??'',c.cycle||'',c.cutAvg||''])];}
document.addEventListener('click',async e=>{
  const nav=e.target.closest('[data-tab]');if(nav){e.preventDefault();navTo(nav.dataset.tab);if(tab==='planner')updatePlanResult();return;}
  const el=e.target.closest('[data-action]');if(!el)return;const action=el.dataset.action,id=el.dataset.id;
  if(action==='start-own'){if(await askConfirm('샘플 손님을 지우고 내 매장 데이터로 시작할까요? 매장 설정은 예시 값으로 남으니 함께 고쳐 주세요.',{confirmLabel:'샘플 지우고 시작'})){state.customers=[];state.source='import';state.plans=[];state.decisions=[];state.experiments=[];state.monthlyPlans=[];state.visitData=null;initializeDashboard(state);currentPlan=null;save();navTo('settings');toast('샘플을 지웠습니다. 매장 숫자부터 입력해 주세요.');}return;}
  if(action==='rec-plan'){const e=findEval(id),plan=e&&planFromEvaluation(e,state);if(plan){currentPlan=plan;navTo('planner');}return;}
  if(action==='rec-run'){const e=findEval(id);if(!e)return;if(!await askConfirm(`‘${e.device.name}’ 실행을 이번 달 기록에 남길까요?\n대상 손님의 일부는 혜택 없는 비교군으로 나눕니다. 손님에게 자동으로 연락하지는 않습니다.`,{confirmLabel:'실행 기록'}))return;const r=startEngineRun(e,state);save();render();toast(r.experiment?`기록했습니다. 혜택군 ${r.experiment.treatment.length}명, 비교군 ${r.experiment.control.length}명으로 나눴습니다.`:r.tooSmall?'기록했습니다. 대상 손님이 적어 비교군은 나누지 않았습니다.':'기록했습니다. 신규 유입은 개인 비교군을 둘 수 없어 월별 신규 수로 확인합니다.');return;}
  if(action==='rec-copy'){const e=findEval(id);if(!e)return;$('#guide').innerHTML=`<div class="dialog-head"><h3>안내 문구 초안</h3><button class="circle-btn" data-action="close-guide" aria-label="닫기">${icon('close')}</button></div><div class="dialog-content"><span class="badge orange">자동 발송 없음</span><label class="field" style="margin-top:12px">문구<textarea id="message-draft" rows="8" readonly>${esc(recommendationMessage(e,state))}</textarea></label><p>수신 동의한 손님에게만 보내고, 대괄호 안의 내용을 채워 주세요.</p><button class="btn primary" data-action="copy-message">문구 복사</button></div>`;$('#guide').showModal();return;}
  if(action==='dash-option'){const p=promotionGroups(state).flatMap(g=>g.proposals).find(p=>p.offerId===id);if(p?.ready){dashboardChoices[p.groupId]=id;refreshDashboard();}}
  if(action==='dash-choose')chooseDashboard(id);
  if(action==='dash-hold'){const key=state.settings.month+'-'+id;state.deferred[key]=!state.deferred[key];save();refreshDashboard();toast(state.deferred[key]?'이 고객군의 제안을 보류했습니다.':'보류를 해제했습니다.');}
  if(action==='diagnosis-answer'){diagnosisAnswers.technique=id;refreshDashboard();}
  if(action==='staff-same'){diagnosisAnswers.staff=true;refreshDashboard();toast('인건비가 그대로라는 답변을 화면에 기록했습니다.');}
  if(action==='message-draft'){const p=promotionGroups(state).flatMap(g=>g.proposals).find(p=>p.offerId===id);if(p)showMessageDraft(p);}
  if(action==='message-current')showMessageDraft(currentPlan);
  if(action==='copy-message'){navigator.clipboard.writeText($('#message-draft').value).then(()=>toast('초안을 복사했습니다. 발송하지 않았습니다.')).catch(()=>toast('문구를 직접 선택해 복사해 주세요.'));}
  if(action==='export-visits')download('retenfit-salon-virtual-visits.csv',[['visit_id','customer_id','visit_date','service','paid','designer'],...(state.visitData?.visits||[]).map(v=>[v.id,v.customerId,v.date,v.service,v.paid,v.designer])]);
  if(action==='view-saved'){currentPlan=clone(state.plans[Number(id)]);navTo('planner');}
  if(action==='guide')showGuide();
  if(action==='ai-mode'){aiMode=id;aiSelected='';aiLimit=10;render();}
  if(action==='ai-select'){aiSelected=id;render();}
  if(action==='ai-more'){aiLimit=10000;render();}
  if(action==='ai-plan')chooseAI(id);
  if(action==='close-guide')$('#guide').close();
  if(action==='choose'){selectRec(id);updatePlanResult();}
  if(action==='filter'){customerFilter=id;customerPage=0;navTo('customers');}
  if(action==='filter-local'){customerFilter=id;customerPage=0;render();}
  if(action==='page-prev'){customerPage--;render();}
  if(action==='page-next'){customerPage++;render();}
  if(action==='save-plan'){
    const x=evaluatePlan(state.settings,state.customers,currentPlan,state.plans);
    if(!x.ok||!Number.isInteger(currentPlan.expiry)||currentPlan.expiry<1||currentPlan.expiry>365){toast('입력 조건을 먼저 확인해 주세요.');return;}
    state.plans=state.plans.filter(p=>planKey(p)!==planKey(currentPlan));state.plans.push({...clone(currentPlan),month:state.settings.month,savedAt:new Date().toISOString()});recordDecision(state,currentPlan);if(currentPlan.engineId)markAdopted(state,state.settings.month,currentPlan.engineId);if(currentPlan.groupId)delete state.deferred[state.settings.month+'-'+currentPlan.groupId];save();render();updatePlanResult();toast('선택을 기록했습니다. 고객에게 연락하지는 않았습니다.');
  }
  if(action==='edit-plan'){currentPlan=clone(state.plans[Number(id)]);render();updatePlanResult();window.scrollTo({top:0,behavior:'smooth'});}
  if(action==='delete-plan'){const removed=state.plans[Number(id)];state.decisions=state.decisions.filter(d=>!(d.month===state.settings.month&&d.key===planKey(removed)));state.plans.splice(Number(id),1);save();render();updatePlanResult();toast('저장한 안을 삭제했습니다.');}
  if(action==='export-plans'){
    const s=state.settings;
    download('retenfit-salon-promotion-plan-'+s.month+'.csv',[
      ['계획 월','대상 고객군','대상 고객ID','시술','할인율(%)','적립률(%)','증정품명','증정 원가','예상 사용 인원','사용 기간(일)','적용 조건','1회 시술 인식금액','1회 잔여이익','총 혜택 비용','검증 상태','계산 기준','쿠폰 금액','정액권 충전금','보너스(%)','보너스 비용','실행 방식'],
      ...state.plans.map(p=>{const x=evaluatePlan(s,state.customers,p,state.plans);return [s.month,SEGMENTS[p.segment].name,planAudience(p,state.customers,s).slice(0,p.count).map(c=>c.id).join(' / '),s.services.find(v=>v.id===p.service).name,p.discount,p.points,p.gift?p.giftName:'',p.gift,p.count,p.expiry,p.conditions,Math.round(x.e.paid),Math.round(x.e.residual),Math.round(x.e.benefitCost*p.count),x.ok?'입력 기준 충족':'재검토 필요','부가세 제외·예상 판매량 달성·혜택 전액 비용 반영',p.coupon||0,p.charge||0,p.bonus||0,x.e.walletReserve,p.execution==='counter'?'계산대에서 권하기':'원장 연락 필요'];})]);
  }
  if(action==='export-customers')download('retenfit-salon-customers.csv',customerRows(state.customers));
  if(action==='template')download('retenfit-salon-customer-template.csv',[[...CSV_FIELDS.map(x=>x[2]),...CSV_AI_FIELDS.map(x=>x[0])],['C001',5,'2026-10-03',85000,'펌',true,3,2,0,0,35,25000],['C002',0,'',0,'커트',false,0,0,0,0,0,0],['C003',3,'2026-06-01',70000,'염색',true,1,0,2,0,45,27000]]);
  if(action==='reset-settings'){
    if(await askConfirm('매장·시술 설정을 예시 값으로 되돌릴까요? 고객 데이터는 유지하고 저장한 프로모션안은 비웁니다.',{confirmLabel:'예시 값으로 되돌리기',danger:true})){state.settings={...clone(DEFAULTS),asOf:state.settings.asOf,month:state.settings.month};state.plans=[];currentPlan=null;save();render();toast('예시 설정을 복원했습니다.');}
  }
  if(action==='demo-data'){
    if(await askConfirm('현재 고객 목록을 가상 고객으로 바꿀까요? 저장한 프로모션안도 비웁니다.',{confirmLabel:'가상 고객으로 바꾸기',danger:true})){state.customers=demoCustomers(state.settings.asOf);state.source='sample';state.plans=[];state.decisions=[];state.visitData=null;initializeDashboard(state);state.dashboardMeta.uploadedAt=today();currentPlan=null;upload=null;save();render();toast(`가상 고객 ${state.customers.length}명을 불러왔습니다.`);}
  }
  if(action==='season-delete'){state.seasonHistory=state.seasonHistory.filter(x=>x.month!==id);save();render();}
  if(action==='import'){
    if(new Set(Object.values(upload.mapping).map(String)).size!==CSV_FIELDS.length){$('#import-errors').innerHTML='<p class="negative">각 항목을 서로 다른 열에 연결해 주세요.</p>';return;}
    const r=importCustomers(upload.parsed,upload.mapping,state.settings);
    if(r.errors.length){$('#import-errors').innerHTML=`<div class="alert danger"><div><strong>${r.errors.length}개 오류를 수정해 주세요. 아직 적용하지 않았습니다.</strong><ul>${r.errors.slice(0,8).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></div>`;return;}
    if(!r.customers.length){toast('가져올 고객이 없습니다.');return;}
    const merged=new Map(state.customers.filter(c=>state.source!=='sample').map(c=>[c.id,c]));r.customers.forEach(c=>merged.set(c.id,c));if(merged.size>1000){toast('최대 1,000명의 고객까지 등록할 수 있습니다.');return;}state.customers=[...merged.values()];state.source='import';state.visitData=null;initializeDashboard(state);state.dashboardMeta.uploadedAt=today();currentPlan=null;upload=null;save();render();toast(`${r.customers.length}명의 고객 데이터를 적용했습니다.`);
  }
});
document.addEventListener('input',e=>{
  const el=e.target;
  if(el.dataset.plan){const k=el.dataset.plan;currentPlan[k]=['giftName','conditions','segment','service','execution'].includes(k)?el.value:Number(el.value)||0;currentPlan.manuallyEdited=true;if(k==='discount'&&$('#discount-range'))$('#discount-range').value=Math.min(50,currentPlan.discount);updatePlanResult();}
  if(el.id==='discount-range'){currentPlan.discount=Number(el.value);$('#discount-number').value=el.value;updatePlanResult();}
  if(el.id==='customer-search'){search=el.value;customerPage=0;const pos=el.selectionStart;$('#view').innerHTML=customers();$('#customer-search').focus();$('#customer-search').setSelectionRange(pos,pos);}
});
document.addEventListener('change',async e=>{
  const el=e.target;
  if(el.dataset.ai){state.aiSettings[el.dataset.ai]=Number(el.value);aiSelected='';save();render();}
  if(el.dataset.plan){const k=el.dataset.plan;if(['segment','service','execution'].includes(k)){currentPlan[k]=el.value;currentPlan.manuallyEdited=true;if(['execution','service'].includes(k)){render();}updatePlanResult();}}
  if(el.dataset.mapping)upload.mapping[el.dataset.mapping]=Number(el.value);
  if(el.id==='csv-file'&&el.files[0]){
    const f=el.files[0];importError='';
    try{
      if(f.size>2*1024*1024)throw new Error('2MB 이하의 파일을 선택해 주세요.');
      if(!/\.csv$/i.test(f.name))throw new Error('CSV UTF-8 파일을 선택해 주세요.');
      const parsed=parseCSV(await f.text());
      if(parsed.headers.length<6)throw new Error('필요한 6개 항목이 있는지 확인해 주세요.');
      if(parsed.rows.length>1000)throw new Error('최대 1,000명의 고객을 처리합니다.');
      const mapping={};CSV_FIELDS.forEach(([key,label,english],i)=>{const found=parsed.headers.findIndex(h=>h===english||h===label);mapping[key]=found>=0?found:i;});
      upload={name:f.name,parsed,mapping};
    }catch(err){upload=null;importError=err.message;}
    render();
  }
});
document.addEventListener('submit',e=>{
  if(e.target.id==='growth-form'){
    e.preventDefault();const fd=new FormData(e.target);
    state.settings.loyaltyVisits=Number(fd.get('loyaltyVisits'));
    state.growthSettings={...GROWTH_DEFAULTS,...state.growthSettings,profile:String(fd.get('profile')),seasonMonth:String(fd.get('seasonMonth')),pilotLimit:Number(fd.get('pilotLimit')),rewardCost:Number(fd.get('rewardCost')),bookingUtilization:fd.get('bookingUtilization')===''?null:Number(fd.get('bookingUtilization'))};
    currentPlan=null;save();render();toast('단골 기준과 이번 계절의 혜택 후보를 다시 계산했습니다.');return;
  }
  if(e.target.id==='season-history-form'){
    e.preventDefault();const fd=new FormData(e.target),month=String(fd.get('month')),visits=Number(fd.get('visits'));
    if(!/^\d{4}-\d{2}$/.test(month)||!Number.isInteger(visits)||visits<0)return;
    state.seasonHistory=state.seasonHistory.filter(x=>x.month!==month);state.seasonHistory.push({month,visits});save();render();return;
  }
  if(e.target.id==='experiment-form'){
    e.preventDefault();const fd=new FormData(e.target),stage=String(fd.get('stage')),group=growthModel(state).stages.find(x=>x.id===stage),month=state.settings.month;
    const ids=group.rows.filter(c=>c.consent).map(c=>c.id),split=deterministicSplit(ids,Number(fd.get('holdout')),month+':'+stage);
    if(split.control.length<2||split.treatment.length<2){toast('각 군에 최소 2명 이상 배정할 고객이 필요합니다.');return;}
    if(state.experiments.some(x=>x.month===month&&x.stage===stage)){toast('이번 달 이 고객군의 비교 설계가 이미 있습니다. 배정을 유지합니다.');return;}
    if(state.plans.some(p=>p.month===month)){toast('비교 설계는 이번 달 혜택을 선택하기 전에 만들어 주세요. 기존 선택 기록을 먼저 검토하세요.');return;}
    state.experiments.push({id:month+'-'+stage,month,stage,label:group.title,...split,createdAt:new Date().toISOString()});save();render();toast('비교 설계만 저장했습니다. 혜택 적용·연락은 하지 않았습니다.');return;
  }
  if(e.target.dataset.experiment){
    e.preventDefault();const fd=new FormData(e.target),x=state.experiments.find(x=>x.id===e.target.dataset.experiment);
    const result={treatmentReturned:Number(fd.get('treatmentReturned')),controlReturned:Number(fd.get('controlReturned')),treatmentMargin:Number(fd.get('treatmentMargin')),controlMargin:Number(fd.get('controlMargin')),observedAt:today()};
    if(result.treatmentReturned>x.treatment.length||result.controlReturned>x.control.length)return;
    x.result=result;save();render();toast('원장이 입력한 관찰 결과를 저장했습니다.');return;
  }
  if(e.target.id!=='settings-form')return;e.preventDefault();
  const fd=new FormData(e.target),s=clone(state.settings);
  for(const k of Object.keys(s)){if(k==='services'||k==='shop')continue;s[k]=['salon','month','asOf'].includes(k)?String(fd.get(k)):Number(fd.get(k));}
  for(const v of s.services)for(const k of ['price','material','minutes','volume','competitor','cycle'])v[k]=Number(fd.get(`${v.id}_${k}`));
  s.shop=readShop(fd);
  const errors=[];
  if(!s.salon.trim())errors.push('매장 이름을 입력해 주세요.');
  if(s.stylists<1||!Number.isInteger(s.stylists)||!Number.isInteger(s.assistants)||s.days<1||s.hours<=0)errors.push('직원 수·영업일·시간을 확인해 주세요.');
  if(s.fee+s.commission>=100)errors.push('수수료와 매출연동 인건비의 합은 100%보다 작아야 합니다.');
  if(s.loyaltyVisits<2||!Number.isInteger(s.loyaltyVisits)||s.dormantMultiple<1)errors.push('단골 기준은 2회 이상 정수, 지연 기준은 1배 이상이어야 합니다.');
  if(s.services.some(v=>v.price<=0||v.minutes<=0||v.cycle<=0||!Number.isInteger(v.volume)))errors.push('시술 가격·시간·주기는 0보다 커야 하고 예상 건수는 정수여야 합니다.');
  if(state.customers.some(c=>c.last&&daysBetween(c.last,s.asOf)<0))errors.push('분석 기준일이 일부 고객의 최근 방문일보다 이전입니다. 고객 데이터나 기준일을 확인해 주세요.');
  if(errors.length){$('#settings-errors').innerHTML=`<ul class="validation-list">${errors.map(x=>`<li>${x}</li>`).join('')}</ul>`;return;}
  if(s.month!==state.settings.month)state.plans=state.plans.filter(p=>p.month===s.month);state.settings=s;state.dashboardMeta.costConfirmedAt=today();currentPlan=null;save();navTo('recommend');toast('매장 정보를 저장하고 추천을 새로 계산했습니다.');
});
window.addEventListener('hashchange',()=>{const route=/^#\/(\w+)/.exec(location.hash)?.[1];if(titles[route]&&route!==tab){tab=route;render();window.scrollTo({top:0,behavior:'instant'});}});
boot();

