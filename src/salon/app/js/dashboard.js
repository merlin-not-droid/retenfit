import {trialLevels,acquisitionGroup,GROWTH_DEFAULTS} from './growth.js';
import {DEFAULTS,daysBetween,economics,salonModel,segmentFor,segmentCounts,evaluatePlan,planAudience,planKey} from './core.js';

export const addDays=(date,n)=>{const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
export const previousMonth=month=>{const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);return d.toISOString().slice(0,7);};
export const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
const money=n=>Math.round(n).toLocaleString('ko-KR')+'원';

// Preserve the original 148 IDs, visit counts, last dates, spend totals and treatment counts.
// A cut-only customer's cut average must equal their overall average. A single visit
// cannot provide an observed inter-visit interval. These two derived fields are repaired.
export function normalizeSample(customers){
  return customers.map(c=>({...c,cutAvg:c.history?.cut===c.visits&&c.visits?c.avg:c.cutAvg,
    cycle:c.visits<2?0:c.cycle,
    prepayDeclined:c.prepayDeclined??(c.visits>=5&&(Number(c.id.slice(1))-25)%4===3)}));
}
export function generateVisitData(customers){
  const visits=[];
  for(const c of customers){
    if(!c.visits||!c.history||Object.values(c.history).reduce((a,b)=>a+b,0)!==c.visits)continue;
    const seq=Number(c.id.replace(/\D/g,''))||1;
    const services=Object.entries(c.history).flatMap(([k,n])=>Array.from({length:n},()=>k));
    // A subset has a most recent cut following a chemical treatment, without changing counts.
    if(seq%5===0&&c.history.cut&&c.history.cut<c.visits){services.splice(services.indexOf('cut'),1);services.push('cut');}
    const cutTotal=c.history.cut*(c.cutAvg||c.avg),otherCount=c.visits-c.history.cut;
    const otherTotal=c.avg*c.visits-cutTotal;
    let otherIdx=0;
    for(let i=0;i<services.length;i++){
      const service=services[i],date=addDays(c.last,-(c.visits-1-i)*(c.cycle||30));
      const paid=service==='cut'?(c.cutAvg||c.avg):Math.floor(otherTotal/otherCount)+(otherIdx++<otherTotal%otherCount?1:0);
      const designer=seq>=67&&seq<=97?'이OO':(seq%2?'김OO':'박OO');
      visits.push({id:c.id+'-V'+(i+1),customerId:c.id,date,service,paid,designer});
    }
  }
  visits.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  const accounts=customers.filter(c=>c.visits>=5&&!c.prepayDeclined&&Number(c.id.slice(1))%11===0).map(c=>{
    const rows=visits.filter(v=>v.customerId===c.id).slice(-2);
    const charge=Math.ceil(c.avg*3/50000)*50000,bonus=Math.round(charge*0.03);
    const used=Math.min(charge+bonus,rows.reduce((n,v)=>n+v.paid,0));
    return {customerId:c.id,issuedAt:rows[0].date,charge,bonus,used,balance:charge+bonus-used,visitIds:rows.map(v=>v.id)};
  });
  const reviews=visits.filter((v,i)=>i%4===0).map((v,i)=>({visitId:v.id,date:v.date,service:v.service,
    sentiment:i%4===0?'negative':'positive',keyword:i%4===0?'대기 시간':({cut:'스타일',perm:'컬 유지',color:'색감',care:'부드러움'}[v.service])}));
  return {version:2,visits,accounts,reviews,priceEvents:[{service:'perm',date:'2026-08-01',before:90000,after:100000}],
    uploadedAt:'2026-10-24',costConfirmedAt:'2026-07-01'};
}
export function initializeDashboard(state){
  state.dashboardMeta??={uploadedAt:state.settings.asOf,costConfirmedAt:state.source==='sample'?addDays(state.settings.asOf,-115):today()};
  state.decisions??=[];state.deferred??={};state.growthSettings={...GROWTH_DEFAULTS,...state.growthSettings};state.seasonHistory??=[];state.experiments??=[];
  if(state.source==='sample'){
    state.customers=normalizeSample(state.customers);
    if(state.visitData?.version!==2)state.visitData=generateVisitData(state.customers);
    const balances=new Map(state.visitData.accounts.map(a=>[a.customerId,a.balance]));
    state.customers.forEach(c=>{c.walletBalance=balances.get(c.id)||0;});
  } else {if(state.visitData?.version!==3){state.visitData=null;state.customers.forEach(c=>{c.walletBalance=0;});}else state.customers.forEach(c=>{c.walletBalance??=0;});}
  state.plans.forEach(p=>{p.month??=state.settings.month;});
}
export function customerSignals(customers,s,visits=[]){
  return customers.map(c=>{
    const rows=visits.filter(v=>v.customerId===c.id&&v.date<=s.asOf).sort((a,b)=>a.date.localeCompare(b.date));
    const service=s.services.find(v=>v.id===c.service)||s.services[0];
    const cycle=c.cycle>0?c.cycle:service.cycle;
    const elapsed=c.last?daysBetween(c.last,s.asOf):0,ratio=elapsed/cycle;
    const down=rows.length>=2&&rows.at(-1).service==='cut'&&['perm','color'].includes(rows.at(-2).service);
    const loyal=c.visits>=s.loyaltyVisits;
    const gaps=rows.slice(1).map((v,i)=>daysBetween(rows[i].date,v.date));
    const cv=gaps.length>1?Math.sqrt(mean(gaps.map(n=>(n-mean(gaps))**2)))/(mean(gaps)||1):null;
    return {...c,cycle,elapsed,ratio,down,loyal,late:loyal&&ratio>1.5,
      drifting:loyal&&(ratio>1.5||down),regular:loyal&&ratio<=1&&!down&&(cv===null?c.cycle>0:cv<=0.35),
      designer:rows.at(-1)?.designer,rows,cv};
  });
}
export function benefitHeadroom(s,service,chargeOverride=0){
  const e=economics(s,service),discount=e.safe?Math.max(0,Math.floor((e.cap+1e-8)/5)*5):0;
  // An indicative 3-month charge for the service table, not an existing customer balance.
  const v=e.service,charge=chargeOverride||Math.max(50000,Math.ceil(v.price*90/v.cycle/50000)*50000);
  let bonus=0;for(let n=1;n<=5;n++)if(economics(s,service,{charge,bonus:n}).safe)bonus=n;
  return {service,discount,bonus,charge,gift:Math.max(0,Math.floor(e.residual-e.target)),e};
}
export function promoTitle(p){
  const bits=[];
  if(p.type==='wallet'||p.charge&&p.bonus)bits.push(`${money(p.charge||0)} 충전 · 보너스 ${p.bonus||0}%`);
  if(p.type==='gift'||p.gift)bits.push((p.giftName||'제품')+' 증정');
  if(p.type==='coupon'||p.coupon)bits.push(`${p.groupId==='acquire'?'첫 방문':'다음 방문'} ${money(p.coupon||0)} 쿠폰`);
  if(p.type==='points'||p.points)bits.push(`${p.points||0}% 적립`);
  if(p.type==='discount'||p.discount)bits.push(`${p.discount||0}% 할인`);
  return bits.join(' + ')||'혜택 없음';
}
export function promotionGroups(state){
  const s=state.settings,m=salonModel(s),signals=customerSignals(state.customers,s,state.visitData?.visits);
  const held=new Set((state.experiments||[]).filter(x=>x.month===s.month).flatMap(x=>x.control));
  const unassigned=new Set(signals.map(c=>c.id));
  const take=fn=>signals.filter(c=>{if(unassigned.has(c.id)&&fn(c)){unassigned.delete(c.id);return true;}return false;});
  const definitions=[
    {id:'steady',segment:'loyal',name:'꾸준히 찾아오는 단골',type:'wallet',rows:take(c=>c.regular&&!c.prepayDeclined&&!c.walletBalance),reason:'방문이 규칙적이고 간격 지연·시술 축소 신호가 없는 고객입니다.'},
    {id:'care',segment:'premium',name:'관리가 필요한 관계',type:'gift',rows:take(c=>c.visits>=2&&c.ratio<=1.5&&((c.loyal&&c.ratio>1)||c.avg>=80000)),reason:'방문 간격이 조금 늘어난 단골 또는 평균 결제액 8만 원 이상 고객입니다.'},
    {id:'first',segment:'regular',name:'첫 방문 다음의 연결',type:'coupon',rows:take(c=>c.visits===1),reason:'첫 방문은 완료했지만 두 번째 방문 이력이 아직 없는 고객입니다.'},
    {id:'convert',segment:'regular',name:'단골이 되어가는 고객',type:'coupon',rows:take(c=>c.visits>=2&&c.visits<s.loyaltyVisits&&c.ratio<2),reason:`첫 방문 이후 이용을 이어온 고객입니다. 실제 ${s.loyaltyVisits}회 방문까지 남은 횟수와 다음 방문 혜택을 안내합니다.`},
    {id:'rescue',segment:'dormant',name:'재방문을 놓친 고객',type:'discount',rows:take(c=>c.visits>=2&&c.ratio>=2),reason:'평소 방문 간격의 2배 이상 경과했습니다. 원장이 연락 여부를 결정합니다.'}
  ];
  return definitions.map(g=>{
    const prefs={};g.rows.forEach(c=>{prefs[c.service]=(prefs[c.service]||0)+1;});
    const service=Object.entries(prefs).sort((a,b)=>b[1]-a[1])[0]?.[0]||({steady:'perm',care:'color',first:'cut',convert:'cut',rescue:'color'}[g.id]);
    const audience=g.rows.filter(c=>c.service===service&&!held.has(c.id)),ids=audience.map(c=>c.id),base=economics(s,service);
    const quarter=mean(audience.map(c=>c.avg*90/c.cycle));
    const charge=Math.max(50000,Math.ceil((quarter||base.service.price*3)/50000)*50000);
    let bonus=0;for(let n=1;n<=5;n++)if(economics(s,service,{charge,bonus:n}).safe)bonus=n;
    const levels=trialLevels(state,service,g.id,charge);bonus=levels.bonus;const discount=levels.discount;
    const coupon=levels.coupon;
    const clinic=s.services.find(v=>v.id==='care');
    const options={
      wallet:{type:'wallet',charge,bonus,execution:'counter',reason:`해당 고객군의 90일 이용액 평균은 ${money(quarter)}입니다. 충전액은 5만 원 단위로 올림하고, 보너스는 손익 한도 안에서 초기 실험값 3%부터 제안합니다. 5% 이내 한도와 구분합니다.`},
      gift:{type:'gift',gift:state.growthSettings?.rewardCost??4500,giftName:'홈케어 미니 트리트먼트',execution:'counter',reason:`설정한 증정 원가 ${money(state.growthSettings?.rewardCost??4500)}으로 시술 후 관리 경험을 제안합니다.`},
      clinic:{type:'gift',gift:clinic.material+clinic.minutes*m.fixedPerMinute,giftName:'클리닉 서비스',extraMinutes:clinic.minutes,execution:'counter',reason:'클리닉 재료비와 추가 디자이너 시간의 고정비를 모두 반영했습니다.'},
      coupon:{type:'coupon',coupon,execution:'contact',reason:`${g.id==='first'?'두 번째 방문을 위한':'재방문을 위한'} 정액 쿠폰입니다. 손익 한도 안에서 작은 시험 금액부터 제안합니다.`},
      discount:{type:'discount',discount,execution:'contact',reason:g.id==='rescue'?'평소 방문 간격을 크게 넘긴 고객에게 기한부 재방문 이유를 제안합니다.':['first','convert'].includes(g.id)?'다음 방문의 가격 부담을 낮추는 대안입니다. 기준 가격을 지키기 위해 정액 쿠폰부터 검토합니다.':g.id==='care'?'가격 혜택도 대안으로 검토하되, 시술 후 관리 경험을 우선 제안합니다.':'단골에게 가격 혜택을 제공하는 대안입니다. 규칙적인 방문 관계에는 정액권을 우선 제안합니다.'}
    };
    const keys=g.id==='steady'?['wallet','gift','discount']:g.id==='care'?['gift','clinic','discount']:['first','convert'].includes(g.id)?['coupon','gift','discount']:['discount','coupon','gift'];
    const proposals=keys.map((key,index)=>{
      const p={discount:0,points:0,gift:0,coupon:0,bonus:0,charge:0,extraMinutes:0,giftName:'홈케어 제품',giftRetail:15000,
        ...options[key],key:'group-'+g.id,offerId:g.id+'-'+key,groupId:g.id,groupName:g.name,segment:g.segment,service,
        audienceIds:ids,expiry:key==='wallet'?90:g.id==='rescue'?14:30,conditions:'선택 시술 한정 · 1인 1회 · 다른 혜택과 중복 불가',month:s.month,
        aiReason:g.reason,quarter,rank:index,generated:true,discountCap:levels.discountCap,bonusCap:levels.bonusCap,couponCap:levels.couponCap,theory:key==='wallet'?'loss':key==='gift'||key==='clinic'?'end':['first','convert'].includes(g.id)?'progress':'reference'};
      const eligible=planAudience(p,state.customers,s).length,e=economics(s,service,p);
      const remaining=s.budget-state.plans.filter(x=>planKey(x)!==p.key&&(!x.month||x.month===s.month)).reduce((n,x)=>n+economics(s,x.service,x).benefitCost*x.count,0);
      const planned=state.plans.filter(x=>x.service===service&&planKey(x)!==p.key&&(!x.month||x.month===s.month)).reduce((n,x)=>n+x.count,0);
      p.count=Math.max(0,Math.min(eligible,state.growthSettings?.pilotLimit||20,Math.max(0,e.service.volume-planned),e.benefitCost>0?Math.floor(Math.max(0,remaining)/e.benefitCost):0));
      const checked=evaluatePlan(s,state.customers,p,state.plans);
      const meaningful=p.type==='wallet'?p.bonus>0:p.type==='discount'?p.discount>0:p.type==='coupon'?p.coupon>0:p.gift>0;
      p.ready=checked.ok&&meaningful;p.e=e;p.eligible=eligible;p.contactCount=audience.filter(c=>c.consent).length;
      p.blockedReason=!e.safe||!meaningful?'목표이익 미달':!ids.length?'해당 고객 없음':!eligible?'수신 동의 고객 없음':checked.reasons[0]||'';
      return p;
    });
    // Keep an excluded primary visible, and identify a viable fallback if one exists.
    const recommended=proposals.find(p=>p.ready)||proposals[0];
    return {...g,service,audience,proposals,recommended,excludedDeclines:signals.filter(c=>c.regular&&c.prepayDeclined).length};
  }).concat(acquisitionGroup(state));
}

