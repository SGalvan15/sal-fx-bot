// AXIOM Signal Analysis Engine v7.1
// @netlify-function timeout=26
// v7.1: +20 pure-TA strategies, style-aware timeframes, pure-TA override gate

const OANDA_KEY   = process.env.OANDA_API_KEY;
const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
const FRED_KEY    = process.env.FRED_API_KEY;
const ACCOUNT_ID  = process.env.OANDA_ACCOUNT_ID || '001-001-21201857-001';
const BASE        = 'https://api-trade.oanda.com/v3';

// ── DYNAMIC REGIMES ──────────────────────────────────────────────────────────
const REQUIRED_CURRENCIES = ['USD','EUR','GBP','JPY','AUD','CAD','CHF','NZD','NOK','SEK'];

function getRegimes() {
  if (!process.env.AXIOM_REGIMES) return null;
  try {
    const parsed = JSON.parse(process.env.AXIOM_REGIMES);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const missing = REQUIRED_CURRENCIES.filter(c => !parsed[c]);
    if (missing.length > 0) return { _error: `AXIOM_REGIMES missing: ${missing.join(', ')}` };
    return parsed;
  } catch(e) {
    return { _error: `AXIOM_REGIMES parse failed: ${e.message}` };
  }
}

// ── CB RATES — verified April 2026 ──────────────────────────────────────────
const CB_RATES = {
  USD: 3.75, EUR: 2.00, GBP: 4.50, JPY: 0.50,
  AUD: 4.10, CAD: 2.75, CHF: 0.25, NZD: 3.50,
  NOK: 4.50, SEK: 2.25,
};

// CB intervention veto levels
const CB_INTERVENTION_LEVELS = {
  'USD/JPY': { buyVeto: 155.0,  sellVeto: null   },
  'EUR/CHF': { buyVeto: null,   sellVeto: 0.9200 },
  'USD/CHF': { buyVeto: 0.9200, sellVeto: null   },
  'EUR/JPY': { buyVeto: 168.0,  sellVeto: null   },
};

// Strategy category sets
const MACRO_STRATS = new Set([
  'BOJ_NORM','CB_DIV','REAL_YLD','CB_COMM','GLOB_MAC','GRW_DIV','SAFE_HVN',
  'YIELD_SPR','ECO_SURP','BOP_FLOW','EARL_WRN','REGIME_SW','TOT_SHOCK','PPP_VAL'
]);
const TECHNICAL_STRATS = new Set([
  'STRUCT_BK','ICT_OB','STOP_HNT','LIQ_SWEEP','SESS_BRK','VOL_BRK','ADX_BRK',
  'LDN_BRK','FIBO_PULL','ICHIMOKU','KELTNER','SUPPLY_DEM','ENG_CAN','NEWS_DFT',
  'TSM_CTA','CS_MOM','MOMO_CRS','MON_PULL','TURT_TR','DUAL_THR','VWAP_REV',
  'BB_FADE','STOCH_RSI','RSIMR','ATR_FADE','GAMMA_EXP'
]);
// Pure-TA: can generate a signal without macro confirmation if 5+ fire
const PURE_TA_STRATS = new Set([
  'EMA_CROSS_55','PRICE_ACTION_PIN','INSIDE_BAR_BO','SR_BOUNCE','MACD_HIST_DIVERGENCE',
  'STOCH_SR_CONFLUENCE','CANDLE_REVERSAL_CLUSTER','TREND_PULLBACK_EMA55',
  'ENGULF_STRUCT','THREE_BAR_PLAY','OUTSIDE_BAR','HAMMER_STAR',
  'THREE_SOLDIERS_CROWS','MORNING_EVENING_STAR',
  'HEAD_SHOULDERS','DOUBLE_TOP_BOTTOM','MARKET_STRUCTURE','FLAG_PENNANT',
  'RANGE_BREAKOUT','TREND_CONTINUATION_BREAK'
]);

// ── INDICATOR MATH ───────────────────────────────────────────────────────────

function ema(data, period) {
  const k = 2 / (period + 1);
  let r = [data[0]];
  for (let i = 1; i < data.length; i++) r.push(data[i] * k + r[i-1] * (1-k));
  return r;
}

function sma(data, period) {
  return data.map((_, i) => i < period-1 ? null : data.slice(i-period+1, i+1).reduce((a,b)=>a+b)/period);
}

function rsi(closes, period = 14) {
  let gains = [], losses = [];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i-1];
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? Math.abs(d) : 0);
  }
  const result = new Array(period).fill(null);
  let ag = gains.slice(0,period).reduce((a,b)=>a+b)/period;
  let al = losses.slice(0,period).reduce((a,b)=>a+b)/period;
  result.push(100 - 100/(1+(al===0?999:ag/al)));
  for (let i = period; i < gains.length; i++) {
    ag = (ag*(period-1)+gains[i])/period;
    al = (al*(period-1)+losses[i])/period;
    result.push(100 - 100/(1+(al===0?999:ag/al)));
  }
  return result;
}

function atr(candles, period = 14) {
  const tr = candles.map((c,i) => {
    if (i===0) return c.h-c.l;
    const p = candles[i-1];
    return Math.max(c.h-c.l, Math.abs(c.h-p.c), Math.abs(c.l-p.c));
  });
  const result = new Array(period-1).fill(null);
  let v = tr.slice(0,period).reduce((a,b)=>a+b)/period;
  result.push(v);
  for (let i = period; i < tr.length; i++) { v=(v*(period-1)+tr[i])/period; result.push(v); }
  return result;
}

function macd(closes, fast=12, slow=26, signal=9) {
  const ef = ema(closes,fast), es = ema(closes,slow);
  const ml = ef.map((v,i)=>v-es[i]);
  const sl = ema(ml.slice(slow-1),signal);
  const ps = new Array(slow-1).fill(null).concat(sl);
  return { macd: ml, signal: ps, histogram: ml.map((v,i)=>ps[i]!==null?v-ps[i]:null) };
}

function bollingerBands(closes, period=20, stdDev=2) {
  const mid = sma(closes, period);
  return closes.map((_,i) => {
    if (mid[i]===null) return {upper:null,middle:null,lower:null,width:0};
    const sl = closes.slice(Math.max(0,i-period+1),i+1);
    const std = Math.sqrt(sl.reduce((s,v)=>s+Math.pow(v-mid[i],2),0)/sl.length);
    return {upper:mid[i]+stdDev*std, middle:mid[i], lower:mid[i]-stdDev*std, width:(2*stdDev*std)/mid[i]};
  });
}

function adx(candles, period=14) {
  const tr = candles.map((c,i) => {
    if (i===0) return {tr:c.h-c.l,pDM:0,mDM:0};
    const p=candles[i-1];
    const t=Math.max(c.h-c.l,Math.abs(c.h-p.c),Math.abs(c.l-p.c));
    const pDM=c.h-p.h>p.l-c.l?Math.max(c.h-p.h,0):0;
    const mDM=p.l-c.l>c.h-p.h?Math.max(p.l-c.l,0):0;
    return {tr:t,pDM,mDM};
  });
  let sTR=tr.slice(0,period).reduce((a,b)=>a+b.tr,0);
  let sP=tr.slice(0,period).reduce((a,b)=>a+b.pDM,0);
  let sM=tr.slice(0,period).reduce((a,b)=>a+b.mDM,0);
  const res = new Array(period).fill(null);
  let adxVal=null;
  for (let i=period; i<tr.length; i++) {
    sTR=sTR-sTR/period+tr[i].tr; sP=sP-sP/period+tr[i].pDM; sM=sM-sM/period+tr[i].mDM;
    const pDI=sTR===0?0:100*sP/sTR, mDI=sTR===0?0:100*sM/sTR;
    const dx=(pDI+mDI)===0?0:100*Math.abs(pDI-mDI)/(pDI+mDI);
    adxVal=adxVal===null?dx:(adxVal*(period-1)+dx)/period;
    res.push({adx:adxVal,plusDI:pDI,minusDI:mDI});
  }
  return res;
}

function swingLevels(candles, lb=10) {
  const highs=[], lows=[];
  for (let i=lb; i<candles.length-lb; i++) {
    const w=candles.slice(i-lb,i+lb+1);
    if (candles[i].h===Math.max(...w.map(c=>c.h))) highs.push({price:candles[i].h,idx:i});
    if (candles[i].l===Math.min(...w.map(c=>c.l))) lows.push({price:candles[i].l,idx:i});
  }
  return {highs:highs.slice(-8), lows:lows.slice(-8)};
}

function ichimoku(candles) {
  return candles.map((_,i) => {
    const span=(n)=>i>=n-1?{h:Math.max(...candles.slice(i-n+1,i+1).map(c=>c.h)),l:Math.min(...candles.slice(i-n+1,i+1).map(c=>c.l))}:null;
    const t9=span(9),t26=span(26),t52=span(52);
    const tenkan=t9?(t9.h+t9.l)/2:null;
    const kijun=t26?(t26.h+t26.l)/2:null;
    const senkouA=tenkan&&kijun?(tenkan+kijun)/2:null;
    const senkouB=t52?(t52.h+t52.l)/2:null;
    return {tenkan,kijun,senkouA,senkouB};
  });
}

function keltnerChannels(candles, ep=20, am=1.5) {
  const cl=candles.map(c=>c.c), el=ema(cl,ep), al=atr(candles,ep);
  return candles.map((_,i)=>({upper:el[i]+am*(al[i]||0),middle:el[i],lower:el[i]-am*(al[i]||0)}));
}

function stochasticRSI(closes, rp=14, sp=14, kp=3, dp=3) {
  const rv=rsi(closes,rp).filter(v=>v!==null);
  const sk=rv.map((_,i)=>{
    if(i<sp-1)return null;
    const sl=rv.slice(i-sp+1,i+1);
    const mn=Math.min(...sl),mx=Math.max(...sl);
    return mx===mn?0:(rv[i]-mn)/(mx-mn)*100;
  }).filter(v=>v!==null);
  const ks=sma(sk,kp).filter(v=>v!==null);
  const ds=sma(ks,dp).filter(v=>v!==null);
  return {k:ks[ks.length-1],d:ds[ds.length-1],prevK:ks[ks.length-2],prevD:ds[ds.length-2]};
}

