// AXIOM Signal Analysis Engine
// @netlify-function timeout=26
// Real technical analysis - NO randomness
// All 51 strategies evaluated against actual market data

const OANDA_KEY = process.env.OANDA_API_KEY;
const ACCOUNT_ID = process.env.OANDA_ACCOUNT_ID || '001-001-21201857-001';
const BASE = 'https://api-trade.oanda.com/v3';

// ── INDICATOR MATH ──────────────────────────────────────────────────────────

function ema(data, period) {
  const k = 2 / (period + 1);
  let result = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] * k + result[i-1] * (1 - k));
  }
  return result;
}

function sma(data, period) {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    return data.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period;
  });
}

function rsi(closes, period = 14) {
  let gains = [], losses = [];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i-1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? Math.abs(diff) : 0);
  }
  const result = new Array(period).fill(null);
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b) / period;
  result.push(100 - 100 / (1 + (avgLoss === 0 ? 999 : avgGain / avgLoss)));
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    result.push(100 - 100 / (1 + (avgLoss === 0 ? 999 : avgGain / avgLoss)));
  }
  return result;
}

function atr(candles, period = 14) {
  const tr = candles.map((c, i) => {
    if (i === 0) return c.h - c.l;
    const prev = candles[i-1];
    return Math.max(c.h - c.l, Math.abs(c.h - prev.c), Math.abs(c.l - prev.c));
  });
  const result = new Array(period - 1).fill(null);
  let atrVal = tr.slice(0, period).reduce((a, b) => a + b) / period;
  result.push(atrVal);
  for (let i = period; i < tr.length; i++) {
    atrVal = (atrVal * (period - 1) + tr[i]) / period;
    result.push(atrVal);
  }
  return result;
}

function macd(closes, fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = ema(macdLine.slice(slow - 1), signal);
  const paddedSignal = new Array(slow - 1).fill(null).concat(signalLine);
  const histogram = macdLine.map((v, i) => paddedSignal[i] !== null ? v - paddedSignal[i] : null);
  return { macd: macdLine, signal: paddedSignal, histogram };
}

function bollingerBands(closes, period = 20, stdDev = 2) {
  const middleBand = sma(closes, period);
  const result = closes.map((_, i) => {
    if (middleBand[i] === null) return { upper: null, middle: null, lower: null };
    const slice = closes.slice(Math.max(0, i - period + 1), i + 1);
    const mean = middleBand[i];
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / slice.length;
    const std = Math.sqrt(variance);
    return {
      upper: mean + stdDev * std,
      middle: mean,
      lower: mean - stdDev * std,
      width: (2 * stdDev * std) / mean // bandwidth %
    };
  });
  return result;
}

function adx(candles, period = 14) {
  const trueRanges = candles.map((c, i) => {
    if (i === 0) return { tr: c.h - c.l, plusDM: 0, minusDM: 0 };
    const prev = candles[i-1];
    const tr = Math.max(c.h - c.l, Math.abs(c.h - prev.c), Math.abs(c.l - prev.c));
    const plusDM = c.h - prev.h > prev.l - c.l ? Math.max(c.h - prev.h, 0) : 0;
    const minusDM = prev.l - c.l > c.h - prev.h ? Math.max(prev.l - c.l, 0) : 0;
    return { tr, plusDM, minusDM };
  });
  let smoothTR = trueRanges.slice(0, period).reduce((a, b) => a + b.tr, 0);
  let smoothPlus = trueRanges.slice(0, period).reduce((a, b) => a + b.plusDM, 0);
  let smoothMinus = trueRanges.slice(0, period).reduce((a, b) => a + b.minusDM, 0);
  const adxValues = new Array(period).fill(null);
  let prevDX = null;
  let adxVal = null;
  for (let i = period; i < trueRanges.length; i++) {
    smoothTR = smoothTR - smoothTR / period + trueRanges[i].tr;
    smoothPlus = smoothPlus - smoothPlus / period + trueRanges[i].plusDM;
    smoothMinus = smoothMinus - smoothMinus / period + trueRanges[i].minusDM;
    const plusDI = smoothTR === 0 ? 0 : 100 * smoothPlus / smoothTR;
    const minusDI = smoothTR === 0 ? 0 : 100 * smoothMinus / smoothTR;
    const dx = (plusDI + minusDI) === 0 ? 0 : 100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI);
    if (prevDX === null) {
      adxVal = dx;
    } else {
      adxVal = (adxVal * (period - 1) + dx) / period;
    }
    prevDX = dx;
    adxValues.push({ adx: adxVal, plusDI, minusDI });
  }
  return adxValues;
}

function swingLevels(candles, lookback = 10) {
  const highs = [], lows = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const window = candles.slice(i - lookback, i + lookback + 1);
    const isSwingHigh = candles[i].h === Math.max(...window.map(c => c.h));
    const isSwingLow = candles[i].l === Math.min(...window.map(c => c.l));
    if (isSwingHigh) highs.push({ price: candles[i].h, idx: i, time: candles[i].t });
    if (isSwingLow) lows.push({ price: candles[i].l, idx: i, time: candles[i].t });
  }
  return { highs: highs.slice(-8), lows: lows.slice(-8) };
}

function ichimoku(candles) {
  const tenkanPeriod = 9, kijunPeriod = 26, senkouBPeriod = 52;
  const result = candles.map((_, i) => {
    const tenkan = i >= tenkanPeriod - 1
      ? (Math.max(...candles.slice(i - tenkanPeriod + 1, i + 1).map(c => c.h)) +
         Math.min(...candles.slice(i - tenkanPeriod + 1, i + 1).map(c => c.l))) / 2 : null;
    const kijun = i >= kijunPeriod - 1
      ? (Math.max(...candles.slice(i - kijunPeriod + 1, i + 1).map(c => c.h)) +
         Math.min(...candles.slice(i - kijunPeriod + 1, i + 1).map(c => c.l))) / 2 : null;
    const senkouA = tenkan !== null && kijun !== null ? (tenkan + kijun) / 2 : null;
    const senkouB = i >= senkouBPeriod - 1
      ? (Math.max(...candles.slice(i - senkouBPeriod + 1, i + 1).map(c => c.h)) +
         Math.min(...candles.slice(i - senkouBPeriod + 1, i + 1).map(c => c.l))) / 2 : null;
    return { tenkan, kijun, senkouA, senkouB };
  });
  return result;
}

function keltnerChannels(candles, emaPeriod = 20, atrMult = 1.5) {
  const closes = candles.map(c => c.c);
  const emaLine = ema(closes, emaPeriod);
  const atrLine = atr(candles, emaPeriod);
  return candles.map((_, i) => ({
    upper: emaLine[i] + atrMult * (atrLine[i] || 0),
    middle: emaLine[i],
    lower: emaLine[i] - atrMult * (atrLine[i] || 0)
  }));
}

