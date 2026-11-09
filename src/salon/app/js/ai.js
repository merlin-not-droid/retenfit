import {economics,segmentFor,daysBetween} from './core.js';
import {trialLevels} from './growth.js';

export const AI_DEFAULTS={graceDays:7,minCuts:2,neighbors:7};
const median=a=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y),i=Math.floor(b.length/2);return b.length%2?b[i]:(b[i-1]+b[i])/2;};
const addDays=(d,n)=>{const date=new Date(d+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10);};
const hasHistory=c=>Boolean(c.history&&['cut','perm','color','care'].every(k=>Number.isInteger(c.history[k])&&c.history[k]>=0));
export const isCutOnly=c=>hasHistory(c)&&c.history.cut===c.visits&&c.history.cut>0&&c.history.perm===0&&c.history.color===0&&c.history.care===0;

export function estimatedCycle(customer,customers,settings){
  const cohort=customers.filter(c=>c.id!==customer.id&&c.service===customer.service&&c.visits>=2&&c.cycle>0&&c.cycle<=365);
  const groupMedian=median(cohort.map(c=>c.cycle));
  const service=settings.services.find(s=>s.id===customer.service)||settings.services[0];
  const prior=groupMedian??service.cycle;
  const observations=Math.max(0,customer.visits-1);
  const weight=customer.cycle>0?observations/(observations+3):0;
  const cycle=Math.max(1,Math.round(weight*(customer.cycle||prior)+(1-weight)*prior));
  return {cycle,ownCycle:customer.cycle||null,groupMedian,samples:cohort.length,weight,
    source:weight>0?'개인 이력 + 같은 시술 고객':groupMedian?'같은 시술 고객의 중앙값':'매장 설정 주기',
    evidence:weight>0&&observations>=3&&cohort.length>=5?'이력 충분':weight>0||cohort.length>=5?'이력 일부':'설정값 참고'};
}
function offer(s,service,desired){
  const base=economics(s,service);
  const discount=Math.max(0,Math.min(desired,Math.floor((base.cap+1e-8)/5)*5));
  const e=economics(s,service,{discount});
  return {discount,e,ready:discount>0&&e.safe&&e.benefitCost<=s.budget&&e.service.volume>0};
}
export function returnRecommendations(customers,s,config=AI_DEFAULTS,growthSettings={}){
  return customers.filter(c=>c.consent&&c.visits>0&&c.last).map(c=>{
    const estimation=estimatedCycle(c,customers,s);
    const next=addDays(c.last,estimation.cycle);
    const overdue=daysBetween(next,s.asOf);
    const multiplier=overdue/estimation.cycle;
    const desired=trialLevels({settings:s,growthSettings},c.service,multiplier>=1?'rescue':'normal').discount;
    const benefit=offer(s,c.service,desired);
    return {id:c.id,customer:c,kind:'return',segment:segmentFor(c,s),service:c.service,next,overdue,estimation,
      priority:Math.min(100,Math.round(40+multiplier*35+Math.min(c.visits,10)*2)),
      reason:`추정 근거는 ‘${estimation.source}’이며 방문 주기는 ${estimation.cycle}일입니다. 예상 재방문일 ${next}보다 ${overdue}일 늦어, 이전에 이용한 시술의 기간 한정 혜택을 제안합니다.`,
      ...benefit};
  }).filter(r=>r.overdue>=config.graceDays).sort((a,b)=>b.priority-a.priority||b.overdue-a.overdue);
}
function feature(c,s){
  const cycle=c.cycle||s.services.find(v=>v.id==='cut').cycle;
  // Features use cut history and timing; the perm label and total ticket are excluded.
  return [Math.min(c.history.cut,8)/8,Math.min(c.cutAvg||s.services.find(v=>v.id==='cut').price,80000)/80000,Math.min(cycle,120)/120];
}
export function crossSellRecommendations(customers,s,config=AI_DEFAULTS,growthSettings={}){
  const pool=customers.filter(c=>hasHistory(c)&&c.history.cut>0&&c.cycle>0&&c.cutAvg>0);
  const positives=pool.filter(c=>c.history.perm>0).length;
  const negatives=pool.length-positives;
  const modelReady=pool.length>=10&&positives>=3&&negatives>=3;
  const candidates=customers.filter(c=>c.consent&&isCutOnly(c)&&c.history.cut>=config.minCuts);
  const rows=candidates.map(c=>{
    const cycle=estimatedCycle(c,customers,s),daysSince=daysBetween(c.last,s.asOf);
    const x=feature(c,s);
    const peers=pool.filter(p=>p.id!==c.id).map(p=>{
      const y=feature(p,s);const distance=Math.sqrt(x.reduce((sum,val,i)=>sum+(val-y[i])**2,0));
      return {id:p.id,hasPerm:p.history.perm>0,cutCount:p.history.cut,cutAvg:p.cutAvg,cycle:p.cycle,distance,weight:1/(0.15+distance)};
    }).sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id)).slice(0,config.neighbors);
    const weighted=peers.length?peers.reduce((sum,p)=>sum+(p.hasPerm?p.weight:0),0)/peers.reduce((sum,p)=>sum+p.weight,0):0;
    const known=c.cycle>0&&c.cutAvg>0;
    const timing=daysSince<=cycle.cycle*1.5;
    const ready=modelReady&&known&&peers.length>=5&&timing&&weighted>=0.35;
    const benefit=offer(s,'perm',trialLevels({settings:s,growthSettings},'perm').discount);
    return {id:c.id,customer:c,kind:'cross',segment:segmentFor(c,s),service:'perm',peers,weighted,
      positivePeers:peers.filter(p=>p.hasPerm).length,estimation:cycle,daysSince,modelReady,known,timing,
      next:addDays(c.last,cycle.cycle),priority:Math.round(weighted*100),...benefit,
      ready:ready&&benefit.ready,
      reason:`커트만 ${c.history.cut}회 이용했습니다. 커트 횟수·커트 평균 결제액·방문 주기가 비슷한 고객 ${peers.length}명 중 ${peers.filter(p=>p.hasPerm).length}명에게 펌 이용 이력이 있습니다. 다음 스타일 상담 때 펌 관심을 확인할 고객으로 제안합니다.`,
      caution:!modelReady?'비교 가능한 고객과 펌 이용 이력이 더 필요합니다.':!known?'커트 평균 결제액과 개인 방문 주기가 필요합니다.':!timing?'재방문 안내를 먼저 검토할 고객입니다.':weighted<0.35?'유사 고객의 펌 이용 근거가 약해 상담 시 관심 확인을 먼저 권합니다.':!benefit.ready?'현재 비용 조건에서 할인 여력이 부족합니다.':''};
  }).sort((a,b)=>Number(b.ready)-Number(a.ready)||b.priority-a.priority||b.customer.history.cut-a.customer.history.cut);
  return {poolSize:pool.length,positives,negatives,modelReady,rows};
}