function slowStochastic(candles, kPeriod=14, dPeriod=3) {
  if (candles.length < kPeriod) return {k:50,d:50,prevK:50,prevD:50};
  const rawK = candles.map((_,i) => {
    if (i < kPeriod-1) return null;
    const slice = candles.slice(i-kPeriod+1, i+1);
    const high = Math.max(...slice.map(c=>c.h));
    const low  = Math.min(...slice.map(c=>c.l));
    return high===low ? 50 : (candles[i].c - low) / (high - low) * 100;
  });
  const validK = rawK.filter(v=>v!==null);
  const smoothK = validK.map((_,i) => {
    if (i < dPeriod-1) return null;
    return validK.slice(i-dPeriod+1,i+1).reduce((a,b)=>a+b,0)/dPeriod;
  }).filter(v=>v!==null);
  const smoothD = smoothK.map((_,i) => {
    if (i < dPeriod-1) return null;
    return smoothK.slice(i-dPeriod+1,i+1).reduce((a,b)=>a+b,0)/dPeriod;
  }).filter(v=>v!==null);
  const n=smoothK.length, m=smoothD.length;
  return {k:n>0?smoothK[n-1]:50,d:m>0?smoothD[m-1]:50,prevK:n>1?smoothK[n-2]:50,prevD:m>1?smoothD[m-2]:50};
}

function detectEngulfing(candles) {
  if (candles.length<2) return null;
  const p=candles[candles.length-2], c=candles[candles.length-1];
  if (p.c<p.o && c.c>c.o && c.o<p.c && c.c>p.o) return 'BULLISH';
  if (p.c>p.o && c.c<c.o && c.o>p.c && c.c<p.o) return 'BEARISH';
  return null;
}

function detectOrderBlock(candles, dir) {
  const rc=candles.slice(-10);
  for (let i=rc.length-3; i>=1; i--) {
    const c=rc[i];
    if (dir==='BUY' && c.c<c.o && rc.slice(i+1).every(x=>x.c>c.h)) return {ob_high:c.h,ob_low:c.l};
    if (dir==='SELL'&& c.c>c.o && rc.slice(i+1).every(x=>x.c<c.l)) return {ob_high:c.h,ob_low:c.l};
  }
  return null;
}

function calcVWAP(candles) {
  let tv=0,vol=0;
  return candles.map(c=>{const tp=(c.h+c.l+c.c)/3;tv+=tp*(c.v||1);vol+=(c.v||1);return tv/vol;});
}

// ── PURE-TA PATTERN DETECTORS ────────────────────────────────────────────────

function detectStarPattern(candles) {
  if (candles.length < 3) return null;
  const [c1,c2,c3] = candles.slice(-3);
  const body1=Math.abs(c1.c-c1.o),body2=Math.abs(c2.c-c2.o),body3=Math.abs(c3.c-c3.o);
  if (c1.c<c1.o&&body2<body1*0.4&&c3.c>c3.o&&c3.c>c1.o+(c1.c-c1.o)*0.5&&body3>body1*0.5) return 'MORNING_STAR';
  if (c1.c>c1.o&&body2<body1*0.4&&c3.c<c3.o&&c3.c<c1.o-(c1.o-c1.c)*0.5&&body3>body1*0.5) return 'EVENING_STAR';
  return null;
}

function detectThreeSoldiersCrows(candles) {
  if (candles.length < 3) return null;
  const [c1,c2,c3] = candles.slice(-3);
  const body=(c)=>Math.abs(c.c-c.o), range=(c)=>c.h-c.l||0.00001;
  if (c1.c>c1.o&&c2.c>c2.o&&c3.c>c3.o&&c2.o>c1.o&&c2.o<c1.c&&c3.o>c2.o&&c3.o<c2.c&&body(c1)/range(c1)>0.6&&body(c2)/range(c2)>0.6&&body(c3)/range(c3)>0.6) return 'THREE_WHITE_SOLDIERS';
  if (c1.c<c1.o&&c2.c<c2.o&&c3.c<c3.o&&c2.o<c1.o&&c2.o>c1.c&&c3.o<c2.o&&c3.o>c2.c&&body(c1)/range(c1)>0.6&&body(c2)/range(c2)>0.6&&body(c3)/range(c3)>0.6) return 'THREE_BLACK_CROWS';
  return null;
}

function detectShadowCandle(candles) {
  if (candles.length < 1) return null;
  const c=candles[candles.length-1];
  const body=Math.abs(c.c-c.o), range=c.h-c.l;
  if (range < 0.00005) return null;
  const upperWick=c.h-Math.max(c.o,c.c), lowerWick=Math.min(c.o,c.c)-c.l;
  if (lowerWick>=body*2.5&&upperWick<=body*0.5) return 'HAMMER';
  if (upperWick>=body*2.5&&lowerWick<=body*0.5) return 'SHOOTING_STAR';
  return null;
}

function detectThreeBarPlay(candles) {
  if (candles.length < 3) return null;
  const [c1,c2,c3]=candles.slice(-3);
  const range1=c1.h-c1.l, range2=c2.h-c2.l;
  const narrow=c2.h<=c1.h&&c2.l>=c1.l&&range2<=range1*0.6;
  if (!narrow) return null;
  if (c1.c>c1.o&&c3.c>c1.h) return 'BULLISH_3BAR';
  if (c1.c<c1.o&&c3.c<c1.l) return 'BEARISH_3BAR';
  return null;
}

function detectOutsideBar(candles) {
  if (candles.length < 2) return null;
  const p=candles[candles.length-2], c=candles[candles.length-1];
  if (c.h>p.h&&c.l<p.l) { const mid=(p.h+p.l)/2; return c.c>mid?'BULLISH_OUTSIDE':'BEARISH_OUTSIDE'; }
  return null;
}

function detectInsideBar(candles) {
  if (candles.length < 2) return null;
  const mother=candles[candles.length-2], inside=candles[candles.length-1];
  return inside.h<=mother.h&&inside.l>=mother.l?{motherHigh:mother.h,motherLow:mother.l}:null;
}

function detectHeadShoulders(swingHighs, swingLows, cp, isBuy) {
  if (!isBuy&&swingHighs.length>=3) {
    const [ls,head,rs]=swingHighs.slice(-3);
    const shoulderAvg=(ls.price+rs.price)/2;
    if (head.price>ls.price&&head.price>rs.price&&Math.abs(ls.price-rs.price)/head.price<0.015&&cp<shoulderAvg*0.999)
      return{met:true,desc:`H&S neckline break ${shoulderAvg.toFixed(5)}`};
  }
  if (isBuy&&swingLows.length>=3) {
    const [ls,head,rs]=swingLows.slice(-3);
    const neckline=(ls.price+rs.price)/2;
    if (head.price<ls.price&&head.price<rs.price&&Math.abs(ls.price-rs.price)/head.price<0.015&&cp>neckline*1.001)
      return{met:true,desc:`Inv H&S neckline break ${neckline.toFixed(5)}`};
  }
  return{met:false,desc:'No H&S pattern'};
}

function detectDoubleTopBottom(swingHighs, swingLows, cp, isBuy) {
  if (isBuy&&swingLows.length>=2) {
    const [b1,b2]=swingLows.slice(-2);
    const tol=Math.abs(b1.price-b2.price)/((b1.price+b2.price)/2);
    if (tol<0.003&&b2.idx>b1.idx) {
      const neckline=Math.max(...swingHighs.filter(h=>h.idx>b1.idx&&h.idx<b2.idx).map(h=>h.price),cp);
      if (cp>neckline*1.001) return{met:true,desc:`Double bottom break ${neckline.toFixed(5)}`};
    }
  }
  if (!isBuy&&swingHighs.length>=2) {
    const [t1,t2]=swingHighs.slice(-2);
    const tol=Math.abs(t1.price-t2.price)/((t1.price+t2.price)/2);
    if (tol<0.003&&t2.idx>t1.idx) {
      const neckline=Math.min(...swingLows.filter(l=>l.idx>t1.idx&&l.idx<t2.idx).map(l=>l.price),cp);
      if (cp<neckline*0.999) return{met:true,desc:`Double top break ${neckline.toFixed(5)}`};
    }
  }
  return{met:false,desc:'No double top/bottom'};
}

function detectMarketStructure(swingHighs, swingLows, cp, isBuy) {
  if (swingHighs.length>=2&&swingLows.length>=2) {
    const [ph1,ph2]=swingHighs.slice(-2), [pl1,pl2]=swingLows.slice(-2);
    const hhhl=ph2.price>ph1.price&&pl2.price>pl1.price;
    const lhll=ph2.price<ph1.price&&pl2.price<pl1.price;
    const bullishMSB=lhll&&cp>ph2.price*1.001;
    const bearishMSB=hhhl&&cp<pl2.price*0.999;
    if (isBuy&&(hhhl||bullishMSB)) return{met:true,score:bullishMSB?3:2,desc:bullishMSB?'Bullish MSB':'HH/HL uptrend'};
    if (!isBuy&&(lhll||bearishMSB)) return{met:true,score:bearishMSB?3:2,desc:bearishMSB?'Bearish MSB':'LH/LL downtrend'};
  }
  return{met:false,score:0,desc:'No clear structure'};
}

function detectFlagPennant(candles, currentAtr) {
  if (candles.length<15||currentAtr<=0) return null;
  const recent=candles.slice(-15);
  const impulseWindow=recent.slice(0,5);
  const impulseMove=Math.abs(impulseWindow[impulseWindow.length-1].c-impulseWindow[0].o);
  if (impulseMove<currentAtr*2.5) return null;
  const impulseDir=impulseWindow[impulseWindow.length-1].c>impulseWindow[0].o?1:-1;
  const consol=recent.slice(-7);
  const consolHigh=Math.max(...consol.map(c=>c.h));
  const consolLow=Math.min(...consol.map(c=>c.l));
  const consolRange=consolHigh-consolLow;
  if (consolRange>impulseMove*0.45) return null;
  const consolAtr=consol.slice(0,-1).reduce((a,c)=>a+(c.h-c.l),0)/Math.max(1,consol.length-1);
  const bk=candles[candles.length-1];
  const exp=(bk.h-bk.l)>consolAtr*1.2;
  if (impulseDir===1&&bk.c>consolHigh*0.999&&exp) return 'BULL_FLAG';
  if (impulseDir===-1&&bk.c<consolLow*1.001&&exp) return 'BEAR_FLAG';
  return null;
}

// ── DATA FETCHERS ────────────────────────────────────────────────────────────