export function monthlyReturnTrends(visits,s){
  const months=[];let month=s.month;for(let i=0;i<6;i++){months.unshift(month);month=previousMonth(month);}
  return s.services.map(service=>({service:service.id,name:service.name,window:Math.ceil(service.cycle*1.5),points:months.map(month=>{
    const rows=visits.filter(v=>v.service===service.id&&v.date.startsWith(month)&&v.date<=s.asOf);
    const first=new Map();rows.forEach(v=>{if(!first.has(v.customerId))first.set(v.customerId,v);});
    const observed=[...first.values()].filter(v=>addDays(v.date,Math.ceil(service.cycle*1.5))<=s.asOf);
    const returned=observed.filter(v=>visits.some(x=>x.customerId===v.customerId&&x.date>v.date&&x.date<=addDays(v.date,Math.ceil(service.cycle*1.5))&&x.date<=s.asOf)).length;
    return {month,n:observed.length,returned,total:first.size,rate:observed.length?returned/observed.length:null};
  })}));
}
function designerEvidence(signals,visits,s){
  const anchor=s.month+'-01',lastMonth=previousMonth(s.month)+'-01';
  const designerNames=[...new Set(visits.filter(v=>v.date<lastMonth).map(v=>v.designer))];
  const missing=designerNames.find(name=>!visits.some(v=>v.designer===name&&v.date>=lastMonth&&v.date<=s.asOf));
  if(!missing)return {name:null,grade:'단서 없음',description:'이전 담당자와 최근 예약을 비교할 방문 기록이 충분하지 않습니다.',ids:[]};
  const a=signals.filter(c=>c.designer===missing&&c.visits>=2),b=signals.filter(c=>c.designer&&c.designer!==missing&&c.visits>=2);
  const lateA=a.filter(c=>c.ratio>1.5),lateB=b.filter(c=>c.ratio>1.5),rateA=a.length?lateA.length/a.length:0,rateB=b.length?lateB.length/b.length:0;
  return {name:missing,anchor:lastMonth,last:visits.filter(v=>v.designer===missing).at(-1)?.date,
    grade:a.length>=5&&b.length>=5&&rateA-rateB>=.2?'가능성 높음':a.length&&rateA>rateB?'가능성 있음':'단서 없음',
    description:`${missing} 담당 고객 ${lateA.length}/${a.length}명 (${Math.round(rateA*100)}%)의 방문 간격이 1.5배를 넘었습니다. 다른 담당 고객은 ${lateB.length}/${b.length}명 (${Math.round(rateB*100)}%)입니다.`,
    ids:lateA.map(c=>c.id)};
}
export function dashboardModel(state,answers={}){
  const s=state.settings,m=salonModel(s),visits=state.visitData?.visits||[],signals=customerSignals(state.customers,s,visits);
  const groups=promotionGroups(state),plans=state.plans.filter(p=>!p.month||p.month===s.month);
  const cost=plans.reduce((n,p)=>n+economics(s,p.service,p).benefitCost*p.count,0);
  const walletBalance=state.customers.reduce((n,c)=>n+(c.walletBalance||0),0),walletRatio=m.sales>0?walletBalance/m.sales:walletBalance?Infinity:0;
  const late=signals.filter(c=>c.late),risk=signals.filter(c=>c.drifting).sort((a,b)=>b.ratio-a.ratio||Number(b.down)-Number(a.down));
  const prevEnd=addDays(s.month+'-01',-1);
  const past=signals.map(c=>{const rows=c.rows.filter(v=>v.date<=prevEnd);return {...c,visits:rows.length,last:rows.at(-1)?.date||''};});
  const previousLate=visits.length?past.filter(c=>c.visits>=s.loyaltyVisits&&c.last&&daysBetween(c.last,prevEnd)>c.cycle*1.5).length:null;
  const staff=designerEvidence(signals,visits,s),trends=monthlyReturnTrends(visits,s);
  const chemical=trends.find(t=>t.service==='color');
  const completed=chemical?.points.filter(p=>p.n>=3)||[],first=completed[0],last=completed.at(-1);
  const falling=first&&last&&first!==last&&last.rate<first.rate-.1;
  const technique={title:'약제·시술 방식 변화',grade:answers.technique==='yes'?'가능성 있음':'단서 없음',
    description:falling?`염색 재방문율 ${first.month} ${Math.round(first.rate*100)}% (${first.returned}/${first.n}) → ${last.month} ${Math.round(last.rate*100)}% (${last.returned}/${last.n}).`:'관찰 기간이 완료된 염색 방문을 비교하고 있습니다. 현재 자료만으로 변화 원인을 특정하기 어렵습니다.',
    note:answers.technique==='yes'?'원장 답변: 변경했습니다 · 시점과 관련성 확인 필요':answers.technique==='no'?'원장 답변: 변경하지 않았습니다 · 해당 가설 보류':answers.technique==='unknown'?'원장 답변: 잘 모르겠어요 · 확인 대기':'원장 확인 대기'};
  const priceEvent=state.visitData?.priceEvents?.[0];
  const perm=trends.find(t=>t.service==='perm');
  const before=priceEvent?perm.points.filter(p=>p.month<priceEvent.date.slice(0,7)&&p.n):[],after=priceEvent?perm.points.filter(p=>p.month>=priceEvent.date.slice(0,7)&&p.n):[];
  const rate=points=>{const n=points.reduce((n,p)=>n+p.n,0);return {n,r:n?points.reduce((n,p)=>n+p.returned,0)/n:null};};
  const pre=rate(before),post=rate(after);
  const price={title:'가격 변화와 방문 흐름',grade:pre.n>=5&&post.n>=5&&pre.r-post.r>.1?'가능성 있음':'단서 없음',
    description:priceEvent?`가상 가격 기록: ${priceEvent.date} 펌 ${money(priceEvent.before)} → ${money(priceEvent.after)}. `+(pre.n&&post.n?`관찰 완료 고객 재방문율 ${Math.round(pre.r*100)}% (${pre.n}명) → ${Math.round(post.r*100)}% (${post.n}명).`:`변경 전 관찰 완료 ${pre.n}명 · 변경 후 ${post.n}명. 비교할 이력이 더 필요합니다.`):'가격 변경 이력이 없어서 전후 비교를 할 수 없습니다.',note:'가격 변화와 시기의 관련성만 확인 · 원인 확정 아님'};
  const clues=new Set(staff.grade!=='단서 없음'?staff.ids:[]);
  if(answers.technique==='yes')risk.filter(c=>c.service==='color').forEach(c=>clues.add(c.id));
  if(price.grade!=='단서 없음')risk.filter(c=>c.service==='perm').forEach(c=>clues.add(c.id));
  const lastActions=state.decisions.filter(d=>d.month===previousMonth(s.month));
  const actionIds=[...new Set(lastActions.flatMap(d=>d.ids))];
  const returnedIds=actionIds.filter(id=>lastActions.some(a=>a.ids.includes(id)&&visits.some(v=>v.customerId===id&&v.date>a.date&&v.date<=addDays(a.date,a.expiry)&&v.date<=s.asOf)));
  const active=signals.filter(c=>c.visits),avg=active.reduce((n,c)=>n+c.avg*c.visits,0)/(active.reduce((n,c)=>n+c.visits,0)||1);
  const counts=segmentCounts(state.customers,s),relationship=Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,v.all]));
  risk.forEach(c=>{relationship[segmentFor(c,s)]--;});relationship.drifting=risk.length;
  const reviewSummary=s.services.map(v=>{const r=(state.visitData?.reviews||[]).filter(x=>x.service===v.id&&x.date>=trends[0].points[0].month+'-01'&&x.date<=s.asOf);const by={};r.forEach(x=>{const k=x.keyword+' '+(x.sentiment==='positive'?'만족':'불만');by[k]=(by[k]||0)+1;});return {name:v.name,keywords:by};});
  return {s,m,signals,visits,groups,plans,cost,walletBalance,walletRatio,walletWarning:walletRatio>.5,late,risk,previousLate,
    staff,technique,price,trends,reviewSummary,unknown:risk.filter(c=>!clues.has(c.id)).length,
    question:falling?`${last.month.slice(5)}월 염색 고객의 재방문율이 ${first.month.slice(5)}월보다 낮습니다. 그 무렵 약제나 시술 방식이 바뀌었나요?`:'최근 약제나 시술 방식이 바뀌었나요? 염색 고객의 방문 흐름을 함께 확인합니다.',
    lastActions,actionIds,returnedIds,avg,relationship};
}

export function selectProposal(p){const out={...p};delete out.e;delete out.ready;delete out.blockedReason;return out;}
export function recordDecision(state,p){
  const ids=planAudience(p,state.customers,state.settings).slice(0,p.count).map(c=>c.id);
  state.decisions=state.decisions.filter(d=>!(d.month===state.settings.month&&d.key===planKey(p)));
  state.decisions.push({key:planKey(p),month:state.settings.month,date:state.settings.asOf,expiry:p.expiry,ids,title:promoTitle(p),execution:p.execution||'contact'});
}