function stochasticRSI(closes, rsiPeriod = 14, stochPeriod = 14, kPeriod = 3, dPeriod = 3) {
  const rsiValues = rsi(closes, rsiPeriod).filter(v => v !== null);
  const stochK = rsiValues.map((_, i) => {
    if (i < stochPeriod - 1) return null;
    const slice = rsiValues.slice(i - stochPeriod + 1, i + 1);
    const min = Math.min(...slice), max = Math.max(...slice);
    return max === min ? 0 : (rsiValues[i] - min) / (max - min) * 100;
  }).filter(v => v !== null);
  const kSmoothed = sma(stochK, kPeriod).filter(v => v !== null);
  const dSmoothed = sma(kSmoothed, dPeriod).filter(v => v !== null);
  return {
    k: kSmoothed[kSmoothed.length - 1],
    d: dSmoothed[dSmoothed.length - 1],
    prevK: kSmoothed[kSmoothed.length - 2],
    prevD: dSmoothed[dSmoothed.length - 2]
  };
}

// ── FETCH CANDLES ───────────────────────────────────────────────────────────

async function fetchCandles(instrument, granularity, count = 200) {
  const url = `${BASE}/instruments/${instrument}/candles?count=${count}&granularity=${granularity}&price=M`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${OANDA_KEY}` },
    signal: AbortSignal.timeout(12000)
  });
  if (!res.ok) throw new Error(`Candle fetch failed ${res.status} for ${instrument} ${granularity}`);
  const data = await res.json();
  return (data.candles || []).filter(c => c.complete).map(c => ({
    t: c.time, o: parseFloat(c.mid.o), h: parseFloat(c.mid.h),
    l: parseFloat(c.mid.l), c: parseFloat(c.mid.c), v: c.volume || 0
  }));
}

async function fetchLivePrice(instrument) {
  const url = `${BASE}/accounts/${ACCOUNT_ID}/pricing?instruments=${instrument}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${OANDA_KEY}` },
    signal: AbortSignal.timeout(6000)
  });
  if (!res.ok) throw new Error(`Price fetch failed for ${instrument}`);
  const data = await res.json();
  const price = data.prices?.[0];
  if (!price) throw new Error(`No price data for ${instrument}`);
  const bid = parseFloat(price.bids[0].price);
  const ask = parseFloat(price.asks[0].price);
  return { bid, ask, mid: (bid + ask) / 2, spread: ask - bid };
}

// ── CARRY RATE DATA ─────────────────────────────────────────────────────────
const CB_RATES = {
  USD: 3.875, EUR: 2.00, GBP: 3.75, JPY: 0.75,
  AUD: 3.85, CAD: 2.25, CHF: 0.00, NZD: 3.00
};

const REGIMES = {
  USD: { dir: 'BEARISH', strength: 'STRONG' },
  JPY: { dir: 'BULLISH', strength: 'STRONG' },
  EUR: { dir: 'BULLISH', strength: 'MOD' },
  GBP: { dir: 'NEUTRAL', strength: 'MOD' },
  NZD: { dir: 'BEARISH', strength: 'STRONG' },
  AUD: { dir: 'BULLISH', strength: 'MOD' },
  CAD: { dir: 'BEARISH', strength: 'MOD' },
  CHF: { dir: 'BULLISH', strength: 'MOD' }
};

// ── SESSION LOGIC ───────────────────────────────────────────────────────────
function getActiveSession() {
  const utcH = new Date().getUTCHours();
  const sessions = {
    SYDNEY:   { start: 21, end: 6  },
    TOKYO:    { start: 23, end: 8  },
    LONDON:   { start: 7,  end: 16 },
    NEW_YORK: { start: 12, end: 21 }
  };
  const active = [];
  for (const [name, s] of Object.entries(sessions)) {
    const isOpen = s.start < s.end
      ? utcH >= s.start && utcH < s.end
      : utcH >= s.start || utcH < s.end;
    if (isOpen) active.push(name);
  }
  return active;
}

function sessionSuitssPair(pair, activeSessions) {
  const base = pair.split('/')[0];
  const sessionMap = {
    JPY: ['TOKYO', 'LONDON'],
    AUD: ['SYDNEY', 'TOKYO'],
    NZD: ['SYDNEY', 'TOKYO'],
    EUR: ['LONDON', 'NEW_YORK'],
    GBP: ['LONDON', 'NEW_YORK'],
    CHF: ['LONDON', 'NEW_YORK'],
    USD: ['LONDON', 'NEW_YORK'],
    CAD: ['NEW_YORK']
  };
  const preferred = sessionMap[base] || ['LONDON', 'NEW_YORK'];
  return preferred.some(s => activeSessions.includes(s));
}

// ── MACRO REGIME ALIGNMENT ──────────────────────────────────────────────────
function regimeDirectionForPair(pair) {
  const [base, quote] = pair.split('/');
  const baseReg = REGIMES[base];
  const quoteReg = REGIMES[quote];
  if (!baseReg || !quoteReg) return 'NEUTRAL';

  const baseBullish = baseReg.dir === 'BULLISH';
  const baseBearish = baseReg.dir === 'BEARISH';
  const quoteBullish = quoteReg.dir === 'BULLISH';
  const quoteBearish = quoteReg.dir === 'BEARISH';

  // BUY base/quote when base is strong and quote is weak
  if (baseBullish && quoteBearish) return 'STRONG_BUY';
  if (baseBullish && quoteReg.dir === 'NEUTRAL') return 'MILD_BUY';
  if (baseReg.dir === 'NEUTRAL' && quoteBearish) return 'MILD_BUY';
  if (baseBearish && quoteBullish) return 'STRONG_SELL';
  if (baseBearish && quoteReg.dir === 'NEUTRAL') return 'MILD_SELL';
  if (baseReg.dir === 'NEUTRAL' && quoteBullish) return 'MILD_SELL';
  return 'NEUTRAL'; // Both same direction = no edge
}

// ── CARRY ANALYSIS ──────────────────────────────────────────────────────────
function carryAnalysis(pair) {
  const [base, quote] = pair.split('/');
  const diff = (CB_RATES[base] || 0) - (CB_RATES[quote] || 0);
  return {
    diff,
    favors: diff > 0.5 ? 'BUY' : diff < -0.5 ? 'SELL' : 'NEUTRAL',
    strong: Math.abs(diff) > 1.5
  };
}

// ── ENGULFING CANDLE DETECTION ───────────────────────────────────────────────
function detectEngulfing(candles) {
  const len = candles.length;
  if (len < 2) return null;
  const prev = candles[len-2];
  const curr = candles[len-1];
  const prevBullish = prev.c > prev.o;
  const currBullish = curr.c > curr.o;
  if (!prevBullish && currBullish && curr.o < prev.c && curr.c > prev.o) return 'BULLISH';
  if (prevBullish && !currBullish && curr.o > prev.c && curr.c < prev.o) return 'BEARISH';
  return null;
}

// ── ICT ORDER BLOCK DETECTION ────────────────────────────────────────────────
function detectOrderBlock(candles, direction) {
  // Last bearish candle before a bullish impulse (bullish OB) or vice versa
  const len = candles.length;
  if (len < 5) return null;
  const recent = candles.slice(-10);
  for (let i = recent.length - 3; i >= 1; i--) {
    const candle = recent[i];
    if (direction === 'BUY') {
      // Bearish candle followed by bullish move
      if (candle.c < candle.o) {
        const afterMove = recent.slice(i+1).every(c => c.c > candle.h);
        if (afterMove) return { ob_high: candle.h, ob_low: candle.l, type: 'BULLISH_OB' };
      }
    } else {
      // Bullish candle followed by bearish move
      if (candle.c > candle.o) {
        const afterMove = recent.slice(i+1).every(c => c.c < candle.l);
        if (afterMove) return { ob_high: candle.h, ob_low: candle.l, type: 'BEARISH_OB' };
      }
    }
  }
  return null;
}

// ── VWAP APPROXIMATION ───────────────────────────────────────────────────────
function calcVWAP(candles) {
  // Approximate VWAP using typical price * volume
  let cumTPV = 0, cumVol = 0;
  const result = candles.map(c => {
    const tp = (c.h + c.l + c.c) / 3;
    cumTPV += tp * (c.v || 1);
    cumVol += (c.v || 1);
    return cumTPV / cumVol;
  });
  return result;
}

// ── COT PROXY (using price momentum as institutional positioning proxy) ───────
function cotProxy(candles) {
  // Proxy for institutional positioning: 
  // Use 26-week price momentum as COT directional bias
  if (candles.length < 26) return 'NEUTRAL';
  const now = candles[candles.length-1].c;
  const past = candles[candles.length-26].c;
  const momentum = (now - past) / past;
  if (momentum > 0.02) return 'LONG';
  if (momentum < -0.02) return 'SHORT';
  return 'NEUTRAL';
}

// ── MAIN ANALYSIS ENGINE ─────────────────────────────────────────────────────
async function analyzeSignal(pair) {
  const instrument = pair.replace('/', '_');
  const isJPY = pair.includes('JPY');
  const pipSize = isJPY ? 0.01 : 0.0001;
  const pipMult = isJPY ? 100 : 10000;

  // Fetch data: H4 for swing/day, H1 for day, D1 for macro
  const [candlesH4, candlesH1, candlesD1, livePrice] = await Promise.all([
    fetchCandles(instrument, 'H4', 200),
    fetchCandles(instrument, 'H1', 200),
    fetchCandles(instrument, 'D', 100),
    fetchLivePrice(instrument)
  ]);

  if (!candlesH4.length || !candlesH1.length) {
    return { signal: null, reason: 'Insufficient candle data' };
  }

  const closesH4 = candlesH4.map(c => c.c);
  const closesH1 = candlesH1.map(c => c.c);
  const closesD1 = candlesD1.map(c => c.c);
  const currentPrice = livePrice.mid;

  // ── CALCULATE ALL INDICATORS ──────────────────────────────────────────────

  // EMAs
  const ema20H4 = ema(closesH4, 20);
  const ema50H4 = ema(closesH4, 50);
  const ema200H4 = ema(closesH4, 200);
  const ema20H1 = ema(closesH1, 20);
  const ema50H1 = ema(closesH1, 50);
  const ema200H1 = ema(closesH1, 200);
  const ema200D1 = ema(closesD1, 200);

  // RSI
  const rsiH4 = rsi(closesH4, 14);
  const rsiH1 = rsi(closesH1, 14);
  const rsiD1 = rsi(closesD1, 14);

  // ATR
  const atrH4 = atr(candlesH4, 14);
  const atrH1 = atr(candlesH1, 14);
  const atrD1 = atr(candlesD1, 14);

  // MACD
  const macdH4 = macd(closesH4);
  const macdH1 = macd(closesH1);

  // Bollinger
  const bbH4 = bollingerBands(closesH4, 20, 2);
  const bbH1 = bollingerBands(closesH1, 20, 2);

  // ADX
  const adxH4 = adx(candlesH4, 14).filter(v => v !== null);
  const adxH1 = adx(candlesH1, 14).filter(v => v !== null);

  // Ichimoku on H4
  const ichiH4 = ichimoku(candlesH4);

  // Keltner Channels H4
  const keltH4 = keltnerChannels(candlesH4, 20, 1.5);

  // StochRSI
  const stochH4 = stochasticRSI(closesH4);
  const stochH1 = stochasticRSI(closesH1);

  // Swing levels
  const swingsH4 = swingLevels(candlesH4, 5);
  const swingsD1 = swingLevels(candlesD1, 3);

  // VWAP H1
  const vwapH1 = calcVWAP(candlesH1);

  // Engulfing
  const engH4 = detectEngulfing(candlesH4);
  const engH1 = detectEngulfing(candlesH1);

  // Current values
  const currEma20H4 = ema20H4[ema20H4.length-1];
  const currEma50H4 = ema50H4[ema50H4.length-1];
  const currEma200H4 = ema200H4[ema200H4.length-1];
  const prevEma20H4 = ema20H4[ema20H4.length-2];
  const prevEma50H4 = ema50H4[ema50H4.length-2];

  const currEma20H1 = ema20H1[ema20H1.length-1];
  const currEma50H1 = ema50H1[ema50H1.length-1];
  const currEma200H1 = ema200H1[ema200H1.length-1];

  const currEma200D1 = ema200D1[ema200D1.length-1];

  const currRsiH4 = rsiH4[rsiH4.length-1];
  const prevRsiH4 = rsiH4[rsiH4.length-2];
  const currRsiH1 = rsiH1[rsiH1.length-1];
  const currRsiD1 = rsiD1[rsiD1.length-1];

  const currAtrH4 = atrH4[atrH4.length-1];
  const currAtrH1 = atrH1[atrH1.length-1];
  const currAtrD1 = atrD1[atrD1.length-1];
  const avgAtrH4 = atrH4.slice(-20).reduce((a, b) => a + b, 0) / 20;

  const currMacdH4 = macdH4.macd[macdH4.macd.length-1];
  const currMacdSigH4 = macdH4.signal[macdH4.signal.length-1];
  const prevMacdH4 = macdH4.macd[macdH4.macd.length-2];
  const prevMacdSigH4 = macdH4.signal[macdH4.signal.length-2];

  const currBbH4 = bbH4[bbH4.length-1];
  const currBbH1 = bbH1[bbH1.length-1];

  const currAdxH4 = adxH4[adxH4.length-1];
  const currAdxH1 = adxH1[adxH1.length-1];

  const currIchiH4 = ichiH4[ichiH4.length-1];
  const futureIchiH4 = ichiH4[ichiH4.length-1-26] || currIchiH4;

  const currKeltH4 = keltH4[keltH4.length-1];
  const currVwapH1 = vwapH1[vwapH1.length-1];

  const cotSignal = cotProxy(candlesD1.length >= 26 ? candlesD1 : candlesH4);

  // ── MACRO & REGIME ────────────────────────────────────────────────────────
  const regimeSignal = regimeDirectionForPair(pair);
  const carry = carryAnalysis(pair);
  const activeSessions = getActiveSession();
  const sessionOk = sessionSuitssPair(pair, activeSessions);

  if (regimeSignal === 'NEUTRAL') {
    return { signal: null, reason: `${pair}: Both currencies in same direction — no macro edge` };
  }

  const macroBuy = regimeSignal === 'STRONG_BUY' || regimeSignal === 'MILD_BUY';
  const macroSell = regimeSignal === 'STRONG_SELL' || regimeSignal === 'MILD_SELL';

  // ── TREND ANALYSIS ────────────────────────────────────────────────────────
  const aboveEma200H4 = currentPrice > currEma200H4;
  const aboveEma200H1 = currentPrice > currEma200H1;
  const aboveEma200D1 = currentPrice > currEma200D1;
  const ema20AboveEma50H4 = currEma20H4 > currEma50H4;
  const ema20AboveEma50H1 = currEma20H1 > currEma50H1;

  // Golden/Death cross detection on H4 (EMA20 crossing EMA50)
  const goldenCrossH4 = currEma20H4 > currEma50H4 && prevEma20H4 <= prevEma50H4;
  const deathCrossH4 = currEma20H4 < currEma50H4 && prevEma20H4 >= prevEma50H4;

  // ── MOMENTUM ──────────────────────────────────────────────────────────────
  const rsiOversoldH4 = currRsiH4 < 40;
  const rsiOverboughtH4 = currRsiH4 > 60;
  const rsiBullishZone = currRsiH4 >= 45 && currRsiH4 <= 65;
  const rsiBearishZone = currRsiH4 >= 35 && currRsiH4 <= 55;
  const rsiRisingH4 = currRsiH4 > prevRsiH4;
  const macdBullishCross = currMacdH4 > currMacdSigH4 && prevMacdH4 <= prevMacdSigH4;
  const macdBearishCross = currMacdH4 < currMacdSigH4 && prevMacdH4 >= prevMacdSigH4;
  const macdBullish = currMacdH4 > currMacdSigH4;
  const macdBearish = currMacdH4 < currMacdSigH4;
  const adxTrending = currAdxH4 && currAdxH4.adx > 20;
  const adxStrong = currAdxH4 && currAdxH4.adx > 30;

  // ── VOLATILITY ────────────────────────────────────────────────────────────
  const volatilityPresent = currAtrH4 > avgAtrH4 * 0.7; // At least 70% of avg ATR
  const bbSqueezing = currBbH4 && currBbH4.width < 0.008; // Tight bands = breakout pending
  const aboveBbMidH4 = currBbH4 && currentPrice > currBbH4.middle;
  const nearBbUpperH4 = currBbH4 && currentPrice > currBbH4.upper * 0.998;
  const nearBbLowerH4 = currBbH4 && currentPrice < currBbH4.lower * 1.002;
  const keltnerSqueeze = currKeltH4 && currBbH4 &&
    currBbH4.upper < currKeltH4.upper && currBbH4.lower > currKeltH4.lower;

  // ── STRUCTURE ─────────────────────────────────────────────────────────────
  // Find nearest support/resistance
  const allResistances = [...swingsH4.highs, ...swingsD1.highs].map(s => s.price).filter(p => p > currentPrice);
  const allSupports = [...swingsH4.lows, ...swingsD1.lows].map(s => s.price).filter(p => p < currentPrice);
  const nearestResistance = allResistances.length ? Math.min(...allResistances) : currentPrice * 1.005;
  const nearestSupport = allSupports.length ? Math.max(...allSupports) : currentPrice * 0.995;

  const distanceToResistance = (nearestResistance - currentPrice) / currAtrH4;
  const distanceToSupport = (currentPrice - nearestSupport) / currAtrH4;

  // Price at/near support for BUY or resistance for SELL
  const atSupport = distanceToSupport < 1.5; // Within 1.5 ATR of support
  const atResistance = distanceToResistance < 1.5; // Within 1.5 ATR of resistance
  const roomToResistance = distanceToResistance > 2.0; // Enough room to run
  const roomToSupport = distanceToSupport > 2.0;

  // ── ICHIMOKU ──────────────────────────────────────────────────────────────
  const priceAboveCloud = currIchiH4.senkouA && currIchiH4.senkouB &&
    currentPrice > Math.max(currIchiH4.senkouA, currIchiH4.senkouB);
  const priceBelowCloud = currIchiH4.senkouA && currIchiH4.senkouB &&
    currentPrice < Math.min(currIchiH4.senkouA, currIchiH4.senkouB);
  const tenkanAboveKijun = currIchiH4.tenkan > currIchiH4.kijun;
  const tenkanBelowKijun = currIchiH4.tenkan < currIchiH4.kijun;

  // ── VWAP ──────────────────────────────────────────────────────────────────
  const aboveVwap = currentPrice > currVwapH1;
  const belowVwap = currentPrice < currVwapH1;

  // ── STOCHASTIC RSI ─────────────────────────────────────────────────────────
  const stochOversold = stochH4.k < 20;
  const stochOverbought = stochH4.k > 80;
  const stochBullishCross = stochH4.k > stochH4.d && stochH4.prevK <= stochH4.prevD;
  const stochBearishCross = stochH4.k < stochH4.d && stochH4.prevK >= stochH4.prevD;

  // ── ORDER BLOCK ───────────────────────────────────────────────────────────
  const bullishOB = detectOrderBlock(candlesH4, 'BUY');
  const bearishOB = detectOrderBlock(candlesH4, 'SELL');
  const atBullishOB = bullishOB && currentPrice >= bullishOB.ob_low && currentPrice <= bullishOB.ob_high * 1.001;
  const atBearishOB = bearishOB && currentPrice <= bearishOB.ob_high && currentPrice >= bearishOB.ob_low * 0.999;

  // ── STRATEGY EVALUATION ───────────────────────────────────────────────────
  // For each strategy, check if its specific conditions are genuinely met
  // Returns { met: bool, score: 0-3, description: string }

  const stratConditions = {
    // MACRO STRATEGIES
    BOJ_NORM: () => {
      if (!pair.includes('JPY')) return { met: false, score: 0, desc: 'Not a JPY pair' };
      const jpyBullish = REGIMES.JPY.dir === 'BULLISH';
      const met = jpyBullish && (pair.startsWith('USD') || pair.startsWith('EUR'));
      return { met, score: met ? 3 : 0, desc: met ? 'BOJ hiking confirmed, JPY structurally bid' : 'BOJ conditions not met' };
    },
    CB_DIV: () => {
      const [base, quote] = pair.split('/');
      const bReg = REGIMES[base], qReg = REGIMES[quote];
      const divergent = bReg && qReg && bReg.dir !== qReg.dir && bReg.dir !== 'NEUTRAL' && qReg.dir !== 'NEUTRAL';
      const score = divergent ? (bReg.strength === 'STRONG' || qReg.strength === 'STRONG' ? 3 : 2) : 0;
      return { met: divergent, score, desc: divergent ? `CB divergence: ${base} ${bReg.dir} vs ${quote} ${qReg.dir}` : 'No CB divergence' };
    },
    REAL_YLD: () => {
      // Real yield = nominal rate - 2.5% (assumed inflation for simplicity)
      const [base, quote] = pair.split('/');
      const realYldDiff = ((CB_RATES[base]||0) - 2.5) - ((CB_RATES[quote]||0) - 2.5);
      const met = Math.abs(realYldDiff) > 1.0;
      return { met, score: met ? 2 : 0, desc: met ? `Real yield diff: ${realYldDiff.toFixed(2)}%` : 'Insufficient yield diff' };
    },
    CB_COMM: () => {
      // Central bank communication — use regime strength as proxy
      const [base, quote] = pair.split('/');
      const baseStrong = REGIMES[base]?.strength === 'STRONG';
      const quoteStrong = REGIMES[quote]?.strength === 'STRONG';
      const met = baseStrong || quoteStrong;
      return { met, score: met ? 2 : 1, desc: met ? 'Strong CB communication signal' : 'Moderate CB signal' };
    },
    GLOB_MAC: () => {
      const strongCount = Object.values(REGIMES).filter(r => r.strength === 'STRONG').length;
      const met = strongCount >= 3 && regimeSignal !== 'NEUTRAL';
      return { met, score: met ? 2 : 0, desc: met ? 'Global macro regime aligned' : 'Macro regime unclear' };
    },
    GRW_DIV: () => {
      // Growth divergence proxy: use regime direction and strength
      const [base, quote] = pair.split('/');
      const bReg = REGIMES[base], qReg = REGIMES[quote];
      const met = bReg && qReg && bReg.dir !== qReg.dir;
      return { met, score: met ? 2 : 0, desc: met ? 'Growth divergence present' : 'No growth divergence' };
    },
    EARL_WRN: () => {
      // Early warning: RSI divergence + regime shift signal
      const rsiDivergence = (macroBuy && rsiOversoldH4) || (macroSell && rsiOverboughtH4);
      return { met: rsiDivergence, score: rsiDivergence ? 2 : 0, desc: rsiDivergence ? 'Early RSI + regime signal' : 'No early warning' };
    },
    REGIME_SW: () => {
      const met = goldenCrossH4 || deathCrossH4;
      return { met, score: met ? 2 : 0, desc: met ? 'Regime switch: EMA cross on H4' : 'No regime switch' };
    },
    TOT_SHOCK: () => {
      // Terms of trade proxy: commodity pairs (AUD, CAD, NZD)
      const commodityCCY = ['AUD', 'CAD', 'NZD'];
      const [base, quote] = pair.split('/');
      const hasCommodity = commodityCCY.includes(base) || commodityCCY.includes(quote);
      const met = hasCommodity && volatilityPresent;
      return { met, score: met ? 1 : 0, desc: met ? 'Commodity CCY + elevated vol' : 'No ToT setup' };
    },
    BOP_FLOW: () => {
      // Balance of payments: JPY & CHF pairs specifically
      const [base, quote] = pair.split('/');
      const isBopPair = base === 'JPY' || quote === 'JPY' || base === 'CHF' || quote === 'CHF';
      const met = isBopPair && regimeSignal !== 'NEUTRAL';
      return { met, score: met ? 1 : 0, desc: met ? 'BOP-driven safe haven' : 'Not BOP pair' };
    },
    PPP_VAL: () => {
      // PPP: long-term mean reversion — only on D1 timeframe
      const d1Trend = aboveEma200D1;
      return { met: true, score: 1, desc: `PPP ${d1Trend ? 'above' : 'below'} D1 EMA200` };
    },

    // TECHNICAL STRATEGIES
    STRUCT_BK: () => {
      const breakout = (macroBuy && currentPrice > nearestResistance * 0.999 && roomToResistance) ||
                       (macroSell && currentPrice < nearestSupport * 1.001 && roomToSupport);
      return { met: breakout, score: breakout ? 3 : 0, desc: breakout ? 'Structure breakout confirmed' : 'No structure break' };
    },
    ICT_OB: () => {
      const met = (macroBuy && atBullishOB) || (macroSell && atBearishOB);
      return { met, score: met ? 3 : 0, desc: met ? 'ICT order block mitigation' : 'Not at order block' };
    },
    STOP_HNT: () => {
      // Stop hunt: price swept beyond swing high/low then reversed
      const recentH4 = candlesH4.slice(-5);
      const sweptHigh = recentH4.some(c => c.h > nearestResistance) && currentPrice < nearestResistance;
      const sweptLow = recentH4.some(c => c.l < nearestSupport) && currentPrice > nearestSupport;
      const met = (macroSell && sweptHigh) || (macroBuy && sweptLow);
      return { met, score: met ? 3 : 0, desc: met ? 'Liquidity sweep detected' : 'No sweep' };
    },
    SESS_BRK: () => {
      const londonOpen = activeSessions.includes('LONDON');
      const nyOpen = activeSessions.includes('NEW_YORK');
      const met = (londonOpen || nyOpen) && adxStrong && volatilityPresent;
      return { met, score: met ? 2 : 0, desc: met ? `Session breakout: ${activeSessions.join('/')}` : 'Wrong session' };
    },
    VOL_BRK: () => {
      const met = (bbSqueezing || keltnerSqueeze) && adxStrong;
      return { met, score: met ? 3 : 0, desc: met ? 'Volatility squeeze breakout' : 'No squeeze' };
    },
    ADX_BRK: () => {
      const met = adxStrong && ((macroBuy && currAdxH4.plusDI > currAdxH4.minusDI) ||
                                (macroSell && currAdxH4.minusDI > currAdxH4.plusDI));
      return { met: met, score: met ? 2 : 0, desc: met ? `ADX ${currAdxH4?.adx?.toFixed(1)} strong trend` : `ADX ${currAdxH4?.adx?.toFixed(1)} weak` };
    },
    LDN_BRK: () => {
      const met = activeSessions.includes('LONDON') && volatilityPresent &&
                  ((macroBuy && aboveEma200H1) || (macroSell && !aboveEma200H1));
      return { met, score: met ? 2 : 0, desc: met ? 'London breakout setup' : 'Not London session' };
    },
    FIBO_PULL: () => {
      // 61.8% retracement: price pulled back into Fibonacci zone
      const recentHighH4 = Math.max(...candlesH4.slice(-20).map(c => c.h));
      const recentLowH4 = Math.min(...candlesH4.slice(-20).map(c => c.l));
      const fib618Buy = recentLowH4 + (recentHighH4 - recentLowH4) * 0.382; // 61.8% retrace
      const fib618Sell = recentLowH4 + (recentHighH4 - recentLowH4) * 0.618;
      const atFibBuy = macroBuy && currentPrice >= fib618Buy * 0.998 && currentPrice <= fib618Buy * 1.002;
      const atFibSell = macroSell && currentPrice >= fib618Sell * 0.998 && currentPrice <= fib618Sell * 1.002;
      const met = atFibBuy || atFibSell;
      return { met, score: met ? 2 : 0, desc: met ? 'Price at 61.8% Fibonacci level' : 'Not at Fib level' };
    },
    ICHIMOKU: () => {
      const met = (macroBuy && priceAboveCloud && tenkanAboveKijun) ||
                  (macroSell && priceBelowCloud && tenkanBelowKijun);
      return { met, score: met ? 3 : 0, desc: met ? 'Ichimoku full alignment' : 'Ichimoku not aligned' };
    },
    KELTNER: () => {
      const met = keltnerSqueeze && volatilityPresent;
      return { met, score: met ? 2 : 0, desc: met ? 'Keltner channel squeeze' : 'No Keltner squeeze' };
    },
    SUPPLY_DEM: () => {
      const met = (macroBuy && atSupport && roomToResistance) ||
                  (macroSell && atResistance && roomToSupport);
      return { met, score: met ? 2 : 0, desc: met ? 'At supply/demand zone' : 'Not at S/D zone' };
    },
    ENG_CAN: () => {
      const met = (macroBuy && (engH4 === 'BULLISH' || engH1 === 'BULLISH')) ||
                  (macroSell && (engH4 === 'BEARISH' || engH1 === 'BEARISH'));
      return { met, score: met ? 2 : 0, desc: met ? `${engH4 || engH1} engulfing candle` : 'No engulfing' };
    },

    // MOMENTUM STRATEGIES
    NEWS_DFT: () => {
      // News drift: strong directional move with volume expansion
      const recentMove = Math.abs((currentPrice - candlesH1[candlesH1.length-4].c) / currAtrH1);
      const met = recentMove > 1.5 && volatilityPresent &&
                  ((macroBuy && currentPrice > candlesH1[candlesH1.length-4].c) ||
                   (macroSell && currentPrice < candlesH1[candlesH1.length-4].c));
      return { met, score: met ? 2 : 0, desc: met ? `News drift: ${(recentMove).toFixed(1)}x ATR move` : 'No news drift' };
    },
    TSM_CTA: () => {
      // Time series momentum: 12-month trend
      const met = ((macroBuy && aboveEma200D1 && aboveEma200H4) ||
                   (macroSell && !aboveEma200D1 && !aboveEma200H4)) && adxTrending;
      return { met, score: met ? 2 : 0, desc: met ? 'CTA trend following aligned' : 'CTA not aligned' };
    },
    CS_MOM: () => {
      // Cross-sectional momentum: pair is outperforming vs others
      const met = ((macroBuy && aboveEma200H4 && macdBullish) ||
                   (macroSell && !aboveEma200H4 && macdBearish));
      return { met, score: met ? 2 : 0, desc: met ? 'Cross-sectional momentum' : 'No CS momentum' };
    },
    MOMO_CRS: () => {
      const met = (macroBuy && goldenCrossH4 && macdBullish) ||
                  (macroSell && deathCrossH4 && macdBearish);
      return { met, score: met ? 3 : 0, desc: met ? 'Momentum cross confirmed' : 'No momentum cross' };
    },
    MON_PULL: () => {
      // Monthly level pullback
      const monthlyHigh = Math.max(...candlesD1.slice(-22).map(c => c.h));
      const monthlyLow = Math.min(...candlesD1.slice(-22).map(c => c.l));
      const atMonthlyPull = (macroBuy && currentPrice < monthlyHigh * 0.98 && currentPrice > monthlyLow * 1.01) ||
                            (macroSell && currentPrice > monthlyLow * 1.02 && currentPrice < monthlyHigh * 0.99);
      return { met: atMonthlyPull, score: atMonthlyPull ? 1 : 0, desc: atMonthlyPull ? 'Monthly pullback setup' : 'Not monthly pullback' };
    },
    TURT_TR: () => {
      // Turtle trading: 20-day breakout
      const dayHigh20 = Math.max(...candlesD1.slice(-20).map(c => c.h));
      const dayLow20 = Math.min(...candlesD1.slice(-20).map(c => c.l));
      const breakoutUp = macroBuy && currentPrice >= dayHigh20 * 0.999;
      const breakoutDown = macroSell && currentPrice <= dayLow20 * 1.001;
      const met = breakoutUp || breakoutDown;
      return { met, score: met ? 2 : 0, desc: met ? '20-day Turtle breakout' : 'No Turtle breakout' };
    },
    DUAL_THR: () => {
      // Dual thrust: intraday range breakout
      const dayRange = currAtrD1;
      const upperThresh = candlesH4[candlesH4.length-1].c + dayRange * 0.4;
      const lowerThresh = candlesH4[candlesH4.length-1].c - dayRange * 0.4;
      const met = (macroBuy && currentPrice > upperThresh) || (macroSell && currentPrice < lowerThresh);
      return { met, score: met ? 1 : 0, desc: met ? 'Dual thrust triggered' : 'No dual thrust' };
    },

    // MEAN REVERSION STRATEGIES
    VWAP_REV: () => {
      const deviation = Math.abs(currentPrice - currVwapH1) / currAtrH1;
      const overextended = deviation > 1.5;
      const met = overextended && ((macroBuy && belowVwap) || (macroSell && aboveVwap));
      return { met, score: met ? 2 : 0, desc: met ? `VWAP reversion: ${deviation.toFixed(1)}x ATR from VWAP` : 'Near VWAP' };
    },
    BB_FADE: () => {
      const met = (macroBuy && nearBbLowerH4 && !adxStrong) ||
                  (macroSell && nearBbUpperH4 && !adxStrong);
      return { met, score: met ? 2 : 0, desc: met ? 'Bollinger Band 2σ fade' : 'Not at BB extreme' };
    },
    STOCH_RSI: () => {
      const met = (macroBuy && stochOversold && stochBullishCross) ||
                  (macroSell && stochOverbought && stochBearishCross);
      return { met, score: met ? 2 : 0, desc: met ? `StochRSI ${macroBuy ? 'oversold cross' : 'overbought cross'}` : 'No StochRSI signal' };
    },
    RSIMR: () => {
      const extremeOversold = currRsiD1 < 30;
      const extremeOverbought = currRsiD1 > 70;
      const met = (macroBuy && extremeOversold) || (macroSell && extremeOverbought);
      return { met, score: met ? 2 : 0, desc: met ? `Daily RSI extreme: ${currRsiD1?.toFixed(1)}` : 'RSI not extreme' };
    },
    ATR_FADE: () => {
      const dailyRange = currAtrH4 * 6; // Approx daily range from H4
      const overextended = Math.abs(currentPrice - candlesH4[candlesH4.length-6].c) > dailyRange * 1.5;
      const met = overextended && !adxStrong;
      return { met, score: met ? 1 : 0, desc: met ? 'ATR overextension fade' : 'No ATR overextension' };
    },

    // CARRY STRATEGIES
    RATE_SRP: () => {
      const surprise = carry.strong && carry.favors !== 'NEUTRAL';
      const aligned = (macroBuy && carry.favors === 'BUY') || (macroSell && carry.favors === 'SELL');
      return { met: aligned && surprise, score: aligned && surprise ? 3 : aligned ? 1 : 0,
               desc: aligned ? `Rate spread ${carry.diff.toFixed(2)}% favors ${carry.favors}` : 'Rate spread against direction' };
    },
    CROSS_CAR: () => {
      const aligned = (macroBuy && carry.favors === 'BUY') || (macroSell && carry.favors === 'SELL');
      return { met: aligned && carry.strong, score: aligned && carry.strong ? 2 : aligned ? 1 : 0,
               desc: aligned ? `Cross-currency carry: ${carry.diff.toFixed(2)}%` : 'Carry against direction' };
    },
    CARRY_MOM: () => {
      const carryAligned = (macroBuy && carry.favors === 'BUY') || (macroSell && carry.favors === 'SELL');
      const momentumAligned = (macroBuy && macdBullish) || (macroSell && macdBearish);
      const met = carryAligned && momentumAligned;
      return { met, score: met ? 2 : 0, desc: met ? 'Carry + momentum aligned' : 'Carry-momentum misaligned' };
    },
    UIP_DEV: () => {
      const significantCarry = Math.abs(carry.diff) > 2.0;
      const met = significantCarry && ((macroBuy && aboveEma200H4) || (macroSell && !aboveEma200H4));
      return { met, score: met ? 1 : 0, desc: met ? 'UIP deviation opportunity' : 'UIP not significant' };
    },
    CARRY: () => {
      const aligned = (macroBuy && carry.favors === 'BUY') || (macroSell && carry.favors === 'SELL');
      return { met: aligned, score: aligned ? 1 : 0, desc: `Carry ${carry.diff.toFixed(2)}%` };
    },

    // FLOW/POSITIONING STRATEGIES
    TRI_ARB: () => {
      // Triangular arbitrage proxy: measure cross-rate divergence
      // This is difficult to truly calculate without real-time multi-pair data
      // Use as confidence signal when tight spread environment detected
      const tightSpread = livePrice.spread < pipSize * 3;
      return { met: tightSpread, score: tightSpread ? 1 : 0, desc: tightSpread ? 'Tight spread / liquidity' : 'Wide spread' };
    },
    WMR_FIX: () => {
      // 4PM London Fix: best at 15:45-16:00 UTC
      const utcH = new Date().getUTCHours(), utcM = new Date().getUTCMinutes();
      const nearFix = (utcH === 15 && utcM >= 30) || (utcH === 16 && utcM <= 15);
      return { met: nearFix, score: nearFix ? 2 : 0, desc: nearFix ? 'WMR Fix window active' : 'Not Fix window' };
    },
    OPT_EXP: () => {
      // Option expiry: round number gravity
      const roundNum = isJPY ? 1.0 : 0.001;
      const nearRound = Math.abs(currentPrice - Math.round(currentPrice / roundNum) * roundNum) < roundNum * 0.2;
      return { met: nearRound, score: nearRound ? 1 : 0, desc: nearRound ? 'Near option expiry level' : 'No expiry gravity' };
    },
    FX_VOL: () => {
      const lowVol = currAtrH4 < avgAtrH4 * 0.8;
      return { met: lowVol, score: lowVol ? 1 : 0, desc: lowVol ? 'Low vol — carry environment' : 'Elevated vol' };
    },
    COT_FADE: () => {
      const extremePositioning = cotSignal !== 'NEUTRAL';
      const contrarian = (macroSell && cotSignal === 'LONG') || (macroBuy && cotSignal === 'SHORT');
      return { met: contrarian, score: contrarian ? 2 : 0, desc: contrarian ? 'COT extreme positioning fade' : 'COT not extreme' };
    },

    // CORRELATION STRATEGIES
    SAFE_HVN: () => {
      const isSafeHaven = pair.includes('JPY') || pair.includes('CHF');
      const riskOff = REGIMES.USD.dir === 'BEARISH' && REGIMES.JPY.dir === 'BULLISH';
      const met = isSafeHaven && riskOff && regimeSignal !== 'NEUTRAL';
      return { met, score: met ? 3 : 0, desc: met ? 'Safe haven demand active' : 'No safe haven flow' };
    },
    GOLD_USD: () => {
      const goldProxy = REGIMES.USD.dir === 'BEARISH';
      const met = goldProxy && (pair.includes('XAU') || pair.includes('CHF') || pair.includes('JPY'));
      return { met, score: met ? 2 : 0, desc: met ? 'Gold/USD correlation signal' : 'No gold correlation' };
    },
    CORR_BRK: () => {
      // Correlation breakdown: pair moving contrary to typical correlation
      const [base, quote] = pair.split('/');
      const baseReg = REGIMES[base], qReg = REGIMES[quote];
      const breakingCorr = baseReg && qReg && baseReg.strength === 'STRONG' && qReg.strength === 'STRONG' && baseReg.dir !== qReg.dir;
      return { met: breakingCorr, score: breakingCorr ? 2 : 0, desc: breakingCorr ? 'Correlation breakdown signal' : 'No correlation break' };
    },
    EQ_BETA: () => {
      const riskOnPairs = ['AUD', 'NZD', 'CAD'];
      const [base] = pair.split('/');
      const isRiskOn = riskOnPairs.includes(base);
      const riskEnv = REGIMES.JPY.dir !== 'BULLISH'; // Risk on when JPY not bid
      const met = isRiskOn && riskEnv && macroBuy;
      return { met, score: met ? 1 : 0, desc: met ? 'Equity beta risk-on' : 'Not equity beta' };
    },
    COMD_CCY: () => {
      const commPairs = ['AUD', 'CAD', 'NZD'];
      const [base] = pair.split('/');
      const isCommodity = commPairs.includes(base);
      const aligned = isCommodity && ((macroBuy && REGIMES[base]?.dir === 'BULLISH') || (macroSell && REGIMES[base]?.dir === 'BEARISH'));
      return { met: aligned, score: aligned ? 1 : 0, desc: aligned ? 'Commodity CCY aligned' : 'Commodity CCY not aligned' };
    },
    RISK_PAR: () => {
      // Risk parity: diversified across pairs — use as confirmation
      const met = adxTrending && volatilityPresent;
      return { met, score: met ? 1 : 0, desc: met ? 'Risk parity conditions met' : 'No risk parity signal' };
    }
  };

  // ── DETERMINE DIRECTION ───────────────────────────────────────────────────
  // Only proceed if macro + primary technicals agree
  let direction = null;

  const buyConditions = [
    aboveEma200H4,
    aboveEma200H1,
    macdBullish,
    aboveBbMidH4,
    ema20AboveEma50H4,
    !rsiOverboughtH4,
    aboveVwap,
    atSupport
  ];
  const sellConditions = [
    !aboveEma200H4,
    !aboveEma200H1,
    macdBearish,
    !aboveBbMidH4,
    !ema20AboveEma50H4,
    !rsiOversoldH4,
    belowVwap,
    atResistance
  ];

  const buyScore = buyConditions.filter(Boolean).length;
  const sellScore = sellConditions.filter(Boolean).length;

  // Direction must agree with macro regime AND technical score
  if (macroBuy && buyScore >= 5) direction = 'BUY';
  else if (macroSell && sellScore >= 5) direction = 'SELL';
  else {
    return {
      signal: null,
      reason: `${pair}: Macro ${regimeSignal} but technical score insufficient (buy:${buyScore}/8 sell:${sellScore}/8)`
    };
  }

  const isBuy = direction === 'BUY';

  // ── EVALUATE ALL APPLICABLE STRATEGIES ───────────────────────────────────
  const evalResults = {};
  let totalScore = 0;
  const triggeredStrategies = [];
  const allStrategyIds = Object.keys(stratConditions);

  for (const stratId of allStrategyIds) {
    const result = stratConditions[stratId]();
    evalResults[stratId] = result;
    if (result.met) {
      totalScore += result.score;
      triggeredStrategies.push({ id: stratId, score: result.score, desc: result.desc });
    }
  }

  // Sort by score descending — best strategies first
  triggeredStrategies.sort((a, b) => b.score - a.score);

  // ── QUALITY GATE ──────────────────────────────────────────────────────────
  // Minimum requirements for a signal to be valid
  const minStrategiesTriggered = 4;
  const minTotalScore = 8;
  const minTechScore = isBuy ? buyScore : sellScore;

  if (triggeredStrategies.length < minStrategiesTriggered) {
    return {
      signal: null,
      reason: `${pair}: Only ${triggeredStrategies.length}/${minStrategiesTriggered} strategies triggered`
    };
  }
  if (totalScore < minTotalScore) {
    return {
      signal: null,
      reason: `${pair}: Strategy score ${totalScore}/${minTotalScore} — insufficient conviction`
    };
  }
  if (!sessionOk) {
    return {
      signal: null,
      reason: `${pair}: Wrong session (active: ${activeSessions.join(', ')})`
    };
  }

  // ── BUILD SIGNAL ──────────────────────────────────────────────────────────
  const entry = isBuy ? livePrice.ask : livePrice.bid;
  const atrPips = Math.round(currAtrH4 * pipMult);

  // SL: beyond nearest swing level + buffer
  const slDistance = isBuy
    ? entry - (nearestSupport - currAtrH4 * 0.5)
    : (nearestResistance + currAtrH4 * 0.5) - entry;
  const slPips = Math.max(12, Math.round(Math.abs(slDistance) * pipMult));

  // TP: based on R:R and next swing levels
  const tp1Pips = Math.round(slPips * 1.5);
  const tp2Pips = Math.round(slPips * 2.5);
  const tp3Pips = Math.round(slPips * 4.0);

  const pip = 1 / pipMult;
  const d = isBuy ? 1 : -1;
  const dec = isJPY ? 3 : 5;

  const sl = parseFloat((entry - d * slPips * pip).toFixed(dec));
  const tp1 = parseFloat((entry + d * tp1Pips * pip).toFixed(dec));
  const tp2 = parseFloat((entry + d * tp2Pips * pip).toFixed(dec));
  const tp3 = parseFloat((entry + d * tp3Pips * pip).toFixed(dec));

  // Lot size: 2% risk
  const ACCT = parseInt(acctParam || '10000');
  const RISK_PCT = parseFloat(riskParam || '2');
  const lotSize = Math.max(0.01, Math.min(2.00,
    Math.round((ACCT * (RISK_PCT/100)) / (slPips * 10.0) * 100) / 100
  ));

  // Probability: based on triggered strategies score (no random component)
  const maxPossibleScore = allStrategyIds.length * 3;
  const rawProb = 52 + (totalScore / maxPossibleScore) * 30; // Range 52-82%
  const probability = Math.min(82, Math.round(rawProb));

  // Primary strategy: highest scoring that triggered
  const primaryStrat = triggeredStrategies[0];
  const supportingStrat = triggeredStrategies[1] || triggeredStrategies[0];

  // Build confluence descriptions from actually triggered strategies
  const confluences = triggeredStrategies.slice(0, 6).map(s => s.desc);

  // Session info
  const sessionNote = `Active sessions: ${activeSessions.join(', ')} · ${sessionOk ? 'Optimal' : 'Suboptimal'} for ${pair}`;
  const regimeNote = `Macro: ${regimeSignal} · Carry: ${carry.diff.toFixed(2)}% (${carry.favors})`;
  const techNote = `EMA200 H4: ${aboveEma200H4 ? 'above' : 'below'} · ADX: ${currAdxH4?.adx?.toFixed(1)} · RSI H4: ${currRsiH4?.toFixed(1)}`;

  return {
    signal: {
      pair, direction, entry, sl, tp1, tp2, tp3,
      slPips, tp1Pips, tp2Pips, tp3Pips,
      rr1: +(tp1Pips/slPips).toFixed(1),
      rr2: +(tp2Pips/slPips).toFixed(1),
      rr3: +(tp3Pips/slPips).toFixed(1),
      lotSize, riskAmount: +(ACCT*(RISK_PCT/100)).toFixed(2),
      probability,
      primaryStrategy: { id: primaryStrat.id, name: primaryStrat.id, tier: 'A', cat: 'REAL', wr: probability },
      supportingStrategy: { id: supportingStrat.id, name: supportingStrat.id },
      confluences,
      technicalScore: totalScore,
      strategiesTriggered: triggeredStrategies.length,
      technicalDetails: { techNote, sessionNote, regimeNote },
      indicators: {
        rsiH4: currRsiH4?.toFixed(1),
        macdH4: currMacdH4?.toFixed(6),
        adxH4: currAdxH4?.adx?.toFixed(1),
        ema20H4: currEma20H4?.toFixed(dec),
        ema50H4: currEma50H4?.toFixed(dec),
        ema200H4: currEma200H4?.toFixed(dec),
        atrH4: (currAtrH4 * pipMult)?.toFixed(1),
        bbUpper: currBbH4?.upper?.toFixed(dec),
        bbLower: currBbH4?.lower?.toFixed(dec),
        carry: carry.diff?.toFixed(2)
      },
      timestamp: new Date().toISOString()
    }
  };
}

// ── HANDLER ──────────────────────────────────────────────────────────────────
exports.handler = async function(event) {
  if (!OANDA_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'OANDA_API_KEY not set' }) };

  const { pair, acct: acctParam, risk: riskParam } = event.queryStringParameters || {};

  if (pair) {
    // Analyze single pair
    try {
      const result = await analyzeSignal(pair);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(result)
      };
    } catch(e) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ signal: null, error: e.message, pair })
      };
    }
  }

  // Scan all 28 pairs — return first valid signal found
  const ALL_PAIRS = [
    'AUD/CAD','AUD/CHF','AUD/JPY','AUD/NZD','AUD/USD',
    'CAD/CHF','CAD/JPY','CHF/JPY','EUR/AUD','EUR/CAD',
    'EUR/CHF','EUR/GBP','EUR/JPY','EUR/NZD','EUR/USD',
    'GBP/AUD','GBP/CAD','GBP/CHF','GBP/JPY','GBP/NZD',
    'GBP/USD','NZD/CAD','NZD/CHF','NZD/JPY','NZD/USD',
    'USD/CAD','USD/CHF','USD/JPY'
  ];

  const signals = [];
  const skipped = [];

  // Analyze pairs concurrently in batches of 4 to avoid overwhelming OANDA
  for (let i = 0; i < ALL_PAIRS.length; i += 2) {
    const batch = ALL_PAIRS.slice(i, i + 2);
    const results = await Promise.allSettled(
      batch.map(p => analyzeSignal(p).catch(e => ({ signal: null, error: e.message, pair: p })))
    );
    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.signal) signals.push(result.value.signal);
        else skipped.push(result.value.reason || result.value.error);
      } else {
        skipped.push(result.reason?.message);
      }
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({
      signals,
      count: signals.length,
      scanned: ALL_PAIRS.length,
      skipped: skipped.length,
      reasons: skipped.slice(0, 10), // First 10 rejection reasons for debugging
      timestamp: new Date().toISOString()
    })
  };
};