async function fetchCandles(instrument, granularity, count=200) {
  const url=`${BASE}/instruments/${instrument}/candles?count=${count}&granularity=${granularity}&price=M`;
  const res=await fetch(url,{headers:{'Authorization':`Bearer ${OANDA_KEY}`},signal:AbortSignal.timeout(12000)});
  if (!res.ok) throw new Error(`Candle fetch failed ${res.status} for ${instrument} ${granularity}`);
  const data=await res.json();
  return (data.candles||[]).filter(c=>c.complete).map(c=>({
    t:c.time,o:parseFloat(c.mid.o),h:parseFloat(c.mid.h),l:parseFloat(c.mid.l),c:parseFloat(c.mid.c),v:c.volume||0
  }));
}

async function fetchLivePrice(instrument) {
  const url=`${BASE}/accounts/${ACCOUNT_ID}/pricing?instruments=${instrument}`;
  const res=await fetch(url,{headers:{'Authorization':`Bearer ${OANDA_KEY}`},signal:AbortSignal.timeout(6000)});
  if (!res.ok) throw new Error(`Price fetch failed for ${instrument}`);
  const data=await res.json();
  const price=data.prices?.[0];
  if (!price) throw new Error(`No price data for ${instrument}`);
  const bid=parseFloat(price.bids[0].price), ask=parseFloat(price.asks[0].price);
  return {bid,ask,mid:(bid+ask)/2,spread:ask-bid};
}

// ── FINNHUB ECONOMIC CALENDAR ────────────────────────────────────────────────
let _ecoCache=null, _ecoCacheTime=0;

async function fetchEconomicReleases() {
  if (_ecoCache&&Date.now()-_ecoCacheTime<600000) return _ecoCache;
  if (!FINNHUB_KEY) throw new Error('FINNHUB_API_KEY not configured');
  try {
    const now=new Date(), from=new Date(now), to=new Date(now);
    from.setDate(from.getDate()-7); to.setDate(to.getDate()+1);
    const fmt=d=>d.toISOString().slice(0,10);
    const res=await fetch(`https://finnhub.io/api/v1/calendar/economic?from=${fmt(from)}&to=${fmt(to)}&token=${FINNHUB_KEY}`,{signal:AbortSignal.timeout(8000)});
    if (!res.ok) throw new Error('Finnhub calendar '+res.status);
    const data=await res.json();
    const events=data.economicCalendar||[];
    const cutoff=Date.now()-4*3600*1000;
    const surprises={}, history={};
    events.filter(e=>e.actual&&e.estimate&&e.country).forEach(e=>{
      const ccy=countryToCcy(e.country); if (!ccy) return;
      const actual=parseFloat(e.actual), est=parseFloat(e.estimate);
      if (isNaN(actual)||isNaN(est)) return;
      const rel=est!==0?(actual-est)/Math.abs(est):(actual-est>0?1:-1);
      if (!history[ccy]) history[ccy]=[];
      history[ccy].push(rel);
      if (e.impact==='high') {
        const t=new Date(e.time||e.date).getTime();
        if (t>=cutoff) { if (!surprises[ccy]) surprises[ccy]=[]; surprises[ccy].push({surprise:rel,event:e.event,time:t}); }
      }
    });
    const ecoSurpIndex={};
    for (const [c,h] of Object.entries(history)) { const l=h.slice(-8); ecoSurpIndex[c]=l.reduce((a,b)=>a+b,0)/l.length; }
    const recent=events.filter(e=>{
      if (!e.actual||!e.estimate) return false;
      const t=new Date(e.time||e.date).getTime();
      return t>=cutoff&&t<=Date.now()&&e.impact==='high';
    });
    _ecoCache={recent,surprises,ecoSurpIndex}; _ecoCacheTime=Date.now(); return _ecoCache;
  } catch(e) { throw new Error(`Finnhub eco calendar: ${e.message}`); }
}

function countryToCcy(c) {
  return {'United States':'USD','Euro Zone':'EUR','Germany':'EUR','France':'EUR','Italy':'EUR','Spain':'EUR',
    'United Kingdom':'GBP','Japan':'JPY','Australia':'AUD','Canada':'CAD','Switzerland':'CHF',
    'New Zealand':'NZD','Norway':'NOK','Sweden':'SEK'}[c]||null;
}

// ── FRED YIELD SPREADS ───────────────────────────────────────────────────────
const FRED_SERIES={'USD':'DGS10','JPY':'IRLTLT01JPM156N','EUR':'IRLTLT01DEM156N','GBP':'IRLTLT01GBM156N','AUD':'IRLTLT01AUM156N','CAD':'IRLTLT01CAM156N','CHF':'IRLTLT01CHM156N','NZD':'IRLTLT01NZM156N'};
let _yieldCache=null, _yieldCacheTime=0;

async function fetchYieldSpreads() {
  if (_yieldCache&&Date.now()-_yieldCacheTime<3600000) return _yieldCache;
  if (!FRED_KEY) throw new Error('FRED_API_KEY not configured');
  try {
    const now=new Date(), from=new Date(now); from.setDate(from.getDate()-30);
    const fmt=d=>d.toISOString().slice(0,10);
    const yields={};
    await Promise.allSettled(Object.entries(FRED_SERIES).map(async([ccy,series])=>{
      try {
        const url=`https://api.stlouisfed.org/fred/series/observations?series_id=${series}&api_key=${FRED_KEY}&file_type=json&observation_start=${fmt(from)}&sort_order=desc&limit=5`;
        const res=await fetch(url,{signal:AbortSignal.timeout(6000)});
        if (!res.ok) return;
        const data=await res.json();
        const obs=(data.observations||[]).filter(o=>o.value!=='.'&&o.value!=='');
        if (obs.length>=2) yields[ccy]={current:parseFloat(obs[0].value),prev:parseFloat(obs[1].value),momentum:parseFloat(obs[0].value)-parseFloat(obs[Math.min(4,obs.length-1)].value)};
      } catch(_){}
    }));
    _yieldCache=yields; _yieldCacheTime=Date.now(); return yields;
  } catch(e) { throw new Error(`FRED yield spreads: ${e.message}`); }
}

// ── SESSION LOGIC ────────────────────────────────────────────────────────────

function getActiveSession() {
  const h=new Date().getUTCHours();
  const s={SYDNEY:{s:21,e:6},TOKYO:{s:23,e:8},LONDON:{s:7,e:16},NEW_YORK:{s:12,e:21}};
  return Object.entries(s).filter(([,v])=>v.s<v.e?h>=v.s&&h<v.e:h>=v.s||h<v.e).map(([k])=>k);
}

function sessionSuitsPair(pair, active) {
  const base=pair.split('/')[0];
  const map={JPY:['TOKYO','LONDON'],AUD:['SYDNEY','TOKYO'],NZD:['SYDNEY','TOKYO'],EUR:['LONDON','NEW_YORK'],GBP:['LONDON','NEW_YORK'],CHF:['LONDON','NEW_YORK'],USD:['LONDON','NEW_YORK'],CAD:['NEW_YORK'],NOK:['LONDON'],SEK:['LONDON']};
  return (map[base]||['LONDON','NEW_YORK']).some(s=>active.includes(s));
}

function regimeForPair(pair, REGIMES) {
  const [b,q]=pair.split('/');
  const br=REGIMES[b], qr=REGIMES[q];
  if (!br||!qr) return 'NEUTRAL';
  if (br.dir==='BULLISH'&&qr.dir==='BEARISH') return 'STRONG_BUY';
  if (br.dir==='BULLISH'&&qr.dir==='NEUTRAL') return 'MILD_BUY';
  if (br.dir==='NEUTRAL'&&qr.dir==='BEARISH') return 'MILD_BUY';
  if (br.dir==='BEARISH'&&qr.dir==='BULLISH') return 'STRONG_SELL';
  if (br.dir==='BEARISH'&&qr.dir==='NEUTRAL') return 'MILD_SELL';
  if (br.dir==='NEUTRAL'&&qr.dir==='BULLISH') return 'MILD_SELL';
  return 'NEUTRAL';
}

function carryAnalysis(pair) {
  const [b,q]=pair.split('/');
  const diff=(CB_RATES[b]||0)-(CB_RATES[q]||0);
  return {diff,favors:diff>0.5?'BUY':diff<-0.5?'SELL':'NEUTRAL',strong:Math.abs(diff)>1.5};
}

// ── MAIN SIGNAL ENGINE ───────────────────────────────────────────────────────

