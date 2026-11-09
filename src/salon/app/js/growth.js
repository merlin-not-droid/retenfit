import {salonModel,economics,daysBetween,planAudience,evaluatePlan,planKey} from './core.js';
export const THEORY={
 reference:{label:'기준가격·프레이밍',url:'https://doi.org/10.1177/002224379202900108',note:'반복 할인은 기대가격에 영향을 줄 수 있습니다. 정상가·최종가·절감액을 함께 보여 줍니다.'},
 progress:{label:'목표기울기',url:'https://doi.org/10.1509/jmkr.43.1.39',note:'실제 완료 방문과 다음 목표까지 남은 횟수를 알려 줍니다. 5회라는 기준은 매장 설정값입니다.'},
 end:{label:'피크앤드·관리 경험',url:'https://doi.org/10.1016/0304-3959(96)02994-6',note:'마무리 경험에 주목한 설계 가설입니다. 증정이 재방문을 보장한다는 의미는 아닙니다.'},
 loss:{label:'손실회피·보유 혜택',url:'https://doi.org/10.2307/1914185',note:'실제로 보유한 잔액과 실제 사용기한만 안내합니다. 새로 손실을 만들어 압박하지 않습니다.'},
 choice:{label:'기본값·선택 부담',url:'https://doi.org/10.1126/science.1091721',note:'추천 1개와 대안 2개를 먼저 보여주되 원장이 선택·보류합니다. 자동 실행하지 않습니다.'},
 social:{label:'사회적 증거',url:'https://doi.org/10.1086/586910',note:'확인 가능한 이용 기록의 기간·분모를 표시합니다. 가상 수치나 후기를 실제 고객 성과로 쓰지 않습니다.'},
 scarce:{label:'실제 가용량·희소성',url:'https://doi.org/10.1037/0022-3514.32.5.906',note:'예상 수요와 실제 남은 예약은 다릅니다. 예약 재고가 없으면 선착순·마감 임박 문구를 만들지 않습니다.'}
};
export const GROWTH_DEFAULTS={profile:'residential',pilotLimit:20,holdout:20,rewardCost:4500,seasonMonth:'',bookingUtilization:null};
export function stageFor(c,s){return c.visits===0?'acquire':c.visits<s.loyaltyVisits?'convert':'retain';}
export function seasonalContext(state,month=state.growthSettings?.seasonMonth||state.settings.month){
 const settings=state.settings,m=salonModel(settings),g={...GROWTH_DEFAULTS,...state.growthSettings};
 const n=Number(month.slice(5)),season=n>=3&&n<=5?'봄':n>=6&&n<=8?'여름':n>=9&&n<=11?'가을':'겨울';
 const themes={봄:'새로운 스타일을 상담하는 계절',여름:'시술 후 홈케어를 챙기는 계절',가을:'기존 스타일과 관리 주기를 점검하는 계절',겨울:'모임 전 상담과 사후 관리를 준비하는 계절'};
 const profiles={residential:'주거 상권 · 익숙한 방문 주기와 생활 일정',office:'직장 상권 · 점심·퇴근 전후의 실제 예약 여유',campus:'대학 상권 · 매장이 확인한 학사·행사 일정'};
 const prevYear=(Number(month.slice(0,4))-1)+month.slice(4),history=(state.seasonHistory||[]).filter(h=>Number.isInteger(h.visits)&&h.visits>=0);
 const observed=history.find(h=>h.month===month),prior=history.find(h=>h.month===prevYear);
 const evidence=Boolean(observed&&prior&&prior.visits>=20&&observed.visits>=20);
 const change=evidence?(observed.visits-prior.visits)/prior.visits:null;
 const utilization=Number.isFinite(g.bookingUtilization)?g.bookingUtilization/100:m.utilization;
 const capacitySource=Number.isFinite(g.bookingUtilization)?'원장이 확인한 예약률':'설정한 예상 시술 가동률';
 const busy=utilization>=.8,quiet=utilization<.55;
 return {month,season,theme:themes[season],profile:profiles[g.profile]||profiles.residential,utilization,capacitySource,busy,quiet,evidence,change,observed,prior,
  rule:busy?'예약이 찬 시간의 할인 확대를 보류하고 관리·후속 방문 혜택부터 검토합니다.':quiet?'원장이 확인한 비어 있는 시간에 소규모 쿠폰 실험을 검토합니다.':'할인 수준을 늘리기보다 기존 주기와 혜택 사용부터 확인합니다.',
  evidenceText:evidence?`${prevYear} ${prior.visits}건 → ${month} ${observed.visits}건 (${change>=0?'+':''}${(change*100).toFixed(1)}%). 같은 매장 입력값의 비교이며 계절성의 인과 증거는 아닙니다.`:'전년 동월과 현재 월 각각 20건 이상의 완료 기록이 없습니다. 계절 테마는 아이디어이며 수요 증가로 가정하지 않습니다.'};
}
export function trialLevels(state,service,context='normal',charge=0){
 const s=state.settings,base=economics(s,service),season=seasonalContext(state);
 const discountCap=Math.max(0,Math.floor((base.cap+1e-8)/5)*5);
 let bonusCap=0;for(let b=1;b<=5;b++)if(economics(s,service,{charge,bonus:b}).safe)bonusCap=b;
 const couponCap=Math.max(0,Math.min(5000,Math.floor((base.residual-base.target)/(1-salonModel(s).rate)/1000)*1000));
 const suggested=context==='rescue'?10:5;
 const discount=Math.min(discountCap,season.busy?5:suggested);
 return {discountCap,discount,bonusCap,bonus:Math.min(3,bonusCap),couponCap,coupon:Math.min(context==='rescue'?3000:1000,couponCap),season};
}
export function growthModel(state){
 const s=state.settings,season=seasonalContext(state),counts={acquire:0,convert:0,retain:0};state.customers.forEach(c=>counts[stageFor(c,s)]++);
 const stages=[{id:'acquire',title:'첫 방문을 만드는 단계',subtitle:'완료 방문 0회',theory:'reference',aim:'첫 완료 방문과 두 번째 정상가 방문을 함께 확인합니다.',type:'coupon'},
 {id:'convert',title:'다시 오는 고객을 단골로',subtitle:`1~${s.loyaltyVisits-1}회 이용`,theory:'progress',aim:`실제 방문 횟수와 ${s.loyaltyVisits}회까지 남은 횟수를 보여 줍니다.`,type:'coupon'},
 {id:'retain',title:'단골과의 관계를 오래',subtitle:`${s.loyaltyVisits}회 이상 · 변화 신호 별도 확인`,theory:'end',aim:'추가 할인 전 보유 혜택·불만·시술 축소를 먼저 확인합니다.',type:'gift'}];
 return {counts,season,stages:stages.map(g=>{const rows=state.customers.filter(c=>stageFor(c,s)===g.id);return {...g,rows,progress:rows.slice(0,5).map(c=>({id:c.id,done:c.visits,remaining:Math.max(0,s.loyaltyVisits-c.visits)}))};})};
}
export function acquisitionGroup(state){
 const s=state.settings,rows=state.customers.filter(c=>c.visits===0),prefs={};rows.forEach(c=>prefs[c.service]=(prefs[c.service]||0)+1);const service=Object.entries(prefs).sort((a,b)=>b[1]-a[1])[0]?.[0]||'cut';
 const held=new Set((state.experiments||[]).filter(x=>x.month===s.month).flatMap(x=>x.control));
 const audience=rows.filter(c=>c.service===service&&!held.has(c.id)),levels=trialLevels(state,service),id='acquire';
 const base={key:'group-acquire',groupId:id,groupName:'첫 방문을 준비하는 고객',segment:'new',service,audienceIds:audience.map(c=>c.id),discount:0,points:0,gift:0,coupon:0,charge:0,bonus:0,extraMinutes:0,execution:'contact',expiry:30,conditions:'첫 완료 방문 · 1인 1회 · 중복 불가',aiReason:'완료 방문이 없는 고객에게 작은 첫 경험 혜택부터 시험합니다.',month:s.month,generated:true};
 const proposals=[{...base,type:'coupon',coupon:levels.coupon,reason:'정상가격을 함께 안내하고 첫 이용 쿠폰부터 작게 시험합니다.',theory:'reference'},
 {...base,type:'discount',discount:levels.discount,reason:'가격 부담을 낮추는 대안입니다. 한도 전체를 바로 쓰지 않습니다.',theory:'reference'},
 {...base,type:'gift',gift:state.growthSettings?.rewardCost??4500,giftName:'홈케어 제품',execution:'counter',reason:'실제 첫 방문 시 관리 경험을 더하는 대안입니다.',theory:'end'}].map((p,i)=>{
  const e=economics(s,service,p),eligible=planAudience(p,state.customers,s).length,remaining=s.budget-state.plans.filter(x=>planKey(x)!==p.key&&(!x.month||x.month===s.month)).reduce((a,x)=>a+economics(s,x.service,x).benefitCost*x.count,0);
  p.count=Math.max(0,Math.min(eligible,state.growthSettings?.pilotLimit||20,e.service.volume,e.benefitCost>0?Math.floor(Math.max(0,remaining)/e.benefitCost):0));
  const x=evaluatePlan(s,state.customers,p,state.plans);return {...p,offerId:`acquire-${p.type}`,rank:i,e,eligible,contactCount:audience.filter(c=>c.consent).length,ready:x.ok,blockedReason:x.reasons[0]||'',discountCap:levels.discountCap,couponCap:levels.couponCap};
 });return {id,name:base.groupName,reason:base.aiReason,rows,audience,service,proposals,recommended:proposals.find(p=>p.ready)||proposals[0]};
}
export function deterministicSplit(ids,holdoutPercent=20,seed='campaign'){
 const ranked=[...new Set(ids)].map(id=>{let h=2166136261;for(const c of seed+':'+id)h=Math.imul(h^c.charCodeAt(0),16777619);return {id,h:h>>>0};}).sort((a,b)=>a.h-b.h||a.id.localeCompare(b.id));
 const n=Math.floor(ranked.length*holdoutPercent/100);return {control:ranked.slice(0,n).map(x=>x.id),treatment:ranked.slice(n).map(x=>x.id)};
}
