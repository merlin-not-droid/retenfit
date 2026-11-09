export const clone = value => JSON.parse(JSON.stringify(value));
export const DEFAULTS = {
  salon: '온유 헤어', month: '2026-10', asOf: '2026-10-24',
  stylists: 2, stylistSalary: 2400000, assistants: 1, assistantSalary: 2000000,
  rent: 1500000, otherFixed: 700000, days: 26, hours: 8,
  fee: 3, commission: 0, targetProfit: 1500000, budget: 500000,
  loyaltyVisits: 5, dormantMultiple: 1.5,
  services: [
    {id:'cut', name:'커트', price:25000, material:2500, minutes:30, volume:160, competitor:28000, cycle:30},
    {id:'perm', name:'펌', price:100000, material:15000, minutes:90, volume:55, competitor:110000, cycle:90},
    {id:'color', name:'염색', price:85000, material:12000, minutes:90, volume:45, competitor:90000, cycle:45},
    {id:'care', name:'클리닉', price:60000, material:8000, minutes:60, volume:35, competitor:65000, cycle:45}
  ]
};
export const SEGMENTS = {
  new: {name:'첫 방문 예정', short:'첫 방문', color:'blue', description:'이용 완료 이력이 없는 신규 예정 고객'},
  loyal: {name:'단골 고객', short:'단골', color:'green', description:'최근 이용 중이며 누적 방문 횟수가 기준 이상인 고객'},
  dormant: {name:'재방문이 늦어진 고객', short:'재방문 지연', color:'orange', description:'선호 시술의 방문 주기 × 지연 기준을 넘긴 고객'},
  premium: {name:'고객 단가가 높은 고객', short:'고단가', color:'purple', description:'평균 결제액 8만 원 이상, 2회 이상 이용 고객'},
  regular: {name:'관계를 키울 고객', short:'일반', color:'gray', description:'첫 방문·재방문 지연·단골·고단가에 속하지 않는 고객'}
};
export function daysBetween(a,b){return Math.floor((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000);}
function dateBefore(date,n){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-n);return d.toISOString().slice(0,10);}
export function demoCustomers(asOf=DEFAULTS.asOf){
  const groups=[['new',24],['loyal',42],['dormant',31],['premium',19],['regular',32],['oneTime',62]];
  let seq=0;
  return groups.flatMap(([type,count])=>Array.from({length:count},(_,i)=>{
    seq++;
    const visits=type==='new'?0:type==='oneTime'?1:type==='loyal'?5+i%6:type==='regular'?1+i%3:2+i%3;
    const service=type==='loyal'?'perm':type==='dormant'?'color':type==='premium'?'color':'cut';
    const cutCount=type==='new'?0:type==='oneTime'?1:type==='loyal'?Math.min(visits-1,2+i%3):type==='regular'?visits:1;
    const history={cut:cutCount,perm:type==='loyal'?visits-cutCount:0,color:['dormant','premium'].includes(type)?visits-cutCount:0,care:0};
    return {id:'C'+String(seq).padStart(3,'0'),visits,last:visits?dateBefore(asOf,type==='oneTime'?70+i*3%160:type==='dormant'?100+i:5+i%22):'',
      avg:visits?(type==='oneTime'?25000+i%3*5000:type==='loyal'?85000+i%5*5000:type==='dormant'?60000+i%5*3000:type==='premium'?95000+i%5*6000:25000+i%5*5000):0,
      service,consent:seq%9!==0,history,
      cycle:visits?(type==='dormant'?40+i%4*7:type==='premium'?45+i%4*6:28+i%4*5):0,
      cutAvg:cutCount?25000+i%3*2000:0};
  }));
}
export function salonModel(s){
  const fixed=s.stylists*s.stylistSalary+s.assistants*s.assistantSalary+s.rent+s.otherFixed;
  const minutes=s.services.reduce((a,v)=>a+v.minutes*v.volume,0);
  const capacity=s.stylists*s.days*s.hours*60;
  const sales=s.services.reduce((a,v)=>a+v.price*v.volume,0);
  const material=s.services.reduce((a,v)=>a+v.material*v.volume,0);
  const rate=(s.fee+s.commission)/100;
  const valid=minutes>0 && capacity>0 && minutes<=capacity && rate>=0 && rate<1;
  return {fixed,minutes,capacity,sales,material,rate,valid,
    utilization:capacity?minutes/capacity:0,
    fixedPerMinute:minutes?fixed/minutes:Infinity,
    targetPerMinute:minutes?s.targetProfit/minutes:Infinity,
    profit:sales*(1-rate)-material-fixed,
    visits:s.services.reduce((a,v)=>a+v.volume,0)};
}
export function economics(s, serviceId, offer={}){
  const v=s.services.find(x=>x.id===serviceId);
  const m=salonModel(s);
  const discount=Number(offer.discount)||0, points=Number(offer.points)||0, gift=Number(offer.gift)||0;
  const coupon=Number(offer.coupon)||0, bonus=Number(offer.bonus)||0, charge=Number(offer.charge)||0;
  const walletReserve=charge*bonus/100;
  const paid=v.price*(1-discount/100)-coupon, fees=paid*m.rate, reserve=paid*points/100;
  const fixed=v.minutes*m.fixedPerMinute, target=v.minutes*m.targetPerMinute;
  const contribution=paid-fees-v.material-reserve-gift-walletReserve;
  const residual=contribution-fixed;
  const denom=v.price*(1-m.rate-points/100);
  const rawCap=denom>0?100*(1-(v.material+gift+walletReserve+fixed+target+coupon*(1-m.rate-points/100))/denom):-100;
  const benefitCost=(v.price-paid)*(1-m.rate)+reserve+gift+walletReserve;
  const safe=m.valid && discount>=0 && discount<=100 && points>=0 && points<=100 && gift>=0 && coupon>=0 && paid>=0 && bonus>=0 && bonus<=5 && charge>=0 && residual+0.001>=target;
  return {service:v,paid,fees,reserve,walletReserve,coupon,bonus,charge,fixed,target,contribution,residual,benefitCost,
    cap:Math.max(0,Math.min(100,rawCap)),rawCap,safe,valid:m.valid};
}
export function segmentFor(c,s){
  if(c.visits===0)return 'new';
  const svc=s.services.find(v=>v.id===c.service)||s.services[0];
  if(daysBetween(c.last,s.asOf)>=Math.ceil(svc.cycle*s.dormantMultiple))return 'dormant';
  if(c.visits>=s.loyaltyVisits)return 'loyal';
  if(c.visits>=2 && c.avg>=80000)return 'premium';
  return 'regular';
}
export function segmentCounts(customers,s){
  const out=Object.fromEntries(Object.keys(SEGMENTS).map(k=>[k,{all:0,eligible:0}]));
  customers.forEach(c=>{const k=segmentFor(c,s);out[k].all++;if(c.consent)out[k].eligible++;});
  return out;
}
export function recommendations(s,customers){
  const counts=segmentCounts(customers,s);
  const newService=s.services.find(v=>v.id==='cut');
  const initialRate=newService.competitor && newService.price>newService.competitor*1.05?10:5;
  const rows=[
    {id:'loyal',service:'perm',type:'discount',desired:15,title:'단골의 다음 펌을 응원합니다',reason:`${s.loyaltyVisits}회 이상 방문한 고객에게 익숙한 고관여 시술의 보상을 제안합니다.`,conditions:'1인 1회 · 다른 혜택과 중복 불가',expiry:30,tag:'관계 유지'},
    {id:'new',service:'cut',type:'discount',desired:initialRate,title:'첫 경험의 문턱을 낮춥니다',reason:'첫 방문은 가격 부담이 작은 커트부터 시작합니다. 주변 참고 가격과 우리 매장의 비용을 함께 반영합니다.',conditions:'첫 이용 완료 시 · 1인 1회',expiry:30,tag:'신규 유입'},
    {id:'dormant',service:'color',type:'discount',desired:10,title:'놓친 방문 주기를 다시 연결합니다',reason:'최근 방문일과 선호 시술 주기를 기준으로 재방문이 늦어진 고객에게 기간 한정 혜택을 제안합니다.',conditions:'평일 예약 한정 · 1인 1회',expiry:14,tag:'재방문'},
    {id:'premium',service:'color',type:'gift',desired:4500,giftName:'홈케어 미니 트리트먼트',giftRetail:15000,title:'가격보다 관리 경험을 더합니다',reason:'평균 결제액이 높은 고객에게 시술 후 관리에 필요한 제품을 제안합니다. 증정 비용은 판매가가 아닌 매입가로 계산합니다.',conditions:'제품 재고 소진 시 종료 · 1개 한정',expiry:30,tag:'관계 강화'},
    {id:'regular',service:'cut',type:'points',desired:3,title:'다음 방문에 쓸 작은 이유를 만듭니다',reason:'관계를 키울 고객에게 결제액의 일부를 적립합니다. 적립금을 전부 사용하는 경우를 가정해 비용을 미리 반영합니다.',conditions:'다음 방문 사용 · 당일 사용 불가',expiry:60,tag:'방문 습관'}
  ];
  return rows.map(r=>{
    if(r.id!=='new'){
      const preferences={};
      customers.filter(c=>c.consent&&segmentFor(c,s)===r.id).forEach(c=>{preferences[c.service]=(preferences[c.service]||0)+1;});
      const preferred=Object.entries(preferences).sort((a,b)=>b[1]-a[1])[0]?.[0];
      if(preferred)r.service=preferred;
      if(r.id==='loyal')r.title=`단골의 다음 ${s.services.find(v=>v.id===r.service).name}을 응원합니다`;
      r.reason+=` 대상 고객군의 선호 시술을 반영했습니다.`;
    }
    const base=economics(s,r.service);
    let discount=0,points=0,gift=0;
    if(r.type==='discount')discount=Math.max(0,Math.min(r.desired,Math.floor((base.cap+1e-8)/5)*5));
    if(r.type==='points'){
      const maxPoints=(base.residual-base.target)/base.service.price*100;
      points=Math.max(0,Math.min(r.desired,Math.floor(maxPoints+1e-8)));
    }
    if(r.type==='gift')gift=r.desired;
    const e=economics(s,r.service,{discount,points,gift});
    const meaningful=discount>0||points>0||gift>0;
    const maxByBudget=e.benefitCost>0?Math.floor(s.budget/e.benefitCost):0;
    const count=Math.max(0,Math.min(20,counts[r.id].eligible,e.service.volume,maxByBudget));
    const ready=e.safe&&meaningful&&count>0;
    return {...r,discount,points,gift,count,maxCount:Math.min(counts[r.id].eligible,e.service.volume),eligible:counts[r.id].eligible,total:counts[r.id].all,e,ready,
      blockedReason:!e.valid?'시술 수요·직원 가동시간을 확인해 주세요.':!e.safe||!meaningful?'현재 비용·목표이익 조건에서는 혜택을 줄 여력이 부족합니다.':counts[r.id].eligible===0?'연락 동의가 확인된 대상 고객이 없습니다.':count===0?'혜택 예산 또는 예상 시술 건수가 부족합니다.':''};
  });
}
export const planKey=p=>p.key||p.segment;
export function planAudience(p,customers,s){return customers.filter(c=>(p.execution==='counter'||c.consent)&&(!(p.type==='wallet')||!c.prepayDeclined)&&(Array.isArray(p.audienceIds)?p.audienceIds.includes(c.id):segmentFor(c,s)===p.segment));}
export function evaluatePlan(s,customers,plan,otherPlans=[]){
  const e=economics(s,plan.service,plan), m=salonModel(s), counts=segmentCounts(customers,s);
  const eligible=planAudience(plan,customers,s).length;
  const all=[...otherPlans.filter(p=>planKey(p)!==planKey(plan)&&(!p.month||p.month===s.month)),plan];
  const totalCost=all.reduce((sum,p)=>sum+economics(s,p.service,p).benefitCost*p.count,0);
  const serviceTotal=all.filter(p=>p.service===plan.service).reduce((a,p)=>a+p.count,0);
  const reasons=[];
  if(!e.valid)reasons.push('월 예상 시술시간이 직원 가동시간을 초과하거나 운영 정보가 부족합니다.');
  if(!e.safe)reasons.push('1회 시술 후 잔여이익이 배분된 목표이익보다 작습니다.');
  if(!Number.isInteger(plan.count)||plan.count<1)reasons.push('예상 사용 인원을 1명 이상으로 입력해 주세요.');
  if(plan.count>eligible)reasons.push(`${plan.execution==='counter'?'계산대에서 제안 가능한':'동의가 확인된'} 고객 ${eligible}명을 초과합니다.`);
  if(all.some(p=>p.type==='wallet')&&customers.reduce((n,c)=>n+(c.walletBalance||0),0)>m.sales*0.5)reasons.push('정액권 미사용 잔액이 월 예상 매출의 50%를 초과합니다. 새 정액권 권유를 멈추세요. 기존 정액권 선택안도 재검토해 주세요.');
  if(plan.type==='wallet'&&(!(plan.charge>0)||!(plan.bonus>0)))reasons.push('정액권 충전 금액과 보너스를 확인해 주세요.');
  if(m.minutes+all.reduce((n,p)=>n+(p.extraMinutes||0)*p.count,0)>m.capacity)reasons.push('증정 서비스 시간을 포함하면 직원 가동시간을 초과합니다.');
  if(serviceTotal>e.service.volume)reasons.push('저장할 안과 기존 안의 시술 건수가 월 예상 시술 건수를 넘습니다.');
  if(totalCost>s.budget+0.01)reasons.push('저장할 안과 기존 안의 총 혜택 비용이 월 예산을 초과합니다.');
  if(m.profit-totalCost<s.targetProfit-0.01)reasons.push('혜택 적용 후 월 예상이익이 월 목표이익보다 낮습니다.');
  if(!(plan.discount||plan.points||plan.gift||plan.coupon||(plan.charge&&plan.bonus)))reasons.push('제공할 혜택을 하나 이상 입력해 주세요.');
  const others=all.filter(p=>planKey(p)!==planKey(plan));
  if(others.some(p=>!economics(s,p.service,p).safe||p.count>planAudience(p,customers,s).length))reasons.push('기존 저장안 중 현재 비용·고객 기준에 맞지 않는 안이 있습니다. 먼저 수정하거나 삭제해 주세요.');
  const selectedIds=new Set(planAudience(plan,customers,s).slice(0,plan.count).map(c=>c.id));
  if(others.some(p=>planAudience(p,customers,s).slice(0,p.count).some(c=>selectedIds.has(c.id))))reasons.push('다른 저장안에 같은 고객이 포함되어 있습니다. 기존 안을 수정하거나 삭제해 중복 혜택을 정리해 주세요.');
  if(s.services.some(v=>all.filter(p=>p.service===v.id).reduce((n,p)=>n+p.count,0)>v.volume)&&serviceTotal<=e.service.volume)reasons.push('기존 저장안 중 월 예상 시술 건수를 초과하는 안이 있습니다.');
  return {e,m,totalCost,eligible,serviceTotal,monthlyProfit:m.profit-totalCost,reasons,ok:reasons.length===0};
}
export function parseCSV(text){
  text=text.replace(/^\uFEFF/,'');
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(ch===','&&!quoted){row.push(cell);cell='';}
    else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';}
    else cell+=ch;
  }
  if(quoted)throw new Error('닫히지 않은 따옴표가 있습니다. CSV 형식을 확인해 주세요.');
  row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
  if(rows.length<2)throw new Error('머리글과 고객 데이터가 최소 1행 필요합니다.');
  return {headers:rows[0].map(x=>x.trim()),rows:rows.slice(1)};
}
export const CSV_FIELDS=[
  ['id','고객 ID','customer_id'],['visits','누적 완료 방문 수','visit_count'],['last','최근 방문일','last_visit'],
  ['avg','평균 결제액','avg_spend'],['service','선호 시술','preferred_service'],['consent','마케팅 동의','marketing_consent']
];
export const CSV_AI_FIELDS=[['cut_count','커트 완료 횟수'],['perm_count','펌 완료 횟수'],['color_count','염색 완료 횟수'],['care_count','클리닉 완료 횟수'],['avg_cycle_days','개인 평균 방문 간격(일)'],['avg_cut_spend','커트 평균 결제액']];
export function importCustomers(parsed,mapping,s){
  const errors=[],out=[],ids=new Set();
  parsed.rows.forEach((row,i)=>{
    const get=k=>(row[Number(mapping[k])]??'').trim();
    const id=get('id'),visitText=get('visits'),avgText=get('avg');
    const visits=Number(visitText.replaceAll(',','')),avg=Number(avgText.replaceAll(',','')),last=get('last');
    const svc=s.services.find(v=>v.id===get('service')||v.name===get('service'));
    const consentText=get('consent').toLowerCase();
    const yes=['true','1','y','yes','동의','동의함'];
    const no=['false','0','n','no','미동의','미확인',''];
    let err='';
    if(!id)err='고객 ID가 비어 있습니다';
    else if(ids.has(id))err='고객 ID가 중복되었습니다';
    else if(!visitText||!Number.isInteger(visits)||visits<0)err='방문 수는 0 이상의 정수여야 합니다';
    else if(!avgText||!Number.isFinite(avg)||avg<0)err='평균 결제액은 0 이상의 숫자여야 합니다';
    else if(!svc)err='선호 시술을 커트·펌·염색·클리닉 중 하나로 입력하세요';
    else if(visits>0&&(!/^\d{4}-\d{2}-\d{2}$/.test(last)||!Number.isFinite(Date.parse(last))||new Date(last).toISOString().slice(0,10)!==last||daysBetween(last,s.asOf)<0))err='최근 방문일을 기준일 이전의 YYYY-MM-DD로 입력하세요';
    else if(!yes.includes(consentText)&&!no.includes(consentText))err='마케팅 동의는 true 또는 false로 입력하세요';
    const optional={};
    for(const [key,label] of CSV_AI_FIELDS){
      const index=parsed.headers.findIndex(h=>h===key||h===label);
      optional[key]=index>=0?(row[index]??'').trim():'';
    }
    let history=null,cycle=0,cutAvg=0;
    const historyKeys=['cut_count','perm_count','color_count','care_count'];
    if(historyKeys.some(k=>optional[k]!=='')){
      if(historyKeys.some(k=>optional[k]===''||!Number.isInteger(Number(optional[k]))||Number(optional[k])<0||Number(optional[k])>visits))err=err||'시술별 횟수 4개를 0 이상·누적 방문 수 이하의 정수로 모두 입력하세요';
      else history={cut:Number(optional.cut_count),perm:Number(optional.perm_count),color:Number(optional.color_count),care:Number(optional.care_count)};
    }
    if(optional.avg_cycle_days!==''){
      cycle=Number(optional.avg_cycle_days);
      if(!Number.isFinite(cycle)||cycle<0||cycle>365)err=err||'개인 평균 방문 간격은 0~365일의 숫자여야 합니다';
    }
    if(optional.avg_cut_spend!==''){
      cutAvg=Number(optional.avg_cut_spend.replaceAll(',',''));
      if(!Number.isFinite(cutAvg)||cutAvg<0)err=err||'커트 평균 결제액은 0 이상의 숫자여야 합니다';
    }
    if(err)errors.push(`${i+2}행: ${err}`);
    else {ids.add(id);out.push({id,visits,last:visits?last:'',avg:visits?avg:0,service:svc.id,consent:yes.includes(consentText),history,cycle,cutAvg});}
  });
  return {customers:out,errors};
}