async function analyzeSignal(pair, enabledStratIds, ecoData, yields, REGIMES, tradeStyle) {
  tradeStyle = tradeStyle||'day';
  const inst=pair.replace('/','_'), isJPY=pair.includes('JPY'), pipMult=isJPY?100:10000;
  const isScalp=tradeStyle==='scalp', isSwing=tradeStyle==='swing';

  const [candlesH4,candlesH1,candlesD1,livePrice]=await Promise.all([
    fetchCandles(inst,'H4',200),fetchCandles(inst,'H1',200),fetchCandles(inst,'D',100),fetchLivePrice(inst)
  ]);
  if (!candlesH4.length||!candlesH1.length) return{signal:null,reason:'Insufficient candle data'};

  // Style-aware primary candles
  const primaryCandles=isScalp?candlesH1:isSwing?candlesD1:candlesH4;
  const clP=primaryCandles.map(c=>c.c);
  const cl4=candlesH4.map(c=>c.c), cl1=candlesH1.map(c=>c.c), cld=candlesD1.map(c=>c.c);
  const cp=livePrice.mid;

  // ── INDICATORS ────────────────────────────────────────────────────────────
  const e20h4=ema(cl4,20),e50h4=ema(cl4,50),e200h4=ema(cl4,200);
  const e55p=ema(clP,55), e200p=ema(clP,200);
  const e20h1=ema(cl1,20),e50h1=ema(cl1,50),e200h1=ema(cl1,200);
  const e200d1=ema(cld,200);
  const rs4=rsi(cl4,14),rs1=rsi(cl1,14),rsd=rsi(cld,14),rsP=rsi(clP,14);
  const at4=atr(candlesH4,14),at1=atr(candlesH1,14),atd=atr(candlesD1,14),atP=atr(primaryCandles,14);
  const mc4=macd(cl4),mcP=macd(clP);
  const bb4=bollingerBands(cl4,20,2);
  const ax4=adx(candlesH4,14).filter(v=>v!==null);
  const ic4=ichimoku(candlesH4);
  const kt4=keltnerChannels(candlesH4,20,1.5);
  const st4=stochasticRSI(cl4),st1=stochasticRSI(cl1);
  const slStochP=slowStochastic(primaryCandles,14,3);
  const sw4=swingLevels(candlesH4,5),swd=swingLevels(candlesD1,3);
  const swP=swingLevels(primaryCandles,isScalp?3:isSwing?3:5);
  const vw1=calcVWAP(candlesH1);
  const eg4=detectEngulfing(candlesH4),eg1=detectEngulfing(candlesH1),egP=detectEngulfing(primaryCandles);
  const bob=detectOrderBlock(candlesH4,'BUY'),bos=detectOrderBlock(candlesH4,'SELL');
  // Pattern detection on primary TF
  const starPat=detectStarPattern(primaryCandles);
  const soldCrow=detectThreeSoldiersCrows(primaryCandles);
  const shadowP=detectShadowCandle(primaryCandles);
  const tbrPlay=detectThreeBarPlay(primaryCandles);
  const outsideB=detectOutsideBar(primaryCandles);
  const insideB=detectInsideBar(primaryCandles);
  const flagPat=detectFlagPennant(primaryCandles,atP[atP.length-1]||0.001);
  const chartSwingH=isScalp?sw4.highs:swd.highs;
  const chartSwingL=isScalp?sw4.lows:swd.lows;

  // ── CURRENT VALUES ────────────────────────────────────────────────────────
  const ce20h4=e20h4[e20h4.length-1],pe20h4=e20h4[e20h4.length-2];
  const ce50h4=e50h4[e50h4.length-1],pe50h4=e50h4[e50h4.length-2];
  const ce200h4=e200h4[e200h4.length-1],ce200h1=e200h1[e200h1.length-1],ce200d1=e200d1[e200d1.length-1];
  const ce55p=e55p[e55p.length-1],pe55p=e55p[e55p.length-2]||ce55p;
  const ce200p=e200p[e200p.length-1];
  const crs4=rs4[rs4.length-1],prs4=rs4[rs4.length-2],crs1=rs1[rs1.length-1],crsd=rsd[rsd.length-1];
  const crsP=rsP[rsP.length-1]||50, prsP=rsP[rsP.length-2]||50;
  const cat4=at4[at4.length-1],avgat4=at4.slice(-20).reduce((a,b)=>a+b,0)/20;
  const catP=atP[atP.length-1]||cat4;
  const avgAtP_arr=atP.slice(-20).filter(Boolean); const avgAtP=avgAtP_arr.length?avgAtP_arr.reduce((a,b)=>a+b,0)/avgAtP_arr.length:cat4;
  const cmc4=mc4.macd[mc4.macd.length-1],cms4=mc4.signal[mc4.signal.length-1];
  const pmc4=mc4.macd[mc4.macd.length-2],pms4=mc4.signal[mc4.signal.length-2];
  const cmcP=mcP.macd[mcP.macd.length-1],cmsP=mcP.signal[mcP.signal.length-1];
  const pmcP=mcP.macd[mcP.macd.length-2],pmsP=mcP.signal[mcP.signal.length-2];
  const mcHistP=mcP.histogram;
  const cbb4=bb4[bb4.length-1],cax4=ax4[ax4.length-1],cic4=ic4[ic4.length-1];
  const ckt4=keltnerChannels(candlesH4,20,1.5)[candlesH4.length-1];
  const cvw1=vw1[vw1.length-1];

  // ── BOOLEANS ──────────────────────────────────────────────────────────────
  const ae200h4=cp>ce200h4,ae200h1=cp>ce200h1,ae200d1=cp>ce200d1;
  const ae200p=cp>ce200p, ae55p=cp>ce55p;
  const e20ae50h4=ce20h4>ce50h4;
  const gcross=ce20h4>ce50h4&&pe20h4<=pe50h4, dcross=ce20h4<ce50h4&&pe20h4>=pe50h4;

  // EMA55/200 cross within last 20 candles on primary TF
  let ema55CrossRecent=false, ema55CrossDir=null;
  for(let i=Math.max(1,e55p.length-20);i<e55p.length;i++){
    if(e55p[i-1]<=e200p[i-1]&&e55p[i]>e200p[i]){ema55CrossRecent=true;ema55CrossDir='BULLISH';break;}
    if(e55p[i-1]>=e200p[i-1]&&e55p[i]<e200p[i]){ema55CrossRecent=true;ema55CrossDir='BEARISH';break;}
  }

  const rso4=crs4<40,rsob4=crs4>60;
  const mbull=cmc4>cms4,mbear=cmc4<cms4;
  const mbullx=cmc4>cms4&&pmc4<=pms4, mbearx=cmc4<cms4&&pmc4>=pms4;
  const adxt=cax4&&cax4.adx>20,adxs=cax4&&cax4.adx>30;
  const volp=cat4>avgat4*0.7;
  const volExpand=catP>avgAtP*1.2;
  const bbsq=cbb4&&cbb4.width<0.008,abm4=cbb4&&cp>cbb4.middle;
  const nbu4=cbb4&&cp>cbb4.upper*0.998,nbl4=cbb4&&cp<cbb4.lower*1.002;
  const ksq=ckt4&&cbb4&&cbb4.upper<ckt4.upper&&cbb4.lower>ckt4.lower;
  const allR=[...sw4.highs,...swd.highs].map(s=>s.price).filter(p=>p>cp);
  const allS=[...sw4.lows,...swd.lows].map(s=>s.price).filter(p=>p<cp);
  const nR=allR.length?Math.min(...allR):cp*1.005,nS=allS.length?Math.max(...allS):cp*0.995;
  const dR=(nR-cp)/cat4,dS=(cp-nS)/cat4;
  const atSup=dS<1.5,atRes=dR<1.5,roomR=dR>2.0,roomS=dS>2.0;
  const allRP=[...swP.highs].map(s=>s.price).filter(p=>p>cp);
  const allSP=[...swP.lows].map(s=>s.price).filter(p=>p<cp);
  const nRP=allRP.length?Math.min(...allRP):cp*1.005;
  const nSP=allSP.length?Math.max(...allSP):cp*0.995;
  const atSupP=(cp-nSP)/catP<1.5, atResP=(nRP-cp)/catP<1.5;
  const allSwingPrices=[...swP.highs,...swP.lows].map(s=>s.price);
  const multiTouchSupport=allSwingPrices.filter(p=>Math.abs(p-nSP)/Math.max(nSP,0.0001)<0.002).length>=2;
  const multiTouchResist =allSwingPrices.filter(p=>Math.abs(p-nRP)/Math.max(nRP,0.0001)<0.002).length>=2;
  const pac=cic4.senkouA&&cic4.senkouB&&cp>Math.max(cic4.senkouA,cic4.senkouB);
  const pbc=cic4.senkouA&&cic4.senkouB&&cp<Math.min(cic4.senkouA,cic4.senkouB);
  const tak=cic4.tenkan>cic4.kijun,tbk=cic4.tenkan<cic4.kijun;
  const avw=cp>cvw1,bvw=cp<cvw1;
  const sto4=st4.k<20,stob4=st4.k>80;
  const stbx=st4.k>st4.d&&st4.prevK<=st4.prevD,stsx=st4.k<st4.d&&st4.prevK>=st4.prevD;
  const atbob=bob&&cp>=bob.ob_low&&cp<=bob.ob_high*1.001;
  const atbos=bos&&cp<=bos.ob_high&&cp>=bos.ob_low*0.999;
  const slStochOversold=slStochP.k<25, slStochOverbought=slStochP.k>75;
  const slStochBullCross=slStochP.k>slStochP.d&&slStochP.prevK<=slStochP.prevD;
  const slStochBearCross=slStochP.k<slStochP.d&&slStochP.prevK>=slStochP.prevD;
  const slStochExhaustedBull=slStochOversold&&slStochP.prevK<25;
  const slStochExhaustedBear=slStochOverbought&&slStochP.prevK>75;

  // MACD histogram divergence on primary TF
  let macdHistDivBull=false, macdHistDivBear=false;
  const histVals=mcHistP.filter(v=>v!==null);
  if(histVals.length>=6){
    const h=histVals, rH=h.slice(-3), pH=h.slice(-6,-3);
    const rLow=Math.min(...rH), pLow=Math.min(...pH);
    const rHigh=Math.max(...rH), pHigh=Math.max(...pH);
    macdHistDivBull=rLow>pLow&&cp<(primaryCandles[primaryCandles.length-4]?.c||cp);
    macdHistDivBear=rHigh<pHigh&&cp>(primaryCandles[primaryCandles.length-4]?.c||cp);
  }

  // ── MACRO ─────────────────────────────────────────────────────────────────
  const reg=regimeForPair(pair,REGIMES),carry=carryAnalysis(pair);
  const active=getActiveSession(),sessOk=sessionSuitsPair(pair,active);
  const regIsBuy=reg==='STRONG_BUY'||reg==='MILD_BUY';
  const regIsNeutral=reg==='NEUTRAL';
  const techBias=(ae200p&&ae55p)?'BUY':(!ae200p&&!ae55p)?'SELL':null;
  if (regIsNeutral&&!techBias) return{signal:null,reason:`${pair}: Neutral regime + no tech bias`};
  const isBuy=regIsNeutral?techBias==='BUY':regIsBuy;
  const isStrong=reg==='STRONG_BUY'||reg==='STRONG_SELL';
  const [base,quote]=pair.split('/');

  const iv=CB_INTERVENTION_LEVELS[pair];
  if (iv) {
    if (isBuy&&iv.buyVeto&&cp>=iv.buyVeto) return{signal:null,reason:`${pair}: CB veto above ${iv.buyVeto}`};
    if (!isBuy&&iv.sellVeto&&cp<=iv.sellVeto) return{signal:null,reason:`${pair}: CB veto below ${iv.sellVeto}`};
  }

  // Core tech gate — only for macro-backed path
  if (!regIsNeutral) {
    const buyC=[ae200h4,ae200h1,mbull,abm4,e20ae50h4,!rsob4,avw,atSup];
    const selC=[!ae200h4,!ae200h1,mbear,!abm4,!e20ae50h4,!rso4,bvw,atRes];
    const buyScore=buyC.filter(Boolean).length,selScore=selC.filter(Boolean).length;
    if (isBuy&&buyScore<4) return{signal:null,reason:`${pair}: Buy tech score ${buyScore}/8`};
    if (!isBuy&&selScore<4) return{signal:null,reason:`${pair}: Sell tech score ${selScore}/8`};
  }

  // Eco / yield data
  const bSurp=ecoData.surprises?.[base]||[],qSurp=ecoData.surprises?.[quote]||[];
  const bEco=ecoData.ecoSurpIndex?.[base]??0,qEco=ecoData.ecoSurpIndex?.[quote]??0;
  const netEco=bEco-qEco;
  const bullSurp=bSurp.some(s=>s.surprise>0.05)||qSurp.some(s=>s.surprise<-0.05);
  const bearSurp=bSurp.some(s=>s.surprise<-0.05)||qSurp.some(s=>s.surprise>0.05);
  const newsAligned=(isBuy&&bullSurp)||(!isBuy&&bearSurp);
  const by=yields[base],qy=yields[quote];
  let yDiff=0,yMom=false;
  if (by&&qy){yDiff=by.current-qy.current;const ym=(by.momentum||0)-(qy.momentum||0);yMom=(isBuy&&yDiff>0&&ym>0)||(!isBuy&&yDiff<0&&ym<0);}

  const utcH=new Date().getUTCHours(),utcM=new Date().getUTCMinutes();

  // ── STRATEGY CONDITIONS ───────────────────────────────────────────────────
  const SC={
    // MACRO
    BOJ_NORM:()=>{const m=REGIMES.JPY?.dir==='BULLISH'&&pair.includes('JPY')&&(pair.startsWith('USD')||pair.startsWith('EUR')||pair.startsWith('GBP'));return{met:m,score:m?3:0,desc:m?'BOJ normalization JPY bid':'N/A'};},
    CB_DIV:()=>{const br=REGIMES[base],qr=REGIMES[quote];const d=br&&qr&&br.dir!==qr.dir&&br.dir!=='NEUTRAL'&&qr.dir!=='NEUTRAL';const s=d?(br.strength==='STRONG'||qr.strength==='STRONG'?3:2):0;return{met:d,score:s,desc:d?`CB div: ${base} ${br.dir} vs ${quote} ${qr.dir}`:'No CB div'};},
    REAL_YLD:()=>{const d=((CB_RATES[base]||0)-2.5)-((CB_RATES[quote]||0)-2.5);const m=Math.abs(d)>1.0;return{met:m,score:m?2:0,desc:m?`Real yield ${d.toFixed(2)}%`:'Insufficient'};},
    CB_COMM:()=>{const m=REGIMES[base]?.strength==='STRONG'||REGIMES[quote]?.strength==='STRONG';return{met:m,score:m?2:1,desc:m?'Strong CB comm':'Moderate CB'};},
    GLOB_MAC:()=>{const m=Object.values(REGIMES).filter(r=>r.strength==='STRONG').length>=3;return{met:m,score:m?2:0,desc:m?'Global macro aligned':'Macro unclear'};},
    GRW_DIV:()=>{const m=REGIMES[base]?.dir!==REGIMES[quote]?.dir;return{met:m,score:m?2:0,desc:m?'Growth divergence':'No growth div'};},
    EARL_WRN:()=>{const m=(isBuy&&rso4)||(!isBuy&&rsob4);return{met:m,score:m?2:0,desc:m?'RSI+regime divergence':'No early warning'};},
    REGIME_SW:()=>{const m=gcross||dcross;return{met:m,score:m?2:0,desc:m?'EMA regime switch':'No switch'};},
    TOT_SHOCK:()=>{const m=['AUD','CAD','NZD'].some(c=>pair.includes(c))&&volp;return{met:m,score:m?1:0,desc:m?'Commodity + vol':'No ToT'};},
    BOP_FLOW:()=>{const m=(pair.includes('JPY')||pair.includes('CHF'))&&reg!=='NEUTRAL';return{met:m,score:m?1:0,desc:m?'BOP safe haven':'Not BOP pair'};},
    PPP_VAL:()=>({met:true,score:1,desc:`PPP: ${ae200d1?'above':'below'} D1 EMA200`}),
    YIELD_SPR:()=>{if(!FRED_KEY||!by||!qy)return{met:false,score:0,desc:'FRED key needed'};const m=yMom&&Math.abs(yDiff)>0.3;const s=m?(Math.abs(yDiff)>1.0?3:Math.abs(yDiff)>0.5?2:1):0;return{met:m,score:s,desc:m?`10Y spread ${yDiff.toFixed(2)}% aligned`:'Yield not aligned'};},
    ECO_SURP:()=>{const m=(isBuy&&netEco>0.05)||(!isBuy&&netEco<-0.05);return{met:m,score:m?(Math.abs(netEco)>0.15?3:2):0,desc:m?`Eco surprise index ${netEco.toFixed(3)}`:'Eco not aligned'};},
    // TECHNICAL (existing)
    STRUCT_BK:()=>{const m=(isBuy&&cp>nR*0.999&&roomR)||(!isBuy&&cp<nS*1.001&&roomS);return{met:m,score:m?3:0,desc:m?'Structure breakout':'No breakout'};},
    ICT_OB:()=>{const m=(isBuy&&atbob)||(!isBuy&&atbos);return{met:m,score:m?3:0,desc:m?'ICT order block':'Not at OB'};},
    STOP_HNT:()=>{const rc=candlesH4.slice(-5);const sh=rc.some(c=>c.h>nR)&&cp<nR,sl=rc.some(c=>c.l<nS)&&cp>nS;const m=(!isBuy&&sh)||(isBuy&&sl);return{met:m,score:m?3:0,desc:m?'Stop hunt sweep':'No stop hunt'};},
    LIQ_SWEEP:()=>{const rc=candlesH4.slice(-5);const sa=rc.slice(0,-1).some(c=>c.h>nR)&&candlesH4[candlesH4.length-1].c<nR;const sb=rc.slice(0,-1).some(c=>c.l<nS)&&candlesH4[candlesH4.length-1].c>nS;const inLdn=active.includes('LONDON');const m=(isBuy&&sb&&avw)||(!isBuy&&sa&&bvw);return{met:m,score:m?(inLdn?3:2):0,desc:m?`Liquidity sweep${inLdn?' (London)':''}`:'No sweep'};},
    SESS_BRK:()=>{const m=(active.includes('LONDON')||active.includes('NEW_YORK'))&&adxs&&volp;return{met:m,score:m?2:0,desc:m?`Session breakout: ${active.join('/')}`:'Wrong session'};},
    VOL_BRK:()=>{const m=(bbsq||ksq)&&adxs;return{met:m,score:m?3:0,desc:m?'Vol squeeze breakout':'No squeeze'};},
    ADX_BRK:()=>{const m=adxs&&cax4&&((isBuy&&cax4.plusDI>cax4.minusDI)||(!isBuy&&cax4.minusDI>cax4.plusDI));return{met:m,score:m?2:0,desc:m?`ADX ${cax4?.adx?.toFixed(1)} trend`:'ADX weak'};},
    LDN_BRK:()=>{const m=active.includes('LONDON')&&volp&&((isBuy&&ae200h1)||(!isBuy&&!ae200h1));return{met:m,score:m?2:0,desc:m?'London breakout':'Not London'};},
    FIBO_PULL:()=>{const hi=Math.max(...candlesH4.slice(-20).map(c=>c.h)),lo=Math.min(...candlesH4.slice(-20).map(c=>c.l));const fb=lo+(hi-lo)*0.382,fs=lo+(hi-lo)*0.618;const m=(isBuy&&cp>=fb*0.998&&cp<=fb*1.002)||(!isBuy&&cp>=fs*0.998&&cp<=fs*1.002);return{met:m,score:m?2:0,desc:m?'61.8% Fibonacci':'Not at Fib'};},
    ICHIMOKU:()=>{const m=(isBuy&&pac&&tak)||(!isBuy&&pbc&&tbk);return{met:m,score:m?3:0,desc:m?'Ichimoku full alignment':'Ichi not aligned'};},
    KELTNER:()=>{const m=ksq&&volp;return{met:m,score:m?2:0,desc:m?'Keltner squeeze':'No Keltner'};},
    SUPPLY_DEM:()=>{const m=(isBuy&&atSup&&roomR)||(!isBuy&&atRes&&roomS);return{met:m,score:m?2:0,desc:m?'At S/D zone':'Not at S/D'};},
    ENG_CAN:()=>{const m=(isBuy&&(eg4==='BULLISH'||eg1==='BULLISH'))||(!isBuy&&(eg4==='BEARISH'||eg1==='BEARISH'));return{met:m,score:m?2:0,desc:m?`${eg4||eg1} engulfing`:'No engulfing'};},
    GAMMA_EXP:()=>{const nyFix=utcH>=14&&utcH<15;const ru=isJPY?1.0:0.005;const nr=Math.round(cp/ru)*ru;const near=Math.abs(cp-nr)/cat4<0.3;const lv=cat4<avgat4*0.85;const m=near&&lv&&(nyFix||!adxs);return{met:m,score:m?2:0,desc:m?`Gamma magnet ${nr}${nyFix?' (fix window)':''}`:'No gamma'};},
    NEWS_DFT:()=>{if(newsAligned){const mg=Math.max(...[...bSurp,...qSurp].map(s=>Math.abs(s.surprise)),0);return{met:true,score:mg>0.3?3:2,desc:`News drift: ${(mg*100).toFixed(0)}% surprise`};}const rm=Math.abs((cp-(candlesH1[candlesH1.length-4]?.c||cp))/(cat4||0.001));const m=rm>1.5&&volp&&((isBuy&&cp>(candlesH1[candlesH1.length-4]?.c||0))||(!isBuy&&cp<(candlesH1[candlesH1.length-4]?.c||999)));return{met:m,score:m?2:0,desc:m?`News drift: ${rm.toFixed(1)}× ATR`:'No news drift'};},
    TSM_CTA:()=>{const m=((isBuy&&ae200d1&&ae200h4)||(!isBuy&&!ae200d1&&!ae200h4))&&adxt;return{met:m,score:m?2:0,desc:m?'CTA trend aligned':'CTA not aligned'};},
    CS_MOM:()=>{const m=(isBuy&&ae200h4&&mbull)||(!isBuy&&!ae200h4&&mbear);return{met:m,score:m?2:0,desc:m?'Cross-sectional momentum':'No CS mom'};},
    MOMO_CRS:()=>{const m=(isBuy&&gcross&&mbull)||(!isBuy&&dcross&&mbear);return{met:m,score:m?3:0,desc:m?'Momentum cross confirmed':'No mom cross'};},
    MON_PULL:()=>{const mh=Math.max(...candlesD1.slice(-22).map(c=>c.h)),ml=Math.min(...candlesD1.slice(-22).map(c=>c.l));const m=(isBuy&&cp<mh*0.98&&cp>ml*1.01)||(!isBuy&&cp>ml*1.02&&cp<mh*0.99);return{met:m,score:m?1:0,desc:m?'Monthly pullback':'Not monthly pull'};},
    TURT_TR:()=>{const h20=Math.max(...candlesD1.slice(-20).map(c=>c.h)),l20=Math.min(...candlesD1.slice(-20).map(c=>c.l));const m=(isBuy&&cp>=h20*0.999)||(!isBuy&&cp<=l20*1.001);return{met:m,score:m?2:0,desc:m?'20d Turtle breakout':'No Turtle'};},
    DUAL_THR:()=>{const r=atd[atd.length-1]||cat4,u=candlesH4[candlesH4.length-1].c+r*0.4,l=candlesH4[candlesH4.length-1].c-r*0.4;const m=(isBuy&&cp>u)||(!isBuy&&cp<l);return{met:m,score:m?1:0,desc:m?'Dual thrust triggered':'No dual thrust'};},
    VWAP_REV:()=>{const dv=cvw1?Math.abs(cp-cvw1)/cat4:0;const m=dv>1.5&&((isBuy&&bvw)||(!isBuy&&avw));return{met:m,score:m?2:0,desc:m?`VWAP rev ${dv.toFixed(1)}× ATR`:'Near VWAP'};},
    BB_FADE:()=>{const m=(isBuy&&nbl4&&!adxs)||(!isBuy&&nbu4&&!adxs);return{met:m,score:m?2:0,desc:m?'BB 2σ fade':'Not at BB extreme'};},
    STOCH_RSI:()=>{const m=(isBuy&&sto4&&stbx)||(!isBuy&&stob4&&stsx);return{met:m,score:m?2:0,desc:m?`StochRSI ${isBuy?'oversold':'overbought'} cross`:'No StochRSI'};},
    RSIMR:()=>{const m=(isBuy&&crsd<30)||(!isBuy&&crsd>70);return{met:m,score:m?2:0,desc:m?`D1 RSI extreme ${crsd?.toFixed(1)}`:'RSI not extreme'};},
    ATR_FADE:()=>{const dr=cat4*6;const ext=candlesH4[candlesH4.length-6]?.c?Math.abs(cp-candlesH4[candlesH4.length-6].c)>dr*1.5:false;const m=ext&&!adxs;return{met:m,score:m?1:0,desc:m?'ATR overextension':'No overextension'};},
    // CARRY
    RATE_SRP:()=>{const al=(isBuy&&carry.favors==='BUY')||(!isBuy&&carry.favors==='SELL');const nb=newsAligned?1:0;return{met:al&&carry.strong,score:(al&&carry.strong?3:al?1:0)+nb,desc:al?`Rate spread ${carry.diff.toFixed(2)}%${nb?' +news':''}`:'Rate against dir'};},
    CROSS_CAR:()=>{const al=(isBuy&&carry.favors==='BUY')||(!isBuy&&carry.favors==='SELL');return{met:al&&carry.strong,score:al&&carry.strong?2:al?1:0,desc:al?`Cross-carry ${carry.diff.toFixed(2)}%`:'Carry against'};},
    CARRY_MOM:()=>{const c=(isBuy&&carry.favors==='BUY')||(!isBuy&&carry.favors==='SELL');const m=(isBuy&&mbull)||(!isBuy&&mbear);return{met:c&&m,score:c&&m?2:0,desc:c&&m?'Carry + momentum':'Carry-mom misaligned'};},
    UIP_DEV:()=>{const m=Math.abs(carry.diff)>2.0&&((isBuy&&ae200h4)||(!isBuy&&!ae200h4));return{met:m,score:m?1:0,desc:m?'UIP deviation':'Not significant'};},
    CARRY:()=>{const al=(isBuy&&carry.favors==='BUY')||(!isBuy&&carry.favors==='SELL');return{met:al,score:al?1:0,desc:`Carry ${carry.diff.toFixed(2)}%`};},
    // FLOW/OTHER
    SWAP_TIME:()=>{const inW=utcH===22&&utcM>=15&&utcM<=45;const al=(isBuy&&carry.favors==='BUY')||(!isBuy&&carry.favors==='SELL');const m=inW&&carry.strong&&al;return{met:m,score:m?2:0,desc:m?`Rollover timing: ${carry.diff.toFixed(2)}%`:'Not rollover window'};},
    COT_REAL:()=>{const isUsdBase=base==='USD';const lm=candlesD1.length>=26?(candlesD1[candlesD1.length-1].c-candlesD1[candlesD1.length-26].c)/candlesD1[candlesD1.length-26].c:0;const sm=candlesH4.length>=20?(candlesH4[candlesH4.length-1].c-candlesH4[candlesH4.length-20].c)/candlesH4[candlesH4.length-20].c:0;if(isUsdBase){const ul=lm>0.04&&sm<lm*0.5,us=lm<-0.04&&sm>lm*0.5;const ct=(!isBuy&&ul)||(isBuy&&us);return{met:ct,score:ct?2:0,desc:ct?`COT DXY extreme: USD ${(lm*100).toFixed(1)}% 26wk`:'DXY COT not extreme'};}const ct=(!isBuy&&lm>0.04&&sm<lm*0.5)||(isBuy&&lm<-0.04&&sm>lm*0.5);return{met:ct,score:ct?2:0,desc:ct?`COT extreme: ${base} ${(lm*100).toFixed(1)}% 26wk`:'COT not extreme'};},
    CB_INTV:()=>{if(!iv)return{met:true,score:1,desc:'No CB intervention risk'};const safe=(isBuy&&(!iv.buyVeto||cp<iv.buyVeto*0.97))||(!isBuy&&(!iv.sellVeto||cp>iv.sellVeto*1.03));return{met:safe,score:safe?1:0,desc:safe?'Clear of intervention zone':'Near intervention'};},
    TRI_ARB:()=>{const t=livePrice.spread<(isJPY?0.03:0.00015);return{met:t,score:t?1:0,desc:t?'Tight spread / liquidity':'Wide spread'};},
    WMR_FIX:()=>{const n=(utcH===15&&utcM>=30)||(utcH===16&&utcM<=15);return{met:n,score:n?2:0,desc:n?'WMR Fix window':'Not fix window'};},
    FX_VOL:()=>{const l=cat4<avgat4*0.8;return{met:l,score:l?1:0,desc:l?'Low vol carry env':'Elevated vol'};},
    SAFE_HVN:()=>{const s=pair.includes('JPY')||pair.includes('CHF');const ro=REGIMES.USD?.dir==='BEARISH'&&REGIMES.JPY?.dir==='BULLISH';const m=s&&ro&&reg!=='NEUTRAL';return{met:m,score:m?3:0,desc:m?'Safe haven demand':'No safe haven'};},
    GOLD_USD:()=>{const m=REGIMES.USD?.dir==='BEARISH'&&(pair.includes('CHF')||pair.includes('JPY'));return{met:m,score:m?2:0,desc:m?'Gold/USD correlation':'No gold signal'};},
    CORR_BRK:()=>{const br=REGIMES[base],qr=REGIMES[quote];const m=br&&qr&&br.strength==='STRONG'&&qr.strength==='STRONG'&&br.dir!==qr.dir;return{met:m,score:m?2:0,desc:m?'Correlation breakdown':'No corr break'};},
    EQ_BETA:()=>{const m=['AUD','NZD','CAD'].includes(base)&&REGIMES.JPY?.dir!=='BULLISH'&&isBuy;return{met:m,score:m?1:0,desc:m?'Equity beta risk-on':'Not eq beta'};},
    COMD_CCY:()=>{const m=['AUD','CAD','NZD'].includes(base)&&((isBuy&&REGIMES[base]?.dir==='BULLISH')||(!isBuy&&REGIMES[base]?.dir==='BEARISH'));return{met:m,score:m?1:0,desc:m?'Commodity CCY aligned':'Not aligned'};},
    RISK_PAR:()=>{const m=adxt&&volp;return{met:m,score:m?1:0,desc:m?'Risk parity met':'No risk parity'};},

    // ══ PURE-TA: Group A — EMA / Momentum ════════════════════════════════════
    EMA_CROSS_55:()=>{const freshCross=ema55CrossRecent&&((isBuy&&ema55CrossDir==='BULLISH')||(!isBuy&&ema55CrossDir==='BEARISH'));const pb=isBuy?(cp>=ce55p*0.998&&cp<=ce55p*1.005):(cp<=ce55p*1.002&&cp>=ce55p*0.995);const rsiN=crsP>=38&&crsP<=62;const m=freshCross&&pb&&rsiN;return{met:m,score:m?3:0,desc:m?`EMA55/200 cross pullback (${ema55CrossDir})`:'No EMA55 cross'};},
    PRICE_ACTION_PIN:()=>{const shadow=shadowP;const atLvl=(isBuy&&atSupP)||(!isBuy&&atResP);const rsiDiv=(isBuy&&crsP<40&&crsP>prsP)||(!isBuy&&crsP>60&&crsP<prsP);const ema55Ok=isBuy?ae55p:!ae55p;const m=shadow&&atLvl&&rsiDiv&&ema55Ok;const type=shadow==='HAMMER'?'Hammer pin':'Shooting star pin';return{met:m,score:m?3:0,desc:m?`${type} at S/R level`:'No pin bar'};},
    INSIDE_BAR_BO:()=>{if(!insideB)return{met:false,score:0,desc:'No inside bar'};const bkBull=cp>insideB.motherHigh*1.001;const bkBear=cp<insideB.motherLow*0.999;const ema55Dir=isBuy?(ce55p>ce200p):(ce55p<ce200p);const m=(isBuy&&bkBull&&ema55Dir&&(volExpand||slStochBullCross))||(!isBuy&&bkBear&&ema55Dir&&(volExpand||slStochBearCross));return{met:m,score:m?2:0,desc:m?`Inside bar breakout (${isBuy?'bull':'bear'})`:'No IB breakout'};},
    SR_BOUNCE:()=>{const atMT=(isBuy&&multiTouchSupport)||(!isBuy&&multiTouchResist);const rsiExt=(isBuy&&crsP<35)||(!isBuy&&crsP>65);const ema200Side=isBuy?ae200p:!ae200p;const stochPending=isBuy?(!slStochBullCross&&slStochOversold):(!slStochBearCross&&slStochOverbought);const m=atMT&&rsiExt&&ema200Side&&stochPending;return{met:m,score:m?3:0,desc:m?`Multi-touch S/R bounce (RSI ${crsP?.toFixed(0)})`:'No SR bounce'};},
    MACD_HIST_DIVERGENCE:()=>{const divOk=(isBuy&&macdHistDivBull)||(!isBuy&&macdHistDivBear);const atLvl=(isBuy&&atSupP)||(!isBuy&&atResP);const rsiDiv=(isBuy&&crsP<50&&crsP>prsP)||(!isBuy&&crsP>50&&crsP<prsP);const m=divOk&&atLvl&&rsiDiv;return{met:m,score:m?3:0,desc:m?`MACD hist divergence (${isBuy?'bull':'bear'})`:'No MACD div'};},
    STOCH_SR_CONFLUENCE:()=>{const atLvl=(isBuy&&atSupP)||(!isBuy&&atResP);const exhaust=isBuy?slStochExhaustedBull:slStochExhaustedBear;const cross=isBuy?slStochBullCross:slStochBearCross;const lc=primaryCandles[primaryCandles.length-1];const conv=lc&&(Math.abs(lc.c-lc.o)/(lc.h-lc.l+0.0000001))>0.6;const ema200Ok=isBuy?ae200p:!ae200p;const m=atLvl&&exhaust&&cross&&conv&&ema200Ok;return{met:m,score:m?3:0,desc:m?`Stoch exhaustion+S/R (K:${slStochP.k?.toFixed(0)})`:'No stoch/SR'};},
    CANDLE_REVERSAL_CLUSTER:()=>{const starOk=(isBuy&&starPat==='MORNING_STAR')||(!isBuy&&starPat==='EVENING_STAR');const scOk=(isBuy&&soldCrow==='THREE_WHITE_SOLDIERS')||(!isBuy&&soldCrow==='THREE_BLACK_CROWS');const rsiFrom=(isBuy&&prsP<35&&crsP>prsP)||(!isBuy&&prsP>65&&crsP<prsP);const ema55Mid=Math.abs(cp-ce55p)/catP<3;const m=(starOk||scOk)&&(rsiFrom||ema55Mid);const pat=starOk?starPat:soldCrow;return{met:m,score:m?3:0,desc:m?`${pat} reversal cluster`:'No candle cluster'};},
    TREND_PULLBACK_EMA55:()=>{const tUp=ae200p&&ce55p>ce200p,tDn=!ae200p&&ce55p<ce200p;const tOk=(isBuy&&tUp)||(!isBuy&&tDn);const touch=(isBuy&&cp>=ce55p*0.997&&cp<=ce55p*1.008)||(!isBuy&&cp<=ce55p*1.003&&cp>=ce55p*0.992);const rsiReset=(isBuy&&crsP>=38&&crsP<=58)||(!isBuy&&crsP>=42&&crsP<=62);const stReset=(isBuy&&slStochP.k<55&&slStochP.k>25)||(!isBuy&&slStochP.k>45&&slStochP.k<75);const calm=catP<avgAtP*1.1;const m=tOk&&touch&&(rsiReset||stReset)&&calm;return{met:m,score:m?3:0,desc:m?`EMA55 trend pullback (RSI ${crsP?.toFixed(0)})`:'No EMA55 pullback'};},

    // ══ PURE-TA: Group B — Candlestick Patterns ═══════════════════════════════
    ENGULF_STRUCT:()=>{const engOk=(isBuy&&egP==='BULLISH')||(!isBuy&&egP==='BEARISH');const atLvl=(isBuy&&atSupP)||(!isBuy&&atResP);const rsiDiv=(isBuy&&crsP<45&&crsP>prsP)||(!isBuy&&crsP>55&&crsP<prsP);const e55Ok=isBuy?(ce55p>ce200p*0.998):(ce55p<ce200p*1.002);const m=engOk&&atLvl&&(rsiDiv||e55Ok);return{met:m,score:m?2:0,desc:m?`${egP} engulfing at structure`:'No engulfing/struct'};},
    THREE_BAR_PLAY:()=>{const playOk=(isBuy&&tbrPlay==='BULLISH_3BAR')||(!isBuy&&tbrPlay==='BEARISH_3BAR');const ema200Ok=isBuy?ae200p:!ae200p;const m=playOk&&(volExpand||slStochBullCross&&isBuy||slStochBearCross&&!isBuy)&&ema200Ok;return{met:m,score:m?2:0,desc:m?`Three-bar play ${isBuy?'bull':'bear'}`:'No 3-bar play'};},
    OUTSIDE_BAR:()=>{const obOk=(isBuy&&outsideB==='BULLISH_OUTSIDE')||(!isBuy&&outsideB==='BEARISH_OUTSIDE');const atLvl=(isBuy&&atSupP)||(!isBuy&&atResP);const rsiT=(isBuy&&crsP<55&&crsP>prsP)||(!isBuy&&crsP>45&&crsP<prsP);const m=obOk&&(atLvl||rsiT);return{met:m,score:m?2:0,desc:m?`Outside bar ${isBuy?'bull':'bear'}`:'No outside bar'};},
    HAMMER_STAR:()=>{const sh=shadowP;const shOk=(isBuy&&sh==='HAMMER')||(!isBuy&&sh==='SHOOTING_STAR');const atLvl=(isBuy&&atSupP)||(!isBuy&&atResP);const e55Ok=isBuy?ae55p:!ae55p;const stOk=isBuy?slStochOversold:slStochOverbought;const m=shOk&&atLvl&&(e55Ok||stOk);return{met:m,score:m?2:0,desc:m?`${sh} at S/R`:'No shadow candle'};},
    THREE_SOLDIERS_CROWS:()=>{const scOk=(isBuy&&soldCrow==='THREE_WHITE_SOLDIERS')||(!isBuy&&soldCrow==='THREE_BLACK_CROWS');const priorLowV=catP<avgAtP*1.3;const slope=isBuy?(ce55p>pe55p):(ce55p<pe55p);const rsiMid=(isBuy&&crsP>=40&&crsP<=65)||(!isBuy&&crsP>=35&&crsP<=60);const m=scOk&&(priorLowV||slope)&&rsiMid;return{met:m,score:m?2:0,desc:m?`${soldCrow}`:'No soldiers/crows'};},
    MORNING_EVENING_STAR:()=>{const starOk=(isBuy&&starPat==='MORNING_STAR')||(!isBuy&&starPat==='EVENING_STAR');const atLvl=(isBuy&&atSupP&&multiTouchSupport)||(!isBuy&&atResP&&multiTouchResist);const rsiDiv=(isBuy&&prsP<40&&crsP>prsP)||(!isBuy&&prsP>60&&crsP<prsP);const stTurn=isBuy?slStochBullCross:slStochBearCross;const m=starOk&&(atLvl||rsiDiv||stTurn);return{met:m,score:m?3:0,desc:m?`${starPat} reversal`:'No star pattern'};},

    // ══ PURE-TA: Group C — Chart Patterns ════════════════════════════════════
    HEAD_SHOULDERS:()=>{if(isScalp)return{met:false,score:0,desc:'H&S: day/swing only'};const hs=detectHeadShoulders(chartSwingH,chartSwingL,cp,isBuy);const rsiDiv=(isBuy&&crsP>prsP&&crsP<55)||(!isBuy&&crsP<prsP&&crsP>45);const e55Ok=isBuy?ae55p:!ae55p;const m=hs.met&&(rsiDiv||e55Ok);return{met:m,score:m?3:0,desc:m?hs.desc:'No H&S pattern'};},
    DOUBLE_TOP_BOTTOM:()=>{if(isScalp)return{met:false,score:0,desc:'DT/DB: day/swing only'};const dtb=detectDoubleTopBottom(chartSwingH,chartSwingL,cp,isBuy);const rsiDiv=(isBuy&&crsP>prsP)||(!isBuy&&crsP<prsP);const e55Ok=isBuy?(ce55p>ce200p*0.998):(ce55p<ce200p*1.002);const m=dtb.met&&(rsiDiv||e55Ok);return{met:m,score:m?3:0,desc:m?dtb.desc:'No double top/bottom'};},
    MARKET_STRUCTURE:()=>{const ms=detectMarketStructure(swP.highs,swP.lows,cp,isBuy);const rsiOk=(isBuy&&crsP>40&&crsP<70)||(!isBuy&&crsP<60&&crsP>30);const e55Ok=isBuy?ae55p:!ae55p;const m=ms.met&&(rsiOk||e55Ok);return{met:m,score:m?(ms.score||2):0,desc:m?ms.desc:'No market structure'};},
    FLAG_PENNANT:()=>{const fOk=(isBuy&&flagPat==='BULL_FLAG')||(!isBuy&&flagPat==='BEAR_FLAG');const e55Dir=isBuy?(ce55p>ce200p):(ce55p<ce200p);const m=fOk&&e55Dir&&volExpand;return{met:m,score:m?3:0,desc:m?`${flagPat} breakout`:'No flag/pennant'};},

    // ══ PURE-TA: Group D — Breakout Patterns ══════════════════════════════════
    RANGE_BREAKOUT:()=>{const win=primaryCandles.slice(-20);const rH=Math.max(...win.map(c=>c.h)),rL=Math.min(...win.map(c=>c.l));const rS=rH-rL;const isRange=rS<=avgAtP*1.8;if(!isRange)return{met:false,score:0,desc:'No range consolidation'};const bkB=cp>rH*1.001&&volExpand,bkBr=cp<rL*0.999&&volExpand;const rsiOk=(isBuy&&crsP<70)||(!isBuy&&crsP>30);const e55Ok=isBuy?(ce55p>ce200p*0.998):(ce55p<ce200p*1.002);const m=(isBuy&&bkB&&rsiOk&&e55Ok)||(!isBuy&&bkBr&&rsiOk&&e55Ok);return{met:m,score:m?2:0,desc:m?`Range breakout ${isBuy?'↑':'↓'}`:'No range break'};},
    TREND_CONTINUATION_BREAK:()=>{const tUp=ae200p&&ae55p,tDn=!ae200p&&!ae55p;const tOk=(isBuy&&tUp)||(!isBuy&&tDn);const r8=atP.slice(-8).filter(Boolean),p8=atP.slice(-16,-8).filter(Boolean);const avgR=r8.length?r8.reduce((a,b)=>a+b,0)/r8.length:avgAtP;const avgP8=p8.length?p8.reduce((a,b)=>a+b,0)/p8.length:avgAtP;const compressed=avgR<avgP8*0.85;const newH=isBuy&&cp>=Math.max(...primaryCandles.slice(-20).map(c=>c.h))*0.999;const newL=!isBuy&&cp<=Math.min(...primaryCandles.slice(-20).map(c=>c.l))*1.001;const stReset=(isBuy&&slStochP.k>40&&slStochP.k<65&&slStochBullCross)||(!isBuy&&slStochP.k<60&&slStochP.k>35&&slStochBearCross);const m=tOk&&compressed&&(newH||newL)&&(stReset||volExpand);return{met:m,score:m?3:0,desc:m?`Trend continuation break ${isBuy?'bull':'bear'}`:'No continuation break'};},
  };

  // ── EVALUATE ──────────────────────────────────────────────────────────────
  let total=0, macroT=0, techT=0, pureTA_T=0;
  const triggered=[];
  for (const [id,fn] of Object.entries(SC)) {
    if (enabledStratIds&&enabledStratIds.length>0&&!enabledStratIds.includes(id)) continue;
    const r=fn();
    if (r.met) {
      total+=r.score; triggered.push({id,score:r.score,desc:r.desc});
      if (MACRO_STRATS.has(id))    macroT++;
      if (TECHNICAL_STRATS.has(id)) techT++;
      if (PURE_TA_STRATS.has(id))  pureTA_T++;
    }
  }
  triggered.sort((a,b)=>b.score-a.score);

  // ── GATES ────────────────────────────────────────────────────────────────
  const isPureTASignal=pureTA_T>=5&&macroT===0;

  if (isPureTASignal) {
    if (triggered.length<4) return{signal:null,reason:`${pair}: Pure-TA needs 4+ strats (${triggered.length})`};
    if (total<7)            return{signal:null,reason:`${pair}: Pure-TA score ${total}/7`};
  } else {
    const minScore=isStrong?6:8;
    if (triggered.length<4) return{signal:null,reason:`${pair}: ${triggered.length}/4 strategies`};
    if (total<minScore)     return{signal:null,reason:`${pair}: Score ${total}/${minScore}`};
    if (macroT<1)           return{signal:null,reason:`${pair}: No macro confirmation`};
    if (techT<2)            return{signal:null,reason:`${pair}: Tech insufficient (${techT}/2)`};
  }

  const sessionPenalty=sessOk?0:-5;

  // ── BUILD SIGNAL ──────────────────────────────────────────────────────────
  const entry=isBuy?livePrice.ask:livePrice.bid, dec=isJPY?3:5, dir=isBuy?1:-1;
  const slRef=isBuy?nSP:nRP;
  const slD=Math.abs(entry-slRef)+catP*0.5;
  const slPips=Math.max(isScalp?8:12,Math.round(slD*pipMult));
  const tp1m=isScalp?1.2:1.5, tp2m=isScalp?2.0:2.5, tp3m=isScalp?3.0:4.0;
  const tp1p=Math.round(slPips*tp1m),tp2p=Math.round(slPips*tp2m),tp3p=Math.round(slPips*tp3m);
  const pip=1/pipMult;
  const sl=parseFloat((entry-dir*slPips*pip).toFixed(dec));
  const tp1=parseFloat((entry+dir*tp1p*pip).toFixed(dec));
  const tp2=parseFloat((entry+dir*tp2p*pip).toFixed(dec));
  const tp3=parseFloat((entry+dir*tp3p*pip).toFixed(dec));
  const ACCT=parseInt(process.env.AXIOM_ACCT||'10000'),RISK=parseFloat(process.env.AXIOM_RISK||'2');
  const lot=Math.max(0.01,Math.min(2.00,Math.round((ACCT*(RISK/100))/(slPips*10.0)*100)/100));
  const maxP=triggered.length*3;
  const rawProb=Math.round(50+(maxP>0?total/maxP*25:0)+(isStrong?4:0)+(yMom?3:0)+(newsAligned?3:0)+sessionPenalty);
  const prob=isPureTASignal?Math.min(62,Math.max(50,rawProb)):Math.min(85,Math.max(50,rawProb));

  return{signal:{
    pair,direction:isBuy?'BUY':'SELL',entry,sl,tp1,tp2,tp3,
    slPips,tp1Pips:tp1p,tp2Pips:tp2p,tp3Pips:tp3p,
    rr1:+(tp1p/slPips).toFixed(1),rr2:+(tp2p/slPips).toFixed(1),rr3:+(tp3p/slPips).toFixed(1),
    lotSize:lot,riskAmount:+(ACCT*(RISK/100)).toFixed(2),probability:prob,
    isPureTASignal,pureTA_T,
    primaryStrategy:{id:triggered[0].id,name:triggered[0].id,tier:triggered.length>=6?'S':triggered.length>=4?'A':'C',cat:isPureTASignal?'PURE TECHNICAL':'REAL',wr:prob},
    supportingStrategy:{id:(triggered[1]||triggered[0]).id,name:(triggered[1]||triggered[0]).id},
    confluences:triggered.slice(0,6).map(s=>s.desc),
    technicalScore:total,strategiesTriggered:triggered.length,macroTriggered:macroT,techTriggered:techT,
    yieldSpreadAligned:yMom,newsSurpriseAligned:newsAligned,tradeStyle,
    technicalDetails:{
      techNote:`EMA55:${ae55p?'above':'below'} EMA200:${ae200p?'above':'below'} ADX:${cax4?.adx?.toFixed(1)} RSI:${crsP?.toFixed(1)} Stoch:${slStochP.k?.toFixed(0)} PureTA:${pureTA_T}`,
      sessionNote:`Sessions:${active.join(',')} Optimal:${sessOk}${!sessOk?' (off-session -5%)':''}`,
      regimeNote:`Regime:${reg} Carry:${carry.diff.toFixed(2)}% Yield:${yDiff.toFixed(2)}%`
    },
    indicators:{rsiPrimary:crsP?.toFixed(1),adxH4:cax4?.adx?.toFixed(1),ema200:ce200p?.toFixed(dec),ema55:ce55p?.toFixed(dec),atr:(catP*pipMult)?.toFixed(1),slowStochK:slStochP.k?.toFixed(0),carry:carry.diff?.toFixed(2),yieldSpread:yDiff?.toFixed(2),ecoSurprise:netEco?.toFixed(3)},
    timestamp:new Date().toISOString()
  }};
}

// ── CORRELATION GATE ─────────────────────────────────────────────────────────
function correlationGate(signals) {
  const map={},kept=[],filtered=[];
  const sorted=[...signals].sort((a,b)=>b.probability-a.probability);
  for (const sig of sorted) {
    const [b,q]=sig.pair.split('/');
    const bk=`${b}_${sig.direction==='BUY'?'BUY':'SELL'}`;
    const qk=`${q}_${sig.direction==='BUY'?'SELL':'BUY'}`;
    if (map[bk]||map[qk]){filtered.push({pair:sig.pair,reason:`${map[bk]?b:q} already in signal set`});continue;}
    map[bk]=sig.pair;map[qk]=sig.pair;kept.push(sig);
  }
  return{kept,filtered};
}

// ── HANDLER ──────────────────────────────────────────────────────────────────
exports.handler = async function(event) {
  const h={'Content-Type':'application/json','Access-Control-Allow-Origin':'*'};

  if (!OANDA_KEY) return{statusCode:503,headers:h,body:JSON.stringify({error:'OANDA_API_KEY not configured',action:'Add OANDA_API_KEY to Netlify environment variables',source:'error',signals:null})};

  const p=event.queryStringParameters||{};
  const enabledStratIds=p.strategies?p.strategies.split(',').filter(Boolean):null;
  const tradeStyle=p.style||'day';

  const REGIMES=getRegimes();
  if (!REGIMES) return{statusCode:503,headers:h,body:JSON.stringify({error:'AXIOM_REGIMES not configured',action:'Go to AXIOM Settings tab → update regime → copy JSON → paste into Netlify AXIOM_REGIMES',source:'error',signals:null})};
  if (REGIMES._error) return{statusCode:503,headers:h,body:JSON.stringify({error:REGIMES._error,action:'Fix AXIOM_REGIMES in Netlify env vars — must be valid JSON with all 10 G10 currencies',source:'error',signals:null})};

  const feedErrors=[];
  let ecoData={recent:[],surprises:{},ecoSurpIndex:{}};
  let yields={};
  const [ecoResult,yieldResult]=await Promise.allSettled([fetchEconomicReleases(),fetchYieldSpreads()]);
  if (ecoResult.status==='fulfilled'){ecoData=ecoResult.value;}
  else{feedErrors.push({feed:'Finnhub Economic Calendar',error:ecoResult.reason?.message||'Unknown error'});}
  if (yieldResult.status==='fulfilled'){yields=yieldResult.value;}
  else{feedErrors.push({feed:'FRED Yield Spreads',error:yieldResult.reason?.message||'Unknown error'});}

  if (p.pair) {
    try{const r=await analyzeSignal(p.pair,enabledStratIds,ecoData,yields,REGIMES,tradeStyle);return{statusCode:200,headers:h,body:JSON.stringify(r)};}
    catch(e){return{statusCode:500,headers:h,body:JSON.stringify({signal:null,error:e.message,pair:p.pair})};}
  }

  const ALL_PAIRS=['AUD/CAD','AUD/CHF','AUD/JPY','AUD/NZD','AUD/USD','CAD/CHF','CAD/JPY','CHF/JPY','EUR/AUD','EUR/CAD','EUR/CHF','EUR/GBP','EUR/JPY','EUR/NZD','EUR/USD','GBP/AUD','GBP/CAD','GBP/CHF','GBP/JPY','GBP/NZD','GBP/USD','NZD/CAD','NZD/CHF','NZD/JPY','NZD/USD','USD/CAD','USD/CHF','USD/JPY'];
  const raw=[],skipped=[];
  for (let i=0;i<ALL_PAIRS.length;i+=2) {
    const res=await Promise.allSettled(ALL_PAIRS.slice(i,i+2).map(pp=>analyzeSignal(pp,enabledStratIds,ecoData,yields,REGIMES,tradeStyle).catch(e=>({signal:null,error:e.message,pair:pp}))));
    for (const r of res){
      if (r.status==='fulfilled'){if(r.value.signal)raw.push(r.value.signal);else skipped.push(r.value.reason||r.value.error);}
      else skipped.push(r.reason?.message);
    }
  }

  const {kept:signals,filtered:corr}=correlationGate(raw);
  corr.forEach(f=>skipped.push(`CORR: ${f.pair} — ${f.reason}`));

  return{statusCode:200,headers:h,body:JSON.stringify({
    signals,count:signals.length,scanned:ALL_PAIRS.length,
    skipped:skipped.length,correlationFiltered:corr.length,
    reasons:skipped.slice(0,20),
    regime:REGIMES,tradeStyle,
    feeds:{finnhub:!!FINNHUB_KEY,fred:!!FRED_KEY,ecoEvents:ecoData.recent?.length||0,yieldPairs:Object.keys(yields).length},
    feedErrors:feedErrors.length>0?feedErrors:undefined,
    timestamp:new Date().toISOString()
  })};
};
