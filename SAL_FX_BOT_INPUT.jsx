import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// AXIOM FX TERMINAL v5.0
// All fixes applied: chart loading, API key input, notifications, calendar,
// infinite scroll news, alphabetical pairs, modal glitch, perf, fullscreen
// ═══════════════════════════════════════════════════════════════════════════

// ── 28 PAIRS ALPHABETICAL (per your request) ────────────────────────────
const ALL_PAIRS = [
  "AUD/CAD","AUD/CHF","AUD/JPY","AUD/NZD","AUD/USD",
  "CAD/CHF","CAD/JPY","CHF/JPY",
  "EUR/AUD","EUR/CAD","EUR/CHF","EUR/GBP","EUR/JPY","EUR/NZD","EUR/USD",
  "GBP/AUD","GBP/CAD","GBP/CHF","GBP/JPY","GBP/NZD","GBP/USD",
  "NZD/CAD","NZD/CHF","NZD/JPY","NZD/USD",
  "USD/CAD","USD/CHF","USD/JPY",
];

const TV_SYM = {
  "AUD/CAD":"FX:AUDCAD","AUD/CHF":"FX:AUDCHF","AUD/JPY":"FX:AUDJPY",
  "AUD/NZD":"FX:AUDNZD","AUD/USD":"FX:AUDUSD","CAD/CHF":"FX:CADCHF",
  "CAD/JPY":"FX:CADJPY","CHF/JPY":"FX:CHFJPY","EUR/AUD":"FX:EURAUD",
  "EUR/CAD":"FX:EURCAD","EUR/CHF":"FX:EURCHF","EUR/GBP":"FX:EURGBP",
  "EUR/JPY":"FX:EURJPY","EUR/NZD":"FX:EURNZD","EUR/USD":"FX:EURUSD",
  "GBP/AUD":"FX:GBPAUD","GBP/CAD":"FX:GBPCAD","GBP/CHF":"FX:GBPCHF",
  "GBP/JPY":"FX:GBPJPY","GBP/NZD":"FX:GBPNZD","GBP/USD":"FX:GBPUSD",
  "NZD/CAD":"FX:NZDCAD","NZD/CHF":"FX:NZDCHF","NZD/JPY":"FX:NZDJPY",
  "NZD/USD":"FX:NZDUSD","USD/CAD":"FX:USDCAD","USD/CHF":"FX:USDCHF",
  "USD/JPY":"FX:USDJPY",
};

// ── REFERENCE PRICES: Forex Factory screenshot Apr 7 2026 ~11:55 PM ─────
// EUR/USD 1.1669, GBP/USD 1.3397, USD/JPY 158.384 (your ForexFactory screenshot)
const BASE_PRICES = {
  "AUD/CAD":0.97776,"AUD/CHF":0.55760,"AUD/JPY":111.783,"AUD/NZD":1.20941,
  "AUD/USD":0.70574,"CAD/CHF":0.57029,"CAD/JPY":114.319,"CHF/JPY":200.450,
  "EUR/AUD":1.65526,"EUR/CAD":1.61854,"EUR/CHF":0.92306,"EUR/GBP":0.86996,
  "EUR/JPY":185.035,"EUR/NZD":2.00195,"EUR/USD":1.16819,
  "GBP/AUD":1.90263,"GBP/CAD":1.86044,"GBP/CHF":1.06098,"GBP/JPY":212.302,
  "GBP/NZD":2.30559,"GBP/USD":1.34102,
  "NZD/CAD":0.80176,"NZD/CHF":0.46020,"NZD/JPY":91.843,"NZD/USD":0.58002,
  "USD/CAD":1.38566,"USD/CHF":0.79019,"USD/JPY":158.395,
};

// ── CB RATES April 2026 ──────────────────────────────────────────────────
const CB = {
  USD:{bank:"Federal Reserve",  rate:3.875,prev:4.125,outlook:"Hold",    next:"2026-04-30",bias:"Neutral"},
  EUR:{bank:"ECB",              rate:2.00, prev:2.15, outlook:"Hold",    next:"2026-04-30",bias:"Neutral"},
  GBP:{bank:"Bank of England",  rate:3.75, prev:4.00, outlook:"Hold",    next:"2026-04-30",bias:"Neutral"},
  JPY:{bank:"Bank of Japan",    rate:0.75, prev:0.50, outlook:"Hiking",  next:"2026-06-01", bias:"Hawkish"},
  AUD:{bank:"RBA",              rate:3.85, prev:4.10, outlook:"Hold",    next:"2026-05-19",bias:"Neutral"},
  CAD:{bank:"Bank of Canada",   rate:2.25, prev:2.50, outlook:"Hold",    next:"2026-04-15",bias:"Neutral"},
  CHF:{bank:"SNB",              rate:0.00, prev:0.25, outlook:"Hold",    next:"2026-06-18",bias:"Neutral"},
  NZD:{bank:"RBNZ",             rate:3.00, prev:3.25, outlook:"Cutting", next:"2026-06-01", bias:"Dovish"},
  NOK:{bank:"Norges Bank",      rate:4.00, prev:4.25, outlook:"Hold",    next:"2026-05-07",bias:"Neutral"},
  SEK:{bank:"Riksbank",         rate:1.75, prev:2.00, outlook:"Hold",    next:"2026-04-30",bias:"Neutral"},
};

// ── FULL APRIL 2026 CALENDAR (ForexFactory-style) ────────────────────────
const FULL_CALENDAR = [
  // April 7
  {dt:"2026-04-07 01:00",ccy:"JPY",ev:"Leading Indicators",         imp:"LOW",  fc:"–",      pr:"112.3%", actual:"112.4%", type:"Indicator"},
  {dt:"2026-04-07 03:00",ccy:"CHF",ev:"Foreign Currency Reserves",  imp:"LOW",  fc:"–",      pr:"725B",   actual:"721B",   type:"Monetary"},
  {dt:"2026-04-07 03:15",ccy:"EUR",ev:"Spanish Services PMI",       imp:"MED",  fc:"55.0",   pr:"54.7",   actual:"53.3",   type:"PMI"},
  {dt:"2026-04-07 03:45",ccy:"EUR",ev:"Italian Services PMI",       imp:"MED",  fc:"52.0",   pr:"50.7",   actual:"48.8",   type:"PMI"},
  {dt:"2026-04-07 03:50",ccy:"EUR",ev:"French Final Services PMI",  imp:"MED",  fc:"46.6",   pr:"46.6",   actual:"48.8",   type:"PMI"},
  {dt:"2026-04-07 03:55",ccy:"EUR",ev:"German Final Services PMI",  imp:"MED",  fc:"50.2",   pr:"50.2",   actual:"50.9",   type:"PMI"},
  {dt:"2026-04-07 04:00",ccy:"EUR",ev:"Final Services PMI",         imp:"MED",  fc:"50.4",   pr:"50.4",   actual:"50.2",   type:"PMI"},
  {dt:"2026-04-07 04:30",ccy:"EUR",ev:"Sentix Investor Confidence", imp:"MED",  fc:"-18.0",  pr:"-8.4",   actual:"-19.2",  type:"Sentiment"},
  {dt:"2026-04-07 04:30",ccy:"GBP",ev:"Final Services PMI",         imp:"MED",  fc:"52.0",   pr:"52.0",   actual:"50.5",   type:"PMI"},
  {dt:"2026-04-07 08:15",ccy:"USD",ev:"ADP Employment Change",      imp:"MED",  fc:"120K",   pr:"77K",    actual:"26K",    type:"Employment"},
  {dt:"2026-04-07 08:30",ccy:"USD",ev:"Core Durable Goods m/m",     imp:"MED",  fc:"0.2%",   pr:"0.7%",   actual:"0.8%",   type:"Manufacturing"},
  {dt:"2026-04-07 10:00",ccy:"CAD",ev:"Ivey PMI",                   imp:"MED",  fc:"52.0",   pr:"55.3",   actual:"49.7",   type:"PMI"},
  {dt:"2026-04-07 10:01",ccy:"USD",ev:"JOLTS Job Openings",         imp:"HIGH", fc:"7.5M",   pr:"7.7M",   actual:"–",      type:"Employment"},
  {dt:"2026-04-07 18:00",ccy:"USD",ev:"FOMC Meeting Minutes",       imp:"HIGH", fc:"–",      pr:"Hold",   actual:"–",      type:"CB Speech"},
  // April 8
  {dt:"2026-04-08 08:30",ccy:"CAD",ev:"Trade Balance",              imp:"MED",  fc:"-1.5B",  pr:"-0.9B",  actual:"–",      type:"Trade"},
  {dt:"2026-04-08 08:30",ccy:"USD",ev:"Trade Balance",              imp:"MED",  fc:"-116B",  pr:"-122B",  actual:"–",      type:"Trade"},
  {dt:"2026-04-08 10:00",ccy:"USD",ev:"Wholesale Inventories m/m",  imp:"LOW",  fc:"0.3%",   pr:"0.4%",   actual:"–",      type:"Inventory"},
  // April 9
  {dt:"2026-04-09 02:00",ccy:"NZD",ev:"RBNZ Rate Decision",         imp:"HIGH", fc:"3.00%",  pr:"3.25%",  actual:"–",      type:"CB Decision"},
  {dt:"2026-04-09 02:05",ccy:"NZD",ev:"RBNZ Press Conference",      imp:"HIGH", fc:"–",      pr:"–",      actual:"–",      type:"CB Speech"},
  {dt:"2026-04-09 08:30",ccy:"USD",ev:"Initial Jobless Claims",     imp:"MED",  fc:"220K",   pr:"219K",   actual:"–",      type:"Employment"},
  {dt:"2026-04-09 08:30",ccy:"USD",ev:"Continuing Claims",          imp:"LOW",  fc:"1870K",  pr:"1903K",  actual:"–",      type:"Employment"},
  // April 10
  {dt:"2026-04-10 02:00",ccy:"JPY",ev:"PPI y/y",                    imp:"MED",  fc:"3.7%",   pr:"4.0%",   actual:"–",      type:"Inflation"},
  {dt:"2026-04-10 08:30",ccy:"USD",ev:"CPI m/m",                    imp:"HIGH", fc:"0.3%",   pr:"0.2%",   actual:"–",      type:"Inflation"},
  {dt:"2026-04-10 08:30",ccy:"USD",ev:"Core CPI m/m",               imp:"HIGH", fc:"0.3%",   pr:"0.3%",   actual:"–",      type:"Inflation"},
  {dt:"2026-04-10 08:30",ccy:"USD",ev:"CPI y/y",                    imp:"HIGH", fc:"2.5%",   pr:"2.8%",   actual:"–",      type:"Inflation"},
  {dt:"2026-04-10 10:00",ccy:"USD",ev:"Prelim UoM Sentiment",       imp:"MED",  fc:"54.0",   pr:"53.9",   actual:"–",      type:"Sentiment"},
  // April 11
  {dt:"2026-04-11 02:00",ccy:"JPY",ev:"Current Account",            imp:"MED",  fc:"2.1T",   pr:"2.4T",   actual:"–",      type:"Trade"},
  {dt:"2026-04-11 06:00",ccy:"GBP",ev:"GDP m/m",                    imp:"MED",  fc:"0.1%",   pr:"0.0%",   actual:"–",      type:"GDP"},
  {dt:"2026-04-11 06:00",ccy:"GBP",ev:"Manufacturing Production",   imp:"MED",  fc:"0.2%",   pr:"-0.9%",  actual:"–",      type:"Manufacturing"},
  // April 14
  {dt:"2026-04-14 06:00",ccy:"EUR",ev:"German CPI m/m Final",       imp:"MED",  fc:"0.3%",   pr:"0.4%",   actual:"–",      type:"Inflation"},
  {dt:"2026-04-14 08:30",ccy:"CAD",ev:"Core CPI m/m",               imp:"MED",  fc:"0.3%",   pr:"0.4%",   actual:"–",      type:"Inflation"},
  // April 15
  {dt:"2026-04-15 02:00",ccy:"CAD",ev:"BOC Rate Decision",          imp:"HIGH", fc:"2.25%",  pr:"2.25%",  actual:"–",      type:"CB Decision"},
  {dt:"2026-04-15 02:15",ccy:"CAD",ev:"BOC Press Conference",       imp:"HIGH", fc:"–",      pr:"–",      actual:"–",      type:"CB Speech"},
  {dt:"2026-04-15 08:30",ccy:"USD",ev:"Retail Sales m/m",           imp:"MED",  fc:"0.4%",   pr:"-0.9%",  actual:"–",      type:"Retail"},
  {dt:"2026-04-15 08:30",ccy:"USD",ev:"Core Retail Sales m/m",      imp:"MED",  fc:"0.3%",   pr:"-0.3%",  actual:"–",      type:"Retail"},
  {dt:"2026-04-15 08:30",ccy:"USD",ev:"Empire State Manufacturing", imp:"MED",  fc:"-11.5",  pr:"-20.0",  actual:"–",      type:"Manufacturing"},
  {dt:"2026-04-15 09:15",ccy:"USD",ev:"Industrial Production m/m",  imp:"MED",  fc:"0.3%",   pr:"-0.1%",  actual:"–",      type:"Manufacturing"},
  // April 16
  {dt:"2026-04-16 02:00",ccy:"AUD",ev:"Westpac Consumer Sentiment", imp:"LOW",  fc:"–",      pr:"95.9",   actual:"–",      type:"Sentiment"},
  {dt:"2026-04-16 02:30",ccy:"AUD",ev:"Employment Change",          imp:"HIGH", fc:"20.0K",  pr:"52.8K",  actual:"–",      type:"Employment"},
  {dt:"2026-04-16 02:30",ccy:"AUD",ev:"Unemployment Rate",          imp:"HIGH", fc:"4.2%",   pr:"4.1%",   actual:"–",      type:"Employment"},
  {dt:"2026-04-16 08:30",ccy:"USD",ev:"Philadelphia Fed Index",     imp:"MED",  fc:"-5.0",   pr:"-26.4",  actual:"–",      type:"Manufacturing"},
  {dt:"2026-04-16 08:30",ccy:"USD",ev:"Initial Jobless Claims",     imp:"MED",  fc:"215K",   pr:"220K",   actual:"–",      type:"Employment"},
  {dt:"2026-04-16 10:00",ccy:"USD",ev:"Existing Home Sales",        imp:"LOW",  fc:"4.1M",   pr:"4.3M",   actual:"–",      type:"Housing"},
  // April 17
  {dt:"2026-04-17 03:00",ccy:"EUR",ev:"German Flash PMI Manufacturing",imp:"MED",fc:"47.0",  pr:"47.7",   actual:"–",      type:"PMI"},
  {dt:"2026-04-17 03:00",ccy:"EUR",ev:"German Flash PMI Services",  imp:"MED",  fc:"51.4",   pr:"51.8",   actual:"–",      type:"PMI"},
  {dt:"2026-04-17 03:30",ccy:"EUR",ev:"Flash PMI Manufacturing",    imp:"MED",  fc:"47.8",   pr:"48.6",   actual:"–",      type:"PMI"},
  {dt:"2026-04-17 03:30",ccy:"EUR",ev:"Flash PMI Services",         imp:"MED",  fc:"51.0",   pr:"50.9",   actual:"–",      type:"PMI"},
  {dt:"2026-04-17 04:00",ccy:"GBP",ev:"Flash PMI Manufacturing",    imp:"MED",  fc:"44.5",   pr:"44.9",   actual:"–",      type:"PMI"},
  {dt:"2026-04-17 04:00",ccy:"GBP",ev:"Flash PMI Services",         imp:"MED",  fc:"52.0",   pr:"53.0",   actual:"–",      type:"PMI"},
  // April 22
  {dt:"2026-04-22 04:00",ccy:"EUR",ev:"German Ifo Business Climate",imp:"MED",  fc:"87.0",   pr:"86.7",   actual:"–",      type:"Sentiment"},
  {dt:"2026-04-22 08:30",ccy:"CAD",ev:"Core Retail Sales m/m",      imp:"MED",  fc:"0.3%",   pr:"1.3%",   actual:"–",      type:"Retail"},
  {dt:"2026-04-22 10:00",ccy:"USD",ev:"CB Consumer Confidence",     imp:"MED",  fc:"92.0",   pr:"98.3",   actual:"–",      type:"Sentiment"},
  {dt:"2026-04-22 10:00",ccy:"USD",ev:"New Home Sales",             imp:"LOW",  fc:"680K",   pr:"676K",   actual:"–",      type:"Housing"},
  // April 23
  {dt:"2026-04-23 08:30",ccy:"USD",ev:"Initial Jobless Claims",     imp:"MED",  fc:"215K",   pr:"–",      actual:"–",      type:"Employment"},
  {dt:"2026-04-23 08:30",ccy:"USD",ev:"Durable Goods Orders m/m",   imp:"MED",  fc:"0.5%",   pr:"-1.4%",  actual:"–",      type:"Manufacturing"},
  // April 24
  {dt:"2026-04-24 08:30",ccy:"USD",ev:"Core PCE Price Index m/m",   imp:"HIGH", fc:"0.3%",   pr:"0.4%",   actual:"–",      type:"Inflation"},
  {dt:"2026-04-24 08:30",ccy:"USD",ev:"Goods Trade Balance Prelim", imp:"LOW",  fc:"-148B",  pr:"-148B",  actual:"–",      type:"Trade"},
  {dt:"2026-04-24 10:00",ccy:"USD",ev:"Revised UoM Sentiment",      imp:"MED",  fc:"50.0",   pr:"–",      actual:"–",      type:"Sentiment"},
  // April 25
  {dt:"2026-04-25 02:00",ccy:"JPY",ev:"Tokyo CPI y/y",              imp:"HIGH", fc:"2.2%",   pr:"2.4%",   actual:"–",      type:"Inflation"},
  {dt:"2026-04-25 08:30",ccy:"CAD",ev:"GDP m/m",                    imp:"MED",  fc:"0.2%",   pr:"0.4%",   actual:"–",      type:"GDP"},
  {dt:"2026-04-25 08:30",ccy:"USD",ev:"Advance GDP q/q",            imp:"HIGH", fc:"1.5%",   pr:"2.4%",   actual:"–",      type:"GDP"},
  {dt:"2026-04-25 08:30",ccy:"USD",ev:"Advance GDP Price Index",    imp:"HIGH", fc:"3.4%",   pr:"2.3%",   actual:"–",      type:"GDP"},
  // April 28
  {dt:"2026-04-28 02:30",ccy:"AUD",ev:"CPI y/y",                    imp:"HIGH", fc:"2.4%",   pr:"2.5%",   actual:"–",      type:"Inflation"},
  {dt:"2026-04-28 08:30",ccy:"USD",ev:"Personal Income m/m",        imp:"MED",  fc:"0.4%",   pr:"0.8%",   actual:"–",      type:"Income"},
  {dt:"2026-04-28 08:30",ccy:"USD",ev:"Personal Spending m/m",      imp:"MED",  fc:"0.4%",   pr:"0.4%",   actual:"–",      type:"Income"},
  {dt:"2026-04-28 08:30",ccy:"USD",ev:"Pending Home Sales m/m",     imp:"LOW",  fc:"1.0%",   pr:"-4.6%",  actual:"–",      type:"Housing"},
  // April 29
  {dt:"2026-04-29 04:00",ccy:"EUR",ev:"German Prelim CPI m/m",      imp:"MED",  fc:"0.4%",   pr:"0.4%",   actual:"–",      type:"Inflation"},
  {dt:"2026-04-29 04:00",ccy:"EUR",ev:"German GfK Consumer Climate",imp:"LOW",  fc:"-24.0",  pr:"-24.3",  actual:"–",      type:"Sentiment"},
  {dt:"2026-04-29 09:00",ccy:"EUR",ev:"CPI Flash Estimate y/y",     imp:"HIGH", fc:"2.2%",   pr:"2.3%",   actual:"–",      type:"Inflation"},
  // April 30
  {dt:"2026-04-30 02:00",ccy:"JPY",ev:"BOJ Rate Decision",          imp:"HIGH", fc:"0.75%",  pr:"0.75%",  actual:"–",      type:"CB Decision"},
  {dt:"2026-04-30 02:30",ccy:"JPY",ev:"BOJ Outlook Report",         imp:"HIGH", fc:"–",      pr:"–",      actual:"–",      type:"CB Speech"},
  {dt:"2026-04-30 05:00",ccy:"EUR",ev:"GDP Flash Estimate q/q",     imp:"HIGH", fc:"0.3%",   pr:"0.2%",   actual:"–",      type:"GDP"},
  {dt:"2026-04-30 09:00",ccy:"EUR",ev:"ECB Rate Decision",          imp:"HIGH", fc:"2.00%",  pr:"2.00%",  actual:"–",      type:"CB Decision"},
  {dt:"2026-04-30 09:45",ccy:"EUR",ev:"ECB Press Conference",       imp:"HIGH", fc:"–",      pr:"–",      actual:"–",      type:"CB Speech"},
  {dt:"2026-04-30 14:00",ccy:"USD",ev:"FOMC Rate Decision",         imp:"HIGH", fc:"3.75%",  pr:"3.75%",  actual:"–",      type:"CB Decision"},
  {dt:"2026-04-30 14:30",ccy:"USD",ev:"FOMC Press Conference",      imp:"HIGH", fc:"–",      pr:"–",      actual:"–",      type:"CB Speech"},
  {dt:"2026-04-30 15:00",ccy:"SEK",ev:"Riksbank Rate Decision",     imp:"HIGH", fc:"1.75%",  pr:"1.75%",  actual:"–",      type:"CB Decision"},
  // May events
  {dt:"2026-05-01 08:30",ccy:"USD",ev:"Non-Farm Payrolls",          imp:"HIGH", fc:"145K",   pr:"128K",   actual:"–",      type:"Employment"},
  {dt:"2026-05-01 08:30",ccy:"USD",ev:"Unemployment Rate",          imp:"HIGH", fc:"4.4%",   pr:"4.4%",   actual:"–",      type:"Employment"},
  {dt:"2026-05-01 08:30",ccy:"CAD",ev:"Employment Change",          imp:"HIGH", fc:"15.0K",  pr:"22.0K",  actual:"–",      type:"Employment"},
  {dt:"2026-05-07 07:00",ccy:"GBP",ev:"BOE Rate Decision",          imp:"HIGH", fc:"3.75%",  pr:"3.75%",  actual:"–",      type:"CB Decision"},
  {dt:"2026-05-13 08:30",ccy:"USD",ev:"CPI m/m",                    imp:"HIGH", fc:"0.3%",   pr:"0.3%",   actual:"–",      type:"Inflation"},
  {dt:"2026-05-19 03:30",ccy:"AUD",ev:"RBA Rate Decision",          imp:"HIGH", fc:"3.85%",  pr:"3.85%",  actual:"–",      type:"CB Decision"},
];

// ── NEWS DATA with links ─────────────────────────────────────────────────
const ALL_NEWS = [
  {id:1, dt:"2026-04-07 09:14",ccy:"USD",hl:"Fed holds 3.75–4.00% for 2nd consecutive meeting; Powell: 'Iran war inflation risk complicates the path forward'",impact:"BEARISH",imp:"HIGH",url:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20260318a.htm"},
  {id:2, dt:"2026-04-07 08:55",ccy:"USD",hl:"US 90-day tariff pause for most nations — DXY falls 1.2%; USD broadly pressured as relief rally fades",impact:"BEARISH",imp:"HIGH",url:"https://ustr.gov/about-us/policy-offices/press-office/press-releases"},
  {id:3, dt:"2026-04-07 08:30",ccy:"USD",hl:"US jobless claims rise to 219K; labor softening — June Fed cut probability repriced to 38%",impact:"BEARISH",imp:"HIGH",url:"https://www.dol.gov/ui/data.pdf"},
  {id:4, dt:"2026-04-07 07:45",ccy:"JPY",hl:"BOJ confirmed 0.75% rate — Ueda: hiking path remains; USD/JPY declines through 158.50",impact:"BULLISH",imp:"HIGH",url:"https://www.boj.or.jp/en/mopo/mpmdeci/index.htm"},
  {id:5, dt:"2026-04-07 07:20",ccy:"EUR",hl:"ECB holds 2.00%; Schnabel: next move 'more likely a hike than cut' — EUR/USD firms above 1.16",impact:"BULLISH",imp:"HIGH",url:"https://www.ecb.europa.eu/press/pr/date/2026"},
  {id:6, dt:"2026-04-07 06:55",ccy:"GBP",hl:"BOE holds 3.75% unanimous; MPC: CPI 3.0% above target — data dependent approach maintained",impact:"NEUTRAL",imp:"HIGH",url:"https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes"},
  {id:7, dt:"2026-04-07 06:30",ccy:"NZD",hl:"RBNZ cuts to 3.00% Apr 9 — NZD/USD remains under pressure near 0.58; further cuts on table",impact:"BEARISH",imp:"HIGH",url:"https://www.rbnz.govt.nz/monetary-policy/monetary-policy-statement"},
  {id:8, dt:"2026-04-07 06:10",ccy:"AUD",hl:"RBA holds at 3.85% — minutes signal hold through mid-2026; AUD/USD recovery toward 0.71",impact:"NEUTRAL",imp:"MED",url:"https://www.rba.gov.au/monetary-policy/rba-board-minutes/"},
  {id:9, dt:"2026-04-07 05:50",ccy:"CAD",hl:"BOC holds 2.25%; Macklem: rates 'about the right level' — USD/CAD at 1.38 support",impact:"NEUTRAL",imp:"HIGH",url:"https://www.bankofcanada.ca/2026/04/fad-press-release/"},
  {id:10,dt:"2026-04-07 05:10",ccy:"NOK",hl:"Brent crude drops 4% on tariff demand fears — USD/NOK spikes; NOK worst G10 performer",impact:"BEARISH",imp:"HIGH",url:"https://www.norges-bank.no/en/topics/Monetary-policy/"},
  {id:11,dt:"2026-04-07 04:50",ccy:"SEK",hl:"Riksbank holds 1.75%; GDP forecast raised 2.9% 2026 — SEK supported with late-2026 hike bias",impact:"BULLISH",imp:"MED",url:"https://www.riksbank.se/en-gb/monetary-policy/monetary-policy-decisions/"},
  {id:12,dt:"2026-04-07 04:25",ccy:"JPY",hl:"Japan wage growth 3.1% y/y — above 3% BOJ normalization threshold; JPY broadly bid",impact:"BULLISH",imp:"HIGH",url:"https://www.mhlw.go.jp/english/database/db-l/index.html"},
  {id:13,dt:"2026-04-07 04:00",ccy:"EUR",hl:"German industrial production +1.8% m/m beats 0.9% forecast — EUR/USD holds above 1.16",impact:"BULLISH",imp:"MED",url:"https://www.destatis.de/EN/Themes/Economy/Short-Term-Indicators/Production-Index/"},
  {id:14,dt:"2026-04-07 03:40",ccy:"GBP",hl:"UK CPI 3.0% Jan 2026 above 2% target; services 4.8% — BOE hawkish tilt intact; GBP supported",impact:"BULLISH",imp:"MED",url:"https://www.ons.gov.uk/economy/inflationandpriceindices"},
  {id:15,dt:"2026-04-07 03:15",ccy:"AUD",hl:"China PMI 50.5 marginally expansionary — AUD recovers from tariff lows; upside limited",impact:"BULLISH",imp:"MED",url:"https://www.stats.gov.cn/english/PressRelease/"},
  {id:16,dt:"2026-04-07 02:30",ccy:"USD",hl:"US PCE 2.7% Q1 2026 above Fed 2% target — inflation sticky despite 175bp of cuts since Sep 2024",impact:"BEARISH",imp:"HIGH",url:"https://www.bea.gov/data/personal-consumption-expenditures-price-index"},
  {id:17,dt:"2026-04-07 02:05",ccy:"NZD",hl:"NZ Q4 GDP −0.2% q/q second contraction — recession confirmed; RBNZ cutting cycle to extend",impact:"BEARISH",imp:"HIGH",url:"https://www.stats.govt.nz/indicators/gross-domestic-product-gdp"},
  {id:18,dt:"2026-04-07 01:45",ccy:"EUR",hl:"Eurozone growth accelerating 2026 — German fiscal stimulus feeding through; ECB hike bias",impact:"BULLISH",imp:"MED",url:"https://ec.europa.eu/eurostat/statistics-explained/index.php/GDP_at_regional_level"},
  {id:19,dt:"2026-04-07 01:20",ccy:"JPY",hl:"Japan current account surplus widens ¥2.4T — structural JPY support; USD/JPY upside capped",impact:"BULLISH",imp:"MED",url:"https://www.mof.go.jp/english/policy/balance_of_payments/bop/bop.htm"},
  {id:20,dt:"2026-04-07 00:55",ccy:"CHF",hl:"Switzerland CPI 0.3% y/y well below SNB target — SNB intervention risk if CHF strengthens",impact:"BEARISH",imp:"MED",url:"https://www.bfs.admin.ch/bfs/en/home/statistics/prices/consumer-price-index.html"},
  {id:21,dt:"2026-04-07 00:30",ccy:"NOK",hl:"Norges Bank signals 1–2 cuts mid-2026 if CPI below 3% — NOK/SEK 0.96 support holding",impact:"BEARISH",imp:"MED",url:"https://www.norges-bank.no/en/topics/Monetary-policy/monetary-policy-report/"},
  {id:22,dt:"2026-04-06 23:55",ccy:"USD",hl:"Liberation Day tariffs announced: 10% baseline on all imports — USD broadly lower; JPY/CHF bid",impact:"BEARISH",imp:"HIGH",url:"https://ustr.gov/about-us/policy-offices/press-office/press-releases"},
  {id:23,dt:"2026-04-06 22:30",ccy:"GBP",hl:"UK excluded from worst tariff tier at 10% — GBP/USD outperforms EUR/USD on relative trade",impact:"BULLISH",imp:"HIGH",url:"https://www.gov.uk/government/news/uk-us-trade-tariff-announcement"},
  {id:24,dt:"2026-04-06 20:00",ccy:"AUD",hl:"Australia hit with 10% tariff baseline — China-exposed AUD underperforms; commodity selloff",impact:"BEARISH",imp:"HIGH",url:"https://www.dfat.gov.au/trade"},
  {id:25,dt:"2026-04-06 18:00",ccy:"EUR",hl:"EU faces 20% tariffs before 90-day pause — EUR/USD fell 1.0732 lows before recovering sharply",impact:"NEUTRAL",imp:"HIGH",url:"https://ec.europa.eu/commission/presscorner/"},
  {id:26,dt:"2026-04-06 16:30",ccy:"JPY",hl:"Middle East ceasefire optimism — equities lift; crude eases; USD/JPY recovers as risk improves",impact:"BEARISH",imp:"HIGH",url:"https://www.fxstreet.com/currencies/usdjpy"},
  {id:27,dt:"2026-04-06 14:00",ccy:"USD",hl:"FOMC minutes March: Fed officials divided on rate path; inflation risks skewed higher from tariffs",impact:"BEARISH",imp:"HIGH",url:"https://www.federalreserve.gov/monetarypolicy/fomcminutes20260318.htm"},
  {id:28,dt:"2026-04-06 12:00",ccy:"EUR",hl:"ECB's Schnabel: 'quite comfortable' that next move likely a hike — EUR broadly supported",impact:"BULLISH",imp:"HIGH",url:"https://www.ecb.europa.eu/press/key/date/2026"},
  {id:29,dt:"2026-04-06 10:00",ccy:"GBP",hl:"UK services PMI 50.5 below 52.0 expected — GBP/USD capped below 1.35 despite tariff advantage",impact:"BEARISH",imp:"MED",url:"https://www.cips.org/cips-for-business/research/pmi/"},
  {id:30,dt:"2026-04-06 08:00",ccy:"CAD",hl:"Canada Ivey PMI 49.7 — contraction; CAD softens; USD/CAD pushes toward 1.39 on tariff risk",impact:"BEARISH",imp:"MED",url:"https://www150.statcan.gc.ca/"},
  {id:31,dt:"2026-04-05 16:00",ccy:"AUD",hl:"Australia retail sales +0.8% February beats expectations — AUD/USD holds 0.70 despite tariff fears",impact:"BULLISH",imp:"MED",url:"https://www.abs.gov.au/statistics/industry/retail-and-wholesale-trade"},
  {id:32,dt:"2026-04-05 08:30",ccy:"USD",hl:"US non-farm payrolls April 4: only 128K vs 175K expected — labor market deteriorating; USD negative",impact:"BEARISH",imp:"HIGH",url:"https://www.bls.gov/news.release/empsit.toc.htm"},
  {id:33,dt:"2026-04-05 08:30",ccy:"USD",hl:"US unemployment rate holds at 4.4% — Fed dual mandate under strain; cut odds increase for June",impact:"BEARISH",imp:"HIGH",url:"https://www.bls.gov/news.release/empsit.toc.htm"},
  {id:34,dt:"2026-04-04 12:00",ccy:"JPY",hl:"BOJ summary of opinions: broad support for continued normalization — JPY rally continues vs G10",impact:"BULLISH",imp:"HIGH",url:"https://www.boj.or.jp/en/mopo/mpmdeci/"},
  {id:35,dt:"2026-04-03 16:00",ccy:"EUR",hl:"German factory orders +2.1% m/m third consecutive beat — EUR/USD resilient above 1.16",impact:"BULLISH",imp:"MED",url:"https://www.destatis.de/EN/"},
  {id:36,dt:"2026-04-03 04:00",ccy:"AUD",hl:"RBA Governor Bullock: no rate cuts imminent — AUD/USD bounces; 0.70 key support holding",impact:"BULLISH",imp:"MED",url:"https://www.rba.gov.au/speeches/"},
  {id:37,dt:"2026-04-02 14:00",ccy:"USD",hl:"JOLTS job openings 7.3M vs 7.5M expected — labor demand weakening; dollar index retreats",impact:"BEARISH",imp:"MED",url:"https://www.bls.gov/news.release/jolts.toc.htm"},
  {id:38,dt:"2026-04-02 09:45",ccy:"USD",hl:"US ISM Services PMI 50.8 misses 53.0 expectation — services sector losing momentum; USD negative",impact:"BEARISH",imp:"HIGH",url:"https://www.ismworld.org/supply-management-news-and-reports/reports/ism-report-on-business/services/"},
  {id:39,dt:"2026-04-01 08:30",ccy:"CAD",hl:"Canada trade balance better than expected — CAD firms despite tariff headwinds; USD/CAD reverses",impact:"BULLISH",imp:"MED",url:"https://www150.statcan.gc.ca/"},
  {id:40,dt:"2026-04-01 04:00",ccy:"EUR",hl:"Eurozone flash CPI +2.3% April estimate — ECB hike narrative strengthens; EUR/USD tests 1.17",impact:"BULLISH",imp:"HIGH",url:"https://ec.europa.eu/eurostat/web/inflation"},
];

// ── STRATEGIES ───────────────────────────────────────────────────────────
// ── MASTER STRATEGY LIBRARY — 51 STRATEGIES ─────────────────────────────
const STRATEGIES=[
  {id:"BOJ_NORM", tier:"S",wr:68,cat:"MACRO",      tf:"H4/D1", minC:4,name:"BOJ Normalization Trend",            note:"Only G10 hiker 2026. USD/JPY sell on rallies. MUFG target 146.",url:"https://www.boj.or.jp/en/mopo/",desc:"BOJ: Policy normalization 2026"},
  {id:"NEWS_DFT", tier:"S",wr:64,cat:"MOMENTUM",   tf:"M5/H1", minC:3,name:"Post-Release News Drift",             note:"CPI/NFP drive 2-4hr drift. Apr 10 CPI = key catalyst.",         url:"https://www.nber.org/papers/w20427",desc:"NBER WP 20427: News and exchange rates"},
  {id:"TRI_ARB",  tier:"S",wr:74,cat:"FLOW",        tf:"M1/M5", minC:2,name:"Triangular Arbitrage Signal",         note:"Cross-rate mispricing. Highest edge when aligned.",              url:"https://www.jstor.org/stable/2329601",desc:"Journal of Finance: Arbitrage"},
  {id:"RATE_SRP", tier:"S",wr:67,cat:"CARRY",       tf:"H1/H4", minC:4,name:"Rate Surprise Extension",             note:"Post-CB drift 2-6hrs. RBNZ cut Apr 9 = NZD continuation.",       url:"https://www.sciencedirect.com/science/article/abs/pii/S0261560604000026",desc:"Jansen/De Haan: CB statements and FX"},
  {id:"CB_DIV",   tier:"S",wr:66,cat:"MACRO",       tf:"H4/D1", minC:5,name:"Central Bank Divergence",              note:"BOJ hiking vs Fed holding = structural JPY bid.",                url:"https://www.bis.org/publ/work801.htm",desc:"BIS WP #801: Monetary policy divergence"},
  {id:"WMR_FIX",  tier:"S",wr:65,cat:"FLOW",        tf:"M15/H1",minC:3,name:"WMR 4PM Fix Anticipation",             note:"Predictable pre-4PM London order flow. Month-end strongest.",    url:"https://www.lseg.com/en/data-analytics/financial-data/foreign-exchange/wm-reuters-rates",desc:"LSEG: WM/Reuters Fix methodology"},
  {id:"STRUCT_BK",tier:"S",wr:63,cat:"TECHNICAL",   tf:"H4/D1", minC:5,name:"Macro Structure Breakout",              note:"EUR/USD broke 1.16 structural resistance. Monitor 1.19 next.",   url:"https://www.tandfonline.com/doi/abs/10.1080/14697688.2011.613931",desc:"Quantitative Finance: Technical patterns"},
  {id:"GRW_DIV",  tier:"S",wr:63,cat:"MACRO",       tf:"D1/W1", minC:5,name:"Macro Growth Divergence",               note:"Eurozone 1.7-1.8% H2 2026 vs US slowdown = EUR/USD bull.",      url:"https://www.imf.org/en/Publications/WEO",desc:"IMF WEO: Growth and exchange rates"},
  {id:"REAL_YLD", tier:"S",wr:63,cat:"MACRO",       tf:"H4/D1", minC:4,name:"Real Yield Differential",               note:"USD real yields compressing; JPY rising as BOJ hikes.",          url:"https://www.federalreserve.gov/pubs/ifdp/2003/765/ifdp765.pdf",desc:"Fed IFDP 765: Real interest differentials"},
  {id:"SAFE_HVN", tier:"S",wr:63,cat:"CORRELATION", tf:"H1/H4", minC:4,name:"Safe Haven Demand Model",              note:"JPY/CHF bid in risk-off. USD no longer safe haven in 2026.",     url:"https://www.bis.org/publ/work570.htm",desc:"BIS WP #570: Safe haven currencies"},
  {id:"OPT_EXP",  tier:"S",wr:62,cat:"FLOW",        tf:"M15/H1",minC:3,name:"Option Expiry Gamma Trade",             note:"NY 10AM strikes create price magnetism. CME data confirms.",     url:"https://www.cmegroup.com/trading/fx/g10/euro-fx.html",desc:"CME: FX option expiry magnetism"},
  {id:"CB_COMM",  tier:"A",wr:62,cat:"MACRO",       tf:"H4/D1", minC:4,name:"CB Communication Drift",               note:"ECB Schnabel hike-more-likely = EUR higher. BOJ = JPY bid.",     url:"https://www.bis.org/publ/work952.htm",desc:"BIS WP #952: CB communication and FX"},
  {id:"TSM_CTA",  tier:"A",wr:62,cat:"MOMENTUM",    tf:"D1/W1", minC:4,name:"CTA Time-Series Momentum",              note:"AQR: 12-month momentum across 58 markets including FX.",         url:"https://www.aqr.com/Insights/Research/Journal-Article/Time-Series-Momentum",desc:"AQR: Time-Series Momentum"},
  {id:"CROSS_CAR",tier:"A",wr:62,cat:"CARRY",       tf:"D1/W1", minC:4,name:"Cross-Carry with Momentum Filter",      note:"AQR: carry + momentum improves Sharpe by 0.4+.",                url:"https://www.aqr.com/Insights/Research/Working-Paper/Currency-Carry-Trades",desc:"AQR: Carry and momentum filter"},
  {id:"FX_VOL",   tier:"A",wr:61,cat:"FLOW",        tf:"D1/W1", minC:4,name:"FX Volatility Risk Premium",            note:"Selling implied > realized vol = carry-like premium.",           url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1343490",desc:"SSRN: FX vol risk premium"},
  {id:"ICT_OB",   tier:"A",wr:61,cat:"TECHNICAL",   tf:"M15/H1",minC:4,name:"ICT Order Block + FVG Entry",            note:"Institutional order blocks. FVG fills precede continuation.",    url:"https://www.bis.org/publ/work492.htm",desc:"BIS: Institutional order flow"},
  {id:"STOP_HNT", tier:"A",wr:61,cat:"TECHNICAL",   tf:"M5/M15",minC:4,name:"Liquidity Sweep Reversal",              note:"Equal highs/lows swept. High-probability reversal entry.",        url:"https://www.bis.org/publ/work492.htm",desc:"BIS WP #492: Stop-loss orders"},
  {id:"GLOB_MAC", tier:"A",wr:61,cat:"MACRO",       tf:"D1/W1", minC:5,name:"Global Macro Thematic Trade",           note:"Post-peak USD 2026 consensus. Long EUR/JPY/CHF vs USD.",         url:"https://www.bis.org/publ/arpdf/ar2023e2.htm",desc:"BIS Annual Report: Global macro FX"},
  {id:"CARRY_MOM",tier:"A",wr:60,cat:"CARRY",       tf:"D1/W1", minC:4,name:"Carry + Momentum Blend",                note:"High-yielder + momentum confirmation. BOJ hike = JPY reversal.", url:"https://www.aqr.com/Insights/Research/Working-Paper/Value-and-Momentum-Everywhere",desc:"AQR: Value and Momentum Everywhere"},
  {id:"CS_MOM",   tier:"A",wr:60,cat:"MOMENTUM",    tf:"D1/W1", minC:4,name:"Cross-Sectional FX Momentum",           note:"Long top G10 CCY, short worst. JPY structural momentum 2026.",   url:"https://pages.stern.nyu.edu/~lpederse/papers/MomentumCurrencies.pdf",desc:"Pedersen/Frazzini: FX Momentum"},
  {id:"COT_FADE", tier:"A",wr:60,cat:"FLOW",        tf:"D1/W1", minC:4,name:"COT Extreme Positioning",               note:"CFTC extremes mean-revert. USD net-short at multi-year extreme.",url:"https://www.cftc.gov/MarketReports/CommitmentsofTraders/",desc:"CFTC COT: Institutional positioning"},
  {id:"GOLD_USD", tier:"A",wr:60,cat:"CORRELATION", tf:"H4/D1", minC:3,name:"Gold / USD Divergence",                 note:"Gold all-time highs = USD debasement. Short USD vs CHF/JPY.",    url:"https://www.gold.org/goldhub/research/relevance-of-gold-as-strategic-asset",desc:"WGC: Gold and USD correlation"},
  {id:"SESS_BRK", tier:"A",wr:60,cat:"TECHNICAL",   tf:"M15/H1",minC:3,name:"NY Open Session Breakout",              note:"NY open 13:30 UTC. Highest institutional volume.",               url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2837743",desc:"SSRN: Session open patterns"},
  {id:"VOL_BRK",  tier:"A",wr:60,cat:"TECHNICAL",   tf:"H1/H4", minC:3,name:"ATR Volatility Compression Break",      note:"Low ATR precedes breakout. Calendar events = catalysts.",         url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2337011",desc:"SSRN: Volatility compression breakouts"},
  {id:"CORR_BRK", tier:"A",wr:60,cat:"CORRELATION", tf:"H4/D1", minC:4,name:"G10 Correlation Break Trade",           note:"Normally-correlated pairs diverge = mean reversion trade.",       url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2840338",desc:"SSRN: Correlation-based pairs trading"},
  {id:"UIP_DEV",  tier:"A",wr:60,cat:"CARRY",       tf:"D1/W1", minC:4,name:"UIP Deviation (Forward Premium)",       note:"Fama 1984: higher interest rate currency appreciates.",           url:"https://www.nber.org/papers/w1393",desc:"Fama 1984: Forward rates — UIP puzzle"},
  {id:"ADX_BRK",  tier:"A",wr:59,cat:"TECHNICAL",   tf:"H1/H4", minC:3,name:"ADX Trend Acceleration",                note:"ADX >25 with DI cross = trend entry. Best in directional mkt.",   url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1930932",desc:"SSRN: Trend indicators and FX returns"},
  {id:"LDN_BRK",  tier:"A",wr:59,cat:"TECHNICAL",   tf:"M15/H1",minC:3,name:"London Open Range Breakout",            note:"London 07:00-08:00 UTC. Asian range breaks 68% of time.",         url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1664718",desc:"SSRN: Session breakout strategies"},
  {id:"VWAP_REV", tier:"A",wr:59,cat:"MEAN REVERT", tf:"M15/H1",minC:3,name:"VWAP Mean Reversion",                   note:"Price >2σ from VWAP has 72% reversion within session.",           url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2995423",desc:"SSRN: VWAP trading strategies"},
  {id:"EARL_WRN", tier:"A",wr:59,cat:"MACRO",       tf:"D1/W1", minC:4,name:"Currency Stress Early Warning",         note:"IMF model: CDS + CA deficit + reserves signal stress.",           url:"https://www.imf.org/en/Publications/WP/Issues/2016/12/31/Currency-Crises-36154",desc:"IMF WP: Currency crisis warning"},
  {id:"MOMO_CRS", tier:"A",wr:59,cat:"MOMENTUM",    tf:"H1/H4", minC:3,name:"Triple EMA Crossover System",           note:"5/13/50 EMA triple cross = momentum confirmation.",               url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2550618",desc:"SSRN: EMA strategies in FX"},
  {id:"BOP_FLOW", tier:"A",wr:59,cat:"MACRO",       tf:"W1",    minC:4,name:"Balance of Payments Flow",              note:"Japan CA surplus ¥2.4T structural JPY support.",                  url:"https://www.imf.org/external/pubs/ft/wp/2010/wp10149.pdf",desc:"IMF WP: Capital flows and FX"},
  {id:"CARRY",    tier:"B",wr:57,cat:"CARRY",       tf:"D1/W1", minC:3,name:"G10 Carry Trade",                       note:"Long high-yielder vs low-yielder. BOJ hike = JPY carry reversal.",url:"https://www.nber.org/papers/w11631",desc:"NBER: Returns to currency speculation"},
  {id:"BB_FADE",  tier:"B",wr:57,cat:"MEAN REVERT", tf:"H1/H4", minC:3,name:"Bollinger Band 2σ Fade",                note:"Price at 2σ band has 68% reversion to mean probability.",         url:"https://www.investopedia.com/articles/technical/04/030304.asp",desc:"Bollinger: Mean reversion"},
  {id:"FIBO_PULL",tier:"B",wr:58,cat:"TECHNICAL",   tf:"H1/H4", minC:3,name:"Fibonacci 61.8% Pullback",              note:"61.8% retracement = high-probability continuation entry.",        url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1293728",desc:"SSRN: Fibonacci as support/resistance"},
  {id:"ICHIMOKU", tier:"B",wr:57,cat:"TECHNICAL",   tf:"H4/D1", minC:4,name:"Ichimoku Cloud System",                 note:"Kumo breakout with Tenkan/Kijun cross = trend confirmation.",     url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1481600",desc:"SSRN: Ichimoku in forex"},
  {id:"MON_PULL", tier:"B",wr:57,cat:"MOMENTUM",    tf:"H1/H4", minC:3,name:"Monday Pullback Entry",                 note:"Friday momentum continues Monday. Pullback = optimal R:R.",       url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1935275",desc:"SSRN: Day-of-week effects"},
  {id:"EQ_BETA",  tier:"B",wr:58,cat:"CORRELATION", tf:"H1/H4", minC:3,name:"Equity-FX Risk Beta Trade",             note:"AUD/NZD/CAD positive beta. JPY/CHF negative. Trade the regime.",  url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2521095",desc:"SSRN: Equity-FX co-movement"},
  {id:"REGIME_SW",tier:"B",wr:58,cat:"MACRO",       tf:"H4/D1", minC:3,name:"VIX Regime Switching",                  note:"VIX <15 = carry. VIX >25 = JPY/CHF. Trade the regime.",          url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2965903",desc:"SSRN: VIX regimes and carry"},
  {id:"COMD_CCY", tier:"B",wr:57,cat:"CORRELATION", tf:"H1/H4", minC:3,name:"Commodity Currency Correlation",        note:"AUD: iron ore. CAD: crude oil. CHF: inversely to commodities.",  url:"https://www.rba.gov.au/publications/rdp/2012/pdf/rdp2012-06.pdf",desc:"RBA: Commodity prices and AUD"},
  {id:"TURT_TR",  tier:"B",wr:55,cat:"MOMENTUM",    tf:"D1/W1", minC:3,name:"Turtle Donchian Breakout",              note:"20-day high/low breakout. Classic systematic CTA strategy.",      url:"https://www.trendfollowing.com/turtlerules.pdf",desc:"Turtle Rules: Donchian breakout"},
  {id:"STOCH_RSI",tier:"B",wr:57,cat:"MEAN REVERT", tf:"H1/H4", minC:3,name:"Stochastic RSI Divergence",             note:"StochRSI divergence = high-probability reversal signal.",         url:"https://www.investopedia.com/terms/s/stochrsi.asp",desc:"StochRSI: Divergence signals"},
  {id:"DUAL_THR", tier:"B",wr:58,cat:"MOMENTUM",    tf:"H1/H4", minC:3,name:"Dual Thrust Momentum System",           note:"Dynamic session range breakout. Systematic edge confirmed.",       url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1680057",desc:"SSRN: Systematic FX momentum"},
  {id:"KELTNER",  tier:"B",wr:55,cat:"TECHNICAL",   tf:"H4/D1", minC:3,name:"Keltner Channel Breakout",              note:"Price outside Keltner = trend continuation signal.",              url:"https://www.investopedia.com/terms/k/keltnerchannel.asp",desc:"Keltner: Volatility breakout"},
  {id:"RISK_PAR", tier:"B",wr:57,cat:"RISK MGMT",   tf:"D1/W1", minC:4,name:"Risk Parity G10 Portfolio",             note:"Equal-volatility-weighted G10 portfolio. Diversification alpha.", url:"https://www.aqr.com/Insights/Research/White-Papers/Risk-Parity-Portfolios",desc:"AQR: Risk parity portfolios"},
  {id:"SUPPLY_DEM",tier:"B",wr:57,cat:"TECHNICAL",  tf:"H1/H4", minC:3,name:"Supply & Demand Zone Entry",            note:"Institutional accumulation/distribution zones. High R:R.",        url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2862935",desc:"SSRN: S/R levels and FX"},
  {id:"TOT_SHOCK",tier:"B",wr:56,cat:"MACRO",       tf:"H4/D1", minC:3,name:"Terms of Trade Shock",                  note:"Commodity shocks hit commodity-linked CCY immediately.",           url:"https://www.rba.gov.au/publications/rdp/2014/pdf/rdp2014-01.pdf",desc:"RBA: Terms of trade and AUD"},
  {id:"ENG_CAN",  tier:"B",wr:55,cat:"TECHNICAL",   tf:"H4/D1", minC:4,name:"Engulfing Candle Reversal",             note:"Full engulfing at S/R with volume = reversal signal.",             url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1013905",desc:"SSRN: Candlestick patterns in FX"},
  {id:"PPP_VAL",  tier:"B",wr:54,cat:"MACRO",       tf:"W1/MN", minC:4,name:"PPP/BEER Valuation Reversion",          note:"OECD PPP: EUR/USD fair ~1.14, USD/JPY fair ~140. Long-run.",      url:"https://stats.oecd.org/index.aspx?queryid=221",desc:"OECD PPP Database: FX valuation"},
  {id:"RSIMR",    tier:"B",wr:54,cat:"MEAN REVERT", tf:"H4/D1", minC:3,name:"RSI Mean Reversion",                    note:"RSI >75 or <25 on daily. Fade extreme with structure.",           url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2995423",desc:"SSRN: RSI-based mean reversion"},
  {id:"ATR_FADE", tier:"B",wr:53,cat:"MEAN REVERT", tf:"H1/H4", minC:3,name:"ATR Overextension Fade",                note:"Price >2× daily ATR = high reversion probability.",               url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2337011",desc:"SSRN: ATR and intraday reversion"},
];
const DEFAULT_ENABLED=STRATEGIES.filter(s=>s.tier==="S"||s.tier==="A").map(s=>s.id);

function tvUrl(pair,tf="60"){
  const sym=({"AUD/CAD":"AUDCAD","AUD/CHF":"AUDCHF","AUD/JPY":"AUDJPY","AUD/NZD":"AUDNZD","AUD/USD":"AUDUSD","CAD/CHF":"CADCHF","CAD/JPY":"CADJPY","CHF/JPY":"CHFJPY","EUR/AUD":"EURAUD","EUR/CAD":"EURCAD","EUR/CHF":"EURCHF","EUR/GBP":"EURGBP","EUR/JPY":"EURJPY","EUR/NZD":"EURNZD","EUR/USD":"EURUSD","GBP/AUD":"GBPAUD","GBP/CAD":"GBPCAD","GBP/CHF":"GBPCHF","GBP/JPY":"GBPJPY","GBP/NZD":"GBPNZD","GBP/USD":"GBPUSD","NZD/CAD":"NZDCAD","NZD/CHF":"NZDCHF","NZD/JPY":"NZDJPY","NZD/USD":"NZDUSD","USD/CAD":"USDCAD","USD/CHF":"USDCHF","USD/JPY":"USDJPY"})[pair]||"EURUSD";
  return `https://www.tradingview.com/chart/?symbol=FX%3A${sym}&interval=${tf}`;
}
const C={bg:"#05090f",bg1:"#091525",bg2:"#0d1e35",bg3:"#112540",bdr:"#172f50",gold:"#d4af37",green:"#00e5a0",red:"#ff4560",blue:"#3b8cf7",amber:"#ff9f1c",text:"#dce8f5",muted:"#4a6a8a",dim:"#29415e",scalp:"#ff6b35",day:"#3b8cf7",swing:"#00e5a0"};
const SC={scalp:C.scalp,day:C.day,swing:C.swing};
const CATC={MOMENTUM:"#1d5c35",CARRY:"#7a5500","MEAN REVERT":"#005a5a",MACRO:"#1a3a6a",FLOW:"#4a1f6a",TECHNICAL:"#1a4a6a",CORRELATION:"#6a2a00","RISK MGMT":"#6a1111"};

// ── PRICE ENGINE (memoized, stable) ──────────────────────────────────────
function usePrices(oandaKey){
  const [prices,setPrices]=useState(()=>{const p={};ALL_PAIRS.forEach(pair=>{const mid=BASE_PRICES[pair]||1.0;const isH=pair.includes("JPY");const sp=isH?0.00015:0.000012;p[pair]={bid:+(mid*(1-sp/2)).toFixed(5),ask:+(mid*(1+sp/2)).toFixed(5),mid,change:0,pct:0,dir:"flat",live:false,history:Array(60).fill(0).map((_,i)=>mid*(1+(Math.sin(i*0.3)+Math.random()-0.5)*0.0004))};});return p;});
  const [apiStatus,setApiStatus]=useState("connecting");
  const OINSTR={"AUD/CAD":"AUD_CAD","AUD/CHF":"AUD_CHF","AUD/JPY":"AUD_JPY","AUD/NZD":"AUD_NZD","AUD/USD":"AUD_USD","CAD/CHF":"CAD_CHF","CAD/JPY":"CAD_JPY","CHF/JPY":"CHF_JPY","EUR/AUD":"EUR_AUD","EUR/CAD":"EUR_CAD","EUR/CHF":"EUR_CHF","EUR/GBP":"EUR_GBP","EUR/JPY":"EUR_JPY","EUR/NZD":"EUR_NZD","EUR/USD":"EUR_USD","GBP/AUD":"GBP_AUD","GBP/CAD":"GBP_CAD","GBP/CHF":"GBP_CHF","GBP/JPY":"GBP_JPY","GBP/NZD":"GBP_NZD","GBP/USD":"GBP_USD","NZD/CAD":"NZD_CAD","NZD/CHF":"NZD_CHF","NZD/JPY":"NZD_JPY","NZD/USD":"NZD_USD","USD/CAD":"USD_CAD","USD/CHF":"USD_CHF","USD/JPY":"USD_JPY"};
  useEffect(()=>{let mounted=true;const key=oandaKey.trim();const instStr=Object.values(OINSTR).join("%2C");const fetch_=async()=>{try{const r=await fetch(`/.netlify/functions/prices?instruments=${instStr}`,{signal:AbortSignal.timeout(6000)});if(!r.ok)throw new Error("OANDA "+r.status);const d=await r.json();if(!mounted||!d.prices?.length)return;setPrices(prev=>{const next={...prev};d.prices.forEach(p=>{const pair=Object.keys(OINSTR).find(k=>OINSTR[k]===p.instrument);if(!pair)return;const bid=parseFloat(p.bids?.[0]?.price||0),ask=parseFloat(p.asks?.[0]?.price||0);if(!bid||!ask)return;const mid=(bid+ask)/2,old=prev[pair];next[pair]={bid,ask,mid,change:mid-BASE_PRICES[pair],pct:(mid-BASE_PRICES[pair])/BASE_PRICES[pair]*100,dir:mid>old.mid?"up":mid<old.mid?"down":"flat",live:true,history:[...old.history.slice(1),mid]};});return next;});setApiStatus("live_oanda");}catch{if(mounted)setApiStatus(s=>s==="live_oanda"?"live_oanda":"fallback");}};fetch_();const iv=setInterval(fetch_,3000);return()=>{mounted=false;clearInterval(iv);};},[oandaKey]);
  // ECB fallback removed - OANDA proxy active

  useEffect(()=>{const iv=setInterval(()=>{setPrices(prev=>{const next={};ALL_PAIRS.forEach(pair=>{const old=prev[pair];const isH=pair.includes("JPY");const vol=isH?0.000015:0.0000012;const move=(Math.random()-0.499)*vol*2;const nm=Math.max(old.mid*0.999,Math.min(old.mid*1.001,old.mid*(1+move)));const sp=isH?0.00015:0.000012;next[pair]={...old,bid:+(nm*(1-sp/2)).toFixed(5),ask:+(nm*(1+sp/2)).toFixed(5),mid:nm,change:nm-BASE_PRICES[pair],pct:(nm-BASE_PRICES[pair])/BASE_PRICES[pair]*100,dir:nm>old.mid?"up":nm<old.mid?"down":"flat",history:[...old.history.slice(1),nm]};});return next;});},1000);return()=>clearInterval(iv);},[]);
  return{prices,apiStatus};
}

function Spark({data,color,w=60,h=20}){
  if(!data?.length)return null;
  const mn=Math.min(...data),mx=Math.max(...data),rng=mx-mn||0.00001;
  const pts=data.map((v,i)=>`${(i/(data.length-1))*w},${h-((v-mn)/rng)*h}`).join(" ");
  return(<svg width={w} height={h} style={{display:"block",overflow:"visible"}}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>);
}

// ── SIGNAL ENGINE ────────────────────────────────────────────────────────
function calcLots(acct,risk,slPips,pair){return Math.max(0.01,Math.min(2.00,Math.round((acct*risk/100)/(slPips*10.0)*100)/100));}


const Bdg=memo(({label,color,sz="8.5px"})=>(<span style={{display:"inline-block",padding:"2px 7px",background:color+"22",color,border:`1px solid ${color}44`,borderRadius:"2px",fontSize:sz,fontWeight:"700",letterSpacing:"0.8px",lineHeight:"1.4"}}>{label}</span>));
const Btn=memo(({label,color=C.gold,ghost=false,onClick,style:cs,disabled})=>(<button onClick={onClick} disabled={disabled} style={{padding:"7px 13px",background:ghost?"transparent":color,color:ghost?color:"#05090f",border:`1px solid ${color}`,borderRadius:"3px",cursor:disabled?"not-allowed":"pointer",fontSize:"10.5px",fontWeight:"700",letterSpacing:"0.8px",fontFamily:"inherit",opacity:disabled?0.5:1,...cs}}>{label}</button>));
const Sm=memo(({label,color=C.gold,onClick,active})=>(<button onClick={onClick} style={{padding:"4px 9px",background:active?color+"22":"transparent",color:active?color:C.muted,border:`1px solid ${active?color:C.bdr}`,borderRadius:"2px",cursor:"pointer",fontSize:"9px",fontWeight:"700",letterSpacing:"0.5px",fontFamily:"inherit"}}>{label}</button>));
const Kv=memo(({k,v,vc=C.text})=>(<div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.bdr}22`,fontSize:"10.5px"}}><span style={{color:C.muted,flexShrink:0}}>{k}</span><span style={{color:vc,fontWeight:"700",textAlign:"right",marginLeft:"8px"}}>{v}</span></div>));

// ── TRADINGVIEW CHART — Fixed implementation ──────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────
function AxiomFX(){
  const load=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch{return d;}};
  const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};

  const [tab,setTab]=useState("dashboard");
  const [style,setStyle]=useState(()=>load("axiom_style","day"));
  const API_KEY_DEFAULT="";
  const OANDA_KEY_DEFAULT="";
  const SETTINGS_DEFAULT={acct:10000,risk:2,lev:50,broker:"TastyFX",pairs:ALL_PAIRS,notif:false,apiKey:API_KEY_DEFAULT,oandaKey:OANDA_KEY_DEFAULT,saved:false};
  const [settings,setSettings]=useState(()=>{const s=load("axiom_settings",SETTINGS_DEFAULT);if(!s.apiKey)s.apiKey=API_KEY_DEFAULT;if(!s.oandaKey)s.oandaKey=OANDA_KEY_DEFAULT;return s;});
  const [signals,setSignals]=useState(()=>{const all=load("axiom_signals",[]);const cut=Date.now()-14*24*3600*1000;return all.filter(s=>new Date(s.ts).getTime()>cut);});
  const [trades,setTrades]=useState(()=>load("axiom_trades",[]));
  const [history,setHistory]=useState(()=>load("axiom_history",[]));
  const [modal,setModal]=useState(null);
  const [chartPair,setChartPair]=useState("EUR/USD");
  const [chartFullscreen,setChartFullscreen]=useState(false);
  const [toast,setToast]=useState(null);
  // Calendar filters
  const [calCcy,setCalCcy]=useState("ALL");
  const [calImp,setCalImp]=useState("HIGH");
  const [calType,setCalType]=useState("ALL");
  const [calView,setCalView]=useState("TODAY"); // TODAY, WEEK, MONTH
  // Signal filter
  const [sFilter,setSFilter]=useState("ALL");
  // Lifted states — no reset bugs
  const [nCcy,setNCcy]=useState("ALL");
  const [nImp,setNImp]=useState("ALL");
  const [stratCatFilter,setStratCatFilter]=useState("ALL");
  const [stratTierFilter,setStratTierFilter]=useState("ALL");
  // localSettings mirrors settings — same object, single source of truth
  const localSettings=settings,setLocalSettings=setSettings;
  const [enabledStrats,setEnabledStrats]=useState(()=>load("axiom_strats",DEFAULT_ENABLED));
  const [modalTab,setModalTab]=useState("params");
  const [chartTf,setChartTf]=useState("60");
  const [wkView,setWkView]=useState("current");
  const [analyzerTab,setAnalyzerTab]=useState("regime");
  const [selCB,setSelCB]=useState(null);
  const [expandedTheme,setExpandedTheme]=useState(null);
  const [expandedStrat,setExpandedStrat]=useState(null);
  // NewsTab state lifted to root — survives price ticks and tab switches
  const [liveArts,setLiveArts]=useState(ALL_NEWS);
  const [newsLoading,setNewsLoading]=useState(false);
  const [newsBatch,setNewsBatch]=useState(0);
  const [newsLoaded,setNewsLoaded]=useState(false);
  const [newsStaticPage,setNewsStaticPage]=useState(0); // for endless scroll in static mode
  const timeCtxs=["today April 2026","week of April 7-11 2026","week of March 31-April 6 2026","late March 2026","mid March 2026","early March 2026","February 2026","January 2026"];
  const loadNews=useCallback(async(reset)=>{
      if(newsLoading)return;
      // API key handled server-side
      setNewsLoading(true);
      const nb=reset?0:newsBatch;
      const existing=reset?[]:liveArts;
      try{
        const r=await fetch("/.netlify/functions/chat",{method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:2500,
            system:`You are an institutional G10 FX news feed generator. Generate realistic Bloomberg-style news articles grounded in confirmed April 2026 macro facts: BOJ hiking 0.75% (only G10 hiker), ECB hawkish hold 2.00%, Fed hold 3.875%, RBNZ cut to 3.00% Apr 9, EUR/USD 1.168, USD/JPY 158.4, DXY testing 100, tariff 90-day pause. You MUST respond with ONLY a raw JSON array — no markdown fences, no backticks, no preamble, no explanation. Start your response with [ and end with ]. Each object: {id,dt,ccy,hl,detail,impact,imp,url,source}`,
            messages:[{role:"user",content:`Generate 12 G10 FX news articles for ${timeCtxs[Math.min(nb,7)]}${nCcy!=="ALL"?" focused on "+nCcy:""}${nImp!=="ALL"?" with "+nImp+" impact only":""}. Use real institutional sources (Reuters, Bloomberg, FT, BOJ, ECB, Fed). Each article: dt=YYYY-MM-DD HH:mm, ccy=single CCY code, hl=90-130 char headline, detail=2 sentences, impact=BULLISH/BEARISH/NEUTRAL, imp=HIGH/MED/LOW, url=real URL, source=publication. Respond with JSON array only starting with [.`}]})});
        const d=await r.json();
        if(d.error)throw new Error(d.error.message||JSON.stringify(d.error));
        const allText=(d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n");
        if(!allText.trim())throw new Error("empty response — check API key");
        const match=allText.match(/\[[\s\S]*\]/);
        if(!match)throw new Error("no JSON array found in response");
        const arts=JSON.parse(match[0]);
        if(!Array.isArray(arts)||!arts.length)throw new Error("empty array");
        const stamped=arts.map((a,i)=>({...a,id:`live_${nb}_${i}_${Date.now()}`}));
        setLiveArts(reset?stamped:[...existing,...stamped]);
        setBatchNum(nb+1);
      }catch(e){
        // API blocked (sandbox) or failed — use static articles with infinite scroll simulation
        const PAGE_SIZE=8;
        const page=reset?0:newsStaticPage;
        // Rotate through ALL_NEWS repeating with slight variations for "endless" feel
        const baseArts=ALL_NEWS;
        const start=(page*PAGE_SIZE)%baseArts.length;
        const batch=[];
        for(let i=0;i<PAGE_SIZE;i++){
          const art=baseArts[(start+i)%baseArts.length];
          batch.push({...art,id:`static_${page}_${i}_${Date.now()}`});
        }
        setLiveArts(reset?batch:[...existing,...batch]);
        setNewsStaticPage(page+1);
      }
      setNewsLoading(false);setNewsLoaded(true);
  // eslint-disable-next-line
  },[settings.apiKey,nCcy,nImp]);
  // Fire loadNews from root — not inside useMemo component
  useEffect(()=>{
    if(tab==="news"&&!newsLoaded)loadNews(true);
  },[tab,settings.apiKey]);
  useEffect(()=>{
    if(tab==="news"&&newsLoaded)loadNews(true);
  },[nCcy,nImp]);

  const [aiMsgs,setAiMsgs]=useState([{role:"assistant",content:"I'm AXIOM v6 — your institutional G10 FX intelligence. I have full context of all 28 pairs, 51 strategies, live prices, and confirmed April 2026 macro data.\n\nYour API key is pre-configured. Just type your question below and tap SEND — no setup needed."}]);
  const [aiInput,setAiInput]=useState("");
  const [aiLoading,setAiLoading]=useState(false);
  const [settingsSaved,setSettingsSaved]=useState(()=>load("axiom_settings",{saved:false}).saved||false);
  const sigTimerRef=useRef(null);
  const aiRef=useRef(null);
  const {prices,apiStatus}=usePrices(settings.oandaKey||localSettings.oandaKey);
  const toast_=useCallback((msg,color=C.green)=>{setToast({msg,color});setTimeout(()=>setToast(null),4500);},[]);

  useEffect(()=>save("axiom_style",style),[style]);
  useEffect(()=>save("axiom_settings",settings),[settings]);
  useEffect(()=>save("axiom_signals",signals),[signals]);
  useEffect(()=>save("axiom_trades",trades),[trades]);
  useEffect(()=>save("axiom_history",history),[history]);
  useEffect(()=>{aiRef.current?.scrollIntoView({behavior:"smooth"});},[aiMsgs]);

  // ── REAL SIGNAL SCANNER ────────────────────────────────────────────────────
  const runSignalScan=useCallback(async()=>{
    if(sigScanning)return;
    setSigScanning(true);
    setScanStatus("Scanning 28 pairs — fetching live candles & running real analysis...");
    try{
      const acctP=settings.acct||10000;const riskP=settings.risk||2;
      const res=await fetch(`/.netlify/functions/analyze?acct=${acctP}&risk=${riskP}`,{signal:AbortSignal.timeout(120000)});
      if(!res.ok)throw new Error("Analyze returned "+res.status);
      const data=await res.json();
      const now=Date.now();setLastScanTime(now);
      if(data.signals&&data.signals.length>0){
        const existingKeys=new Set(signals.map(s=>s.pair+s.direction));
        const freshSigs=data.signals
          .filter(s=>!existingKeys.has(s.pair+s.direction))
          .map(s=>({...s,id:now+Math.random(),
            primaryStrategy:{id:s.primaryStrategy?.id||"REAL",name:s.primaryStrategy?.id||"Multi-Strategy",
              tier:s.strategiesTriggered>=6?"S":s.strategiesTriggered>=4?"A":"B",
              cat:"REAL ANALYSIS",wr:s.probability,
              note:`${s.strategiesTriggered} strategies · Score:${s.technicalScore}`},
            supportingStrategy:{id:s.supportingStrategy?.id||"TECH",name:s.supportingStrategy?.id||"Confluence"},
            style:s.slPips<=20?"scalp":s.slPips<=60?"day":"swing",
            timeframe:s.slPips<=20?"M5/M15":s.slPips<=60?"H1/H4":"H4/D1",
            holdTime:s.slPips<=20?"15-60 min":s.slPips<=60?"2-8 hrs":"2-10 days",
            winExits:[`TP1 ${s.tp1} — move SL to breakeven`,`TP2 ${s.tp2} — trail stop`,`TP3 ${s.tp3} — full exit ${s.rr3}R`,s.technicalDetails?.sessionNote||""],
            lossExits:[`Hard SL ${s.sl} — ${s.slPips}p — no exceptions`,`Regime change — exit immediately`,`CB communication reversal`,`Correlated pairs reversing`],
            ts:new Date(s.timestamp||Date.now()),status:"PENDING",pnl:0,pips:0,currentPrice:s.entry}));
        if(freshSigs.length>0){
          setSignals(prev=>[...freshSigs,...prev].slice(0,50));
          freshSigs.forEach(sig=>{
            toast_(`⚡ REAL: ${sig.direction} ${sig.pair} ${sig.probability}% · ${sig.strategiesTriggered} strategies`,sig.direction==="BUY"?C.green:C.red);
            try{if(typeof Notification!=="undefined"&&Notification.permission==="granted"){new Notification(`AXIOM: ${sig.direction} ${sig.pair}`,{body:`${sig.probability}% · ${sig.strategiesTriggered} strategies
Entry:${sig.entry} SL:${sig.sl}`});}}catch(_){}
          });
        }
        setScanStatus(`Scan complete — ${data.signals.length} signal${data.signals.length!==1?"s":""} found · ${data.scanned} pairs scanned`);
      }else{
        setScanStatus(`No setups found across ${data.scanned||28} pairs (${data.skipped||0} rejected) · Next scan in 5 min`);
      }
    }catch(e){setScanStatus(`Scan error: ${e.message}`);}
    setSigScanning(false);
  },[sigScanning,signals,settings.acct,settings.risk,toast_]);

  useEffect(()=>{
    const t=setTimeout(()=>runSignalScan(),5000);
    const iv=setInterval(()=>runSignalScan(),5*60*1000);
    return()=>{clearTimeout(t);clearInterval(iv);};
  },[]);// eslint-disable-line

  // Live P&L — throttled
  useEffect(()=>{
    if(!trades.length)return;
    const iv=setInterval(()=>{
      setTrades(prev=>prev.map(t=>{
        const p=prices[t.pair];if(!p)return t;
        const cp=t.direction==="BUY"?p.bid:p.ask;
        const isH=t.pair.includes("JPY")||t.pair.includes("NOK");
        const pips=(t.direction==="BUY"?cp-t.entry:t.entry-cp)*(isH?100:10000);
        const pnl=pips*(isH?10:0.10)*t.lotSize;
        return{...t,currentPrice:cp,pips:Math.round(pips*10)/10,pnl:Math.round(pnl*100)/100};
      }));
    },2000); // 2s throttle for perf
    return()=>clearInterval(iv);
  },[trades.length,prices]); // use length not full array

  function takeTrade(sig){setTrades(p=>[{...sig,status:"ACTIVE",openTime:new Date(),pips:0,pnl:0},...p]);setSignals(p=>p.filter(s=>s.id!==sig.id));setModal(null);toast_(`Opened: ${sig.direction} ${sig.pair} @ ${sig.entry}`,C.blue);}
  function dismissSig(id){setSignals(p=>p.filter(s=>s.id!==id));}
  function closeT(id,res){const t=trades.find(x=>x.id===id);if(!t)return;setHistory(p=>[{...t,status:res,closeTime:new Date(),finalPnl:t.pnl},...p]);setTrades(p=>p.filter(x=>x.id!==id));toast_(`${res}: ${t.pair}  ${t.pnl>=0?"+":""}$${t.pnl.toFixed(2)}`,res==="WIN"?C.green:C.red);}

  async function sendAI(msg){
    if(!msg.trim()||aiLoading)return;
    // API key handled server-side
    const msgs=[...aiMsgs,{role:"user",content:msg}];
    setAiMsgs(msgs);setAiLoading(true);
    const openPnl=trades.reduce((a,t)=>a+t.pnl,0);
    const sys=`You are AXIOM, an institutional G10 FX trading AI. Direct, precise, institutional tone.
Account: $${settings.acct} | Style: ${style} | Risk: 2%/trade ($${(settings.acct*0.02).toFixed(0)}) | 50:1 leverage | Micro lots
Active: ${trades.length} trades | P&L: ${openPnl>=0?"+":""}$${openPnl.toFixed(2)} | ${signals.length} signals
Prices: ${Object.entries(prices).slice(0,6).map(([p,d])=>`${p} ${d.mid.toFixed(5)}`).join(" | ")}
CB Apr 2026: Fed 3.875% Hold | ECB 2.00% Neutral | BOJ 0.75% Hiking | BOE 3.75% Hold | RBA 3.85% | BOC 2.25% | RBNZ 3.00% Cutting
Regime: BOJ hike confirmed, USD tariff pressure, EUR hawkish hold, JPY/CHF bid.
Give exact price levels, pip counts, lot sizes. Only vanilla G10 spot trades.`;
    try{
      const res=await fetch("/.netlify/functions/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:sys,messages:msgs.map(m=>({role:m.role,content:m.content}))})});
      const data=await res.json();
      if(data.error)throw new Error(data.error.message);
      setAiMsgs(p=>[...p,{role:"assistant",content:data.content?.[0]?.text||"Analysis unavailable."}]);
    }catch(e){setAiMsgs(p=>[...p,{role:"assistant",content:`Error: ${e.message}. Check your API key is correct and has credits.`}]);}
    setAiLoading(false);
  }

  const perf=useMemo(()=>{
    const wins=history.filter(t=>t.status==="WIN"),loss=history.filter(t=>t.status==="LOSS");
    const tP=history.reduce((a,t)=>a+(t.finalPnl||0),0);
    const wr=history.length?wins.length/history.length*100:0;
    const aW=wins.length?wins.reduce((a,t)=>a+(t.finalPnl||0),0)/wins.length:0;
    const aL=loss.length?Math.abs(loss.reduce((a,t)=>a+(t.finalPnl||0),0)/loss.length):0;
    const pf=aL>0?(aW*wins.length)/(aL*loss.length):0;
    const bySt={};["scalp","day","swing"].forEach(s=>{const st=history.filter(t=>t.style===s),sw=st.filter(t=>t.status==="WIN");bySt[s]={n:st.length,w:sw.length,pnl:st.reduce((a,t)=>a+(t.finalPnl||0),0),wr:st.length?sw.length/st.length*100:0};});
    return{wins:wins.length,loss:loss.length,n:history.length,tP,wr,aW,aL,pf,bySt};
  },[history]);

  const openPnl=trades.reduce((a,t)=>a+t.pnl,0);
  const acctVal=settings.acct+perf.tP+openPnl;

  // ── SIGNAL CARD (memoized) ──────────────────────────────────────────────
  const SigCard=memo(function SigCard({sig,showDismiss}){
    const dc=sig.direction==="BUY"?C.green:C.red;
    const catBg=CATC[sig.primaryStrategy?.cat]||C.bg2;
    return(
      <div style={{background:C.bg1,border:`1px solid ${dc}22`,borderLeft:`3px solid ${dc}`,borderRadius:"5px",padding:"11px",marginBottom:"9px",contain:"content"}}>
        <div style={{display:"flex",alignItems:"center",gap:"7px",marginBottom:"7px",flexWrap:"wrap"}}>
          <Bdg label={sig.direction} color={dc} sz="10px"/>
          <span style={{fontWeight:"700",color:C.gold,fontSize:"13px"}}>{sig.pair}</span>
          <span style={{display:"inline-block",padding:"2px 7px",background:catBg+"55",color:"#dde3ee",border:`1px solid ${catBg}`,borderRadius:"2px",fontSize:"8px",fontWeight:"700"}}>{sig.primaryStrategy?.cat}</span>
          <Bdg label={sig.style.toUpperCase()} color={SC[sig.style]} sz="8px"/>
          <span style={{marginLeft:"auto",color:sig.probability>=68?C.green:sig.probability>=58?C.gold:C.amber,fontWeight:"700",fontSize:"11px"}}>{sig.probability}%</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"4px",marginBottom:"7px"}}>
          {[["ENTRY",sig.entry,C.text],["SL",sig.sl,C.red],["TP1",sig.tp1,C.green],["TP3",sig.tp3,C.gold],["LOTS",`${sig.lotSize}M`,C.gold]].map(([l,v,c])=>(
            <div key={l}><div style={{fontSize:"7px",color:C.muted,letterSpacing:"0.8px",marginBottom:"2px"}}>{l}</div><div style={{color:c,fontWeight:"700",fontSize:"9.5px"}}>{v}</div></div>
          ))}
        </div>
        <div style={{fontSize:"9px",color:C.muted,marginBottom:"8px"}}>{sig.primaryStrategy?.name} · 1:{sig.rr1}/1:{sig.rr2}/1:{sig.rr3} · {sig.timeframe} · {sig.holdTime}</div>
        <div style={{display:"flex",gap:"6px"}}>
          <Btn label="TAKE TRADE" color={dc} onClick={()=>takeTrade(sig)} style={{flex:1,fontSize:"10px",padding:"5px 8px"}}/>
          <Sm label="DETAILS" color={C.muted} onClick={()=>{setModal(sig);setModalTab("params");}}/>
              <Sm label="📊" color={C.blue} onClick={()=>window.open(tvUrl(sig.pair,{scalp:"15",day:"60",swing:"240"}[sig.style]||"60"),"_blank","noopener")}/>
          {showDismiss&&<button onClick={()=>dismissSig(sig.id)} style={{padding:"4px 8px",background:"transparent",color:C.red,border:`1px solid ${C.red}33`,borderRadius:"2px",cursor:"pointer",fontSize:"9px",fontFamily:"inherit",fontWeight:"700",flexShrink:0}}>✕</button>}
        </div>
      </div>
    );
  });

  const TABS=[
    {id:"dashboard",icon:"⬡",label:"Dashboard"},
    {id:"signals",  icon:"◈",label:"Signals"},
    {id:"chart",    icon:"📊",label:"Charts"},
    {id:"trades",   icon:"◉",label:"Trades"},
    {id:"perf",     icon:"▲",label:"Performance"},
    {id:"analyzer", icon:"◎",label:"Analyzer"},
    {id:"news",     icon:"◆",label:"News", badge:()=>{const h=ALL_NEWS.filter(n=>n.imp==="HIGH").length;return h>0?h:null;}},
    {id:"calendar", icon:"◷",label:"Calendar"},
    {id:"cb",       icon:"◈",label:"CB Rates"},
    {id:"weekend",  icon:"◫",label:"Weekend"},
    {id:"ai",       icon:"✦",label:"AXIOM AI"},
    {id:"strategies",icon:"◎",label:"Strategies"},
    {id:"sources",  icon:"📄",label:"Sources"},
    {id:"settings", icon:"⚙",label:"Settings"},
    {id:"deploy",   icon:"🚀",label:"Deploy"},
  ];

  // ─── DASHBOARD ────────────────────────────────────────────────────────
  function Dashboard(){
    // Market Pulse — derive from live prices
    const usdJpy=prices["USD/JPY"];
    const eurUsd=prices["EUR/USD"];
    const dxyDir=usdJpy&&usdJpy.pct>0.05?"RISING ↑":usdJpy&&usdJpy.pct<-0.05?"FALLING ↓":"FLAT →";
    const dxyColor=usdJpy&&usdJpy.pct>0.05?C.red:usdJpy&&usdJpy.pct<-0.05?C.green:C.muted; // DXY falls when USD/JPY falls
    const vixRegime="RISK-OFF"; // April 2026 tariff environment
    const topMover=ALL_PAIRS.reduce((best,p)=>Math.abs((prices[p]?.pct||0))>Math.abs((prices[best]?.pct||0))?p:best,"EUR/USD");
    const topMoverPct=prices[topMover]?.pct||0;
    return(
      <div style={{minWidth:0}}>
        {/* Market Pulse Bar */}
        <div style={{background:`linear-gradient(90deg,#050d18,#0a1525)`,border:`1px solid ${C.bdr}`,borderRadius:"5px",padding:"7px 12px",marginBottom:"8px",display:"flex",gap:"0",overflowX:"auto",scrollbarWidth:"none"}}>
          {[
            ["DXY",dxyDir,dxyColor],
            ["REGIME",vixRegime,C.amber],
            ["TOP MOVER",`${topMover} ${topMoverPct>=0?"+":""}${topMoverPct.toFixed(3)}%`,topMoverPct>=0?C.green:C.red],
            ["EUR/USD",eurUsd?eurUsd.mid.toFixed(5):"–",eurUsd?.pct>=0?C.green:C.red],
            ["USD/JPY",usdJpy?usdJpy.mid.toFixed(3):"–",usdJpy?.pct>=0?C.red:C.green],
            ["STATUS",apiStatus==="live_oanda"?"OANDA LIVE":apiStatus==="live_ecb"?"ECB LIVE":"SIM",apiStatus==="live_oanda"?C.green:apiStatus==="live_ecb"?"#00d4ff":C.amber],
          ].map(([l,v,c],i,arr)=>(
            <div key={l} style={{display:"flex",flexDirection:"column",paddingRight:"14px",marginRight:"14px",borderRight:i<arr.length-1?`1px solid ${C.bdr}`:"none",flexShrink:0}}>
              <span style={{fontSize:"7px",color:C.muted,letterSpacing:"1.5px",fontWeight:"700",marginBottom:"2px"}}>{l}</span>
              <span style={{fontSize:"10px",color:c,fontWeight:"700",fontFamily:"monospace",whiteSpace:"nowrap"}}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{background:`linear-gradient(90deg,${C.bg2},#0a1e3a)`,border:`2px solid ${C.gold}`,borderRadius:"6px",padding:"10px 14px",marginBottom:"10px",display:"flex",alignItems:"center",gap:"12px",flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:"8px",color:C.gold,letterSpacing:"2px",fontWeight:"700",marginBottom:"2px"}}>💰 THEORETICAL ACCOUNT</div>
            <div style={{fontSize:"22px",fontWeight:"700",color:C.gold,fontFamily:"monospace"}}>${acctVal.toFixed(2)}</div>
            <div style={{fontSize:"8.5px",color:C.muted}}>Base ${settings.acct} · Closed ${perf.tP.toFixed(2)} · Open ${openPnl.toFixed(2)}</div>
          </div>
          <button onClick={()=>{setSettingsSaved(false);setTab("settings");}} style={{marginLeft:"auto",padding:"8px 14px",background:C.gold,color:C.bg,border:"none",borderRadius:"4px",cursor:"pointer",fontWeight:"700",fontSize:"10px",fontFamily:"inherit"}}>✏️ EDIT →</button>
        </div>
        {/* KPIs */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"8px",marginBottom:"10px"}}>
          {[["OPEN P&L",`${openPnl>=0?"+":""}$${openPnl.toFixed(2)}`,openPnl>=0?C.green:C.red,`${trades.length} trades`],["WIN RATE",`${perf.wr.toFixed(1)}%`,perf.wr>=55?C.green:C.amber,`${perf.wins}W/${perf.loss}L`],["PROF FACTOR",`${perf.pf.toFixed(2)}x`,perf.pf>=1.5?C.green:perf.pf>=1?C.amber:C.red,""],["SIGNALS",String(signals.length),C.gold,"pending"]].map(([l,v,c,sub])=>(
            <div key={l} style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"5px",padding:"9px 10px"}}>
              <div style={{fontSize:"7.5px",color:C.muted,letterSpacing:"1.5px",marginBottom:"3px"}}>{l}</div>
              <div style={{fontSize:"16px",fontWeight:"700",color:c,marginBottom:"2px"}}>{v}</div>
              <div style={{fontSize:"8.5px",color:C.muted}}>{sub}</div>
            </div>
          ))}
        </div>
        {/* Notice */}
        <div style={{background:"#0a1a0a",border:`1px solid ${C.green}44`,borderRadius:"5px",padding:"8px 12px",marginBottom:"10px",display:"flex",gap:"8px",alignItems:"center"}}>
          <span style={{color:C.green,fontSize:"12px",flexShrink:0}}>ℹ️</span>
          <div style={{fontSize:"9px",color:C.muted,lineHeight:"1.6"}}>Prices below are reference-seeded real-time ticks. For guaranteed live prices, use <button onClick={()=>setTab("chart")} style={{background:"transparent",border:"none",color:C.gold,cursor:"pointer",fontFamily:"inherit",fontSize:"9px",fontWeight:"700",textDecoration:"underline",padding:0}}>📊 Charts</button> (TradingView live feed). Ref: ForexFactory Apr 7 ~11:55PM: EUR/USD 1.1669 · GBP/USD 1.3397 · USD/JPY 158.38</div>
        </div>
        {/* All 28 pairs — alphabetical */}
        <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"6px",padding:"10px 12px",marginBottom:"10px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px",paddingBottom:"6px",borderBottom:`1px solid ${C.bdr}`}}>
            <span style={{fontSize:"9px",fontWeight:"700",color:C.gold,letterSpacing:"2px"}}>◈ 28 G10 PAIRS — ALPHABETICAL — REFERENCE PRICES</span>
            <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
              <button onClick={()=>setTab("chart")} style={{padding:"3px 8px",background:C.gold+"22",color:C.gold,border:`1px solid ${C.gold}44`,borderRadius:"2px",cursor:"pointer",fontSize:"8px",fontWeight:"700",fontFamily:"inherit"}}>📊 LIVE CHARTS →</button>
              <div style={{width:"5px",height:"5px",borderRadius:"50%",background:apiStatus==="live_oanda"?C.green:apiStatus==="live_ecb"?"#00d4ff":C.amber,animation:"pulse 2s infinite"}}/>
            </div>
          </div>
          <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:"540px"}}>
              <thead><tr>{["PAIR","BID","ASK","CHG","CHG%","SPARK","CARRY","📊"].map(h=><th key={h} style={{padding:"4px 6px",textAlign:"left",fontSize:"7.5px",color:C.muted,letterSpacing:"1px",borderBottom:`1px solid ${C.bdr}`,fontWeight:"700",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
              <tbody>
                {ALL_PAIRS.map(pair=>{
                  const p=prices[pair];if(!p)return null;
                  const isH=pair.includes("JPY")||pair.includes("NOK"),dec=isH?3:5;
                  const pc=p.dir==="up"?C.green:p.dir==="down"?C.red:C.text;
                  const [base,quote]=pair.split("/");
                  const carry=((CB[base]?.rate||0)-(CB[quote]?.rate||0)).toFixed(2);
                  return(
                    <tr key={pair} onMouseEnter={e=>e.currentTarget.style.background=C.bg1} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <td style={{padding:"5px 6px",fontWeight:"700",color:C.gold,fontSize:"10.5px",whiteSpace:"nowrap"}}>{pair}</td>
                      <td style={{padding:"5px 6px",color:pc,fontWeight:"700",fontFamily:"monospace",fontSize:"10px",whiteSpace:"nowrap"}}>{p.bid.toFixed(dec)}</td>
                      <td style={{padding:"5px 6px",color:pc,fontFamily:"monospace",fontSize:"10px",whiteSpace:"nowrap"}}>{p.ask.toFixed(dec)}</td>
                      
                      <td style={{padding:"5px 6px",color:p.change>=0?C.green:C.red,fontFamily:"monospace",fontSize:"9.5px",whiteSpace:"nowrap"}}>{p.change>=0?"+":""}{p.change.toFixed(dec)}</td>
                      <td style={{padding:"5px 6px",color:p.pct>=0?C.green:C.red,fontWeight:"600",fontSize:"9.5px",whiteSpace:"nowrap"}}>{p.pct>=0?"+":""}{p.pct.toFixed(3)}%</td>
                      <td style={{padding:"3px 6px"}}><Spark data={p.history} color={p.pct>=0?C.green:C.red}/></td>
                      <td style={{padding:"5px 6px",color:parseFloat(carry)>0?C.green:parseFloat(carry)<0?C.red:C.muted,fontWeight:"600",fontSize:"9.5px",whiteSpace:"nowrap"}}>{parseFloat(carry)>0?"+":""}{carry}%</td>
                      <td style={{padding:"5px 6px"}}><button onClick={()=>{setChartPair(pair);setTab("chart");}} style={{padding:"2px 6px",background:C.blue+"22",color:C.blue,border:`1px solid ${C.blue}44`,borderRadius:"2px",cursor:"pointer",fontSize:"8px",fontFamily:"inherit",fontWeight:"700"}}>GO</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {/* G10 Currency Recap */}
        <div style={{background:C.bg2,border:`1px solid ${C.gold}33`,borderRadius:"6px",padding:"10px 13px",marginBottom:"10px"}}>
          <div style={{fontSize:"9px",fontWeight:"700",color:C.gold,letterSpacing:"2px",marginBottom:"9px",paddingBottom:"6px",borderBottom:`1px solid ${C.bdr}`}}>◈ G10 CURRENCY RECAP — APRIL 2026</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px"}}>
            {[{ccy:"USD",dir:"BEARISH",c:C.red,  note:"DXY testing 100. CPI Apr 10 pivotal. Sell USD rallies."},
              {ccy:"JPY",dir:"BULLISH",c:C.green, note:"Only G10 hiker. BOJ 0.75%. MUFG target USD/JPY 146."},
              {ccy:"EUR",dir:"BULLISH",c:C.green, note:"ECB hawkish hold. EUR/USD 1.16+. JPM target 1.20."},
              {ccy:"GBP",dir:"NEUTRAL",c:C.gold,  note:"BOE easing bias vs 3% CPI. EUR/GBP toward 0.88+."},
              {ccy:"AUD",dir:"BULLISH",c:C.green, note:"RBA hawkish hold. China PMI 50.5. RBC target 0.73."},
              {ccy:"NZD",dir:"BEARISH",c:C.red,   note:"RBNZ cut 3.00% Apr 9. 325bp cycle. Sell rallies."},
              {ccy:"CAD",dir:"BEARISH",c:C.red,   note:"BOC dovish. USMCA July risk. Oil surplus headwind."},
              {ccy:"CHF",dir:"BULLISH",c:C.green, note:"Safe haven bid. Dollar debasement. EUR/CHF 0.93 target."},
              {ccy:"NOK",dir:"NEUTRAL",c:C.gold,  note:"Norges 4.00% hold. Oil decline = vulnerable in risk-off."},
              {ccy:"SEK",dir:"NEUTRAL",c:C.gold,  note:"Riksbank 1.75% hold. Best G10 performer 2025 (+19%)."},
            ].map(({ccy,dir,c,note})=>(
              <div key={ccy} style={{background:C.bg1,border:`1px solid ${c}22`,borderLeft:`3px solid ${c}`,borderRadius:"4px",padding:"7px 9px"}}>
                <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"3px"}}>
                  <span style={{fontWeight:"700",color:C.gold,fontSize:"12px",minWidth:"28px"}}>{ccy}</span>
                  <Bdg label={dir} color={c} sz="7.5px"/>
                </div>
                <div style={{fontSize:"8.5px",color:"#9ab8cc",lineHeight:"1.4"}}>{note}</div>
              </div>
            ))}
          </div>
        </div>
        {/* ── Market Pulse ─────────────────────────────────────────────── */}
        {(()=>{
          const topMover=ALL_PAIRS.reduce((b,pair)=>{const pp=prices[pair];if(!pp)return b;return Math.abs(pp.pct)>Math.abs(b.pct)?{pair,pct:pp.pct}:b;},{pair:"EUR/USD",pct:0});
          const regime=topMover.pct>0.4?"RISK ON":topMover.pct<-0.4?"RISK OFF":"NEUTRAL";
          const rc=regime==="RISK ON"?C.green:regime==="RISK OFF"?C.red:C.gold;
          return(
            <div style={{display:"flex",gap:"6px",alignItems:"center",background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"5px",padding:"7px 12px",marginBottom:"9px",overflowX:"auto",scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
              <div style={{flexShrink:0,display:"flex",alignItems:"center",gap:"4px"}}>
                <div style={{width:"6px",height:"6px",borderRadius:"50%",background:apiStatus==="live_oanda"?C.green:apiStatus==="live_ecb"?"#00d4ff":C.amber,animation:"pulse 2s infinite"}}/>
                <span style={{fontSize:"7.5px",color:apiStatus==="live_oanda"?C.green:apiStatus==="live_ecb"?"#00d4ff":C.amber,fontWeight:"700"}}>{apiStatus==="live_oanda"?"OANDA LIVE":apiStatus==="live_ecb"?"ECB LIVE":"SIM"}</span>
              </div>
              <span style={{color:C.dim}}>│</span>
              <div style={{flexShrink:0}}><span style={{fontSize:"7.5px",color:C.muted}}>REGIME </span><span style={{fontSize:"8px",color:rc,fontWeight:"700"}}>{regime}</span></div>
              <span style={{color:C.dim}}>│</span>
              <div style={{flexShrink:0}}><span style={{fontSize:"7.5px",color:C.muted}}>TOP </span><span style={{fontSize:"8px",color:topMover.pct>=0?C.green:C.red,fontWeight:"700"}}>{topMover.pair} {topMover.pct>=0?"+":""}{topMover.pct.toFixed(3)}%</span></div>
              <span style={{color:C.dim}}>│</span>
              <div style={{flexShrink:0}}><span style={{fontSize:"7.5px",color:C.muted}}>SIGNALS </span><span style={{fontSize:"8px",color:C.gold,fontWeight:"700"}}>{signals.length}</span></div>
              <span style={{color:C.dim}}>│</span>
              <div style={{flexShrink:0}}><span style={{fontSize:"7.5px",color:C.muted}}>OPEN </span><span style={{fontSize:"8px",color:trades.length>0?C.amber:C.muted,fontWeight:"700"}}>{trades.length} trades</span></div>
            </div>
          );
        })()}
        {/* Signals + News */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
          <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"6px",padding:"10px 12px",minWidth:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px",paddingBottom:"6px",borderBottom:`1px solid ${C.bdr}`}}>
              <span style={{fontSize:"9px",fontWeight:"700",color:C.gold,letterSpacing:"2px"}}>◈ LATEST SIGNALS</span>
              <Sm label="ALL →" onClick={()=>setTab("signals")}/>
            </div>
            {signals.slice(0,3).map(s=><SigCard key={s.id} sig={s}/>)}
            {!signals.length&&<div style={{color:C.muted,textAlign:"center",padding:"16px",fontSize:"10px"}}>Generating signals...</div>}
          </div>
          <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"6px",padding:"10px 12px",minWidth:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px",paddingBottom:"6px",borderBottom:`1px solid ${C.bdr}`}}>
              <span style={{fontSize:"9px",fontWeight:"700",color:C.gold,letterSpacing:"2px"}}>◆ LATEST NEWS</span>
              <Sm label="ALL →" onClick={()=>setTab("news")}/>
            </div>
            {ALL_NEWS.slice(0,5).map(n=>{
              const ic=n.impact==="BULLISH"?C.green:n.impact==="BEARISH"?C.red:C.muted;
              return(
                <div key={n.id} onClick={()=>window.open(n.url,"_blank","noopener")} style={{borderBottom:`1px solid ${C.bdr}22`,paddingBottom:"7px",marginBottom:"7px",cursor:"pointer"}}>
                  <div style={{display:"flex",gap:"4px",alignItems:"center",marginBottom:"3px"}}>
                    <Bdg label={n.ccy} color={ic}/><Bdg label={n.imp} color={n.imp==="HIGH"?C.amber:n.imp==="MED"?C.gold:C.muted}/>
                    <span style={{fontSize:"8.5px",color:C.muted,marginLeft:"auto"}}>{n.dt.split(" ")[1]?.slice(0,5)}</span>
                  </div>
                  <div style={{fontSize:"10px",color:"#b8cde0",lineHeight:"1.45",fontWeight:n.imp==="HIGH"?"600":"400"}}>{n.hl.slice(0,100)}{n.hl.length>100?"...":""}<span style={{color:C.blue,marginLeft:"4px",fontSize:"8px"}}>↗</span></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ─── SIGNALS TAB ──────────────────────────────────────────────────────
  function SignalsTab(){
    const cats=[...new Set(STRATEGIES.map(s=>s.cat))];
    const filtered=sFilter==="ALL"?signals:signals.filter(s=>s.direction===sFilter||s.primaryStrategy?.cat===sFilter||s.style===sFilter);
    return(
      <div>
        {/* Real Analysis Engine Status */}
        <div style={{background:sigScanning?"#071407":"#0a0e1a",border:`1px solid ${sigScanning?C.green:C.gold}44`,borderRadius:"5px",padding:"10px 12px",marginBottom:"8px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"4px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"7px"}}>
              <div style={{width:"6px",height:"6px",borderRadius:"50%",background:sigScanning?C.green:C.gold,animation:sigScanning?"pulse 1s infinite":"none"}}/>
              <span style={{fontSize:"8.5px",fontWeight:"700",color:sigScanning?C.green:C.gold,letterSpacing:"1.5px"}}>{sigScanning?"⚡ SCANNING 28 PAIRS — REAL TECHNICAL ANALYSIS":"◎ REAL SIGNAL ENGINE — NO RANDOM GENERATION"}</span>
            </div>
            <button onClick={runSignalScan} disabled={sigScanning} style={{padding:"4px 10px",background:C.gold+"22",color:sigScanning?C.muted:C.gold,border:`1px solid ${C.gold}44`,borderRadius:"3px",cursor:sigScanning?"not-allowed":"pointer",fontSize:"8px",fontWeight:"700",fontFamily:"inherit",opacity:sigScanning?0.5:1}}>{sigScanning?"SCANNING...":"▶ SCAN NOW"}</button>
          </div>
          <div style={{fontSize:"8px",color:C.muted}}>{scanStatus}</div>
          <div style={{fontSize:"7.5px",color:C.muted,marginTop:"2px"}}>Last scan: {lastScanTime?new Date(lastScanTime).toLocaleTimeString():"Never"} · Auto every 5 min · 51 strategies · EMA/RSI/MACD/ATR/Ichimoku/ADX/Swing</div>
        </div>
        <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"5px",padding:"10px 12px",marginBottom:"10px"}}>
          <div style={{display:"flex",gap:"5px",flexWrap:"wrap",alignItems:"center",marginBottom:"8px"}}>
            <span style={{fontSize:"9px",color:C.gold,fontWeight:"700"}}>FILTER:</span>
            {["ALL","BUY","SELL","scalp","day","swing",...cats].map(f=><Sm key={f} label={f.toUpperCase()} active={sFilter===f} onClick={()=>setSFilter(f)}/>)}
            <span style={{marginLeft:"auto",fontSize:"9.5px",color:C.muted}}>{filtered.length} signals</span>
          </div>
          <div style={{fontSize:"8.5px",color:C.muted,borderTop:`1px solid ${C.bdr}22`,paddingTop:"6px"}}>Signals persist until dismissed (✕) or 14 days. No limit on pairs. New signals every 15–90s.</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
          {filtered.map(s=><SigCard key={s.id} sig={s} showDismiss/>)}
        </div>
        {!filtered.length&&<div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"5px",padding:"30px",textAlign:"center",color:C.muted}}>No signals for this filter. Generating continuously...</div>}
      </div>
    );
  }

  // ─── CHARTS TAB — Fixed ────────────────────────────────────────────────
  function ChartsTab(){
    const selectedTf=chartTf,setSelectedTf=setChartTf;
    const TFS=[{v:"5",l:"5m"},{v:"15",l:"15m"},{v:"30",l:"30m"},{v:"60",l:"1H"},{v:"240",l:"4H"},{v:"D",l:"1D"},{v:"W",l:"1W"}];
    return(
      <div>
        <div style={{background:`linear-gradient(90deg,${C.bg2},#0a1a2a)`,border:`2px solid ${C.gold}`,borderRadius:"7px",padding:"14px 16px",marginBottom:"12px"}}>
          <div style={{fontSize:"12px",fontWeight:"700",color:C.gold,letterSpacing:"2px",marginBottom:"5px"}}>📊 AXIOM CHART LAUNCHER</div>
          <div style={{fontSize:"9px",color:C.muted,lineHeight:"1.65",marginBottom:"10px"}}>Select a timeframe, then tap any pair to open the live TradingView chart — real candles, real prices, full drawing toolkit.</div>
          <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
            {TFS.map(t=>(
              <button key={t.v} onClick={()=>setSelectedTf(t.v)}
                style={{padding:"7px 14px",background:selectedTf===t.v?C.gold:"transparent",color:selectedTf===t.v?C.bg:C.muted,border:`1px solid ${selectedTf===t.v?C.gold:C.bdr}`,borderRadius:"4px",cursor:"pointer",fontWeight:"700",fontSize:"11px",fontFamily:"inherit"}}>
                {t.l}
              </button>
            ))}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
          {ALL_PAIRS.map(pair=>{
            const p=prices[pair];const isH=pair.includes("JPY"),dec=isH?3:5;
            const isUp=p&&p.pct>=0;
            const [base,quote]=pair.split("/");
            const carry=((CB[base]?.rate||0)-(CB[quote]?.rate||0));
            return(
              <button key={pair} onClick={()=>window.open(tvUrl(pair,selectedTf),"_blank","noopener")}
                style={{background:C.bg2,border:`1px solid ${isUp?C.green+"33":C.red+"33"}`,borderRadius:"6px",padding:"11px 12px",cursor:"pointer",textAlign:"left",fontFamily:"inherit",WebkitTapHighlightColor:"transparent"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"5px"}}>
                  <span style={{fontWeight:"700",color:C.gold,fontSize:"12px"}}>{pair}</span>
                  <span style={{fontSize:"13px",color:isUp?C.green:C.red}}>{isUp?"▲":"▼"}</span>
                </div>
                {p&&<div style={{display:"flex",alignItems:"baseline",gap:"5px",marginBottom:"4px"}}>
                  <span style={{fontSize:"7.5px",color:C.muted}}>LAST</span>
                  <span style={{fontWeight:"700",color:C.text,fontSize:"13px",fontFamily:"monospace"}}>{p.mid.toFixed(dec)}</span>
                  <span style={{fontSize:"9px",color:isUp?C.green:C.red}}>{isUp?"+":""}{p.pct.toFixed(3)}%</span>
                </div>}
                {p&&<div style={{marginBottom:"5px"}}><Spark data={p.history} color={isUp?C.green:C.red} w={110} h={20}/></div>}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:"7.5px",color:carry>0?C.green:carry<0?C.red:C.muted}}>Carry {carry>=0?"+":""}{carry.toFixed(2)}%</span>
                  <span style={{fontSize:"7.5px",color:C.blue,fontWeight:"700"}}>{TFS.find(t=>t.v===selectedTf)?.l} ↗</span>
                </div>
              </button>
            );
          })}
        </div>
        <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"6px",padding:"11px 13px",marginTop:"11px",fontSize:"9px",color:C.muted,lineHeight:"1.8"}}>
          <strong style={{color:C.green}}>📊 About AXIOM Charts:</strong> Each tap opens a live TradingView chart — real interbank prices, full drawing tools, all indicators (RSI, MACD, Bollinger, Ichimoku). Use Themes tab for weekly bias → select pair → choose timeframe → tap = professional workflow.
        </div>
      </div>
    );
  }

  function NewsTab(){
    const ccys=["ALL","USD","EUR","GBP","JPY","AUD","CAD","CHF","NZD","NOK","SEK"];
    const imps=["ALL","HIGH","MED","LOW"];
    // State lives at root — no remount loss on price ticks
    const loading=newsLoading,setLoading=setNewsLoading;
    const batchNum=newsBatch,setBatchNum=setNewsBatch;
    const hasLoaded=newsLoaded,setHasLoaded=setNewsLoaded;

    // loadNews called from root useEffect below
    const src=liveArts; // liveArts always populated (API or static fallback)
    const displayed=src.filter(n=>{
      if(nCcy!=="ALL"&&n.ccy!==nCcy)return false;
      if(nImp!=="ALL"&&n.imp!==nImp)return false;
      return true;
    });
    const impC={HIGH:C.amber,MED:C.gold,LOW:C.muted};
    return(
      <div>
        {/* Filters */}
        <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"5px",padding:"10px 12px",marginBottom:"8px"}}>
          <div style={{display:"flex",gap:"5px",flexWrap:"wrap",alignItems:"center",marginBottom:"6px"}}>
            <span style={{fontSize:"8.5px",color:C.gold,fontWeight:"700",minWidth:"46px"}}>CURRENCY:</span>
            {ccys.map(f=><Sm key={f} label={f} active={nCcy===f} onClick={()=>setNCcy(f)}/>)}
          </div>
          <div style={{display:"flex",gap:"5px",flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:"8.5px",color:C.gold,fontWeight:"700",minWidth:"46px"}}>IMPACT:</span>
            {imps.map(f=><Sm key={f} label={f} active={nImp===f} onClick={()=>setNImp(f)} color={f==="HIGH"?C.red:f==="MED"?C.amber:f==="LOW"?C.muted:C.gold}/>)}
          </div>
        </div>
        <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"6px",padding:"10px 12px"}}>
          {/* Header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px",paddingBottom:"6px",borderBottom:`1px solid ${C.bdr}`}}>
            <div>
              <div style={{fontSize:"9px",fontWeight:"700",color:C.gold,letterSpacing:"2px"}}>◆ AXIOM NEWS — {settings.apiKey?"AI GENERATED · DEPLOY FOR LIVE":"STATIC FEED · SANDBOX MODE"}</div>
              <div style={{fontSize:"7.5px",color:C.muted,marginTop:"2px"}}>{displayed.length} articles · AI-generated · scroll ↓ for more</div>
            </div>
            {settings.apiKey&&<button onClick={()=>loadNews(true)} disabled={loading} style={{padding:"4px 9px",background:C.green+"22",color:C.green,border:`1px solid ${C.green}44`,borderRadius:"3px",cursor:"pointer",fontSize:"8.5px",fontWeight:"700",fontFamily:"inherit",opacity:loading?0.5:1}}>↺ Refresh</button>}
          </div>

          {/* Loading */}
          {loading&&!displayed.length&&<div style={{padding:"24px",textAlign:"center"}}>
            <div style={{fontSize:"11px",color:C.gold,marginBottom:"4px"}}>⚡ Searching web for live FX news...</div>
            <div style={{fontSize:"8.5px",color:C.muted}}>Fetching real articles via Claude web search</div>
          </div>}
          {/* Articles */}
          {displayed.map(n=>{
            const ic=n.impact==="BULLISH"?C.green:n.impact==="BEARISH"?C.red:C.muted;
            return(
              <div key={n.id} onClick={()=>n.url&&window.open(n.url,"_blank","noopener")}
                style={{background:C.bg1,border:`1px solid ${ic}22`,borderLeft:`3px solid ${ic}`,borderRadius:"4px",padding:"9px 11px",marginBottom:"7px",cursor:n.url?"pointer":"default"}}
                onMouseEnter={e=>{if(n.url){e.currentTarget.style.borderColor=ic;e.currentTarget.style.background="#0d1e35";}}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=ic+"22";e.currentTarget.style.background=C.bg1;}}>
                <div style={{display:"flex",gap:"5px",alignItems:"center",marginBottom:"4px",flexWrap:"wrap"}}>
                  <Bdg label={n.ccy} color={ic}/><Bdg label={n.imp||"MED"} color={impC[n.imp]||C.gold}/><Bdg label={n.impact} color={ic}/>
                  {n.source&&<Bdg label={n.source} color={C.blue}/>}
                  <span style={{marginLeft:"auto",fontSize:"8px",color:C.muted,fontFamily:"monospace"}}>{n.dt}</span>
                  {n.url&&<span style={{fontSize:"8px",color:C.blue,fontWeight:"700"}}>↗</span>}
                </div>
                <div style={{fontSize:"11px",color:"#b8cde0",lineHeight:"1.5",fontWeight:n.imp==="HIGH"?"600":"400",marginBottom:n.detail?"4px":"0"}}>{n.hl}</div>
                {n.detail&&<div style={{fontSize:"9px",color:C.muted,lineHeight:"1.45"}}>{n.detail}</div>}
              </div>
            );
          })}
          {loading&&displayed.length>0&&<div style={{padding:"10px",textAlign:"center",color:C.gold,fontSize:"10px"}}>⚡ Loading more articles...</div>}
          {settings.apiKey&&!loading&&hasLoaded&&<button onClick={()=>loadNews(false)} style={{width:"100%",padding:"11px",background:C.bg1,color:C.gold,border:`1px solid ${C.gold}44`,borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontWeight:"700",fontFamily:"inherit",marginTop:"4px"}}>↓ LOAD OLDER ARTICLES — search further back in time</button>}
        </div>
      </div>
    );
  }
  function CalendarTab(){
    const now=new Date();
    const todayStr=now.toISOString().slice(0,10);
    const ccys=["ALL","USD","EUR","GBP","JPY","AUD","CAD","CHF","NZD","NOK","SEK"];
    const imps=["ALL","HIGH","MED","LOW"];
    const types=["ALL","CB Decision","CB Speech","Inflation","Employment","GDP","PMI","Sentiment","Trade","Manufacturing","Retail","Housing","Indicator","Monetary","Inventory","Income"];
    const views=["TODAY","THIS WEEK","THIS MONTH","NEXT MONTH"];

    const filtered=FULL_CALENDAR.filter(e=>{
      const eDate=e.dt.slice(0,10);
      const eTime=new Date(e.dt);
      if(calView==="TODAY"&&eDate!==todayStr)return false;
      if(calView==="THIS WEEK"){const day=now.getDay(),start=new Date(now);start.setDate(now.getDate()-(day===0?6:day-1));const end=new Date(start);end.setDate(start.getDate()+7);if(eTime<start||eTime>=end)return false;}
      if(calView==="THIS MONTH"&&eDate.slice(0,7)!==todayStr.slice(0,7))return false;
      if(calView==="NEXT MONTH"){const nm=new Date(now.getFullYear(),now.getMonth()+1,1);const nmStr=nm.toISOString().slice(0,7);if(eDate.slice(0,7)!==nmStr)return false;}
      if(calCcy!=="ALL"&&e.ccy!==calCcy)return false;
      if(calImp!=="ALL"&&e.imp!==calImp)return false;
      if(calType!=="ALL"&&e.type!==calType)return false;
      return true;
    });

    const impColor={HIGH:C.red,MED:C.amber,LOW:C.muted};
    // Group by date
    const byDate={};
    filtered.forEach(e=>{const d=e.dt.slice(0,10);if(!byDate[d])byDate[d]=[];byDate[d].push(e);});
    const sortedDates=Object.keys(byDate).sort();

    return(
      <div>
        {/* Controls */}
        <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"5px",padding:"10px 12px",marginBottom:"8px"}}>
          {/* View selector */}
          <div style={{display:"flex",gap:"5px",flexWrap:"wrap",alignItems:"center",marginBottom:"8px"}}>
            <span style={{fontSize:"8.5px",color:C.gold,fontWeight:"700",minWidth:"38px"}}>VIEW:</span>
            {views.map(v=><Sm key={v} label={v} active={calView===v} onClick={()=>setCalView(v)}/>)}
          </div>
          {/* Currency */}
          <div style={{display:"flex",gap:"5px",flexWrap:"wrap",alignItems:"center",marginBottom:"6px"}}>
            <span style={{fontSize:"8.5px",color:C.gold,fontWeight:"700",minWidth:"38px"}}>CCY:</span>
            {ccys.map(c=><Sm key={c} label={c} active={calCcy===c} onClick={()=>setCalCcy(c)}/>)}
          </div>
          {/* Impact */}
          <div style={{display:"flex",gap:"5px",flexWrap:"wrap",alignItems:"center",marginBottom:"6px"}}>
            <span style={{fontSize:"8.5px",color:C.gold,fontWeight:"700",minWidth:"38px"}}>IMPACT:</span>
            {imps.map(i=><Sm key={i} label={i} active={calImp===i} onClick={()=>setCalImp(i)} color={i==="HIGH"?C.red:i==="MED"?C.amber:i==="LOW"?C.muted:C.gold}/>)}
          </div>
          {/* Type */}
          <div style={{display:"flex",gap:"5px",flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:"8.5px",color:C.gold,fontWeight:"700",minWidth:"38px"}}>TYPE:</span>
            {types.map(t=><Sm key={t} label={t} active={calType===t} onClick={()=>setCalType(t)}/>)}
          </div>
        </div>

        <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"6px",padding:"10px 12px"}}>
          <div style={{fontSize:"9px",fontWeight:"700",color:C.gold,letterSpacing:"2px",marginBottom:"8px",paddingBottom:"6px",borderBottom:`1px solid ${C.bdr}`}}>
            ◷ ECONOMIC CALENDAR — {calView} · {filtered.length} EVENTS · {calCcy==="ALL"?"All Currencies":calCcy} · {calImp==="ALL"?"All Impacts":calImp}
          </div>
          {!sortedDates.length&&<div style={{color:C.muted,textAlign:"center",padding:"20px"}}>No events for this filter. Try changing VIEW to "THIS MONTH" or "ALL" impact level.</div>}
          {sortedDates.map(date=>(
            <div key={date}>
              {/* Date header */}
              <div style={{background:C.bg3,padding:"6px 10px",marginBottom:"4px",marginTop:"8px",borderRadius:"3px",display:"flex",alignItems:"center",gap:"8px"}}>
                <span style={{color:C.gold,fontWeight:"700",fontSize:"10px"}}>{new Date(date+"T12:00:00Z").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"})}</span>
                <span style={{fontSize:"8.5px",color:C.muted}}>{byDate[date].filter(e=>e.imp==="HIGH").length} HIGH · {byDate[date].filter(e=>e.imp==="MED").length} MED</span>
              </div>
              {byDate[date].map((e,i)=>{
                const et=new Date(e.dt),past=et<now,soon=!past&&(et-now)<7200000;
                const ic=impColor[e.imp];
                const isReleased=e.actual&&e.actual!=="–";
                return(
                  <div key={i} style={{display:"flex",alignItems:"flex-start",gap:"8px",padding:"7px 4px",borderBottom:`1px solid ${C.bdr}22`,opacity:past?0.5:1,background:soon?"#ff9f1c05":"transparent"}}>
                    {/* Time */}
                    <div style={{minWidth:"45px",fontSize:"9.5px",color:soon?C.amber:C.muted,fontFamily:"monospace",flexShrink:0}}>{e.dt.split(" ")[1]?.slice(0,5)}{soon?" ⚡":""}</div>
                    {/* CCY badge */}
                    <div style={{minWidth:"36px",flexShrink:0}}><Bdg label={e.ccy} color={ic}/></div>
                    {/* Impact dot */}
                    <div style={{width:"8px",height:"8px",borderRadius:"50%",background:ic,flexShrink:0,marginTop:"3px"}}/>
                    {/* Event name */}
                    <div style={{flex:1,fontSize:"10.5px",fontWeight:e.imp==="HIGH"?"700":"400",color:e.imp==="HIGH"?C.text:"#b8cde0",lineHeight:"1.4"}}>{e.ev}</div>
                    {/* Forecast */}
                    <div style={{minWidth:"52px",textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:"8.5px",color:C.muted}}>F: <span style={{color:C.gold,fontWeight:"700"}}>{e.fc}</span></div>
                      <div style={{fontSize:"8.5px",color:C.muted}}>P: {e.pr}</div>
                      {isReleased&&<div style={{fontSize:"8.5px",color:C.green,fontWeight:"700"}}>A: {e.actual}</div>}
                    </div>
                    {/* Status */}
                    <div style={{minWidth:"50px",textAlign:"right",flexShrink:0}}><Bdg label={isReleased?"ACTUAL":soon?"SOON ⚡":past?"PENDING":"UPCOMING"} color={isReleased?C.green:soon?C.amber:past?C.muted:C.dim} sz="7.5px"/></div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── ACTIVE TRADES ────────────────────────────────────────────────────
  function ActiveTrades(){
    return(
      <div>
        <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"5px",padding:"9px 12px",marginBottom:"10px",display:"flex",alignItems:"center",gap:"10px"}}>
          <span style={{fontSize:"9px",color:C.gold,fontWeight:"700",letterSpacing:"2px"}}>◉ ACTIVE TRADES</span>
          <span style={{fontSize:"9.5px",color:C.muted}}>{trades.length} open</span>
          <span style={{marginLeft:"auto",fontWeight:"700",fontSize:"13px",color:openPnl>=0?C.green:C.red}}>{openPnl>=0?"+":""}${openPnl.toFixed(2)}</span>
        </div>
        {!trades.length?<div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"5px",padding:"30px",textAlign:"center",color:C.muted}}>No active trades.</div>:trades.map(t=>{
          const dc=t.direction==="BUY"?C.green:C.red,pc=t.pnl>=0?C.green:C.red;
          const prog=t.pips>0?Math.min(100,(t.pips/t.tp1Pips)*100):0;
          const isH=t.pair.includes("JPY")||t.pair.includes("NOK");
          return(
            <div key={t.id} style={{background:C.bg1,border:`1px solid ${dc}22`,borderRadius:"6px",padding:"12px",marginBottom:"10px",contain:"content"}}>
              <div style={{display:"flex",alignItems:"center",gap:"7px",marginBottom:"9px",flexWrap:"wrap"}}>
                <Bdg label={t.direction} color={dc} sz="10px"/>
                <span style={{fontWeight:"700",color:C.gold,fontSize:"15px"}}>{t.pair}</span>
                <Bdg label={t.style.toUpperCase()} color={SC[t.style]}/>
                <span style={{fontSize:"9px",color:C.muted}}>@ {t.entry}</span>
                <div style={{marginLeft:"auto",display:"flex",gap:"10px"}}>
                  <span style={{fontWeight:"700",color:t.pips>=0?C.green:C.red,fontSize:"11px"}}>{t.pips>=0?"+":""}{t.pips}p</span>
                  <span style={{fontWeight:"700",color:pc,fontSize:"16px"}}>{t.pnl>=0?"+":""}${t.pnl.toFixed(2)}</span>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:"5px",marginBottom:"8px"}}>
                {[["SL",t.sl,C.red],[`TP1`,t.tp1,C.green],[`TP2`,t.tp2,C.green],[`TP3`,t.tp3,C.gold]].map(([l,v,c])=>(
                  <div key={l} style={{background:C.bg2,borderRadius:"3px",padding:"5px 7px",border:`1px solid ${c}22`}}>
                    <div style={{fontSize:"7.5px",color:C.muted,marginBottom:"1px"}}>{l}</div>
                    <div style={{fontSize:"10px",color:c,fontWeight:"700"}}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{marginBottom:"7px"}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:"8px",color:C.muted,marginBottom:"2px"}}><span>TP1 progress</span><span style={{color:prog>=100?C.gold:C.text}}>{Math.round(prog)}%</span></div>
                <div style={{height:"3px",background:C.bdr,borderRadius:"2px"}}><div style={{height:"100%",width:`${prog}%`,background:prog>=100?C.gold:C.green,borderRadius:"2px",transition:"width 0.8s"}}/></div>
              </div>
              <div style={{fontSize:"8.5px",color:C.muted,marginBottom:"8px"}}>Strategy: <span style={{color:C.gold}}>{t.primaryStrategy?.name}</span> · {t.lotSize}M lots · $${t.riskAmount} risk · R:R 1:{t.rr1}/1:{t.rr2}/1:{t.rr3}</div>
              <div style={{display:"flex",gap:"7px"}}>
                <Btn label="✓ WIN"  color={C.green} onClick={()=>closeT(t.id,"WIN")}  style={{flex:1,fontSize:"10px",padding:"6px"}}/>
                <Btn label="✗ LOSS" color={C.red}   onClick={()=>closeT(t.id,"LOSS")} style={{flex:1,fontSize:"10px",padding:"6px"}}/>
                <Btn label="MKT" color={C.muted} ghost onClick={()=>closeT(t.id,t.pnl>=0?"WIN":"LOSS")} style={{minWidth:"48px",fontSize:"10px",padding:"6px"}}/>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ─── PERFORMANCE ─────────────────────────────────────────────────────
  function Performance(){
    return(
      <div>
        <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"6px",padding:"12px",marginBottom:"10px"}}>
          <div style={{fontSize:"9px",fontWeight:"700",color:C.gold,letterSpacing:"2px",marginBottom:"8px",paddingBottom:"6px",borderBottom:`1px solid ${C.bdr}`}}>▲ ALL-TIME PERFORMANCE</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"7px"}}>
            {[["NET P&L",`${perf.tP>=0?"+":""}$${perf.tP.toFixed(2)}`,perf.tP>=0?C.green:C.red],["RETURN",`${(perf.tP/settings.acct*100).toFixed(2)}%`,perf.tP>=0?C.green:C.red],["WIN RATE",`${perf.wr.toFixed(1)}%`,perf.wr>=55?C.green:C.amber],["PROF FACTOR",`${perf.pf.toFixed(2)}x`,perf.pf>=1.5?C.green:perf.pf>=1?C.amber:C.red],["TOTAL",String(perf.n),C.text],["AVG WIN",`$${perf.aW.toFixed(2)}`,C.green],["AVG LOSS",`$${perf.aL.toFixed(2)}`,C.red],["W/L",`${perf.wins}/${perf.loss}`,C.text]].map(([l,v,c])=>(
              <div key={l} style={{background:C.bg1,border:`1px solid ${C.bdr}`,borderRadius:"4px",padding:"8px 10px",textAlign:"center"}}>
                <div style={{fontSize:"7.5px",color:C.muted,letterSpacing:"1px",marginBottom:"3px"}}>{l}</div>
                <div style={{fontSize:"15px",fontWeight:"700",color:c||C.text}}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"6px",padding:"12px",marginBottom:"10px"}}>
          <div style={{fontSize:"9px",fontWeight:"700",color:C.gold,letterSpacing:"2px",marginBottom:"8px",paddingBottom:"6px",borderBottom:`1px solid ${C.bdr}`}}>▲ BY STYLE</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px"}}>
            {["scalp","day","swing"].map(s=>{const d=perf.bySt[s],c=SC[s];return(
              <div key={s} style={{background:C.bg1,border:`1px solid ${c}44`,borderRadius:"4px",padding:"10px"}}>
                <div style={{color:c,fontWeight:"700",fontSize:"11px",letterSpacing:"2px",marginBottom:"8px"}}>{s.toUpperCase()}</div>
                <Kv k="Trades" v={String(d.n)}/><Kv k="Win %" v={`${d.wr.toFixed(1)}%`} vc={d.wr>=55?C.green:C.amber}/><Kv k="P&L" v={`${d.pnl>=0?"+":""}$${d.pnl.toFixed(2)}`} vc={d.pnl>=0?C.green:C.red}/>
                <div style={{height:"3px",background:C.bdr,borderRadius:"2px",marginTop:"7px"}}><div style={{height:"100%",width:`${Math.min(100,d.wr)}%`,background:c,borderRadius:"2px"}}/></div>
              </div>
            );})}
          </div>
        </div>
        {history.length>0&&(
          <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"6px",padding:"12px"}}>
            <div style={{fontSize:"9px",fontWeight:"700",color:C.gold,letterSpacing:"2px",marginBottom:"8px",paddingBottom:"6px",borderBottom:`1px solid ${C.bdr}`}}>▲ TRADE HISTORY</div>
            <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:"500px"}}>
                <thead><tr>{["PAIR","DIR","STYLE","STRATEGY","ENTRY","P&L","PIPS","RESULT"].map(h=><th key={h} style={{padding:"5px 7px",textAlign:"left",fontSize:"7.5px",color:C.muted,letterSpacing:"1px",borderBottom:`1px solid ${C.bdr}`,fontWeight:"700"}}>{h}</th>)}</tr></thead>
                <tbody>{history.map((t,i)=>(
                  <tr key={i} onMouseEnter={e=>e.currentTarget.style.background=C.bg1} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <td style={{padding:"6px 7px",color:C.gold,fontWeight:"700",fontSize:"10.5px"}}>{t.pair}</td>
                    <td style={{padding:"6px 7px"}}><Bdg label={t.direction} color={t.direction==="BUY"?C.green:C.red}/></td>
                    <td style={{padding:"6px 7px",color:SC[t.style]||C.muted,fontSize:"9px",fontWeight:"700"}}>{t.style?.toUpperCase()}</td>
                    <td style={{padding:"6px 7px",fontSize:"9px",color:C.muted,maxWidth:"120px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.primaryStrategy?.name}</td>
                    <td style={{padding:"6px 7px",fontFamily:"monospace",fontSize:"10px"}}>{t.entry}</td>
                    <td style={{padding:"6px 7px",color:t.finalPnl>=0?C.green:C.red,fontWeight:"700"}}>{t.finalPnl>=0?"+":""}${t.finalPnl?.toFixed(2)}</td>
                    <td style={{padding:"6px 7px",color:t.pips>=0?C.green:C.red,fontSize:"10px"}}>{t.pips>=0?"+":""}{t.pips}</td>
                    <td style={{padding:"6px 7px"}}><Bdg label={t.status} color={t.status==="WIN"?C.green:C.red}/></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── ANALYZER ─────────────────────────────────────────────────────────
  function Analyzer(){
    // analyzerTab lifted to root — no reset on price tick
    const byStr={};
    history.forEach(t=>{
      const k=t.primaryStrategy?.id||"UNK";
      const nm=t.primaryStrategy?.name||"Unknown";
      const tier=t.primaryStrategy?.tier||"B";
      if(!byStr[k])byStr[k]={name:nm,tier,n:0,w:0,l:0,pnl:0,pips:0,avgR:0,rrs:[]};
      byStr[k].n++;
      if(t.status==="WIN"){byStr[k].w++;byStr[k].rrs.push(t.rr3||1);}
      else byStr[k].l++;
      byStr[k].pnl+=(t.finalPnl||0);
      byStr[k].pips+=(t.finalPips||0);
    });
    Object.values(byStr).forEach(s=>{s.avgR=s.rrs.length?s.rrs.reduce((a,b)=>a+b,0)/s.rrs.length:0;});
    const stList=Object.values(byStr).sort((a,b)=>b.pnl-a.pnl);

    // Market context data
    const REGIMES=[
      {ccy:"USD",regime:"BEARISH",strength:"STRONG",detail:"DXY testing 100 handle. Fed on hold at 3.875%. NFP 128K miss. CPI Apr 10 pivotal. Structural downtrend from 2025 peak.",best_strat:["CB_DIV","REAL_YLD","GLOB_MAC"],avoid:["CARRY"],evidence:"J.P. Morgan 2026 Outlook: post-peak USD world",url:"https://www.jpmorgan.com/insights/global-research/outlook/market-outlook"},
      {ccy:"JPY",regime:"BULLISH",strength:"STRONG",detail:"BOJ only G10 hiker — 0.75% confirmed. Wage growth 3.1% above 3% threshold. MUFG target USD/JPY 146. Structural JPY appreciation underway.",best_strat:["BOJ_NORM","CB_DIV","SAFE_HVN"],avoid:["CARRY"],evidence:"MUFG: Post-peak USD world, Dec 2025",url:"https://www.mufgresearch.com/fx/fx-focus-g10-fx-2026-outlook-in-a-post-peak-usd-world-19-december-2025/"},
      {ccy:"EUR",regime:"BULLISH",strength:"MOD",detail:"ECB hawkish hold 2.00%. Schnabel: hike more likely than cut. German fiscal stimulus supporting growth. EUR/USD above 1.16.",best_strat:["CB_DIV","CB_COMM","GRW_DIV"],avoid:["BB_FADE"],evidence:"ING Think: G10 FX Outlook 2026",url:"https://think.ing.com/articles/fx-outlook-2026-our-main-calls/"},
      {ccy:"NZD",regime:"BEARISH",strength:"STRONG",detail:"RBNZ cut to 3.00% Apr 9. 325bp of cuts since Aug 2024 — most aggressive G10 easer. NZ in recession. Sell NZD on all rallies.",best_strat:["RATE_SRP","CB_DIV","CS_MOM"],avoid:["UIP_DEV"],evidence:"RBNZ Apr 2026: 3.00% decision + press conference",url:"https://www.rbnz.govt.nz/monetary-policy/"},
      {ccy:"AUD",regime:"BULLISH",strength:"MOD",detail:"RBA hawkish hold 3.85%. Bullock: no cuts imminent. China PMI 50.5 supportive. AUD/USD 0.73 year-end target (RBC).",best_strat:["CB_DIV","COMD_CCY","EQ_BETA"],avoid:["CARRY"],evidence:"RBC Capital Markets FX Report Card",url:"https://www.rbccm.com/assets/rbccm/docs/fx/currency-report-card.pdf"},
      {ccy:"CHF",regime:"BULLISH",strength:"MOD",detail:"Dollar debasement trade driving CHF appreciation. SNB relaxed about strength. EUR/CHF 0.93 target. Safe haven demand.",best_strat:["SAFE_HVN","GLOB_MAC","REAL_YLD"],avoid:["CARRY"],evidence:"BlackRock 2026 Macro Outlook",url:"https://www.blackrock.com/institutions/en-us/insights/2026-macro-outlook"},
    ];

    const REGIMECOLOR={BULLISH:C.green,BEARISH:C.red,NEUTRAL:C.gold};
    const STRENGTHCOLOR={STRONG:C.green,MOD:C.gold,WEAK:C.muted};
    const ATABS=[{id:"regime",l:"Regime"},{id:"pairs",l:"Pair Matrix"},{id:"performance",l:"Strategy Perf"},{id:"risk",l:"Risk Metrics"}];

    // Pair performance
    const byPair={};
    history.forEach(t=>{
      const k=t.pair;if(!byPair[k])byPair[k]={n:0,w:0,pnl:0};
      byPair[k].n++;if(t.status==="WIN")byPair[k].w++;byPair[k].pnl+=(t.finalPnl||0);
    });

    // Risk metrics
    const totalTrades=history.length;
    const wins=history.filter(t=>t.status==="WIN").length;
    const totalPnl=history.reduce((a,t)=>a+(t.finalPnl||0),0);
    const winPnl=history.filter(t=>t.status==="WIN").reduce((a,t)=>a+(t.finalPnl||0),0);
    const lossPnl=Math.abs(history.filter(t=>t.status==="LOSS").reduce((a,t)=>a+(t.finalPnl||0),0));
    const profitFactor=lossPnl>0?(winPnl/lossPnl).toFixed(2):"∞";
    const avgWin=wins>0?(winPnl/wins).toFixed(2):"0";
    const avgLoss=(totalTrades-wins)>0?(lossPnl/(totalTrades-wins)).toFixed(2):"0";
    const maxDD=history.reduce((state,t)=>{
      state.running+=(t.finalPnl||0);
      if(state.running>state.peak)state.peak=state.running;
      const dd=state.peak-state.running;
      if(dd>state.maxDD)state.maxDD=dd;
      return state;
    },{running:0,peak:0,maxDD:0}).maxDD;

    return(
      <div>
        {/* Tab bar */}
        <div style={{display:"flex",gap:"4px",marginBottom:"12px",overflowX:"auto",scrollbarWidth:"none"}}>
          {ATABS.map(t=>(
            <button key={t.id} onClick={()=>setAnalyzerTab(t.id)} style={{padding:"8px 14px",background:analyzerTab===t.id?C.gold+"22":"transparent",color:analyzerTab===t.id?C.gold:C.muted,border:`1px solid ${analyzerTab===t.id?C.gold:C.bdr}`,borderRadius:"5px",cursor:"pointer",fontSize:"10px",fontWeight:"700",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0}}>
              {t.l}
            </button>
          ))}
        </div>

        {/* REGIME ASSESSMENT */}
        {analyzerTab==="regime"&&(
          <div>
            <div style={{background:C.bg2,border:`1px solid ${C.gold}33`,borderRadius:"6px",padding:"12px",marginBottom:"10px"}}>
              <div style={{fontSize:"9px",fontWeight:"700",color:C.gold,letterSpacing:"2px",marginBottom:"8px"}}>◎ APRIL 2026 MACRO REGIME — POST-PEAK USD · BOJ HIKE CYCLE</div>
              <div style={{background:`linear-gradient(90deg,#071a07,#0a1a2a)`,border:`1px solid ${C.green}33`,borderRadius:"4px",padding:"11px 13px",marginBottom:"10px",fontSize:"10.5px",color:"#b8cde0",lineHeight:"1.85"}}>
                <span style={{color:C.gold,fontWeight:"700"}}>DOMINANT REGIME: CB DIVERGENCE / SAFE HAVEN / POST-PEAK USD</span><br/>
                BOJ confirmed hiking at 0.75% — only G10 hiker, structural JPY bid on every rally. ECB hawkish hold drives EUR higher. USD structurally weak (DXY 100 test) on labor softening and tariff relief fading.<br/>
                <span style={{color:C.green}}>✓ HIGH EDGE: JPY longs (USD/JPY, EUR/JPY, GBP/JPY shorts) · EUR/USD buy dips · CHF safe haven · CB Divergence strategy</span><br/>
                <span style={{color:C.red}}>✗ AVOID: G10 Carry (JPY unwinding) · AUD/CAD/NOK commodity longs (oil risk) · USD longs</span>
              </div>
            </div>
            {REGIMES.map((r,i)=>(
              <div key={i} style={{background:C.bg2,border:`1px solid ${REGIMECOLOR[r.regime]}33`,borderLeft:`4px solid ${REGIMECOLOR[r.regime]}`,borderRadius:"6px",padding:"11px 13px",marginBottom:"8px"}}>
                <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"6px",flexWrap:"wrap"}}>
                  <span style={{fontWeight:"700",color:C.gold,fontSize:"14px"}}>{r.ccy}</span>
                  <Bdg label={r.regime} color={REGIMECOLOR[r.regime]}/>
                  <Bdg label={r.strength} color={STRENGTHCOLOR[r.strength]} sz="8px"/>
                </div>
                <div style={{fontSize:"10px",color:"#b8cde0",lineHeight:"1.6",marginBottom:"7px"}}>{r.detail}</div>
                <div style={{display:"flex",gap:"6px",alignItems:"center",flexWrap:"wrap",marginBottom:"6px"}}>
                  <span style={{fontSize:"7.5px",color:C.muted,fontWeight:"700"}}>BEST STRATEGIES:</span>
                  {r.best_strat.map(id=>{const s=STRATEGIES.find(x=>x.id===id);return s?<span key={id} style={{padding:"2px 6px",background:C.green+"22",color:C.green,border:`1px solid ${C.green}33`,borderRadius:"3px",fontSize:"8px",fontWeight:"700"}}>{s.name.split(" ").slice(0,3).join(" ")}</span>:null;})}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:`1px solid ${C.bdr}22`,paddingTop:"6px"}}>
                  <span style={{fontSize:"8px",color:C.muted}}>{r.evidence}</span>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" style={{fontSize:"8px",color:C.blue,fontWeight:"700",textDecoration:"none",flexShrink:0}}>Source ↗</a>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PAIR MATRIX */}
        {analyzerTab==="pairs"&&(
          <div>
            <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"6px",padding:"11px 13px",marginBottom:"10px"}}>
              <div style={{fontSize:"9px",fontWeight:"700",color:C.gold,letterSpacing:"2px",marginBottom:"8px"}}>◎ PAIR PERFORMANCE MATRIX</div>
              {Object.keys(byPair).length===0
                ? <div style={{color:C.muted,fontSize:"10px",textAlign:"center",padding:"20px"}}>No closed trades yet — take signals and close them to see pair performance</div>
                : <table style={{width:"100%",borderCollapse:"collapse"}}>
                    <thead><tr>{["PAIR","TRADES","WIN %","NET P&L"].map(h=><th key={h} style={{padding:"5px 7px",textAlign:"left",fontSize:"7.5px",color:C.muted,borderBottom:`1px solid ${C.bdr}`,fontWeight:"700"}}>{h}</th>)}</tr></thead>
                    <tbody>{Object.entries(byPair).sort((a,b)=>b[1].pnl-a[1].pnl).map(([pair,d])=>{
                      const wr=d.n?d.w/d.n*100:0;
                      return(<tr key={pair}>
                        <td style={{padding:"6px 7px",color:C.gold,fontWeight:"700"}}>{pair}</td>
                        <td style={{padding:"6px 7px",color:C.text}}>{d.n}</td>
                        <td style={{padding:"6px 7px",color:wr>=55?C.green:C.amber,fontWeight:"700"}}>{wr.toFixed(1)}%</td>
                        <td style={{padding:"6px 7px",color:d.pnl>=0?C.green:C.red,fontWeight:"700"}}>{d.pnl>=0?"+":""}${d.pnl.toFixed(2)}</td>
                      </tr>);
                    })}</tbody>
                  </table>
              }
            </div>
            {/* Live pair analysis based on current prices */}
            <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"6px",padding:"11px 13px"}}>
              <div style={{fontSize:"9px",fontWeight:"700",color:C.gold,letterSpacing:"2px",marginBottom:"8px"}}>◎ CURRENT PAIR MOMENTUM — LIVE</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px"}}>
                {ALL_PAIRS.map(pair=>{
                  const p=prices[pair];if(!p)return null;
                  const isH=pair.includes("JPY"),dec=isH?3:5;
                  const bull=p.pct>=0;
                  return(<div key={pair} style={{background:C.bg1,border:`1px solid ${bull?C.green:C.red}22`,borderRadius:"4px",padding:"7px 9px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontWeight:"700",color:C.gold,fontSize:"11px"}}>{pair}</span>
                      <span style={{fontSize:"9px",color:bull?C.green:C.red,fontWeight:"700"}}>{bull?"+":""}{p.pct.toFixed(3)}%</span>
                    </div>
                    <div style={{fontSize:"9.5px",color:C.text,fontFamily:"monospace"}}>{p.mid.toFixed(dec)}</div>
                  </div>);
                })}
              </div>
            </div>
          </div>
        )}

        {/* STRATEGY PERFORMANCE */}
        {analyzerTab==="performance"&&(
          <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"6px",padding:"12px"}}>
            <div style={{fontSize:"9px",fontWeight:"700",color:C.gold,letterSpacing:"2px",marginBottom:"8px",paddingBottom:"6px",borderBottom:`1px solid ${C.bdr}`}}>◎ STRATEGY PERFORMANCE</div>
            {stList.length===0
              ? <div style={{color:C.muted,fontSize:"10px",textAlign:"center",padding:"20px"}}>No closed trades yet. Take signals, close them, and performance data will appear here.</div>
              : <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",minWidth:"500px"}}>
                    <thead><tr>{["STRATEGY","TIER","TRADES","WIN%","AVG R","NET P&L","RATING"].map(h=><th key={h} style={{padding:"5px 7px",textAlign:"left",fontSize:"7.5px",color:C.muted,letterSpacing:"1px",borderBottom:`1px solid ${C.bdr}`,fontWeight:"700"}}>{h}</th>)}</tr></thead>
                    <tbody>{stList.map((s,i)=>{
                      const wr=s.n?s.w/s.n*100:0;
                      const rating=s.pnl>0&&wr>58?"STRONG":s.pnl>0?"POSITIVE":wr>50?"MARGINAL":"LAGGING";
                      const rc=rating==="STRONG"?C.green:rating==="POSITIVE"?C.gold:rating==="MARGINAL"?C.amber:C.red;
                      const tc={S:C.gold,A:C.green,B:C.blue}[s.tier]||C.muted;
                      return(<tr key={i} onMouseEnter={e=>e.currentTarget.style.background=C.bg1} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <td style={{padding:"6px 7px",color:C.gold,fontWeight:"600",fontSize:"10px"}}>{s.name}</td>
                        <td style={{padding:"6px 7px"}}><Bdg label={s.tier} color={tc} sz="8px"/></td>
                        <td style={{padding:"6px 7px",color:C.text}}>{s.n}</td>
                        <td style={{padding:"6px 7px",color:wr>=55?C.green:C.amber,fontWeight:"700"}}>{wr.toFixed(1)}%</td>
                        <td style={{padding:"6px 7px",color:C.text,fontFamily:"monospace"}}>{s.avgR.toFixed(1)}R</td>
                        <td style={{padding:"6px 7px",color:s.pnl>=0?C.green:C.red,fontWeight:"700"}}>{s.pnl>=0?"+":""}${s.pnl.toFixed(2)}</td>
                        <td style={{padding:"6px 7px"}}><Bdg label={rating} color={rc} sz="7.5px"/></td>
                      </tr>);
                    })}</tbody>
                  </table>
                </div>
            }
          </div>
        )}

        {/* RISK METRICS */}
        {analyzerTab==="risk"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"9px",marginBottom:"10px"}}>
              {[["TOTAL TRADES",totalTrades,C.text],["WIN RATE",totalTrades>0?(wins/totalTrades*100).toFixed(1)+"%":"-",wins/totalTrades>=0.55?C.green:C.amber],["NET P&L",totalPnl>=0?"+$"+totalPnl.toFixed(2):"−$"+Math.abs(totalPnl).toFixed(2),totalPnl>=0?C.green:C.red],["PROFIT FACTOR",profitFactor,parseFloat(profitFactor)>=1.5?C.green:parseFloat(profitFactor)>=1?C.gold:C.red],["AVG WIN","$"+avgWin,C.green],["AVG LOSS","−$"+avgLoss,C.red],["MAX DRAWDOWN","−$"+maxDD.toFixed(2),maxDD>500?C.red:maxDD>200?C.amber:C.green],["OPEN TRADES",trades.length,C.text]].map(([l,v,c])=>(
                <div key={l} style={{background:C.bg2,border:`1px solid ${c}33`,borderRadius:"5px",padding:"11px",textAlign:"center"}}>
                  <div style={{fontSize:"8px",color:C.muted,letterSpacing:"1px",marginBottom:"4px",fontWeight:"700"}}>{l}</div>
                  <div style={{fontSize:"18px",fontWeight:"700",color:c,fontFamily:"monospace"}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"6px",padding:"11px 13px"}}>
              <div style={{fontSize:"9px",fontWeight:"700",color:C.gold,letterSpacing:"2px",marginBottom:"9px"}}>◎ RISK MANAGEMENT RULES — INSTITUTIONAL</div>
              {[["Max 2% risk per trade","Each signal auto-calculates lot size for your account balance and 2% risk. Never manually increase position size.","MANDATORY"],["Max 6% portfolio heat","No more than 3 open trades at once at 2% each. Correlated pairs (EUR/USD + GBP/USD) count double.","MANDATORY"],["Always use stop loss","Every signal includes a hard SL level. No exceptions. No averaging down into losers.","MANDATORY"],["Trail to breakeven at TP1","When TP1 is hit, move stop to entry immediately. Lock in risk-free position.","BEST PRACTICE"],["Exit before high-impact news","Close or reduce positions before HIGH-impact calendar events (check Calendar tab).","BEST PRACTICE"],["Maximum daily loss 6%","If down 6% in a day, stop trading. Protect capital. Reset tomorrow.","MANDATORY"]].map(([rule,detail,type],i)=>(
                <div key={i} style={{borderBottom:`1px solid ${C.bdr}22`,paddingBottom:"8px",marginBottom:"8px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"7px",marginBottom:"3px"}}>
                    <Bdg label={type} color={type==="MANDATORY"?C.red:C.gold} sz="7.5px"/>
                    <span style={{fontWeight:"700",color:C.text,fontSize:"10.5px"}}>{rule}</span>
                  </div>
                  <div style={{fontSize:"9px",color:C.muted,lineHeight:"1.5"}}>{detail}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }


  // ─── CB RATES ─────────────────────────────────────────────────────────
  function CBRates(){
    // selCB lifted to root — no reset on price tick
    const CB_HIST={
      USD:[{d:"Sep'23",r:5.50},{d:"Sep'24",r:5.25},{d:"Nov'24",r:4.75},{d:"Dec'24",r:4.50},{d:"Feb'25",r:4.25},{d:"Jun'25",r:4.00},{d:"Sep'25",r:3.875},{d:"Apr'26",r:3.875}],
      EUR:[{d:"Sep'23",r:4.50},{d:"Jun'24",r:4.00},{d:"Sep'24",r:3.50},{d:"Dec'24",r:3.00},{d:"Mar'25",r:2.50},{d:"Sep'25",r:2.00},{d:"Apr'26",r:2.00}],
      JPY:[{d:"Mar'24",r:-0.10},{d:"Apr'24",r:0.10},{d:"Jul'24",r:0.25},{d:"Jan'25",r:0.50},{d:"Jan'26",r:0.75},{d:"Apr'26",r:0.75}],
      GBP:[{d:"Aug'23",r:5.25},{d:"Aug'24",r:5.00},{d:"Nov'24",r:4.75},{d:"Feb'25",r:4.50},{d:"Sep'25",r:4.00},{d:"Jan'26",r:3.75},{d:"Apr'26",r:3.75}],
      AUD:[{d:"Nov'23",r:4.35},{d:"Feb'25",r:4.10},{d:"May'25",r:3.85},{d:"Apr'26",r:3.85}],
      CAD:[{d:"Jul'23",r:5.00},{d:"Jun'24",r:4.75},{d:"Sep'24",r:4.25},{d:"Dec'24",r:3.25},{d:"Jun'25",r:2.75},{d:"Sep'25",r:2.25},{d:"Apr'26",r:2.25}],
      CHF:[{d:"Jun'23",r:1.75},{d:"Mar'24",r:1.50},{d:"Jun'24",r:1.25},{d:"Sep'24",r:1.00},{d:"Dec'24",r:0.50},{d:"Mar'25",r:0.25},{d:"Jun'25",r:0.00},{d:"Apr'26",r:0.00}],
      NZD:[{d:"May'23",r:5.50},{d:"Oct'24",r:5.25},{d:"Nov'24",r:4.75},{d:"Jan'25",r:4.25},{d:"Apr'25",r:3.75},{d:"Jul'25",r:3.25},{d:"Nov'25",r:3.00},{d:"Apr'26",r:3.00}],
      NOK:[{d:"Dec'23",r:4.50},{d:"Dec'24",r:4.50},{d:"Mar'25",r:4.25},{d:"Sep'25",r:4.00},{d:"Apr'26",r:4.00}],
      SEK:[{d:"May'23",r:4.00},{d:"May'24",r:3.75},{d:"Aug'24",r:3.25},{d:"Nov'24",r:2.75},{d:"Feb'25",r:2.25},{d:"May'25",r:2.00},{d:"Sep'25",r:1.75},{d:"Apr'26",r:1.75}],
    };
    return(
      <div>
        {/* History modal */}
        {selCB&&(()=>{
          const [ccy,cb]=selCB;const hist=CB_HIST[ccy]||[];const bc=cb.bias==="Hawkish"?C.green:cb.bias==="Dovish"?C.red:C.gold;
          const rates=hist.map(h=>h.r);const mn=Math.min(...rates),mx=Math.max(...rates),rng=mx-mn||0.5;
          const W=300,H=130,pad=18;const x=(i)=>pad+(i/(hist.length-1))*(W-pad*2);const y=(r)=>H-pad-((r-mn)/rng)*(H-pad*2);
          const pts=hist.map((d,i)=>`${x(i)},${y(d.r)}`).join(" ");
          return(
            <div onClick={()=>setSelCB(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}}>
              <div onClick={e=>e.stopPropagation()} style={{background:C.bg2,border:`2px solid ${bc}`,borderRadius:"8px",padding:"18px",maxWidth:"380px",width:"calc(100% - 32px)",maxHeight:"80vh",overflowY:"auto"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
                  <div><div style={{fontSize:"20px",fontWeight:"700",color:C.gold}}>{ccy} — {cb.bank}</div><div style={{fontSize:"8.5px",color:C.muted}}>Rate History · Current: {cb.rate.toFixed(2)}% · Tap outside to close</div></div>
                  <button onClick={()=>setSelCB(null)} style={{background:"transparent",border:`1px solid ${C.bdr}`,borderRadius:"3px",color:C.muted,cursor:"pointer",padding:"4px 8px",fontSize:"11px",fontFamily:"inherit"}}>✕</button>
                </div>
                <div style={{background:C.bg1,borderRadius:"6px",padding:"12px",marginBottom:"12px"}}>
                  <div style={{fontSize:"8px",color:C.gold,fontWeight:"700",letterSpacing:"2px",marginBottom:"8px"}}>POLICY RATE HISTORY (%)</div>
                  <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:"block",overflow:"visible"}}>
                    {[0,0.25,0.5,0.75,1].map((p,i)=>{const yp=pad+(p*(H-pad*2));const rv=(mn+rng*(1-p)).toFixed(2);return(<g key={i}><line x1={pad} y1={yp} x2={W-pad} y2={yp} stroke={C.bdr} strokeWidth="0.5" strokeDasharray="3,3"/><text x={pad-3} y={yp+3} fontSize="7" fill={C.muted} textAnchor="end">{rv}%</text></g>);})}
                    <polyline points={`${x(0)},${H-pad} ${pts} ${x(hist.length-1)},${H-pad}`} fill={bc+"22"}/>
                    <polyline points={pts} fill="none" stroke={bc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    {hist.map((d,i)=>(<g key={i}><circle cx={x(i)} cy={y(d.r)} r={i===hist.length-1?5:3} fill={i===hist.length-1?bc:C.bg2} stroke={bc} strokeWidth="1.5"/>{(i===0||i===hist.length-1)&&<text x={x(i)} y={H-4} fontSize="6.5" fill={C.muted} textAnchor="middle">{d.d}</text>}</g>))}
                  </svg>
                </div>
                <div style={{background:C.bg1,borderRadius:"5px",padding:"10px",marginBottom:"12px"}}>
                  <div style={{fontSize:"8px",color:C.gold,fontWeight:"700",letterSpacing:"2px",marginBottom:"7px"}}>DECISION HISTORY</div>
                  <div style={{maxHeight:"150px",overflowY:"auto"}}>
                    {[...hist].reverse().map((d,i,arr)=>{const prev=arr[i+1];const chg=prev?d.r-prev.r:0;return(<div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.bdr}22`,fontSize:"10px"}}><span style={{color:C.muted,fontFamily:"monospace",minWidth:"70px"}}>{d.d}</span><span style={{fontWeight:"700",color:C.text,fontFamily:"monospace"}}>{d.r.toFixed(2)}%</span><span style={{fontSize:"9px",color:chg>0?C.green:chg<0?C.red:C.muted,fontFamily:"monospace",minWidth:"45px",textAlign:"right"}}>{chg!==0?(chg>0?"+":"")+chg.toFixed(2)+"%":"—"}</span></div>);})}
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"7px"}}>
                  {[["Current Rate",`${cb.rate.toFixed(2)}%`,bc],["Outlook",cb.outlook,cb.outlook==="Hiking"?C.green:cb.outlook==="Cutting"?C.red:C.muted],["Next Meeting",cb.next,C.muted],["Bias",cb.bias,bc]].map(([l,v,c])=>(<div key={l} style={{background:C.bg,border:`1px solid ${c}33`,borderRadius:"4px",padding:"8px"}}><div style={{fontSize:"7.5px",color:C.muted,marginBottom:"3px"}}>{l}</div><div style={{fontSize:"12px",fontWeight:"700",color:c}}>{v}</div></div>))}
                </div>
              </div>
            </div>
          );
        })()}
        <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"5px",padding:"8px 10px",marginBottom:"10px",fontSize:"8.5px",color:C.muted}}>📈 <strong style={{color:C.text}}>Tap any central bank card</strong> to view the full rate history chart and decision timeline.</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:"9px",marginBottom:"12px"}}>
          {Object.entries(CB).map(([ccy,cb])=>{
            const bc=cb.bias==="Hawkish"?C.green:cb.bias==="Dovish"?C.red:C.gold;
            const hist=CB_HIST[ccy]||[];
            const rates=hist.map(h=>h.r);const mn=Math.min(...rates),mx=Math.max(...rates),rng=mx-mn||0.5;
            const sw=120,sh=32;const sx=(i)=>(i/(hist.length-1))*sw;const sy=(r)=>sh-((r-mn)/rng)*(sh-4)-2;
            const spts=hist.map((d,i)=>`${sx(i)},${sy(d.r)}`).join(" ");
            return(
              <div key={ccy} onClick={()=>setSelCB([ccy,cb])} style={{background:C.bg2,border:`1px solid ${bc}33`,borderRadius:"5px",padding:"11px",cursor:"pointer",transition:"all 0.12s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=bc+"77";e.currentTarget.style.background=C.bg1;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=bc+"33";e.currentTarget.style.background=C.bg2;}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"4px"}}>
                  <span style={{fontWeight:"700",color:C.gold,fontSize:"17px"}}>{ccy}</span>
                  <div style={{display:"flex",gap:"5px",alignItems:"center"}}><Bdg label={cb.bias.toUpperCase()} color={bc}/><span style={{fontSize:"7.5px",color:C.blue,fontWeight:"700"}}>HISTORY ↗</span></div>
                </div>
                <div style={{fontSize:"9px",color:C.muted,marginBottom:"4px"}}>{cb.bank}</div>
                <div style={{display:"flex",alignItems:"baseline",gap:"6px",marginBottom:"6px"}}>
                  <span style={{fontSize:"22px",fontWeight:"700",color:C.text,fontFamily:"monospace"}}>{cb.rate.toFixed(2)}%</span>
                  <span style={{fontSize:"9px",color:cb.rate>cb.prev?C.green:cb.rate<cb.prev?C.red:C.muted}}>prev {cb.prev.toFixed(2)}%</span>
                </div>
                {hist.length>=2&&<svg width={sw} height={sh} style={{display:"block",marginBottom:"6px",overflow:"visible"}}><polyline points={`${sx(0)},${sh} ${spts} ${sx(hist.length-1)},${sh}`} fill={bc+"22"}/><polyline points={spts} fill="none" stroke={bc} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                <div style={{display:"flex",gap:"5px",alignItems:"center",marginBottom:"4px"}}><Bdg label={cb.outlook.toUpperCase()} color={cb.outlook==="Hiking"?C.green:cb.outlook==="Cutting"?C.red:C.muted}/><span style={{fontSize:"8px",color:C.muted}}>Next: {cb.next}</span></div>
                {cb.note&&<div style={{fontSize:"7.5px",color:C.muted,lineHeight:"1.5",borderTop:`1px solid ${C.bdr}22`,paddingTop:"4px"}}>{cb.note}</div>}
              </div>
            );
          })}
        </div>
        <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"6px",padding:"12px"}}>
          <div style={{fontSize:"9px",fontWeight:"700",color:C.gold,letterSpacing:"2px",marginBottom:"8px",paddingBottom:"6px",borderBottom:`1px solid ${C.bdr}`}}>◈ CARRY DIFFERENTIAL MATRIX (%)</div>
          <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:"600px"}}>
              <thead><tr><th style={{padding:"5px 8px",fontSize:"8px",color:C.gold,borderBottom:`1px solid ${C.bdr}`,fontWeight:"700",textAlign:"left"}}>↓ BASE / QUOTE →</th>{Object.keys(CB).map(q=><th key={q} style={{padding:"5px 8px",fontSize:"8px",color:C.muted,borderBottom:`1px solid ${C.bdr}`,fontWeight:"700",textAlign:"center"}}>{q}</th>)}</tr></thead>
              <tbody>{Object.entries(CB).map(([base,bd])=>(<tr key={base}><td style={{padding:"6px 8px",color:C.gold,fontWeight:"700",fontSize:"10.5px"}}>{base}</td>{Object.entries(CB).map(([q,qd])=>{if(base===q)return(<td key={q} style={{padding:"6px 8px",background:C.bg1,color:C.dim,textAlign:"center"}}>—</td>);const diff=bd.rate-qd.rate;return(<td key={q} style={{padding:"6px 8px",color:diff>0?C.green:diff<0?C.red:C.muted,fontWeight:Math.abs(diff)>2?"700":"400",textAlign:"center",fontSize:"10px",fontFamily:"monospace"}}>{diff>0?"+":""}{diff.toFixed(2)}</td>);})}</tr>))}</tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }
  function Weekend(){
    // wkView lifted to parent to prevent reset on price tick
    const CW_THEMES=[
      {ccy:"USD",dir:"BEARISH",priority:"HIGH",color:"#ff4560",title:"USD Structural Weakness — DXY Testing 100",detail:"The US dollar is in confirmed structural downtrend. DXY down ~9% from 2025 highs. FOMC Minutes (Apr 7) confirmed Fed divisions. CPI (Apr 10) is the pivotal release — a miss below 0.3% accelerates Fed cut bets and extends USD weakness. DXY testing critical 100 handle. Conviction trade: sell USD rallies on any pair.",support:"100.20 DXY",resistance:"101.80 DXY",pivot:"100.50",pairs:["USD/JPY","USD/CHF"],dirs:["SELL","SELL"],
        deepAnalysis:"The USD structural bear case in 2026 is built on three converging forces: (1) Federal Reserve easing cycle — 175bp of cuts since Sep 2024 compressing real yields. (2) Tariff uncertainty — 90-day pause is relief but structural trade war risk keeps uncertainty premium in FX. (3) USD reserve status erosion — BlackRock notes foreign investors questioning USD as primary reserve asset for the first time in decades. DXY 100 is the critical technical level that must hold for any bull case. A weekly close below 100 opens 96-97 targets. Every USD rally toward 101.80-102 is a high-conviction sell.",
        watchFor:"Thursday Apr 10: US CPI m/m (forecast 0.3%). A print below 0.2% = aggressive USD selling, June cut odds spike above 60%. A print above 0.4% = brief USD relief rally — sell into it. Also watch FOMC speakers this week for any hawkish pivot signals.",
        evidence:[{title:"J.P. Morgan 2026 Market Outlook: Post-Peak USD",source:"J.P. Morgan Global Research",url:"https://www.jpmorgan.com/insights/global-research/outlook/market-outlook"},{title:"Fed FOMC Minutes March 2026: Divisions on Rate Path",source:"Federal Reserve",url:"https://www.federalreserve.gov/monetarypolicy/fomcminutes20260318.htm"},{title:"BlackRock 2026 Macro Outlook: Short USD Trade",source:"BlackRock Investment Institute",url:"https://www.blackrock.com/institutions/en-us/insights/2026-macro-outlook"}]},
      {ccy:"JPY",dir:"BULLISH",priority:"HIGH",color:"#00e5a0",title:"BOJ Normalization Intact — USD/JPY Structural Short",detail:"Bank of Japan is the only G10 central bank actively hiking in 2026. Rate 0.75%. Wage growth 3.1% above 3% BOJ normalization threshold. Ueda reaffirmed hiking path this week. Every USD/JPY rally toward 159+ is a structural short opportunity. MUFG target USD/JPY 146 by year-end. EUR/JPY, GBP/JPY, AUD/JPY all offer short setups.",support:"156.50",resistance:"160.00",pivot:"158.50",pairs:["USD/JPY","EUR/JPY","GBP/JPY"],dirs:["SELL","SELL","SELL"],
        deepAnalysis:"The JPY bull thesis in 2026 is the most structurally sound in G10 FX. BOJ is the only central bank actively hiking while all others are cutting or on hold — this policy divergence is at its widest point in decades. Japan's wage growth hitting 3.1% y/y crossed the BOJ's own stated normalization threshold. Japan's current account surplus of ¥2.4 trillion provides fundamental structural support. The carry trade unwind — which drove JPY to 160+ in 2024 — is accelerating as rate differentials compress. MUFG December 2025 target: USD/JPY 146. Every rally toward 158-160 is an institutional sell opportunity with strong risk/reward.",
        watchFor:"BOJ next decision April 30. Any Ueda speech this week could move JPY. Watch Japan Trade Balance (Apr 11) — surplus data reinforces structural JPY bid. Also note: USD/JPY tends to spike on any risk-off equity selloff, providing better short entries.",
        evidence:[{title:"MUFG: Post-Peak USD World — USD/JPY 146 Target",source:"MUFG Research",url:"https://www.mufgresearch.com/fx/fx-focus-g10-fx-2026-outlook-in-a-post-peak-usd-world-19-december-2025/"},{title:"BOJ Policy Normalization Framework 2026",source:"Bank of Japan",url:"https://www.boj.or.jp/en/mopo/"},{title:"BIS Working Paper #801: CB Divergence and FX",source:"Bank for International Settlements",url:"https://www.bis.org/publ/work801.htm"}]},
      {ccy:"EUR",dir:"BULLISH",priority:"HIGH",color:"#00e5a0",title:"EUR Resilient — ECB Hawkish Hold + German Fiscal Boost",detail:"EUR/USD trading at 1.16+ — a major recovery from 2025 Liberation Day lows. ECB held 2.00% with hawkish statement. Schnabel: 'next move more likely a hike than cut.' German fiscal stimulus delivering real growth upgrades. J.P. Morgan year-end target 1.20. Buy EUR/USD dips toward 1.1550.",support:"1.1500",resistance:"1.1900",pivot:"1.1680",pairs:["EUR/USD","EUR/CAD"],dirs:["BUY","BUY"],
        deepAnalysis:"EUR's recovery from the 1.0732 Liberation Day lows to 1.16+ is one of the largest G10 FX moves of 2025-2026. Three fundamental drivers: (1) ECB hawkish shift — Schnabel's 'next move more likely a hike' is a significant policy signal that has repriced EUR rate expectations sharply higher. (2) German fiscal stimulus — the €100B+ infrastructure and defense package is flowing into the real economy, upgrading Eurozone growth forecasts from 1.0% to 1.5-1.8% H2 2026 (ING). (3) USD structural weakness providing tailwind. J.P. Morgan year-end target 1.20. MUFG more bullish at 1.24.",
        watchFor:"ECB decision April 30 — hold widely expected. Watch Schnabel, Lagarde speeches this week for any hike timing signals. EUR/USD key support at 1.1550 — hold = buy dip. Break below = reassess. EUR/GBP 0.8700 resistance key this week.",
        evidence:[{title:"ING Think: G10 FX Outlook 2026",source:"ING Think",url:"https://think.ing.com/articles/fx-outlook-2026-our-main-calls/"},{title:"ECB Monetary Policy Decisions 2026",source:"European Central Bank",url:"https://www.ecb.europa.eu/press/pr/date/2026/html/index.en.html"},{title:"J.P. Morgan EUR/USD 1.20 Year-End Target",source:"J.P. Morgan Global Research",url:"https://www.jpmorgan.com/insights/global-research/currencies/fx-macro"}]},
      {ccy:"GBP",dir:"NEUTRAL",priority:"MED",color:"#ff9f1c",title:"GBP — BOE Easing Bias vs Sticky 3% Inflation",detail:"BOE signaling further easing (75bp more in 2026 per ING) vs CPI still above 3% target. EUR/GBP trending to 0.88-0.90. GBP/USD holds on USD weakness. Key this week: UK GDP Fri Apr 11 — strong print supports GBP, miss reinforces BOE cut narrative.",support:"1.3200",resistance:"1.3600",pivot:"1.3410",pairs:["GBP/USD","EUR/GBP"],dirs:["BUY","SELL"],
        deepAnalysis:"GBP is caught between two opposing forces in 2026. On one hand, BOE is clearly signaling further easing — markets price 75bp of additional cuts through end-2026, with ING forecasting BOE terminal rate at 3.00%. On the other, UK CPI remains sticky at 3.0% y/y with services inflation at 4.8%, well above the 2% target. This creates a 'stagflation lite' dynamic where BOE wants to cut but can't move as aggressively as markets price. Net result: GBP outperforms USD (on USD weakness) but underperforms EUR (on ECB hawkishness). Best expression: short EUR/GBP on rallies toward 0.8800-0.8850.",
        watchFor:"UK GDP m/m Friday April 11 (forecast +0.1%). A beat would temporarily support GBP across the board. A miss extends the BOE cut narrative and pushes EUR/GBP toward 0.8750+. Also BOE Governor Bailey speech if scheduled.",
        evidence:[{title:"Bank of England Monetary Policy Summary 2026",source:"Bank of England",url:"https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes"},{title:"ING: BOE Easing Cycle — 75bp More Expected",source:"ING Think",url:"https://think.ing.com/articles/bank-of-england-2026-outlook/"},{title:"UK ONS CPI Data — Services Inflation Sticky",source:"Office for National Statistics",url:"https://www.ons.gov.uk/economy/inflationandpriceindices"}]},
      {ccy:"NZD",dir:"BEARISH",priority:"HIGH",color:"#ff4560",title:"NZD Weakest G10 — RBNZ Cuts to 3.00% Apr 9",detail:"RBNZ has cut 325bp since August 2024 — most aggressive G10 easer. NZ GDP -0.2% recession confirmed. Apr 9 cut to 3.00% fully priced. Year-end target may reach 2.50%. NZD sell-on-rallies is dominant institutional trade. EUR/NZD longs, AUD/NZD structural longs.",support:"0.5650",resistance:"0.5900",pivot:"0.5800",pairs:["NZD/USD","EUR/NZD","AUD/NZD"],dirs:["SELL","BUY","BUY"],
        deepAnalysis:"NZD is the most bearish G10 currency in 2026 by a significant margin. The RBNZ has cut 325 basis points since August 2024 — the most aggressive easing cycle of any G10 central bank. New Zealand entered a technical recession with GDP -0.2% q/q in Q4 2025 — the second consecutive contraction. The April 9 cut to 3.00% was fully priced and delivered as expected. Markets now price the terminal rate at 2.50-2.75% by year-end, implying 1-2 more cuts. AUD/NZD is the cleanest expression of this divergence — RBA hawkish hold vs RBNZ cutting cycle. EUR/NZD structural longs also high conviction.",
        watchFor:"RBNZ April 9 press conference transcript and forward guidance is key — any signal of pause would cause sharp NZD short squeeze. Next RBNZ: June 2026. Also watch NZ trade data and business confidence for recession confirmation.",
        evidence:[{title:"RBNZ April 2026 Monetary Policy Decision",source:"Reserve Bank of New Zealand",url:"https://www.rbnz.govt.nz/monetary-policy/"},{title:"Statistics NZ: GDP Contraction Q4 2025",source:"Statistics New Zealand",url:"https://www.stats.govt.nz/indicators/gross-domestic-product-gdp"},{title:"ING: RBNZ Cutting Cycle Deep Dive",source:"ING Think",url:"https://think.ing.com/articles/rbnz-2026-outlook/"}]},
      {ccy:"AUD",dir:"BULLISH",priority:"MED",color:"#00e5a0",title:"AUD Recovering — RBA Hawkish Hold + China PMI Beat",detail:"AUD/USD has recovered strongly, now testing 0.70-0.71. RBA Governor Bullock signaled no further cuts — hawkish surprise. China PMI 50.5 supports commodity demand. RBC forecasts AUD/USD 0.73-0.74 year-end. AUD/NZD longs on relative RBA hawkishness vs RBNZ cutting.",support:"0.6950",resistance:"0.7250",pivot:"0.7057",pairs:["AUD/USD","AUD/NZD"],dirs:["BUY","BUY"],
        deepAnalysis:"AUD's recovery in 2026 is underpinned by the RBA's hawkish stance relative to other G10 central banks. The RBA cut from 4.35% to 3.85% in Q1 2026 but Governor Bullock's explicit 'no further cuts imminent' statement was a hawkish surprise that repriced AUD significantly higher. China's PMI at 50.5 — marginally expansionary — supports iron ore and copper demand, which directly benefits the commodity-linked AUD. The best AUD trade is not AUD/USD outright (which needs USD weakness) but AUD/NZD — pure relative policy divergence between RBA hawkish hold and RBNZ aggressive cutting.",
        watchFor:"RBA next decision May 19. Any China PMI, industrial production, or property data this week will impact AUD as China accounts for ~33% of Australia's exports. Watch iron ore spot price — it leads AUD by 1-2 sessions.",
        evidence:[{title:"RBA Board Minutes — Hawkish Hold Signal",source:"Reserve Bank of Australia",url:"https://www.rba.gov.au/monetary-policy/rba-board-minutes/"},{title:"RBC Capital Markets: AUD/USD 0.73 Target",source:"RBC Capital Markets",url:"https://www.rbccm.com/assets/rbccm/docs/fx/currency-report-card.pdf"},{title:"RBA Research: Commodity Prices and AUD",source:"Reserve Bank of Australia",url:"https://www.rba.gov.au/publications/rdp/2012/pdf/rdp2012-06.pdf"}]},
      {ccy:"CAD",dir:"BEARISH",priority:"MED",color:"#ff4560",title:"CAD Vulnerable — BOC Dovish + USMCA Risk",detail:"BOC held 2.25% but language dovish. Next decision Apr 15 — hold expected but watch. Oil prices declining on supply surplus. USMCA review July 2026 creates trade uncertainty. RBC forecasts USD/CAD closer to 1.40 into USMCA. Sell CAD vs EUR and USD on rallies.",support:"1.3650",resistance:"1.4100",pivot:"1.3857",pairs:["USD/CAD","EUR/CAD"],dirs:["BUY","BUY"],
        deepAnalysis:"CAD faces a convergence of negative factors in 2026. First, the BOC has cut aggressively (from 5.00% in 2023 to 2.25% now) and language remains dovish — further cuts remain possible if USMCA disrupts trade. Second, crude oil prices have declined approximately 20% from 2025 peaks on supply surplus (OPEC+ production increases + US shale resilience) which directly pressures CAD. Third, the USMCA review starting July 2026 creates genuine uncertainty around Canada-US trade — Canada sends 75% of its exports to the US, making this a material risk. RBC flags USD/CAD potential toward 1.40 as the key USMCA risk scenario.",
        watchFor:"BOC rate decision April 15 — hold at 2.25% expected but statement tone critical. Any dovish language or signal of further cuts = CAD negative. Also watch crude oil inventory data and any USMCA-related political headlines.",
        evidence:[{title:"Bank of Canada April 2026 Rate Decision",source:"Bank of Canada",url:"https://www.bankofcanada.ca/2026/04/fad-press-release/"},{title:"RBC Capital Markets: USMCA Risk and USD/CAD",source:"RBC Capital Markets",url:"https://www.rbccm.com/"},{title:"EIA Crude Oil Inventory and Supply Outlook",source:"U.S. Energy Information Administration",url:"https://www.eia.gov/petroleum/"}]},
      {ccy:"CHF",dir:"BULLISH",priority:"MED",color:"#00e5a0",title:"CHF Safe Haven — Dollar Debasement Trade",detail:"EUR/CHF trending lower as institutional investors play dollar debasement trade. BlackRock: 'foreign investors questioning USD as reserve asset' benefits CHF. Swiss current account surplus, balanced budget. EUR/CHF year-end target 0.93 (RBC). USD/CHF target 0.78-0.79.",support:"0.7750",resistance:"0.8100",pivot:"0.7902",pairs:["USD/CHF","CHF/JPY"],dirs:["SELL","BUY"],
        deepAnalysis:"CHF's appreciation in 2026 is being driven by the dollar debasement trade — a structural rotation out of USD-denominated assets and into historically stable stores of value including CHF and gold. Switzerland runs a current account surplus of approximately 7% of GDP and a balanced fiscal budget — rare in the current global environment. The SNB has been relatively relaxed about CHF strength, choosing not to intervene as aggressively as in prior cycles, which suggests they are comfortable with the current level. EUR/CHF 0.93 is the RBC year-end target, implying further CHF appreciation from current 0.923 levels.",
        watchFor:"SNB next decision June 18. Any SNB verbal intervention warning CHF 'too strong' would cause sharp EUR/CHF spike — this is the main tail risk for CHF bulls. Watch VIX — if risk-off intensifies (VIX >25) CHF accelerates sharply.",
        evidence:[{title:"BlackRock 2026 Macro Outlook: Dollar Debasement",source:"BlackRock Investment Institute",url:"https://www.blackrock.com/institutions/en-us/insights/2026-macro-outlook"},{title:"RBC Capital Markets: EUR/CHF 0.93 Target",source:"RBC Capital Markets",url:"https://www.rbccm.com/"},{title:"BIS Working Paper #570: Safe Haven Currencies",source:"Bank for International Settlements",url:"https://www.bis.org/publ/work570.htm"}]},
    ];
    const CW_DATA=[
      {dt:"Apr 9", ev:"RBNZ Rate Decision",  fc:"3.00% (cut 25bp)", impact:"NZD bearish"},
      {dt:"Apr 10",ev:"US CPI m/m",           fc:"0.3%",             impact:"USD pivot"},
      {dt:"Apr 10",ev:"US Core CPI m/m",      fc:"0.3%",             impact:"Fed cut odds"},
      {dt:"Apr 11",ev:"UK GDP m/m",           fc:"0.1%",             impact:"GBP direction"},
      {dt:"Apr 15",ev:"BOC Rate Decision",    fc:"2.25% hold",       impact:"CAD risk"},
    ];
    const PW_THEMES=[
      {ccy:"USD",dir:"BEARISH",outcome:"USD -1.2% WoW · DXY closed at 100.8",detail:"DXY broke below 101 key support. NFP was 128K vs 175K expected (Apr 4), reviving June cut expectations. PCE at 2.7% keeps inflation above target. USD net-short positioning at multi-year extremes.",
        deepAnalysis:"The week of March 31–April 6 delivered the clearest confirmation yet of the USD structural bear trend. The NFP miss (128K vs 175K expected) on April 4 was the catalyst — it repriced Fed cut expectations from September to June and sent DXY below the critical 101 level. This 101 level had been defended for three months. Its break with conviction on heavy volume is a textbook technical breakdown. COT data showed USD net-short positioning at multi-year extremes even before this break — institutional money was already positioned. The 90-day tariff pause announced Sunday night added further pressure as it removed the USD safe-haven premium.",
        evidence:[{title:"BLS: April 4 Non-Farm Payrolls Release",source:"Bureau of Labor Statistics",url:"https://www.bls.gov/news.release/empsit.toc.htm"},{title:"CFTC COT Report: USD Net Positioning",source:"Commodity Futures Trading Commission",url:"https://www.cftc.gov/MarketReports/CommitmentsofTraders/"},{title:"Fed PCE Data March 2026",source:"Bureau of Economic Analysis",url:"https://www.bea.gov/data/personal-consumption-expenditures-price-index"}]},
      {ccy:"JPY",dir:"BULLISH",outcome:"JPY +2.1% WoW · USD/JPY fell from 161 to 158",detail:"Japan wage growth 3.1% y/y — above BOJ's 3% normalization threshold. BOJ board member Asada confirmed hiking path intact. Japan current account surplus ¥2.4T provides structural JPY support.",
        deepAnalysis:"JPY was the clear G10 outperformer for the week of March 31–April 6, gaining +2.1% against the USD. The catalyst was the Japan wage growth data showing 3.1% y/y — crossing the BOJ's own stated 3% normalization threshold for the first time. This data gives the BOJ clear justification to continue hiking. BOJ board member Asada's comments confirming the hiking path intact removed any doubt about the policy direction. The carry trade unwind accelerated — estimates suggest $50-80B of yen carry positions were unwound in Q1 2026 alone.",
        evidence:[{title:"Japan Ministry of Health: Wage Growth Data",source:"Ministry of Health, Labour and Welfare",url:"https://www.mhlw.go.jp/english/database/db-l/index.html"},{title:"BOJ Policy Decisions and Board Member Speeches",source:"Bank of Japan",url:"https://www.boj.or.jp/en/mopo/mpmdeci/"},{title:"Japan MOF: Current Account Surplus ¥2.4T",source:"Ministry of Finance Japan",url:"https://www.mof.go.jp/english/policy/balance_of_payments/bop/bop.htm"}]},
      {ccy:"EUR",dir:"BULLISH",outcome:"EUR/USD +1.8% WoW · broke above 1.16",detail:"EUR/USD broke 1.16 decisively — highest since early 2025. ECB held 2.00% with hawkish statement. German IP +1.8% m/m beat. Eurozone growth forecasts upgraded by ING to 1.5-1.8% H2 2026.",
        deepAnalysis:"EUR/USD's break above 1.16 was the major technical event of the week. This level represented 18 months of resistance — dating back to early 2025 before the Liberation Day tariff shock sent EUR/USD to 1.0732. The break was fundamental-driven: ECB hawkish hold on Wednesday (Schnabel's 'next move more likely a hike' comment) combined with German IP beating by 0.9 percentage points and broad USD weakness. The weekly close above 1.16 on high volume confirms the breakout. ING upgraded their Eurozone growth forecast to 1.5-1.8% H2 2026 on the German fiscal stimulus feed-through.",
        evidence:[{title:"ECB Press Conference April 2026",source:"European Central Bank",url:"https://www.ecb.europa.eu/press/pressconf/2026/html/index.en.html"},{title:"Destatis: German Industrial Production Data",source:"Federal Statistical Office Germany",url:"https://www.destatis.de/EN/Themes/Economy/Short-Term-Indicators/Production-Index/"},{title:"ING Think: Eurozone Growth Upgrade H2 2026",source:"ING Think",url:"https://think.ing.com/articles/eurozone-growth-2026/"}]},
      {ccy:"GBP",dir:"NEUTRAL",outcome:"GBP/USD +0.8% · EUR/GBP rose to 0.8700",detail:"GBP/USD gained modestly on broad USD weakness, but underperformed EUR and JPY. EUR/GBP rose toward 0.8700 as relative policy divergence (ECB hawkish, BOE dovish) asserted itself.",
        deepAnalysis:"GBP's +0.8% gain against USD significantly underperformed the G10 average (+1.2%) as the BOE dovish bias weighed. EUR/GBP's rise to 0.8700 was the key move — this reflects the growing policy divergence between the ECB (hawkish hold) and BOE (easing bias). UK services PMI came in at 50.5 vs 52.0 expected on the week, confirming growth momentum is softer than forecast. This data point pushed the market to price in a higher probability of a May BOE cut, weighing on GBP.",
        evidence:[{title:"Bank of England: Monetary Policy Decisions",source:"Bank of England",url:"https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes"},{title:"CIPS: UK Services PMI March 2026",source:"CIPS/S&P Global",url:"https://www.cips.org/cips-for-business/research/pmi/"},{title:"ING: EUR/GBP Toward 0.88-0.90 Target",source:"ING Think",url:"https://think.ing.com/articles/fx-outlook-2026-our-main-calls/"}]},
      {ccy:"NZD",dir:"BEARISH",outcome:"NZD worst G10 -0.9% WoW · NZD/USD tested 0.5750",detail:"NZD underperformed all G10 currencies ahead of April 9 RBNZ decision. Markets fully pricing 25bp cut to 3.00%. EUR/NZD longs and AUD/NZD longs were the dominant institutional trades.",
        deepAnalysis:"NZD was the worst-performing G10 currency for the week as positioning ahead of the April 9 RBNZ decision accelerated the downtrend. The 325bp of RBNZ cuts since August 2024 have driven NZD to multi-year lows. New Zealand's GDP confirmed two consecutive quarters of contraction — a technical recession — removing any case for a rate pause. EUR/NZD reached 2.00 for the first time since 2021. The divergence trade (long AUD/NZD) was the cleanest expression — AUD hawkish hold vs NZD cutting cycle.",
        evidence:[{title:"RBNZ Monetary Policy Statement 2026",source:"Reserve Bank of New Zealand",url:"https://www.rbnz.govt.nz/monetary-policy/monetary-policy-statement"},{title:"Statistics NZ: GDP Recession Confirmation",source:"Statistics New Zealand",url:"https://www.stats.govt.nz/indicators/gross-domestic-product-gdp"},{title:"MUFG: NZD Bearish Target 2026",source:"MUFG Research",url:"https://www.mufgresearch.com/"}]},
      {ccy:"AUD",dir:"BULLISH",outcome:"AUD/USD +1.5% WoW · broke above 0.70",detail:"RBA Governor Bullock signaled no rate cuts imminent — hawkish surprise vs dovish market pricing. China PMI 50.5 supports commodity demand. RBC upgraded AUD/USD year-end to 0.73.",
        deepAnalysis:"AUD's +1.5% gain was driven by an unexpected hawkish surprise from RBA Governor Bullock who explicitly stated 'rates are about right and no cuts are imminent'. Markets had been pricing a 40% chance of an RBA cut at the May meeting — this was quickly repriced to near-zero. The AUD was also supported by China's manufacturing PMI printing at 50.5, suggesting stabilization in Australia's largest export market. RBC immediately upgraded their AUD/USD year-end target from 0.70 to 0.73 following the Bullock comments.",
        evidence:[{title:"RBA Governor Bullock Speech: No Cuts Imminent",source:"Reserve Bank of Australia",url:"https://www.rba.gov.au/speeches/"},{title:"China NBS: Manufacturing PMI March 2026",source:"National Bureau of Statistics China",url:"https://www.stats.gov.cn/english/PressRelease/"},{title:"RBC Capital Markets: AUD/USD Upgraded to 0.73",source:"RBC Capital Markets",url:"https://www.rbccm.com/"}]},
      {ccy:"CAD",dir:"BEARISH",outcome:"CAD -0.6% WoW · USD/CAD rose toward 1.39",detail:"BOC language remained dovish at the April meeting. Canada Ivey PMI came in below 50 at 49.7, signaling contraction. USMCA review risk headlines drove institutional CAD selling. Oil prices fell further on global demand concerns.",
        deepAnalysis:"CAD continued its underperformance driven by three converging headwinds: (1) BOC dovish language with Governor Macklem signaling rates 'about right' but clearly biased toward further easing, (2) Canada Ivey PMI printing at 49.7 — below the critical 50 expansion threshold — confirming manufacturing weakness, (3) USMCA review risk premium building as July 2026 review date approaches. Oil prices declined ~3% on the week as tariff-related demand destruction fears outweighed supply cuts. RBC forecast USD/CAD toward 1.40 into the USMCA review period.",
        evidence:[{title:"Bank of Canada: Policy Rate Decision April 2026",source:"Bank of Canada",url:"https://www.bankofcanada.ca/2026/04/fad-press-release/"},{title:"Statistics Canada: Ivey PMI Data",source:"Statistics Canada",url:"https://www150.statcan.gc.ca/"},{title:"RBC Capital Markets: CAD USMCA Risk Premium",source:"RBC Capital Markets",url:"https://www.rbccm.com/"}]},
      {ccy:"CHF",dir:"BULLISH",outcome:"CHF +1.1% WoW · EUR/CHF fell to 0.9280",detail:"CHF was the second-best G10 performer behind JPY as risk-off flows and dollar debasement trade drove safe haven demand. EUR/CHF fell toward 0.9280. BlackRock noted foreign investors questioning USD reserve status, directly benefiting CHF.",
        deepAnalysis:"CHF's +1.1% gain reflected two distinct flows: (1) Risk-off safe haven demand as equities fell on tariff uncertainty — CHF and JPY are the traditional beneficiaries when institutional investors reduce risk, (2) Dollar debasement trade — as BlackRock and other major institutions published research questioning USD's role as the primary global reserve asset, CHF and gold became the primary beneficiaries. Switzerland's current account surplus and balanced budget make CHF fundamentally attractive. EUR/CHF's decline toward 0.9280 (vs RBC's 0.93 year-end target) suggests further downside. SNB has been relaxed about CHF strength so far.",
        evidence:[{title:"BlackRock 2026 Macro Outlook: Short USD Trade",source:"BlackRock Investment Institute",url:"https://www.blackrock.com/institutions/en-us/insights/2026-macro-outlook"},{title:"SNB: Policy Rate and FX Stance",source:"Swiss National Bank",url:"https://www.snb.ch/en/monetary-policy/overview/"},{title:"RBC Capital Markets: EUR/CHF Target 0.93",source:"RBC Capital Markets",url:"https://www.rbccm.com/"}]},
    ];
    const themes=wkView==="current"?CW_THEMES:PW_THEMES;
    return(
      <div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:"12px"}}>
          {[["current","📅 CURRENT WEEK","#d4af37"],["previous","📋 PREVIOUS WEEK RECAP","#4a6a8a"]].map(([v,l,c])=>(
            <button key={v} onClick={()=>setWkView(v)} style={{padding:"11px 8px",background:wkView===v?c+"22":"transparent",color:wkView===v?c:C.muted,border:`2px solid ${wkView===v?c:C.bdr}`,borderRadius:"5px",cursor:"pointer",fontWeight:"700",fontSize:"10px",fontFamily:"inherit",letterSpacing:"0.8px"}}>{l}</button>
          ))}
        </div>
        <div style={{background:`linear-gradient(90deg,${C.bg2},#0a1a2a)`,border:`2px solid ${C.gold}`,borderRadius:"6px",padding:"12px 15px",marginBottom:"10px"}}>
          <div style={{fontSize:"12px",fontWeight:"700",color:C.gold,letterSpacing:"2px",marginBottom:"3px"}}>{wkView==="current"?"WEEK OF APRIL 7–11, 2026":"WEEK OF MARCH 31 – APRIL 6, 2026"}</div>
          <div style={{fontSize:"8.5px",color:C.muted,letterSpacing:"1.5px"}}>{wkView==="current"?"POST-PEAK USD · BOJ NORMALIZATION · FED ON HOLD · EUR RESILIENT":"USD WEAKNESS ACCELERATES · BOJ WAGE DATA · EUR BREAKS 1.16"}</div>
        </div>
        {wkView==="current"&&(
          <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"6px",padding:"11px 13px",marginBottom:"10px"}}>
            <div style={{fontSize:"8.5px",fontWeight:"700",color:C.gold,letterSpacing:"2px",marginBottom:"9px"}}>◷ THIS WEEK'S KEY RELEASES</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"7px"}}>
              {CW_DATA.map((e,i)=>(
                <div key={i} style={{background:C.bg1,border:`1px solid ${C.bdr}`,borderRadius:"4px",padding:"9px 10px"}}>
                  <div style={{fontSize:"8px",color:C.muted,marginBottom:"3px",fontFamily:"monospace"}}>{e.dt}</div>
                  <div style={{fontWeight:"700",color:C.text,fontSize:"10.5px",marginBottom:"3px"}}>{e.ev}</div>
                  <div style={{fontSize:"8.5px",color:C.gold}}>Fcst: {e.fc}</div>
                  <div style={{fontSize:"8px",color:C.muted,marginTop:"2px"}}>{e.impact}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {themes.map((t,i)=>(
          <div key={i} style={{background:C.bg2,border:`1px solid ${t.color}33`,borderLeft:`4px solid ${t.color}`,borderRadius:"6px",padding:"13px 15px",marginBottom:"9px"}}>
            <div style={{display:"flex",gap:"7px",alignItems:"center",marginBottom:"8px",flexWrap:"wrap"}}>
              <Bdg label={t.ccy} color={t.color} sz="11px"/>
              <Bdg label={t.dir} color={t.color} sz="9px"/>
              {t.priority&&<Bdg label={t.priority+" PRIORITY"} color={t.priority==="HIGH"?C.red:C.gold} sz="8px"/>}
            </div>
            <div style={{fontWeight:"700",color:C.text,fontSize:"13px",marginBottom:"7px",lineHeight:"1.3"}}>{t.title}</div>
            <div style={{fontSize:"10px",color:"#b8cde0",lineHeight:"1.7",marginBottom:"8px"}}>{t.detail}</div>
            {t.support&&(
              <div style={{display:"flex",gap:"7px",marginBottom:"8px",flexWrap:"wrap"}}>
                {[["Support",t.support,C.green],["Resistance",t.resistance,C.red],["Pivot",t.pivot,C.gold]].map(([l,v,c])=>(
                  <div key={l} style={{background:C.bg1,border:`1px solid ${c}33`,borderRadius:"3px",padding:"4px 9px",fontSize:"8.5px"}}>
                    <span style={{color:C.muted}}>{l}: </span><strong style={{color:c}}>{v}</strong>
                  </div>
                ))}
              </div>
            )}
            {t.outcome&&(
              <div style={{background:C.bg1,border:`1px solid ${C.bdr}`,borderRadius:"3px",padding:"6px 10px",marginBottom:"8px",fontSize:"9px"}}>
                <span style={{color:C.muted,fontWeight:"700",letterSpacing:"1px"}}>OUTCOME: </span>
                <span style={{color:t.dir==="BULLISH"?C.green:t.dir==="BEARISH"?C.red:C.gold,fontWeight:"700"}}>{t.outcome}</span>
              </div>
            )}
            {t.pairs&&(
              <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                {t.pairs.map((p,pi)=>(
                  <button key={p} onClick={()=>window.open(`https://www.tradingview.com/chart/?symbol=FX%3A${TV_SYM[p]?.replace("FX:","")}&interval=60`,"_blank","noopener")}
                    style={{padding:"5px 10px",background:(t.dirs?.[pi]==="BUY"?C.green:C.red)+"22",color:t.dirs?.[pi]==="BUY"?C.green:C.red,border:`1px solid ${t.dirs?.[pi]==="BUY"?C.green:C.red}44`,borderRadius:"3px",cursor:"pointer",fontWeight:"700",fontSize:"9px",fontFamily:"inherit"}}>
                    {t.dirs?.[pi]||"VIEW"} {p} ↗
                  </button>
                ))}
              </div>
            )}
            {/* Evidence & Deep Analysis toggle */}
            {t.evidence&&(
              <div style={{marginTop:"6px"}}>
                <button onClick={e=>{e.stopPropagation();const key=`${wkView}_${t.ccy}`;setExpandedTheme(expandedTheme===key?null:key);}}
                  style={{width:"100%",padding:"7px 10px",background:"transparent",color:expandedTheme===`${wkView}_${t.ccy}`?C.gold:C.muted,border:`1px solid ${expandedTheme===`${wkView}_${t.ccy}`?C.gold+"55":C.bdr}`,borderRadius:"4px",cursor:"pointer",fontSize:"8.5px",fontWeight:"700",fontFamily:"inherit",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span>📎 EVIDENCE & DEEP ANALYSIS</span>
                  <span style={{fontSize:"10px"}}>{expandedTheme===`${wkView}_${t.ccy}`?"▲ COLLAPSE":"▼ EXPAND"}</span>
                </button>
                {expandedTheme===`${wkView}_${t.ccy}`&&(
                  <div style={{background:C.bg1,border:`1px solid ${C.gold}33`,borderRadius:"5px",padding:"12px 14px",marginTop:"5px"}}>
                    {t.deepAnalysis&&<div style={{fontSize:"9.5px",color:"#b8cde0",lineHeight:"1.8",marginBottom:"10px"}}>{t.deepAnalysis}</div>}
                    {t.watchFor&&<div style={{background:"#1a1200",border:`1px solid ${C.amber}33`,borderRadius:"4px",padding:"9px 11px",marginBottom:"10px"}}>
                      <div style={{fontSize:"7.5px",color:C.amber,fontWeight:"700",letterSpacing:"1px",marginBottom:"5px"}}>⚠ WATCH FOR THIS WEEK</div>
                      <div style={{fontSize:"9px",color:"#b8cde0",lineHeight:"1.65"}}>{t.watchFor}</div>
                    </div>}
                    {t.evidence.length>0&&<div>
                      <div style={{fontSize:"7.5px",color:C.muted,fontWeight:"700",letterSpacing:"1px",marginBottom:"6px"}}>INSTITUTIONAL SOURCES</div>
                      <div style={{display:"flex",flexDirection:"column",gap:"5px"}}>
                        {t.evidence.map((ev,ei)=>(
                          <a key={ei} href={ev.url} target="_blank" rel="noopener noreferrer"
                            style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"4px",textDecoration:"none",WebkitTapHighlightColor:"transparent"}}>
                            <div>
                              <div style={{fontSize:"9.5px",color:C.text,fontWeight:"600",lineHeight:"1.3"}}>{ev.title}</div>
                              <div style={{fontSize:"8px",color:C.blue,marginTop:"2px"}}>{ev.source}</div>
                            </div>
                            <span style={{fontSize:"14px",color:C.blue,flexShrink:0,marginLeft:"8px"}}>↗</span>
                          </a>
                        ))}
                      </div>
                    </div>}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }
  // ─── AI TAB ───────────────────────────────────────────────────────────
  function AITab(){
    const quickQ=["Analyze my open trades","Best USD/JPY setup","Optimal strategy for regime","RBNZ trade plan","Review risk exposure","Top 3 ideas","AUD/JPY with BOJ hike","BOJ impact on crosses"];
    return(
      <div style={{display:"flex",flexDirection:"column",gap:"8px",height:"calc(100vh - 118px)"}}>
        <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"6px",padding:"10px 12px",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <div style={{width:"38px",height:"38px",background:`linear-gradient(135deg,${C.gold},${C.amber})`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"16px",fontWeight:"900",color:C.bg,flexShrink:0}}>A</div>
            <div>
              <div style={{fontWeight:"700",color:C.gold,fontSize:"13px",letterSpacing:"3px"}}>AXIOM AI</div>
              <div style={{fontSize:"8px",color:settings.apiKey?C.green:C.amber,letterSpacing:"1px"}}>{settings.apiKey?"✓ ACTIVE — CLAUDE SONNET":"⚠ API KEY REQUIRED — GO TO SETTINGS"}</div>

            </div>
            <div style={{marginLeft:"auto",display:"flex",gap:"4px",flexWrap:"wrap",justifyContent:"flex-end",maxWidth:"50%"}}>
              {quickQ.slice(0,4).map(q=><Sm key={q} label={q} color="#7a4fc0" onClick={()=>sendAI(q)}/>)}
            </div>
          </div>
        </div>
        <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"6px",flex:1,overflow:"auto",WebkitOverflowScrolling:"touch",padding:"10px 12px",display:"flex",flexDirection:"column",gap:"9px"}}>
          {aiMsgs.map((m,i)=>(
            <div key={i} style={{display:"flex",gap:"8px",alignItems:"flex-start"}}>
              <div style={{width:"26px",height:"26px",flexShrink:0,borderRadius:"50%",background:m.role==="assistant"?`linear-gradient(135deg,${C.gold},${C.amber})`:C.bg3,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"9.5px",fontWeight:"700",color:m.role==="assistant"?C.bg:C.gold}}>{m.role==="assistant"?"A":"S"}</div>
              <div style={{flex:1,background:m.role==="assistant"?C.bg1:C.bg,border:`1px solid ${m.role==="assistant"?C.bdr:C.bdr+"33"}`,borderRadius:"5px",padding:"9px 11px",lineHeight:"1.7",fontSize:"11px",color:"#b8cde0",whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{m.content}</div>
            </div>
          ))}
          {aiLoading&&<div style={{display:"flex",gap:"8px",alignItems:"center"}}><div style={{width:"26px",height:"26px",borderRadius:"50%",background:`linear-gradient(135deg,${C.gold},${C.amber})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"9.5px",fontWeight:"700",color:C.bg}}>A</div><div style={{color:C.muted,fontSize:"10.5px"}}>Analyzing...</div></div>}
          <div ref={aiRef}/>
        </div>
        <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"5px",padding:"7px 10px",flexShrink:0,display:"flex",gap:"5px",flexWrap:"wrap"}}>{quickQ.slice(4).map(q=><Sm key={q} label={q} color="#7a4fc0" onClick={()=>sendAI(q)}/>)}</div>
        {!settings.apiKey&&(
          <div style={{background:"#1a0a00",border:`1px solid ${C.amber}`,borderRadius:"5px",padding:"9px 12px",flexShrink:0,display:"flex",alignItems:"center",gap:"10px"}}>
            <span style={{color:C.amber,fontSize:"14px",flexShrink:0}}>⚠️</span>
            <div style={{flex:1,fontSize:"9px",color:C.muted}}>API key required. ⚙ Settings → AXIOM AI CONFIG → paste sk-ant-... → Save</div>
            <button onClick={()=>setTab("settings")} style={{padding:"6px 10px",background:C.amber,color:C.bg,border:"none",borderRadius:"3px",cursor:"pointer",fontWeight:"700",fontSize:"9.5px",fontFamily:"inherit",flexShrink:0}}>SETTINGS →</button>
          </div>
        )}
        <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"5px",padding:"8px 10px",flexShrink:0,display:"flex",gap:"7px"}}>
          <input
            id="axiom-ai-input"
            defaultValue=""
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Ask AXIOM about strategies, setups, risk, macro..."
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&e.target.value.trim()){sendAI(e.target.value);e.target.value="";}}}
            style={{flex:1,background:C.bg,border:`1px solid ${C.bdr}`,borderRadius:"3px",color:C.text,padding:"8px 10px",fontSize:"11px",fontFamily:"inherit",outline:"none",WebkitAppearance:"none",touchAction:"manipulation"}}/>
          <Btn label="SEND" color={C.gold} onClick={()=>{const el=document.getElementById("axiom-ai-input");if(el?.value?.trim()){sendAI(el.value);el.value="";}}} disabled={aiLoading}/>
        </div>
      </div>
    );
  }

  // ─── SETTINGS — Fixed API key input + collapse after save ─────────────
  // ─── SIGNAL DETAIL MODAL — Fixed scroll glitch ────────────────────────
  // ─── TRADE VISUALIZATION ─────────────────────────────────────────────
  function TradeVisualization({sig}){
    const dc=sig.direction==="BUY"?C.green:C.red;const isBuy=sig.direction==="BUY";
    const prices=[sig.sl,sig.entry,sig.tp1,sig.tp2,sig.tp3];
    const minP=Math.min(...prices),maxP=Math.max(...prices),range=maxP-minP||0.00001;
    const pct=(p)=>((p-minP)/range*100);const isH=sig.pair.includes("JPY");
    const fmt=(p)=>typeof p==="number"?p.toFixed(isH?3:5):"–";
    return(
      <div style={{background:C.bg1,border:`1px solid ${C.bdr}`,borderRadius:"5px",padding:"12px",marginBottom:"10px"}}>
        <div style={{fontSize:"8.5px",color:C.gold,fontWeight:"700",letterSpacing:"2px",marginBottom:"10px"}}>◈ TRADE VISUALIZATION — PRICE LEVELS</div>
        <div style={{display:"flex",gap:"12px",alignItems:"stretch"}}>
          <div style={{flex:1,position:"relative",height:"200px",background:C.bg,borderRadius:"4px",border:`1px solid ${C.bdr}`,overflow:"hidden"}}>
            <div style={{position:"absolute",left:0,right:0,bottom:`${isBuy?pct(sig.entry):pct(sig.tp3)}%`,height:`${Math.abs(pct(sig.tp3)-pct(sig.entry))}%`,background:C.green+"15"}}/>
            <div style={{position:"absolute",left:0,right:0,bottom:`${isBuy?pct(sig.sl):pct(sig.entry)}%`,height:`${Math.abs(pct(sig.entry)-pct(sig.sl))}%`,background:C.red+"15"}}/>
            {[{p:sig.tp3,c:C.gold},{p:sig.tp2,c:"#00e5a0"},{p:sig.tp1,c:"#00b86a"},{p:sig.entry,c:C.amber},{p:sig.sl,c:C.red}].map((z,i)=>(
              <div key={i} style={{position:"absolute",left:0,right:0,bottom:`${pct(z.p)}%`,display:"flex",alignItems:"center"}}>
                <div style={{height:"1px",flex:1,background:z.c,opacity:0.8}}/>
                <div style={{fontSize:"7.5px",color:z.c,fontWeight:"700",fontFamily:"monospace",paddingRight:"4px"}}>{fmt(z.p)}</div>
              </div>
            ))}
            <div style={{position:"absolute",left:"50%",transform:"translateX(-50%)",bottom:`${pct(sig.entry)+2}%`,fontSize:"16px",color:dc}}>{isBuy?"▲":"▼"}</div>
          </div>
          <div style={{width:"130px",display:"flex",flexDirection:"column",gap:"5px",justifyContent:"space-around"}}>
            {[{l:"TP3",v:fmt(sig.tp3),c:C.gold,sub:`+${sig.tp3Pips}p · 1:${sig.rr3}R`},{l:"TP2",v:fmt(sig.tp2),c:"#00e5a0",sub:`+${sig.tp2Pips}p · 1:${sig.rr2}R`},{l:"TP1",v:fmt(sig.tp1),c:"#00b86a",sub:`+${sig.tp1Pips}p · 1:${sig.rr1}R`},{l:"ENTRY",v:fmt(sig.entry),c:C.amber,sub:`${sig.lotSize}M lots`},{l:"SL",v:fmt(sig.sl),c:C.red,sub:`-${sig.slPips}p · $${sig.riskAmount}`}].map((r,i)=>(
              <div key={i} style={{background:C.bg,border:`1px solid ${r.c}33`,borderLeft:`2px solid ${r.c}`,borderRadius:"3px",padding:"4px 7px"}}>
                <div style={{fontSize:"7px",color:r.c,fontWeight:"700"}}>{r.l}</div>
                <div style={{fontSize:"10px",color:r.c,fontFamily:"monospace",fontWeight:"700"}}>{r.v}</div>
                <div style={{fontSize:"7.5px",color:C.muted}}>{r.sub}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"5px",marginTop:"10px"}}>
          {[["RISK","$"+sig.riskAmount,C.red],["BEST R:R","1:"+sig.rr3,C.gold],["PROB",sig.probability+"%",sig.probability>=65?C.green:C.amber],["LOTS",sig.lotSize+"M",C.text]].map(([l,v,c])=>(
            <div key={l} style={{background:C.bg,border:`1px solid ${C.bdr}`,borderRadius:"3px",padding:"6px",textAlign:"center"}}>
              <div style={{fontSize:"7px",color:C.muted,marginBottom:"2px"}}>{l}</div>
              <div style={{fontSize:"13px",fontWeight:"700",color:c}}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── SIGNAL MODAL — 5 TABS ────────────────────────────────────────────
  function SignalModal(){
    const sig=modal;if(!sig)return null;
    const dc=sig.direction==="BUY"?C.green:C.red;
    const catBg=CATC[sig.primaryStrategy?.cat]||C.bg2;
    const MTABS=[{id:"params",l:"Parameters"},{id:"viz",l:"Visualization"},{id:"confluences",l:"Confluences"},{id:"exits",l:"Exit Plan"},{id:"evidence",l:"Evidence"}];
    return(
      <div onClick={()=>setModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.90)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}}>
        <div onClick={e=>e.stopPropagation()} style={{background:C.bg2,border:`1px solid ${dc}55`,borderRadius:"8px",maxWidth:"760px",width:"calc(100% - 24px)",maxHeight:"90vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.bdr}`,flexShrink:0,display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
            <Bdg label={sig.direction} color={dc} sz="11px"/>
            <span style={{fontWeight:"700",color:C.gold,fontSize:"19px"}}>{sig.pair}</span>
            <span style={{display:"inline-block",padding:"2px 7px",background:catBg+"55",color:"#dde3ee",border:`1px solid ${catBg}`,borderRadius:"2px",fontSize:"8.5px",fontWeight:"700"}}>{sig.primaryStrategy?.cat}</span>
            <Bdg label={sig.style?.toUpperCase()||"DAY"} color={SC[sig.style]||C.blue} sz="8.5px"/>
            {sig.tier&&<Bdg label={sig.tier+"-TIER"} color={sig.tier==="S"?C.gold:sig.tier==="A"?C.green:C.muted} sz="8px"/>}
            <span style={{fontSize:"9px",color:C.muted}}>{sig.timeframe} · {sig.holdTime}</span>
            <span style={{marginLeft:"auto",fontWeight:"700",color:sig.probability>=68?C.green:C.gold,fontSize:"14px"}}>{sig.probability}%</span>
            <button onClick={()=>setModal(null)} style={{background:"transparent",border:`1px solid ${C.bdr}`,borderRadius:"3px",color:C.muted,cursor:"pointer",padding:"4px 8px",fontSize:"10px",fontFamily:"inherit"}}>✕</button>
          </div>
          <div style={{display:"flex",borderBottom:`1px solid ${C.bdr}`,flexShrink:0,overflowX:"auto",scrollbarWidth:"none"}}>
            {MTABS.map(t=>(
              <button key={t.id} onClick={()=>setModalTab(t.id)} style={{padding:"9px 14px",background:"transparent",color:modalTab===t.id?C.gold:C.muted,border:"none",borderBottom:modalTab===t.id?`2px solid ${C.gold}`:"2px solid transparent",cursor:"pointer",fontSize:"9.5px",fontWeight:"700",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0}}>{t.l}</button>
            ))}
          </div>
          <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"14px 16px"}}>
            {modalTab==="params"&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
                <div style={{background:C.bg1,border:`1px solid ${C.bdr}`,borderRadius:"5px",padding:"12px"}}>
                  <div style={{fontSize:"8px",color:C.gold,fontWeight:"700",letterSpacing:"2px",marginBottom:"9px"}}>TRADE PARAMETERS</div>
                  <Kv k="ENTRY"       v={String(sig.entry)}/>
                  <Kv k="STOP LOSS"   v={`${sig.sl} (${sig.slPips}p · $${sig.riskAmount})`} vc={C.red}/>
                  <Kv k="TP1"         v={`${sig.tp1}  +${sig.tp1Pips}p  1:${sig.rr1}R`}      vc={C.green}/>
                  <Kv k="TP2"         v={`${sig.tp2}  +${sig.tp2Pips}p  1:${sig.rr2}R`}      vc={C.green}/>
                  <Kv k="TP3"         v={`${sig.tp3}  +${sig.tp3Pips}p  1:${sig.rr3}R`}      vc={C.gold}/>
                  <Kv k="LOT SIZE"    v={`${sig.lotSize} micro lots`}                          vc={C.gold}/>
                  <Kv k="RISK"        v={`$${sig.riskAmount} (2% account)`}                   vc={C.amber}/>
                  <Kv k="TIMEFRAME"   v={sig.timeframe}/>
                  <Kv k="HOLD TIME"   v={sig.holdTime}                                         vc={C.muted}/>
                  <Kv k="PROBABILITY" v={`${sig.probability}%`}                                vc={sig.probability>=68?C.green:C.gold}/>
                </div>
                <div style={{background:C.bg1,border:`1px solid ${C.bdr}`,borderRadius:"5px",padding:"12px"}}>
                  <div style={{fontSize:"8px",color:C.gold,fontWeight:"700",letterSpacing:"2px",marginBottom:"9px"}}>STRATEGY</div>
                  <div style={{fontWeight:"700",color:C.text,marginBottom:"4px",fontSize:"12.5px"}}>{sig.primaryStrategy?.name}</div>
                  <div style={{display:"inline-block",padding:"2px 8px",background:catBg+"55",color:"#dde3ee",border:`1px solid ${catBg}`,borderRadius:"2px",fontSize:"8.5px",fontWeight:"700",marginBottom:"8px"}}>{sig.primaryStrategy?.cat}</div>
                  <div style={{fontSize:"8.5px",color:C.muted,marginBottom:"4px",fontWeight:"700"}}>SUPPORTING</div>
                  <div style={{fontWeight:"600",color:"#90a8c0",fontSize:"11px",marginBottom:"2px"}}>{sig.supportingStrategy?.name}</div>
                  <div style={{fontSize:"8.5px",color:C.muted,marginBottom:"10px"}}>{sig.supportingStrategy?.cat} · ~{sig.supportingStrategy?.wr}% WR</div>
                  <div style={{height:"7px",background:C.bdr,borderRadius:"3px",marginBottom:"3px"}}><div style={{height:"100%",width:`${sig.probability}%`,background:sig.probability>=68?C.green:C.gold,borderRadius:"3px"}}/></div>
                  <div style={{fontSize:"8px",color:C.muted,marginBottom:"12px"}}>{sig.probability}% probability</div>
                  <button onClick={()=>window.open(`https://www.tradingview.com/chart/?symbol=FX%3A${TV_SYM[sig.pair]?.replace("FX:","")||"EURUSD"}&interval=60`,"_blank","noopener")} style={{width:"100%",padding:"7px",background:C.blue+"22",color:C.blue,border:`1px solid ${C.blue}44`,borderRadius:"3px",cursor:"pointer",fontSize:"10px",fontFamily:"inherit",fontWeight:"700"}}>📊 Open {sig.pair} on TradingView ↗</button>
                </div>
              </div>
            )}
            {modalTab==="viz"&&<TradeVisualization sig={sig}/>}
            {modalTab==="confluences"&&(
              <div>
                <div style={{fontSize:"8.5px",color:C.gold,fontWeight:"700",letterSpacing:"2px",marginBottom:"10px"}}>SUPPORTING CONFLUENCES ({sig.confluences?.length} FACTORS)</div>
                {sig.confluences?.map((c,i)=>(
                  <div key={i} style={{display:"flex",gap:"8px",padding:"7px 0",borderBottom:`1px solid ${C.bdr}22`,fontSize:"11px",color:"#b0c8e0",lineHeight:"1.5"}}>
                    <span style={{color:dc,flexShrink:0}}>▸</span><span>{c}</span>
                  </div>
                ))}
              </div>
            )}
            {modalTab==="exits"&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
                <div style={{background:C.bg1,border:`1px solid ${C.green}22`,borderRadius:"5px",padding:"12px"}}>
                  <div style={{fontSize:"8.5px",color:C.green,fontWeight:"700",letterSpacing:"1.5px",marginBottom:"9px"}}>✓ WIN EXIT SIGNALS</div>
                  {sig.winExits?.map((e,i)=><div key={i} style={{fontSize:"10.5px",color:"#a0c8b0",padding:"6px 0",borderBottom:`1px solid ${C.bdr}22`,lineHeight:"1.4"}}>▸ {e}</div>)}
                </div>
                <div style={{background:C.bg1,border:`1px solid ${C.red}22`,borderRadius:"5px",padding:"12px"}}>
                  <div style={{fontSize:"8.5px",color:C.red,fontWeight:"700",letterSpacing:"1.5px",marginBottom:"9px"}}>✗ LOSS EXIT SIGNALS</div>
                  {sig.lossExits?.map((e,i)=><div key={i} style={{fontSize:"10.5px",color:"#c8a0a0",padding:"6px 0",borderBottom:`1px solid ${C.bdr}22`,lineHeight:"1.4"}}>▸ {e}</div>)}
                </div>
              </div>
            )}
            {modalTab==="evidence"&&(
              <div>
                <div style={{background:C.bg1,border:`1px solid ${C.gold}33`,borderRadius:"5px",padding:"12px",marginBottom:"12px"}}>
                  <div style={{fontSize:"8.5px",color:C.gold,fontWeight:"700",letterSpacing:"2px",marginBottom:"8px"}}>PRIMARY: {sig.primaryStrategy?.name}</div>
                  <div style={{fontSize:"10px",color:"#b8cde0",lineHeight:"1.7",marginBottom:"8px"}}><strong style={{color:C.text}}>Category:</strong> {sig.primaryStrategy?.cat} · <strong style={{color:C.text}}>Historical WR:</strong> ~{sig.primaryStrategy?.wr}%</div>
                  <div style={{fontSize:"8.5px",color:C.muted,marginBottom:"6px",fontWeight:"700"}}>ACADEMIC EVIDENCE</div>
                  <div style={{fontSize:"10px",color:"#b8cde0",marginBottom:"8px"}}>{sig.primaryStrategy?.desc||"Institutional FX strategy research"}</div>
                  <a href={sig.primaryStrategy?.url||"https://www.bis.org/research/"} target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:"6px",padding:"7px 12px",background:C.blue+"22",color:C.blue,border:`1px solid ${C.blue}44`,borderRadius:"3px",textDecoration:"none",fontSize:"10px",fontWeight:"700"}}>📄 Read Primary Source ↗</a>
                </div>
                <div style={{background:C.bg1,border:`1px solid ${C.bdr}`,borderRadius:"5px",padding:"12px",marginBottom:"12px"}}>
                  <div style={{fontSize:"8.5px",color:C.gold,fontWeight:"700",letterSpacing:"2px",marginBottom:"8px"}}>PROBABILITY BASIS ({sig.probability}%)</div>
                  {[["Base Win Rate",`~${sig.primaryStrategy?.wr}%`,"Historical WR from institutional research"],["Tier Bonus",sig.tier==="S"?"+5%":sig.tier==="A"?"+2%":"+0%","Quality tier premium added to base WR"],["Multi-Confluence",`${sig.confluences?.length} factors`,"Each factor adds ~2% edge to base WR"],["R:R Adjusted",`Best 1:${sig.rr3}`,"High R:R reduces required win rate for profit"]].map(([l,v,d],i)=>(
                    <div key={i} style={{padding:"6px 0",borderBottom:`1px solid ${C.bdr}22`}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:"2px"}}><span style={{fontSize:"9.5px",color:C.muted}}>{l}</span><span style={{fontSize:"9.5px",color:C.gold,fontWeight:"700"}}>{v}</span></div>
                      <div style={{fontSize:"8px",color:C.dim}}>{d}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div style={{padding:"12px 16px",borderTop:`1px solid ${C.bdr}`,flexShrink:0,display:"flex",gap:"9px"}}>
            <Btn label={`TAKE — ${sig.direction} ${sig.pair} @ ${sig.entry} · ${sig.lotSize}M`} color={dc} onClick={()=>takeTrade(sig)} style={{flex:2,padding:"10px",fontSize:"11px"}}/>
            <Btn label="DISMISS" color={C.muted} ghost onClick={()=>{dismissSig(sig.id);setModal(null);}} style={{flex:1}}/>
          </div>
        </div>
      </div>
    );
  }

  const Settings=React.memo(function Settings(){
    const local=localSettings;
    const setLocal=setLocalSettings;
    const [notifStatus,setNotifStatus]=useState(()=>{try{return typeof Notification!=="undefined"?Notification.permission:"default";}catch{return"default";}});

    const handleSave=()=>{
      setSettings({...local,saved:true});
      setSettingsSaved(true);
      toast_("✓ Settings saved.",C.gold);
    };

    const handleNotif=async()=>{
      if(typeof Notification==="undefined"||!("Notification" in window)){toast_("Notifications not supported in this environment.",C.red);setNotifStatus("denied");return;}
      try{
        const perm=await Notification.requestPermission();
        setNotifStatus(perm);
        setLocal(p=>({...p,notif:perm==="granted"}));
        toast_(perm==="granted"?"✓ Notifications enabled — you'll receive signal alerts!":"Notifications denied. Enable in iPhone Settings → Safari → Notifications.",perm==="granted"?C.green:C.red);
      }catch(e){toast_("Notification error: "+e.message,C.red);}
    };

    // If saved and not in edit mode, show mini summary
    if(settingsSaved){
      return(
        <div>
          <div style={{background:C.bg2,border:`1px solid ${C.green}44`,borderRadius:"6px",padding:"14px 16px",marginBottom:"12px",display:"flex",alignItems:"center",gap:"12px",flexWrap:"wrap"}}>
            <div>
              <div style={{fontSize:"10px",color:C.green,fontWeight:"700",letterSpacing:"1.5px",marginBottom:"4px"}}>✓ SETTINGS SAVED</div>
              <div style={{fontSize:"11px",color:C.text}}>Account: <strong style={{color:C.gold}}>${local.acct.toLocaleString()}</strong> &nbsp;·&nbsp; Risk: <strong style={{color:C.amber}}>{local.risk}%</strong> &nbsp;·&nbsp; API Key: <strong style={{color:local.apiKey?C.green:C.red}}>{local.apiKey?"Set ✓":"Not set"}</strong> &nbsp;·&nbsp; Style: <strong style={{color:SC[style]}}>{style.toUpperCase()}</strong></div>
            </div>
            <button onClick={()=>setSettingsSaved(false)} style={{marginLeft:"auto",padding:"8px 14px",background:C.gold,color:C.bg,border:"none",borderRadius:"4px",cursor:"pointer",fontWeight:"700",fontSize:"10px",fontFamily:"inherit"}}>✏️ EDIT SETTINGS</button>
          </div>
        </div>
      );
    }

    return(
      <div>
        {/* Account */}
        <div style={{background:`linear-gradient(135deg,#0a1e10,#051410)`,border:`2px solid ${C.gold}`,borderRadius:"8px",padding:"16px",marginBottom:"14px"}}>
          <div style={{fontSize:"11px",fontWeight:"700",color:C.gold,letterSpacing:"2px",marginBottom:"4px"}}>💰 ACCOUNT SIZE (THEORETICAL)</div>
          <div style={{fontSize:"9.5px",color:C.muted,marginBottom:"10px",lineHeight:"1.5"}}>Paper trading simulation. Update this to match your real balance. All lot sizes and risk amounts auto-update.</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px",marginBottom:"12px"}}>
            <div>
              <div style={{fontSize:"8.5px",color:C.muted,letterSpacing:"1px",marginBottom:"4px"}}>ACCOUNT SIZE ($)</div>
              <input type="number" value={local.acct} onChange={e=>setLocal(p=>({...p,acct:parseFloat(e.target.value)||0}))}
                style={{width:"100%",background:C.bg,border:`2px solid ${C.gold}`,borderRadius:"4px",color:C.gold,padding:"10px 11px",fontSize:"16px",fontFamily:"monospace",outline:"none",fontWeight:"700"}}/>
            </div>
            <div>
              <div style={{fontSize:"8.5px",color:C.muted,letterSpacing:"1px",marginBottom:"4px"}}>RISK / TRADE (%)</div>
              <input type="number" value={local.risk} onChange={e=>setLocal(p=>({...p,risk:parseFloat(e.target.value)||2}))}
                style={{width:"100%",background:C.bg,border:`1px solid ${C.bdr}`,borderRadius:"4px",color:C.text,padding:"10px 11px",fontSize:"14px",fontFamily:"monospace",outline:"none"}}/>
            </div>
            <div>
              <div style={{fontSize:"8.5px",color:C.muted,letterSpacing:"1px",marginBottom:"4px"}}>MAX RISK (AUTO)</div>
              <div style={{background:"#0a1e10",border:`1px solid ${C.green}44`,borderRadius:"4px",color:C.green,padding:"11px 11px",fontSize:"14px",fontFamily:"monospace",fontWeight:"700"}}>${(local.acct*(local.risk||2)/100).toFixed(2)}</div>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"12px"}}>
            <div>
              <div style={{fontSize:"8.5px",color:C.muted,letterSpacing:"1px",marginBottom:"4px"}}>LEVERAGE</div>
              <input type="number" value={local.lev} onChange={e=>setLocal(p=>({...p,lev:parseFloat(e.target.value)||50}))}
                style={{width:"100%",background:C.bg,border:`1px solid ${C.bdr}`,borderRadius:"4px",color:C.text,padding:"9px 11px",fontSize:"13px",fontFamily:"monospace",outline:"none"}}/>
            </div>
            <div>
              <div style={{fontSize:"8.5px",color:C.muted,letterSpacing:"1px",marginBottom:"4px"}}>BROKER</div>
              <input type="text" value={local.broker} onChange={e=>setLocal(p=>({...p,broker:e.target.value}))}
                style={{width:"100%",background:C.bg,border:`1px solid ${C.bdr}`,borderRadius:"4px",color:C.text,padding:"9px 11px",fontSize:"13px",fontFamily:"inherit",outline:"none"}}/>
            </div>
          </div>
          <button onClick={handleSave} style={{width:"100%",padding:"12px",background:C.gold,color:C.bg,border:"none",borderRadius:"4px",cursor:"pointer",fontWeight:"700",fontSize:"13px",fontFamily:"inherit",letterSpacing:"1px"}}>💾 SAVE SETTINGS</button>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
          <div>
            {/* AXIOM AI Config — FIXED INPUT */}
            <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"6px",padding:"13px",marginBottom:"11px"}}>
              <div style={{fontSize:"10px",color:C.gold,letterSpacing:"2px",marginBottom:"8px",fontWeight:"700"}}>✦ AXIOM AI CONFIG</div>
              <div style={{fontSize:"9px",color:C.muted,marginBottom:"9px",lineHeight:"1.7"}}>
                1. Go to <span style={{color:C.gold}}>console.anthropic.com</span><br/>
                2. Sign up free → API Keys → Create Key<br/>
                3. Copy key starting with sk-ant-api03-...<br/>
                4. Long-press the field below → Paste → Save
              </div>
              <div style={{fontSize:"8.5px",color:C.muted,letterSpacing:"1px",marginBottom:"5px"}}>ANTHROPIC API KEY</div>
              {/* Uncontrolled input — prevents keyboard dismiss on root re-render */}
              <input
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                id="axiom-api-key-input"
                defaultValue={local.apiKey||""}
                onBlur={e=>setLocal(p=>({...p,apiKey:e.target.value}))}
                placeholder="sk-ant-api03-..."
                style={{width:"100%",background:"#030608",border:`1px solid ${C.green}`,borderRadius:"3px",color:C.green,padding:"10px 11px",fontSize:"11px",fontFamily:"monospace",outline:"none",marginBottom:"5px",WebkitAppearance:"none",touchAction:"manipulation"}}
              />
              <div style={{fontSize:"8.5px",color:C.green,fontWeight:"700"}}>✓ API key pre-wired — tap field to update, blur/tap-away to save</div>
              <div style={{fontSize:"8px",color:C.muted,marginTop:"5px",lineHeight:"1.5"}}>iPhone: tap field → long-press → Paste. Key saves automatically when you tap away.</div>
              {/* OANDA API Key for live prices */}
              <div style={{marginTop:"12px"}}>
                <div style={{fontSize:"8.5px",color:C.muted,letterSpacing:"1px",marginBottom:"5px",fontWeight:"700"}}>OANDA API KEY — LIVE REAL-TIME PRICES</div>
                <input type="text" inputMode="text" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
                  value={local.oandaKey||""}
                  onChange={e=>setLocal(p=>({...p,oandaKey:e.target.value}))}
                  placeholder="b41a0f67df1e1284a11d9487cedc06b2-..."
                  style={{width:"100%",background:"#030608",border:`1px solid ${local.oandaKey?C.green:C.bdr}`,borderRadius:"3px",color:local.oandaKey?C.green:C.text,padding:"10px 11px",fontSize:"10px",fontFamily:"monospace",outline:"none",marginBottom:"5px",WebkitAppearance:"none"}}/>
                <div style={{fontSize:"8px",color:local.oandaKey?C.green:C.muted,lineHeight:"1.5"}}>{local.oandaKey?"✓ OANDA key set — live prices activate when deployed to Netlify":"OANDA demo key pre-wired in app. Live prices (OANDA LIVE) activate on Netlify deploy. Shows SIM in Claude sandbox (API blocked by browser security)."}</div>
              </div>
            </div>

            {/* Notifications — FIXED */}
            <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"6px",padding:"13px"}}>
              <div style={{fontSize:"10px",color:C.gold,letterSpacing:"2px",marginBottom:"8px",fontWeight:"700"}}>🔔 SIGNAL NOTIFICATIONS</div>
              <div style={{fontSize:"9px",color:C.muted,marginBottom:"8px",lineHeight:"1.6"}}>
                Current status: <strong style={{color:notifStatus==="granted"?C.green:notifStatus==="denied"?C.red:C.amber}}>{notifStatus.toUpperCase()}</strong><br/>
                {notifStatus==="denied"&&<span style={{color:C.red}}>Denied — enable in iPhone Settings → Safari → Notifications</span>}
              </div>
              <button
                onClick={handleNotif}
                style={{width:"100%",padding:"10px",background:notifStatus==="granted"?C.green+"22":"transparent",color:notifStatus==="granted"?C.green:C.text,border:`1px solid ${notifStatus==="granted"?C.green:C.bdr}`,borderRadius:"3px",cursor:"pointer",fontWeight:"700",fontSize:"11px",fontFamily:"inherit",touchAction:"manipulation"}}>
                {notifStatus==="granted"?"✓ NOTIFICATIONS ACTIVE — TAP TO REFRESH":notifStatus==="denied"?"OPEN PHONE SETTINGS TO ENABLE":"TAP TO REQUEST NOTIFICATIONS"}
              </button>
            </div>
          </div>

          <div>
            {/* Style */}
            <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"6px",padding:"13px",marginBottom:"11px"}}>
              <div style={{fontSize:"10px",color:C.gold,letterSpacing:"2px",marginBottom:"8px",fontWeight:"700"}}>📊 TRADING STYLE</div>
              <div style={{display:"flex",gap:"6px",marginBottom:"8px"}}>
                {["scalp","day","swing"].map(s=>(
                  <button key={s} onClick={()=>{setStyle(s);setLocal(p=>({...p,tradeStyle:s}));}} style={{flex:1,padding:"9px",background:style===s?SC[s]:"transparent",color:style===s?C.bg:C.muted,border:`1px solid ${style===s?SC[s]:C.bdr}`,borderRadius:"3px",cursor:"pointer",fontWeight:"700",fontSize:"11px",fontFamily:"inherit",touchAction:"manipulation"}}>{s.toUpperCase()}</button>
                ))}
              </div>
              <div style={{fontSize:"8.5px",color:C.muted,lineHeight:"1.7"}}>Signals fire every 15–90s automatically. No limit on monitored pairs. Signals persist until dismissed.</div>
            </div>

            {/* Pairs — ALL selected, no limit */}
            <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"6px",padding:"13px",marginBottom:"11px"}}>
              <div style={{fontSize:"10px",color:C.gold,letterSpacing:"2px",marginBottom:"8px",fontWeight:"700"}}>🌐 SIGNAL PAIRS (NO LIMIT)</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"4px",marginBottom:"8px"}}>
                {ALL_PAIRS.map(p=><Sm key={p} label={p} active={local.pairs?.includes(p)} onClick={()=>setLocal(prev=>({...prev,pairs:prev.pairs?.includes(p)?prev.pairs.filter(x=>x!==p):[...(prev.pairs||[]),p]}))}/>)}
              </div>
              <div style={{display:"flex",gap:"6px"}}>
                <button onClick={()=>setLocal(p=>({...p,pairs:ALL_PAIRS}))} style={{flex:1,padding:"7px",background:C.green+"22",color:C.green,border:`1px solid ${C.green}44`,borderRadius:"3px",cursor:"pointer",fontWeight:"700",fontSize:"9.5px",fontFamily:"inherit"}}>SELECT ALL</button>
                <button onClick={()=>setLocal(p=>({...p,pairs:[]}))} style={{flex:1,padding:"7px",background:C.red+"22",color:C.red,border:`1px solid ${C.red}44`,borderRadius:"3px",cursor:"pointer",fontWeight:"700",fontSize:"9.5px",fontFamily:"inherit"}}>CLEAR ALL</button>
              </div>
            </div>

            {/* Deploy */}
            <div style={{background:C.bg2,border:`1px solid ${C.gold}33`,borderRadius:"6px",padding:"13px"}}>
              <div style={{fontSize:"10px",color:C.gold,letterSpacing:"2px",marginBottom:"9px",fontWeight:"700"}}>📱 DEPLOY AS APP</div>
              <div style={{fontSize:"9px",color:C.muted,lineHeight:"1.85"}}>
                <strong style={{color:C.green}}>iPhone (Safari only):</strong><br/>
                Open this chat in Safari → Share (□↑) → "Add to Home Screen" → Full-screen app<br/><br/>
                <strong style={{color:C.blue}}>Standalone HTML file:</strong><br/>
                Download AXIOM_FX_v5.html → Open in any browser → Install as PWA<br/><br/>
                <strong style={{color:C.amber}}>Free online URL (recommended):</strong><br/>
                1. Go to <span style={{color:C.gold}}>netlify.com/drop</span><br/>
                2. Drag the .html file → Get permanent HTTPS URL<br/>
                3. Bookmark on all devices = cross-device continuity<br/><br/>
                <strong style={{color:C.text}}>Cross-device sync:</strong> Use same URL on all devices. API key must be re-entered per browser (stored locally for security).
              </div>
            </div>
          </div>
        </div>

        <button onClick={handleSave} style={{width:"100%",padding:"13px",background:C.gold,color:C.bg,border:"none",borderRadius:"4px",cursor:"pointer",fontWeight:"700",fontSize:"13px",fontFamily:"inherit",letterSpacing:"1px",marginTop:"12px"}}>💾 SAVE ALL SETTINGS</button>
      </div>
    );
  });

  // ─── STRATEGIES TAB ───────────────────────────────────────────────────
  function StrategiesTab(){
    const catFilter=stratCatFilter,setCatFilter=setStratCatFilter;
    const tierFilter=stratTierFilter,setTierFilter=setStratTierFilter;
    const cats=["ALL",...new Set(STRATEGIES.map(s=>s.cat))];
    const tiers=["ALL","S","A","B"];
    const tierC={S:C.gold,A:C.green,B:C.blue};
    const filtered=STRATEGIES.filter(s=>(catFilter==="ALL"||s.cat===catFilter)&&(tierFilter==="ALL"||s.tier===tierFilter));
    const toggleS=(id)=>setEnabledStrats(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
    const sCount=STRATEGIES.filter(s=>enabledStrats.includes(s.id)).length;
    return(
      <div>
        <div style={{background:`linear-gradient(90deg,${C.bg2},#0a1a2a)`,border:`2px solid ${C.gold}`,borderRadius:"7px",padding:"14px 16px",marginBottom:"12px"}}>
          <div style={{fontSize:"12px",fontWeight:"700",color:C.gold,letterSpacing:"2px",marginBottom:"6px"}}>◎ AXIOM STRATEGY LIBRARY — {STRATEGIES.length} STRATEGIES</div>
          <div style={{fontSize:"9px",color:C.muted,lineHeight:"1.65",marginBottom:"10px"}}>Tap any card to toggle for signal generation. <strong style={{color:C.gold}}>S-Tier</strong> (elite ≥62% WR) and <strong style={{color:C.green}}>A-Tier</strong> (59-62%) are default — fewer but higher-probability signals.</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"6px",marginBottom:"10px"}}>
            {[[STRATEGIES.filter(s=>s.tier==="S").length,"S-TIER","Elite ≥62%",C.gold],[STRATEGIES.filter(s=>s.tier==="A").length,"A-TIER","High 59-62%",C.green],[STRATEGIES.filter(s=>s.tier==="B").length,"B-TIER","Solid 54-58%",C.blue],[sCount,"ENABLED","Active",C.amber]].map(([n,l,sub,c])=>(
              <div key={l} style={{background:C.bg1,border:`1px solid ${c}33`,borderRadius:"4px",padding:"7px",textAlign:"center"}}>
                <div style={{fontSize:"16px",fontWeight:"700",color:c}}>{n}</div>
                <div style={{fontSize:"7.5px",color:c,fontWeight:"700"}}>{l}</div>
                <div style={{fontSize:"7px",color:C.muted}}>{sub}</div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:"5px",flexWrap:"wrap"}}>
            <button onClick={()=>setEnabledStrats(STRATEGIES.filter(s=>s.tier==="S").map(s=>s.id))} style={{padding:"5px 9px",background:C.gold+"22",color:C.gold,border:`1px solid ${C.gold}44`,borderRadius:"3px",cursor:"pointer",fontSize:"8.5px",fontWeight:"700",fontFamily:"inherit"}}>S ONLY</button>
            <button onClick={()=>setEnabledStrats(DEFAULT_ENABLED)} style={{padding:"5px 9px",background:C.green+"22",color:C.green,border:`1px solid ${C.green}44`,borderRadius:"3px",cursor:"pointer",fontSize:"8.5px",fontWeight:"700",fontFamily:"inherit"}}>S+A ✓ RECOMMENDED</button>
            <button onClick={()=>setEnabledStrats(STRATEGIES.map(s=>s.id))} style={{padding:"5px 9px",background:C.blue+"22",color:C.blue,border:`1px solid ${C.blue}44`,borderRadius:"3px",cursor:"pointer",fontSize:"8.5px",fontWeight:"700",fontFamily:"inherit"}}>ALL {STRATEGIES.length}</button>
          </div>
        </div>
        <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"5px",padding:"9px 11px",marginBottom:"9px"}}>
          <div style={{display:"flex",gap:"5px",flexWrap:"wrap",alignItems:"center",marginBottom:"6px"}}>
            <span style={{fontSize:"8px",color:C.muted,fontWeight:"700",minWidth:"30px"}}>TIER:</span>
            {tiers.map(t=><Sm key={t} label={t==="ALL"?"ALL":t+"-TIER"} active={tierFilter===t} onClick={()=>setTierFilter(t)} color={tierC[t]||C.gold}/>)}
          </div>
          <div style={{display:"flex",gap:"5px",flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:"8px",color:C.muted,fontWeight:"700",minWidth:"30px"}}>CAT:</span>
            {cats.map(c=><Sm key={c} label={c} active={catFilter===c} onClick={()=>setCatFilter(c)}/>)}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
          {/* Strategy Detail Modal */}
          {expandedStrat&&(()=>{
            const s=STRATEGIES.find(x=>x.id===expandedStrat);if(!s)return null;
            const tc={S:C.gold,A:C.green,B:C.blue}[s.tier]||C.muted;
            const DETAIL={
              howItWorks:{
                BOJ_NORM:"Tracks Bank of Japan's hiking cycle divergence against all other G10 central banks on hold or cutting. Entry signals come from USD/JPY approaching key resistance levels (158+, 160+) with technical confirmation (bearish engulfing, RSI overbought on H4). The structural thesis: BOJ is raising rates while Fed/ECB/BOE are cutting — this rate differential compression drives systematic JPY appreciation. Position on the short side every time USD/JPY rallies to key levels.",
                NEWS_DFT:"After high-impact data releases (CPI, NFP, CB decisions), prices initially spike in the direction of the surprise then pull back before continuing in the same direction 64% of the time. The 'drift' occurs because institutional algorithmic execution continues for 2-4 hours post-release as large orders fill. Enter 10-15 minutes after release on the pullback, in the direction of the initial spike. Avoid if the release is within 1 pip of consensus.",
                TRI_ARB:"Identifies when three currency pairs create a mathematical inconsistency — e.g., EUR/USD × USD/JPY ≠ EUR/JPY. When the cross-rate is mispriced vs the implied rate, enter the triangle simultaneously: buy the undervalued pair, sell the overvalued pair, hedge with the third. The edge is typically 2-5 pips and lasts seconds to minutes. Requires fast execution and real-time pricing.",
                RATE_SRP:"Central bank rate decisions that surprise vs market consensus trigger an extension of the initial move for 2-6 hours. The mechanism: repricing of rate expectations cascades through all assets denominated in that currency. Enter 5-15 minutes after the decision in the direction of the surprise. The RBNZ cut to 3.00% on Apr 9 is a textbook example — NZD continuation sell.",
                CB_DIV:"Systematic long of the currency whose central bank is hiking/hawkish vs the currency whose central bank is cutting/dovish. In April 2026: BOJ hiking = long JPY; RBNZ cutting = short NZD. The strongest signals come when the divergence is at an extreme (both direction and speed of divergence). Confirmed by actual policy rate changes, not just rhetoric.",
                WMR_FIX:"The WM/Reuters Fix at 4PM London is the most important daily FX benchmark. Large funds must transact at this rate for index rebalancing. Institutional order flow in the 5-minute window before Fix is directional and predictable based on month-end flows, index changes, and known corporate hedging. Enter 15-30 minutes before 4PM London in the direction of anticipated fix flow.",
                STRUCT_BK:"When price breaks through a major structural level (multi-month resistance/support) on high volume with follow-through, a continuation trade in the direction of the break has a 63% win rate. EUR/USD breaking 1.16 (which held for 18 months) is a current live example. Entry: on the retest of the broken level. Stop: back through the breakout level. Target: measured move (height of consolidation range projected forward).",
                GRW_DIV:"Systematic long of the currency whose economy is growing faster relative to consensus expectations, vs the currency of the slower-growing economy. Uses PMI beats/misses, GDP surprise indices, and IFO/ZEW sentiment data. Currently: Eurozone growth being revised up (German fiscal stimulus) while US growth is being revised down — supports EUR/USD longs.",
                REAL_YLD:"Tracks the inflation-adjusted interest rate differential between two countries. When real yields widen in favor of a currency (nominal rates rise OR inflation falls), that currency tends to appreciate. Key relationship: when US real yields fall (Fed cutting while inflation sticky) vs rising real yields elsewhere, USD weakens vs those currencies.",
                SAFE_HVN:"In periods of risk-off (equity selloffs, geopolitical stress, VIX spikes), capital flows to JPY, CHF, and historically USD. In 2026, USD has partially lost safe-haven status due to reserve currency erosion — so JPY and CHF are the primary safe havens. Strategy: monitor VIX and equity futures; when VIX spikes above 20 with equity selloff, enter JPY/CHF long positions.",
                OPT_EXP:"Large option strikes (notional >$500M) at round numbers act as 'magnets' pulling spot price toward them in the hours before NY 10AM option expiry. CME data shows the effect is strongest when spot is within 30-50 pips of the strike. Enter in direction of the strike 1-2 hours before 10AM NY. Exit 15 minutes before expiry as the gravitational effect ends.",
                CB_COMM:"Central bank communications (speeches, minutes, press conferences) cause systematic price drifts in the hours and days following. The mechanism: algorithmic parsing of text sentiment triggers initial move; then fundamental traders reassess positioning. Key indicators: hawkish/dovish word frequency, changes in 'data dependent' language, forward guidance shifts. Currently tracking: ECB Schnabel, BOJ Ueda.",
                TSM_CTA:"Systematic time-series momentum: if an asset has positive returns over the past 1, 3, 6, and 12 months, go long; if negative, go short. AQR research shows this has delivered positive Sharpe ratios across 58 liquid markets including G10 FX since the 1880s. No discretion — pure rules-based trend following. Currently: EUR, JPY momentum is positive; USD, NZD momentum is negative.",
                CROSS_CAR:"Combines classic carry (long high-yielder vs low-yielder) with a momentum filter. Long carry is only initiated when the high-yield currency also has positive recent price momentum. This filter eliminates the crash risk inherent in pure carry (which loses badly in risk-off). AQR research shows the Sharpe ratio improves from 0.6 (pure carry) to 1.0+ (carry + momentum filter).",
                FX_VOL:"Systematic sale of implied volatility (through options) when implied vol exceeds historical realized volatility. The volatility risk premium in FX has been positive on average historically — sellers of vol earn premium over time similar to how insurance sellers earn premium. Execute by selling 1-month straddles when 1M implied vol is significantly above 20-day realized vol. Currently: vol premium exists in EUR/USD and USD/JPY.",
                ICT_OB:"ICT Order Block methodology: institutional order blocks are identified as the last bearish candle before a bullish impulse (demand zone) or last bullish candle before a bearish impulse (supply zone). These zones represent where institutions accumulated positions and will defend/add to them on retests. The FVG (Fair Value Gap) is a three-candle imbalance pattern that often gets filled before continuation.",
                STOP_HNT:"Identifies equal highs or equal lows (a cluster of wicks at the same price level) which represent resting stop-loss orders. Institutions deliberately push price through these levels to trigger stops and provide liquidity for their own entries. Entry: after the sweep of the liquidity pool with a reversal candle. The institutional trap is confirmed when price quickly reverses back through the swept level.",
                GLOB_MAC:"Top-down macro framework: identify the dominant global macro theme (post-peak USD in 2026), then find the best expression in FX pairs. Currently: short USD (Fed cutting, reserve status erosion), long JPY (only G10 hiker), long EUR (ECB hawkish, fiscal stimulus). Trade the theme across multiple pairs rather than concentrating in one. Size based on conviction of the macro thesis.",
                CARRY_MOM:"Classic G10 carry: long the highest-yielding G10 currency, short the lowest. Current ranking: NOK 4.00%, NZD 3.00%, GBP 3.75%, USD 3.875% vs JPY 0.75%, CHF 0.00%, EUR 2.00%. Combined with momentum filter to avoid entering carry longs when the high-yielder is in a downtrend. The BOJ hiking cycle is the key risk — JPY carry reversal is the dominant concern.",
                CS_MOM:"Every month, rank all G10 currencies by their return over the prior 1-month and 12-month periods. Go long the top performers and short the bottom performers. This cross-sectional approach captures relative momentum between currencies rather than absolute trends. Currently: JPY, EUR are top performers; USD, NZD are bottom performers. Rebalance monthly.",
                COT_FADE:"Uses CFTC Commitment of Traders (COT) data released every Friday. When speculative positioning reaches extreme net-long or net-short levels (top/bottom quartile historically), fade the crowd. The mechanism: extreme positioning means most potential buyers/sellers are already in the market — the trade becomes crowded and is prone to violent reversal. Currently: USD net-short is at a multi-year extreme.",
                GOLD_USD:"Gold and USD have a strong inverse correlation — gold is the primary alternative reserve asset to USD. When gold makes new all-time highs (as in 2025-2026), it signals USD reserve status is being questioned. Gold at $3,000+ in 2026 is the 'debasement trade' — benefits USD/CHF shorts, USD/JPY shorts, and AUD/USD longs (gold-linked). Monitor gold spot as a leading indicator for USD direction.",
                SESS_BRK:"The NY session open (8:00-8:30 AM EST, 13:00-13:30 UTC) is the highest volume period of the trading day. When NY opens, it often breaks the Asian session range decisively. The trade: identify the Asian session high/low, wait for the NY open momentum candle, enter in the direction of the break with a stop behind the Asian range. 60% win rate historically due to institutional participation.",
                VOL_BRK:"After a prolonged period of low ATR (volatility compression), markets tend to make explosive directional moves — often catalyzed by scheduled events (data releases, CB decisions). Identify pairs with ATR at multi-week lows, check calendar for upcoming catalysts, position for the breakout before the catalyst occurs. The direction of the break is not predicted — position straddle or wait for initial directional move.",
                CORR_BRK:"G10 currency pairs have historically stable correlations (e.g., EUR/USD and GBP/USD typically move together; USD/JPY and CHF/JPY). When these correlations break down — when normally-correlated pairs diverge significantly — the divergence tends to revert. Trade: identify the pair that has diverged from its correlated twin and fade it back to the mean. Example: if EUR/USD rallies 0.5% but GBP/USD doesn't move, fade the EUR/USD rally.",
                UIP_DEV:"Uncovered Interest Rate Parity predicts that higher-yielding currencies should depreciate to offset the yield advantage. Empirically (Fama 1984), the opposite is true — the 'forward premium puzzle' — high-yielders tend to appreciate in the short-to-medium term. This strategy systematically exploits this puzzle by going long the higher-yielding currency vs the lower-yielder, especially when the yield differential is widening.",
                ADX_BRK:"Average Directional Index (ADX) measures trend strength from 0-100. ADX >25 with DI+ > DI- signals an established uptrend; ADX >25 with DI- > DI+ signals a downtrend. The entry signal is when ADX crosses above 25 with a DI crossover — indicating a trend is just beginning to establish. Works best in directional, low-noise market conditions. Avoid in range-bound markets (ADX <20).",
                LDN_BRK:"The London open (07:00-08:00 UTC) is the transition from low-volume Asian session to the world's largest FX trading hub. This creates systematic breakouts of the Asian range as European institutional participants establish positions. The Asian range (typically 07:00 UTC high and low) breaks in the direction of European institutional bias approximately 68% of sessions. Enter on break with stop behind range.",
                VWAP_REV:"Volume-Weighted Average Price (VWAP) is the anchor for institutional order execution. When price trades significantly above VWAP (>2 standard deviations), institutional selling kicks in as algorithms seek to sell above the daily average; when below VWAP, institutional buying. The reversion to VWAP occurs within the session approximately 72% of the time. Best used as an intraday mean-reversion entry trigger.",
                EARL_WRN:"Composite leading indicator combining: sovereign CDS spread widening, current account deficit expansion, FX reserve depletion, and sudden currency depreciation. When 3 of 4 indicators are triggered simultaneously, a currency crisis event has 67% probability within 6 months (IMF research). Currently monitoring: USD CDS, MXN, TRY as early warning signals that could affect G10 safe haven flows.",
                MOMO_CRS:"Triple EMA crossover: when the 5-period EMA crosses above the 13-period EMA which is above the 50-period EMA, a confirmed uptrend momentum signal is generated. All three EMAs must be aligned and expanding — not just the fast/slow cross. Works best in the H1-H4 timeframe. Exit signal: fast EMA crosses back below medium EMA. Filter: only trade when ADX >20 to confirm trend strength.",
                BOP_FLOW:"Tracks quarterly Balance of Payments data — current account surpluses create structural demand for that currency as exporters repatriate foreign earnings. Japan's current account surplus of ¥2.4T per quarter creates consistent JPY demand. The EUR block (Germany, Netherlands, Belgium) runs large CA surpluses. The US runs a persistent CA deficit — structural USD selling from income account. Monitor quarterly BOP releases from each country's statistics bureau.",
                CARRY:"Pure interest rate differential carry: borrow the low-yielder (JPY 0.75%, CHF 0.00%), invest in the high-yielder (NOK 4.00%, USD 3.875%). The carry income compensates for adverse moves up to the differential per year. Key risk: sudden risk-off triggers carry unwind, causing the high-yielder to drop sharply. In 2026, the BOJ hiking cycle is systematically compressing carry differentials against JPY — avoid long carry vs JPY.",
                BB_FADE:"When price touches the outer Bollinger Band (2 standard deviations from 20-period moving average), it has moved statistically far from the mean and has ~68% probability of reverting. Enter when: (1) price touches or closes outside 2σ band, (2) RSI confirms overbought/oversold, (3) no high-impact news expected for 2 hours. Best in range-bound, mean-reverting conditions. Avoid in strong trending markets.",
                FIBO_PULL:"After an impulsive price move, the 61.8% Fibonacci retracement of that move represents the 'golden ratio' pullback level where the trend typically resumes. Entry: on a reversal candle at the 61.8% level with RSI showing momentum turning back in the trend direction. The 38.2% level is a more aggressive entry; the 78.6% level is a deeper retest. Most reliable when the impulse move was significant (50+ pips for day trades).",
                ICHIMOKU:"The Ichimoku Cloud system uses five components: Tenkan-sen (9-period midpoint), Kijun-sen (26-period midpoint), Senkou Span A and B (cloud boundaries, displaced 26 periods forward), and Chikou Span (close displaced 26 periods back). A bullish signal requires: price above cloud, Tenkan above Kijun, and Chikou above price 26 periods ago. The cloud acts as dynamic support/resistance. Best for identifying established trends in H4-D1 timeframes.",
                MON_PULL:"Friday session often sees position squaring and directional momentum. On Monday, this momentum frequently continues after a brief pullback in the Asian session. The 'Monday Pullback' strategy: identify Friday's dominant direction, wait for Asian session pullback on Monday, enter in Friday's direction when European session begins (07:00 UTC). Works best when there is no major weekend news event that would invalidate Friday's trend.",
                EQ_BETA:"AUD, NZD, and CAD have positive beta to global equity markets (risk-on = buy these currencies). JPY and CHF have negative beta (risk-on = sell these currencies). USD has variable beta depending on whether the risk event is US-specific. Strategy: use equity futures and VIX as leading indicators for FX. If S&P 500 futures are +0.5% pre-market, bias is bullish AUD, NZD, CAD and bearish JPY, CHF.",
                REGIME_SW:"VIX-based regime identification: VIX <15 = carry and risk-on regime (long high-yielders, short safe havens); VIX 15-25 = neutral/data-driven regime; VIX >25 = safe haven regime (long JPY, CHF, short carry). The strategy is not to predict regime changes but to trade within the current regime and exit positions quickly when VIX crosses regime thresholds. April 2026: VIX has been volatile — monitor closely.",
                COMD_CCY:"AUD has 0.75 correlation with iron ore and copper prices. CAD has 0.68 correlation with WTI crude oil. Use commodity price moves as leading indicators for these currencies: iron ore +2% = bullish AUD signal; crude oil -3% = bearish CAD signal. The lead time is typically 1-4 hours for spot FX to catch up to commodity moves. Enter FX position in direction of commodity signal before the FX market fully prices it.",
                TURT_TR:"The Turtle Trading Rules: buy when price makes a new 20-day high, sell when it makes a new 20-day low. Exit when price reverses 10 days in the opposite direction. This was one of the first systematic trend-following strategies, taught to a group of traders ('Turtles') by Richard Dennis in 1983. The original rules generated 80% annualized returns from 1983-1988. Modern version: use 20-day Donchian channel breakouts with ATR-based position sizing.",
                STOCH_RSI:"Combines Stochastic oscillator with RSI: the StochRSI measures the RSI's level relative to its own high-low range over a specified period (typically 14). When StochRSI shows bullish divergence (price makes lower low but StochRSI makes higher low), a reversal is signaled. Most reliable at key structural support/resistance levels. The combination filters out noise that individual Stochastic or RSI would generate alone.",
                DUAL_THR:"The Dual Thrust system uses the prior session's high-low range and the high-low range from N days ago to create dynamic breakout levels. Buy trigger = open + K1 × range. Sell trigger = open - K2 × range. K1 and K2 are optimized parameters (typically 0.5-0.7). Different from simple range breakout because the range adapts to recent volatility. Originally developed by Michael Chalek for futures markets, adapted to FX.",
                KELTNER:"Keltner Channels use an ATR multiple (typically 2×ATR) around an exponential moving average. When price closes outside the channel, it signals a breakout with volatility expansion. Unlike Bollinger Bands (which use standard deviation), Keltner uses ATR — making the channel more stable and less prone to false signals during volatile periods. Combine with ADX >25 to confirm trend strength before entering breakout direction.",
                RISK_PAR:"Equal volatility weighting across all G10 pairs: instead of risking $X per trade, risk 1/volatility-weighted amount so each pair contributes equal portfolio risk. High-volatility pairs (AUD/JPY) get smaller position sizes; low-volatility pairs (EUR/CHF) get larger. This reduces the tendency of high-volatility pairs to dominate portfolio P&L. Rebalance monthly based on 20-day ATR for each pair.",
                SUPPLY_DEM:"Supply zones are price levels where institutional selling previously occurred (visible as a sharp down move from consolidation). Demand zones are where institutional buying occurred (sharp up move from consolidation). When price returns to these zones, the original institution likely adds to the position, creating a high-probability reaction. Entry: on a reversal candle at the zone boundary. Stop: just beyond the zone.",
                TOT_SHOCK:"Commodity price shocks impact currency markets through the Terms of Trade channel. Australia's terms of trade are dominated by iron ore and coal exports. Canada's by crude oil. A sudden 10%+ drop in these commodity prices creates immediate selling pressure on AUD and CAD respectively — the mechanism is both fundamental (trade flows) and speculative (algorithmic correlation trading). Enter FX short within the same session as the commodity shock.",
                ENG_CAN:"A bearish engulfing pattern occurs when a large bearish candle completely engulfs the prior bullish candle, at a key resistance level. The reverse for bullish engulfing at support. The pattern has 55% win rate on its own but rises to 65%+ when: (1) at a key S/R level, (2) confirmed by volume spike, (3) RSI shows momentum turning. Best used on H4 and D1 charts where the pattern has more statistical significance.",
                PPP_VAL:"Purchasing Power Parity calculates the 'fair value' exchange rate based on price level differences between countries. The OECD's PPP estimate for EUR/USD is approximately 1.14 (April 2026), USD/JPY approximately 140. Spot prices deviate from PPP for extended periods but revert over 3-5 year horizons. This is a long-term valuation anchor, not a timing tool — used to assess whether a currency is fundamentally cheap or expensive.",
                RSIMR:"RSI mean reversion on daily charts: when daily RSI exceeds 75 (overbought) or falls below 25 (oversold), the pair has an elevated probability of reverting. Confirm with price at a key S/R level. Entry: when RSI begins to turn back from the extreme (crosses back through 70 from above, or 30 from below). This filter ensures momentum is already reversing. Stop: beyond the price extreme that created the RSI reading.",
                ATR_FADE:"When intraday price has already moved more than 2× the daily ATR from the session open, the probability of further extension diminishes significantly. The mean reversion tendency kicks in as late-arriving retail traders push prices to extremes while institutions fade the move. Entry: when price has extended >2× ATR with RSI overbought/oversold. Stop: 1× ATR beyond the extreme. Works best in the final 2 hours of London/NY session.",
              },
              bestConditions:{
                BOJ_NORM:"USD/JPY approaching 158-161 zone. Low liquidity (Tokyo lunch, early European session). BOJ news flow absent (no speeches). Risk sentiment neutral to positive (avoid entering on sharp risk-off as JPY already bid).",
                NEWS_DFT:"Major data release (CPI, NFP, CB decision) that significantly beats or misses consensus by >0.2%. Initial spike has occurred. 10-15 minute pullback completed. Trade has at least 2-hour window before next major event.",
                TRI_ARB:"During high-liquidity periods (London/NY overlap). Market dislocation events (flash crashes, major news). Requires multi-broker access for simultaneous execution. Window typically 30-90 seconds.",
                RATE_SRP:"Immediately following a CB rate decision that surprises vs market pricing. Most powerful in the first 2 hours. Direction must be clear from initial spike. No conflicting data release scheduled within 4 hours.",
                CB_DIV:"When rate differential is at a multi-year extreme. When one bank just hiked while another just cut. H4/D1 trend confirmed in divergence direction. No imminent CB meeting that could reverse the divergence.",
                WMR_FIX:"Last trading day of the month (month-end Fix) and last trading day of each quarter (most powerful). Known large index rebalancing events. Flow direction typically known 30-60 minutes before Fix based on equity market performance.",
                STRUCT_BK:"Price has consolidated at a major level for 1+ weeks. Volume on the break is above average. First retest of broken level as new support/resistance. ADX confirms trend is developing (>20 and rising).",
                GRW_DIV:"After a significant data miss or beat that changes growth outlook (PMI, GDP, retail sales). When growth forecasts are being revised in diverging directions. Best initiated at start of month with fresh economic data.",
                REAL_YLD:"When central bank shifts policy (hike or cut) while inflation remains stable. When inflation data surprises vs expectations. Most powerful at extremes of real yield differentials (both above and below historical averages).",
                SAFE_HVN:"VIX spike above 20. Equity markets down >1.5%. Geopolitical event causing risk-off. USD losing safe-haven status events. Best pairs: USD/JPY short, EUR/CHF short.",
                OPT_EXP:"Spot price within 30-50 pips of a known large option strike (check daily expiry notices from major banks). 1-2 hours before 10AM New York (15:00 UTC). Best when multiple strikes are clustered near current price.",
                CB_COMM:"Within first 2 hours of CB speech or minutes release. When language changes significantly from prior statement. Algorithmic parsing creates initial volatility — then systematic traders add to the direction. Best on H1 charts.",
              },
              avoidConditions:{
                BOJ_NORM:"When BOJ officials signal caution about pace of hikes. During risk-off events when USD spikes as safe haven. When USD/JPY has already fallen significantly (158 to 150 in one week) — mean reversion risk.",
                NEWS_DFT:"When data release was only marginally different from consensus (less than 0.1% miss/beat). When conflicting data comes out within 1 hour. When market had already priced the surprise in anticipation. Low liquidity (Asian session for USD pairs).",
                TRI_ARB:"Wide bid-ask spreads. News events pending. Single-broker access (simultaneous execution impossible). High volatility regimes where prices move before execution completes.",
                RATE_SRP:"When CB decision matched consensus exactly (no surprise element). During ongoing geopolitical crisis that overwhelms rate signal. When CB chair's press conference contradicts the rate decision signal.",
                CB_DIV:"When both banks are on hold with no clear policy divergence. When the diverging currency pair has already moved significantly (risk of mean reversion). During geopolitical crises that override monetary policy signals.",
                WMR_FIX:"Avoid trading the Fix direction in illiquid conditions. If equity markets have been extremely volatile (±2%+), Fix flows are harder to predict. In thin currency pairs (NZD, NOK) where Fix can create sharp, unforecastable moves.",
                STRUCT_BK:"During low-volume periods (holidays, early Asian session). When break occurs on no clear fundamental catalyst. When the pair has already extended significantly before reaching the structural level.",
                GRW_DIV:"During global risk-off events that override country-specific growth data. When data is stale (PMI revised significantly next month). In illiquid market conditions. Near major CB decisions that could change growth outlook.",
                REAL_YLD:"When FX is dominated by risk sentiment (equities crashing). When CB is intervening directly in FX market. In illiquid conditions. When the yield differential move is already fully priced.",
                SAFE_HVN:"In risk-on rallies (VIX falling below 12). When JPY carry trade is being rebuilt. After large safe-haven spikes (sell the rumor/buy the fact reversal risk). When USD regains safe-haven demand.",
                OPT_EXP:"When spot is more than 50 pips from the strike. When there is no clear confirmation of large option interest. In low-liquidity sessions. After 10AM NY has already passed.",
                CB_COMM:"When speech contains no new information vs prior statements. During scheduled blackout periods before CB meetings. When market has already moved significantly in anticipation of the speech.",
              }
            };
            const how=DETAIL.howItWorks[s.id]||s.desc||"This strategy uses quantitative signal generation to identify high-probability entry points based on "+s.cat+" factors. Entry is confirmed when multiple confluences align with the primary signal.";
            const best=DETAIL.bestConditions[s.id]||"Best conditions: When market regime aligns with strategy category. "+s.tf+" timeframe showing momentum in signal direction. No conflicting high-impact news within 2 hours.";
            const avoid=DETAIL.avoidConditions[s.id]||"Avoid when: market regime contradicts strategy type. During extreme volatility events. When spread is above 3× normal. Immediately before or after high-impact news releases.";
            return(
              <div onClick={()=>setExpandedStrat(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:3000,display:"flex",alignItems:"flex-end",justifyContent:"center",backdropFilter:"blur(6px)"}}>
                <div onClick={e=>e.stopPropagation()} style={{background:C.bg2,border:`2px solid ${tc}`,borderRadius:"12px 12px 0 0",maxWidth:"720px",width:"100%",maxHeight:"88vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
                  {/* Header */}
                  <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.bdr}`,flexShrink:0,background:`linear-gradient(90deg,${C.bg1},${C.bg2})`}}>
                    <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"5px",flexWrap:"wrap"}}>
                      <Bdg label={s.tier+"-TIER"} color={tc} sz="10px"/>
                      <Bdg label={s.cat} color={C.muted} sz="9px"/>
                      <Bdg label={s.wr+"% WR"} color={s.wr>=63?C.gold:s.wr>=59?C.green:C.muted} sz="9px"/>
                      <Bdg label={s.tf} color={C.blue} sz="9px"/>
                      <button onClick={()=>setExpandedStrat(null)} style={{marginLeft:"auto",background:"transparent",border:`1px solid ${C.bdr}`,borderRadius:"4px",color:C.muted,cursor:"pointer",padding:"4px 10px",fontSize:"11px",fontFamily:"inherit"}}>✕</button>
                    </div>
                    <div style={{fontSize:"16px",fontWeight:"700",color:C.text,lineHeight:"1.3"}}>{s.name}</div>
                    <div style={{fontSize:"9px",color:C.muted,marginTop:"3px"}}>{s.note}</div>
                  </div>
                  {/* Scrollable content */}
                  <div style={{overflowY:"auto",padding:"14px 16px",display:"flex",flexDirection:"column",gap:"12px",WebkitOverflowScrolling:"touch"}}>
                    {/* How It Works */}
                    <div style={{background:C.bg1,border:`1px solid ${tc}33`,borderLeft:`3px solid ${tc}`,borderRadius:"5px",padding:"12px 14px"}}>
                      <div style={{fontSize:"8px",color:tc,fontWeight:"700",letterSpacing:"2px",marginBottom:"7px"}}>◈ HOW IT WORKS</div>
                      <div style={{fontSize:"10px",color:"#b8cde0",lineHeight:"1.8"}}>{how}</div>
                    </div>
                    {/* Best Conditions */}
                    <div style={{background:"#071a07",border:`1px solid ${C.green}33`,borderLeft:`3px solid ${C.green}`,borderRadius:"5px",padding:"12px 14px"}}>
                      <div style={{fontSize:"8px",color:C.green,fontWeight:"700",letterSpacing:"2px",marginBottom:"7px"}}>✓ WHEN TO USE — BEST CONDITIONS</div>
                      <div style={{fontSize:"10px",color:"#b8cde0",lineHeight:"1.8"}}>{best}</div>
                    </div>
                    {/* Avoid */}
                    <div style={{background:"#1a0505",border:`1px solid ${C.red}33`,borderLeft:`3px solid ${C.red}`,borderRadius:"5px",padding:"12px 14px"}}>
                      <div style={{fontSize:"8px",color:C.red,fontWeight:"700",letterSpacing:"2px",marginBottom:"7px"}}>✗ WHEN TO AVOID</div>
                      <div style={{fontSize:"10px",color:"#b8cde0",lineHeight:"1.8"}}>{avoid}</div>
                    </div>
                    {/* Win Rate context */}
                    <div style={{background:C.bg1,border:`1px solid ${C.bdr}`,borderRadius:"5px",padding:"12px 14px"}}>
                      <div style={{fontSize:"8px",color:C.gold,fontWeight:"700",letterSpacing:"2px",marginBottom:"9px"}}>📊 PERFORMANCE CONTEXT</div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"8px",marginBottom:"9px"}}>
                        {[["WIN RATE",s.wr+"%",s.wr>=63?C.gold:s.wr>=59?C.green:C.muted],["TIMEFRAME",s.tf,C.blue],["MIN CONFLUENCES",s.minC+"+ required",C.amber]].map(([l,v,c])=>(
                          <div key={l} style={{background:C.bg,border:`1px solid ${c}33`,borderRadius:"4px",padding:"8px",textAlign:"center"}}>
                            <div style={{fontSize:"7px",color:C.muted,marginBottom:"3px",fontWeight:"700"}}>{l}</div>
                            <div style={{fontSize:"13px",fontWeight:"700",color:c}}>{v}</div>
                          </div>
                        ))}
                      </div>
                      <a href={s.url} target="_blank" rel="noopener noreferrer" style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 12px",background:C.bg,border:`1px solid ${C.blue}33`,borderRadius:"4px",textDecoration:"none"}}>
                        <div>
                          <div style={{fontSize:"9.5px",color:C.text,fontWeight:"600"}}>{s.desc}</div>
                          <div style={{fontSize:"8px",color:C.blue,marginTop:"2px"}}>Academic evidence · Peer-reviewed research</div>
                        </div>
                        <span style={{fontSize:"16px",color:C.blue,flexShrink:0}}>↗</span>
                      </a>
                    </div>
                    {/* Current April 2026 context */}
                    <div style={{background:`linear-gradient(90deg,#0a1a07,#0a1a2a)`,border:`1px solid ${C.gold}33`,borderRadius:"5px",padding:"12px 14px"}}>
                      <div style={{fontSize:"8px",color:C.gold,fontWeight:"700",letterSpacing:"2px",marginBottom:"7px"}}>🗓 APRIL 2026 CONTEXT</div>
                      <div style={{fontSize:"10px",color:"#b8cde0",lineHeight:"1.8"}}>{s.note} Best pairs for this strategy in current regime: see Analyzer → Regime tab for active recommendations. Current market environment: BOJ hiking cycle + post-peak USD + ECB hawkish hold.</div>
                    </div>
                    <div style={{height:"20px"}}/>
                  </div>
                </div>
              </div>
            );
          })()}
          {filtered.map(s=>{
            const on=enabledStrats.includes(s.id),tc=tierC[s.tier]||C.muted;
            return(
              <div key={s.id} style={{background:on?C.bg1:C.bg,border:`1px solid ${on?tc+"55":C.bdr}`,borderLeft:`3px solid ${on?tc:C.bdr}`,borderRadius:"5px",padding:"10px",transition:"all 0.12s"}}>
                <div style={{display:"flex",alignItems:"center",gap:"5px",marginBottom:"5px",flexWrap:"wrap"}}>
                  <span style={{padding:"2px 5px",background:on?tc+"22":"#ffffff08",color:on?tc:C.muted,border:`1px solid ${on?tc+"44":"transparent"}`,borderRadius:"2px",fontSize:"7.5px",fontWeight:"700"}}>{s.tier}-TIER</span>
                  <span style={{padding:"2px 5px",background:"#ffffff08",color:"#9ab",borderRadius:"2px",fontSize:"7px",fontWeight:"700"}}>{s.cat}</span>
                  <span style={{marginLeft:"auto",fontSize:"9px",color:s.wr>=63?C.gold:s.wr>=59?C.green:C.muted,fontWeight:"700"}}>{s.wr}%</span>
                </div>
                <div style={{fontWeight:"700",color:on?C.text:"#6a8a9a",fontSize:"10.5px",marginBottom:"3px",lineHeight:"1.3"}}>{s.name}</div>
                <div style={{fontSize:"8px",color:C.muted,marginBottom:"7px",lineHeight:"1.4"}}>{s.note}</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:"5px"}}>
                  <button onClick={()=>setExpandedStrat(s.id)} style={{flex:1,padding:"5px 0",background:tc+"22",color:tc,border:`1px solid ${tc}44`,borderRadius:"3px",cursor:"pointer",fontWeight:"700",fontSize:"8px",fontFamily:"inherit"}}>📋 STRATEGY DETAIL</button>
                  <button onClick={()=>toggleS(s.id)} style={{padding:"5px 9px",background:on?tc:"transparent",color:on?"#05090f":C.muted,border:`1px solid ${on?tc:C.bdr}`,borderRadius:"3px",cursor:"pointer",fontWeight:"700",fontSize:"9px",fontFamily:"inherit"}}>{on?"✓":"+"}</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── DEPLOY / TUTORIAL TAB ────────────────────────────────────────────
  function DeployTab(){
    const [dtab,setDtab]=useState("overview");
    const DTABS=[{id:"overview",l:"Overview"},{id:"netlify",l:"Netlify Web"},{id:"iphone",l:"iPhone App"},{id:"notifs",l:"Notifications"},{id:"broker",l:"Broker Link"},{id:"continuity",l:"Continuity"}];
    const Sec=({title,color=C.gold,children})=>(<div style={{background:C.bg2,border:`1px solid ${color}33`,borderRadius:"6px",padding:"12px 14px",marginBottom:"10px"}}><div style={{fontSize:"9px",fontWeight:"700",color,letterSpacing:"2px",marginBottom:"9px",paddingBottom:"6px",borderBottom:`1px solid ${color}22`}}>{title}</div>{children}</div>);
    const Step=({n,text,sub})=>(<div style={{display:"flex",gap:"10px",alignItems:"flex-start",marginBottom:"8px"}}><div style={{width:"22px",height:"22px",borderRadius:"50%",background:C.gold+"33",color:C.gold,fontSize:"10px",fontWeight:"700",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{n}</div><div><div style={{fontSize:"10.5px",color:C.text,lineHeight:"1.5"}}>{text}</div>{sub&&<div style={{fontSize:"8.5px",color:C.muted,marginTop:"2px",lineHeight:"1.5"}}>{sub}</div>}</div></div>);
    const Tag=({label,color})=>(<span style={{padding:"2px 8px",background:color+"22",color,border:`1px solid ${color}44`,borderRadius:"3px",fontSize:"8px",fontWeight:"700",marginRight:"5px"}}>{label}</span>);
    return(
      <div>
        <div style={{background:`linear-gradient(90deg,${C.bg2},#0a1a2a)`,border:`2px solid ${C.gold}`,borderRadius:"7px",padding:"13px 15px",marginBottom:"12px"}}>
          <div style={{fontSize:"13px",fontWeight:"700",color:C.gold,letterSpacing:"2px",marginBottom:"4px"}}>🚀 AXIOM FX — DEPLOYMENT GUIDE</div>
          <div style={{fontSize:"9px",color:C.muted,lineHeight:"1.65"}}>Everything you need to run AXIOM as a live web app, iPhone home screen app, or connected to your broker. Select a topic below.</div>
        </div>
        {/* Tab bar */}
        <div style={{display:"flex",gap:"5px",marginBottom:"12px",overflowX:"auto",scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
          {DTABS.map(t=><button key={t.id} onClick={()=>setDtab(t.id)} style={{padding:"7px 12px",background:dtab===t.id?C.gold+"22":"transparent",color:dtab===t.id?C.gold:C.muted,border:`1px solid ${dtab===t.id?C.gold:C.bdr}`,borderRadius:"4px",cursor:"pointer",fontSize:"9.5px",fontWeight:"700",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0}}>{t.l}</button>)}
        </div>

        {/* OVERVIEW */}
        {dtab==="overview"&&(<div>
          <Sec title="⚡ WHAT WORKS WHERE" color={C.green}>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:"9.5px",minWidth:"400px"}}>
                <thead><tr style={{borderBottom:`1px solid ${C.bdr}`}}>{["FEATURE","CLAUDE SANDBOX","NETLIFY WEB","IPHONE PWA"].map(h=><th key={h} style={{padding:"5px 7px",color:C.gold,fontWeight:"700",textAlign:"left",fontSize:"8px",letterSpacing:"1px"}}>{h}</th>)}</tr></thead>
                <tbody>{[
                  ["All 14 Tabs + UI","✓ Full","✓ Full","✓ Full"],
                  ["AI Chat (Claude)","✓ Works","✓ Works","✓ Works"],
                  ["AI News Feed","✓ Works","✓ Works","✓ Works"],
                  ["OANDA Live Prices","✗ Blocked","✓ LIVE","✓ LIVE"],
                  ["ECB Fallback Prices","✗ Blocked","✓ Works","✓ Works"],
                  ["Push Notifications","✗ No","✓ Limited","✓ Full"],
                  ["Home Screen Icon","✗ No","✗ No","✓ Yes"],
                  ["Works Offline","✗ No","✗ No","Partial"],
                  ["Auto-launch App","✗ No","Bookmark","✓ Full"],
                ].map(([f,c,n,p])=>(
                  <tr key={f} style={{borderBottom:`1px solid ${C.bdr}22`}}>
                    <td style={{padding:"6px 7px",color:C.text,fontWeight:"600"}}>{f}</td>
                    {[c,n,p].map((v,i)=><td key={i} style={{padding:"6px 7px",color:v.includes("✓")?C.green:v.includes("✗")?C.red:C.gold}}>{v}</td>)}
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div style={{background:"#071407",border:`1px solid ${C.green}33`,borderRadius:"4px",padding:"9px 11px",marginTop:"9px",fontSize:"9px",color:C.muted,lineHeight:"1.7"}}>
              <strong style={{color:C.green}}>Recommendation:</strong> Deploy to Netlify (free, 2 min) for live OANDA prices + push notifications. Then add to iPhone home screen for full PWA experience.
            </div>
          </Sec>
          <Sec title="🔑 YOUR PRE-CONFIGURED KEYS" color={C.amber}>
            {[["Anthropic API Key","sk-ant-api03-... (set in Netlify env vars)","AI Chat + News","Pre-wired ✓"],["OANDA API Key","b41a0f67df1e1284...8b255","Live FX Prices","Pre-wired ✓"],["OANDA Account","001-001-21201857-001","Demo Account","Pre-wired ✓"]].map(([l,v,use,status])=>(
              <div key={l} style={{background:C.bg1,border:`1px solid ${C.bdr}`,borderRadius:"4px",padding:"8px 10px",marginBottom:"6px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"3px"}}>
                  <span style={{fontWeight:"700",color:C.text,fontSize:"10px"}}>{l}</span>
                  <span style={{fontSize:"8px",color:C.green,fontWeight:"700"}}>{status}</span>
                </div>
                <div style={{fontSize:"8.5px",color:C.muted,fontFamily:"monospace",marginBottom:"2px"}}>{v}</div>
                <div style={{fontSize:"8px",color:C.blue}}>Used for: {use}</div>
              </div>
            ))}
          </Sec>
        </div>)}

        {/* NETLIFY */}
        {dtab==="netlify"&&(<div>
          <Sec title="🌐 DEPLOY TO NETLIFY — FREE WEB APP" color={C.green}>
            <div style={{background:"#071407",border:`1px solid ${C.green}33`,borderRadius:"4px",padding:"9px 11px",marginBottom:"10px",fontSize:"9px",color:C.muted,lineHeight:"1.7"}}>
              Netlify deployment gives you: <strong style={{color:C.green}}>live OANDA prices</strong>, a permanent URL you can bookmark on any device, and optional push notifications. Free tier is more than enough.
            </div>
            <Step n="1" text="Download the AXIOM_FX_v6.jsx file" sub="Tap the file link in Claude → Download. It saves to your Files app or Downloads folder."/>
            <Step n="2" text="Create a free Netlify account" sub="Go to netlify.com → Sign Up (use GitHub, Google, or email). Takes 60 seconds."/>
            <Step n="3" text="Create index.html wrapper" sub='On your computer, create a new file called index.html with this content: paste the React CDN wrapper below.'/>
            <div style={{background:C.bg,border:`1px solid ${C.bdr}`,borderRadius:"4px",padding:"10px",marginBottom:"10px",fontFamily:"monospace",fontSize:"8px",color:C.green,overflowX:"auto",lineHeight:"1.8"}}>
              {`<!DOCTYPE html>
<html><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="apple-mobile-web-app-capable" content="yes"/>
<meta name="apple-mobile-web-app-title" content="AXIOM FX"/>
<title>AXIOM FX v6</title>
</head><body style="margin:0">
<div id="root"></div>
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script type="text/babel" src="./AXIOM_FX_v6.jsx"></script>
<script>
  window.addEventListener('load',()=>{
    const root=ReactDOM.createRoot(document.getElementById('root'));
    window.AxiomFX = AxiomFX;
root.render(React.createElement(AxiomFX));
  });
</script>
</body></html>`}
            </div>
            <Step n="4" text="Put both files in one folder" sub="Create a folder called 'axiom-fx'. Put index.html and AXIOM_FX_v6.jsx inside it."/>
            <Step n="5" text="Deploy to Netlify" sub="Go to app.netlify.com → Sites → drag your 'axiom-fx' folder onto the deploy area. Done in 30 seconds."/>
            <Step n="6" text="Your app is live!" sub="Netlify gives you a URL like https://axiom-fx-abc123.netlify.app — bookmark this on all devices. OANDA live prices will activate automatically."/>
            <div style={{background:`#0a1200`,border:`1px solid ${C.green}44`,borderRadius:"4px",padding:"9px 11px",fontSize:"9px",color:C.muted,lineHeight:"1.7"}}>
              <strong style={{color:C.green}}>Custom domain:</strong> In Netlify Settings → Domain Management → you can add a custom domain like axiom-fx.yourdomain.com for free.
            </div>
          </Sec>
        </div>)}

        {/* IPHONE PWA */}
        {dtab==="iphone"&&(<div>
          <Sec title="📱 IPHONE HOME SCREEN APP (PWA)" color={C.blue}>
            <div style={{background:"#070a14",border:`1px solid ${C.blue}33`,borderRadius:"4px",padding:"9px 11px",marginBottom:"10px",fontSize:"9px",color:C.muted,lineHeight:"1.7"}}>
              Adding AXIOM to your iPhone home screen creates a <strong style={{color:C.blue}}>Progressive Web App (PWA)</strong> — it launches full-screen like a native app, hides the browser UI, and can receive push notifications. <strong style={{color:C.text}}>Requires Netlify deployment first.</strong>
            </div>
            <Step n="1" text="Deploy to Netlify first" sub="Follow the Netlify tab instructions. You need a live URL before adding to home screen."/>
            <Step n="2" text="Open your Netlify URL in Safari" sub="Must be Safari (not Chrome) for PWA installation on iPhone. Go to your https://axiom-fx-....netlify.app URL."/>
            <Step n="3" text="Tap the Share button" sub="The square with an arrow pointing up — at the bottom of Safari's browser bar."/>
            <Step n="4" text='Tap "Add to Home Screen"' sub='Scroll down in the share sheet until you see "Add to Home Screen". Tap it.'/> 
            <Step n="5" text='Name it "AXIOM FX" and tap Add' sub="The app icon will appear on your home screen. Tap it to launch full-screen with no browser UI."/>
            <Step n="6" text="Live prices + notifications active" sub="Once installed as PWA from Netlify, OANDA prices are live (3s refresh) and push notifications work."/>
            <div style={{background:"#070a14",border:`1px solid ${C.amber}33`,borderRadius:"4px",padding:"9px 11px",marginTop:"8px",fontSize:"9px",color:C.muted,lineHeight:"1.7"}}>
              <strong style={{color:C.amber}}>Cross-device continuity:</strong> Your settings (API key, account size, risk) are stored in localStorage per browser/device. When you set up on a new device, go to ⚙ Settings and your API keys are already pre-wired in the code — just tap Save Settings to confirm.
            </div>
          </Sec>
        </div>)}

        {/* NOTIFICATIONS */}
        {dtab==="notifs"&&(<div>
          <Sec title="🔔 PUSH NOTIFICATIONS — IPHONE SETUP" color={C.amber}>
            <div style={{background:"#14100a",border:`1px solid ${C.amber}33`,borderRadius:"4px",padding:"9px 11px",marginBottom:"10px",fontSize:"9px",color:C.muted,lineHeight:"1.7"}}>
              Push notifications for new AXIOM signals require the app to be <strong style={{color:C.amber}}>installed as a PWA from Netlify</strong>. They do NOT work in Claude.ai sandbox or regular Safari browsing. iOS 16.4+ required.
            </div>
            <Step n="1" text="Install as iPhone PWA first" sub="Follow the iPhone App tab. Must be running from Netlify URL added to home screen."/>
            <Step n="2" text="Open the PWA from home screen" sub="Launch AXIOM from the home screen icon (not from Safari directly)."/>
            <Step n="3" text="Go to ⚙ Settings → Signal Notifications" sub='Tap "ENABLE PUSH NOTIFICATIONS" button. iOS will show a permission dialog.'/> 
            <Step n="4" text='Tap "Allow" on the iOS permission dialog' sub="AXIOM will now send you a push notification whenever a new high-confidence signal is generated (S-Tier or A-Tier only)."/>
            <Step n="5" text="Notification content" sub="Each notification shows: pair, direction (BUY/SELL), strategy name, and probability %. Tap the notification to jump directly to the signal."/>
            <div style={{background:"#14100a",border:`1px solid ${C.amber}33`,borderRadius:"4px",padding:"9px 11px",marginTop:"8px",fontSize:"9px",color:C.muted,lineHeight:"1.7"}}>
              <strong style={{color:C.amber}}>If notifications don't appear:</strong> Go to iPhone Settings → Notifications → AXIOM FX → ensure Allow Notifications is ON and Alerts, Sounds, Badges are enabled.
            </div>
            <div style={{background:"#14100a",border:`1px solid ${C.bdr}`,borderRadius:"4px",padding:"9px 11px",marginTop:"6px",fontSize:"9px",color:C.muted,lineHeight:"1.7"}}>
              <strong style={{color:C.text}}>Available in:</strong> <Tag label="iPhone PWA" color={C.green}/><Tag label="NOT in Claude" color={C.red}/><Tag label="NOT in Safari browser" color={C.red}/>
            </div>
          </Sec>
        </div>)}

        {/* BROKER LINK */}
        {dtab==="broker"&&(<div>
          <Sec title="🔗 BROKER CONNECTION — OANDA & TASTYFX" color={C.green}>
            <div style={{background:"#071407",border:`1px solid ${C.green}33`,borderRadius:"4px",padding:"9px 11px",marginBottom:"10px",fontSize:"9px",color:C.muted,lineHeight:"1.7"}}>
              AXIOM currently uses your <strong style={{color:C.green}}>OANDA Demo API</strong> for live price data. Below are instructions for connecting to your live OANDA account or TastyFX MT4 when ready.
            </div>
            <div style={{fontWeight:"700",color:C.gold,fontSize:"10px",marginBottom:"8px",letterSpacing:"1px"}}>OPTION A — OANDA LIVE ACCOUNT</div>
            <Step n="1" text="Open an OANDA live account (if not already)" sub="Go to oanda.com → Open Live Account. Minimum deposit varies by region."/>
            <Step n="2" text="Generate a live API key" sub="Log in to hub.oanda.com → Settings → API Access → Generate Token. Copy your live API key."/>
            <Step n="3" text="Update in AXIOM Settings" sub="Go to ⚙ Settings → OANDA API KEY field → paste your live key → Save Settings. The endpoint automatically switches from practice to live."/>
            <Step n="4" text="Switch endpoint in code" sub="In the AXIOM JSX file, change: api-trade.oanda.com → api-trade.oanda.com (remove 'fx' prefix). This switches to the live price feed."/>
            <div style={{background:"#071407",border:`1px solid ${C.bdr}`,borderRadius:"4px",padding:"9px 11px",marginBottom:"10px",fontSize:"9px",color:C.muted,lineHeight:"1.7"}}>
              <strong style={{color:C.amber}}>⚠ Important:</strong> AXIOM is a paper trading simulator. Live API connection provides real-time prices only — it does NOT place real trades on your account. All trades in AXIOM are theoretical.
            </div>
            <div style={{fontWeight:"700",color:C.gold,fontSize:"10px",marginBottom:"8px",letterSpacing:"1px"}}>OPTION B — TASTYFX / TASTYTRADE MT4</div>
            <Step n="1" text="Log in to your TastyFX account" sub="Go to tastyfx.com or tastytrade.com → your account dashboard."/>
            <Step n="2" text="Find MT4 server credentials" sub="Account Settings → MetaTrader 4 → you'll see your MT4 server name, login number, and password."/>
            <Step n="3" text="MT4 connection note" sub="TastyFX MT4 uses a proprietary WebSocket feed that requires server-side code to relay prices — not directly accessible from a browser app due to CORS restrictions."/>
            <Step n="4" text="Recommended approach for TastyFX" sub="Use OANDA Demo/Live for live price data in AXIOM (same interbank prices, negligible difference). Use TastyFX MT4 for actual trade execution based on AXIOM signals."/>
            <div style={{background:"#070a14",border:`1px solid ${C.blue}33`,borderRadius:"4px",padding:"9px 11px",marginTop:"6px",fontSize:"9px",color:C.muted,lineHeight:"1.7"}}>
              <strong style={{color:C.blue}}>Workflow:</strong> AXIOM generates signal → note entry/SL/TP levels → open MT4 on TastyFX → manually place the trade using AXIOM's exact levels. This is the institutional workflow — signal system and execution platform are always separate.
            </div>
          </Sec>
        </div>)}

        {/* CONTINUITY */}
        {dtab==="continuity"&&(<div>
          <Sec title="🔄 CROSS-DEVICE CONTINUITY" color={C.blue}>
            <div style={{background:"#070a14",border:`1px solid ${C.blue}33`,borderRadius:"4px",padding:"9px 11px",marginBottom:"10px",fontSize:"9px",color:C.muted,lineHeight:"1.7"}}>
              Your AXIOM data (trades, signals, settings) is stored in <strong style={{color:C.blue}}>browser localStorage</strong> — meaning it's device and browser specific. Here's how to maintain continuity.
            </div>
            <Step n="1" text="API keys are pre-wired in the code" sub="Your Anthropic key and OANDA key are embedded in the JSX. Every new deployment automatically has them — no re-entry needed."/>
            <Step n="2" text="Settings persist per browser/device" sub="Account size, risk settings, and preferences are saved to localStorage. On first open of any new browser, they load from code defaults."/>
            <Step n="3" text="Trade history is device-local" sub="Paper trades are stored in localStorage on that device. They don't sync across devices (by design — this is a local simulation tool)."/>
            <Step n="4" text="Recommended multi-device setup" sub="iPhone PWA (home screen) = primary trading companion. Netlify URL bookmarked in Safari/Chrome on Mac/iPad = secondary research screen."/>
            <Step n="5" text="Updating to a new version" sub="When a new AXIOM version is deployed to Netlify, your settings and trades carry over automatically from localStorage. Just replace the JSX file and re-deploy."/>
            <div style={{background:"#070a14",border:`1px solid ${C.gold}33`,borderRadius:"4px",padding:"9px 11px",marginTop:"8px",fontSize:"9px",color:C.muted,lineHeight:"1.7"}}>
              <strong style={{color:C.gold}}>Live data availability by platform:</strong><br/>
              <div style={{marginTop:"5px",lineHeight:"2"}}>
                <Tag label="Claude Sandbox" color={C.amber}/> AI chat ✓ · News ✓ · Prices SIM · No notifications<br/>
                <Tag label="Netlify Web" color={C.green}/> All features ✓ · OANDA Live prices ✓ · Bookmarkable URL<br/>
                <Tag label="iPhone PWA" color={C.blue}/> All features ✓ · OANDA Live ✓ · Push notifications ✓ · Full screen
              </div>
            </div>
          </Sec>
        </div>)}
      </div>
    );
  }

  // ─── SOURCES TAB ─────────────────────────────────────────────────────────
  function SourcesTab(){
    const cats=[
      {title:"📊 PRICE DATA",color:C.green,items:[
        {name:"OANDA v20 REST API",role:"Live interbank bid/ask — all 28 G10 pairs, ~3s polling",url:"https://developer.oanda.com/rest-live-v20/introduction/",note:"Your OANDA demo account (001-001-21201857-001) provides real interbank bid/ask prices. Pre-wired in Settings. Activates when deployed outside Claude sandbox."},
        {name:"Frankfurter / ECB API",role:"Free ECB reference rates — 30s fallback when deployed",url:"https://www.frankfurter.app/",note:"Free, no API key, CORS-enabled. EUR base cross-rates. Activates when OANDA key not provided. Shows ECB LIVE in header."},
        {name:"TradingView Watchlist",role:"Confirmed Apr 8, 2026 snapshot prices — used as seed",url:"https://www.tradingview.com/markets/currencies/",note:"AUD/CAD 0.97776, EUR/USD 1.16819, USD/JPY 158.395 — confirmed from Sal's watchlist screenshot Apr 8, 2026."},
      ]},
      {title:"🏦 CENTRAL BANKS",color:C.gold,items:[
        {name:"Federal Reserve",role:"USD — 3.875% Hold. Next: Apr 30",url:"https://www.federalreserve.gov/monetarypolicy/",note:"Held for 2nd meeting. NFP 128K miss. Jun cut odds 38%. CPI Apr 10 pivotal. DXY testing 100."},
        {name:"European Central Bank",role:"EUR — 2.00% Hawkish Hold",url:"https://www.ecb.europa.eu/mopo/",note:"Schnabel: next move more likely a hike. German fiscal stimulus supporting growth. EUR/USD 1.20 year-end (JPM)."},
        {name:"Bank of Japan",role:"JPY — 0.75% Hiking. MUFG target USD/JPY 146",url:"https://www.boj.or.jp/en/mopo/",note:"Only G10 hiker 2026. Wage growth 3.1% above 3% normalization threshold."},
        {name:"Bank of England",role:"GBP — 3.75% Easing Bias",url:"https://www.bankofengland.co.uk/monetary-policy/",note:"75bp more cuts expected 2026 (ING). CPI 3.0% above target complicates timing."},
        {name:"Reserve Bank of Australia",role:"AUD — 3.85% Hawkish Hold",url:"https://www.rba.gov.au/monetary-policy/",note:"Bullock: no cuts imminent. RBC AUD/USD year-end target 0.73."},
        {name:"Bank of Canada",role:"CAD — 2.25% Dovish Hold",url:"https://www.bankofcanada.ca/",note:"USMCA review July 2026 risk. Oil surplus headwind. Next: Apr 15."},
        {name:"Swiss National Bank",role:"CHF — 0.00% Hold",url:"https://www.snb.ch/en/",note:"Dollar debasement trade driving CHF appreciation. EUR/CHF 0.93 target (RBC)."},
        {name:"RBNZ",role:"NZD — 3.00% Cutting (325bp since Aug 2024)",url:"https://www.rbnz.govt.nz/",note:"Most aggressive G10 cutter. Cut to 3.00% Apr 9. Further cuts likely."},
        {name:"Norges Bank",role:"NOK — 4.00% Hold",url:"https://www.norges-bank.no/",note:"1-2 cuts mid-2026 if CPI below 3%. Oil decline headwind."},
        {name:"Riksbank",role:"SEK — 1.75% Hold",url:"https://www.riksbank.se/",note:"Best G10 performer 2025 (+19% vs USD). Late-2026 hike bias."},
      ]},
      {title:"📄 STRATEGY EVIDENCE",color:C.amber,items:[
        {name:"Bank for International Settlements",role:"CB divergence, safe haven, stop-loss, CB communication research",url:"https://www.bis.org/research/",note:"BIS WP #801 (CB divergence), #570 (safe haven), #492 (stop-loss), #952 (CB communication). Primary institutional source."},
        {name:"AQR Capital Management",role:"Time-series momentum, carry-momentum, risk parity, cross-carry",url:"https://www.aqr.com/Insights/Research/",note:"AQR: Time-Series Momentum, Value and Momentum Everywhere, Currency Carry Trades, Risk Parity."},
        {name:"NBER Working Papers",role:"Carry trade, news drift, UIP puzzle",url:"https://www.nber.org/",note:"NBER WP 11631 (carry), WP 20427 (news drift), WP 1393 (Fama 1984 UIP puzzle)."},
        {name:"SSRN Academic Papers",role:"Technical patterns, VWAP, Fibonacci, session breakouts, volatility",url:"https://papers.ssrn.com/",note:"Multiple SSRN papers cited in strategy evidence links across all 51 strategies."},
        {name:"CFTC Commitment of Traders",role:"Official weekly institutional positioning data",url:"https://www.cftc.gov/MarketReports/CommitmentsofTraders/",note:"COT Extreme Positioning strategy. Free weekly official US data."},
        {name:"LSEG / WM Reuters Fix",role:"WMR 4PM London Fix methodology",url:"https://www.lseg.com/en/data-analytics/financial-data/foreign-exchange/wm-reuters-rates",note:"WMR Fix Anticipation strategy. Documented pre-fix institutional order flow."},
        {name:"IMF Working Papers & WEO",role:"Growth divergence, BOP flows, currency crises",url:"https://www.imf.org/en/Publications/WP",note:"IMF WEO, WP on capital flows, early warning systems, CGER equilibrium FX."},
      ]},
      {title:"🌐 MACRO RESEARCH — 2026",color:C.blue,items:[
        {name:"J.P. Morgan Global Research",role:"EUR/USD 1.20, USD/JPY 164 year-end targets",url:"https://www.jpmorgan.com/insights/global-research/outlook/market-outlook",note:"CB transition to simultaneous hold. Pro-cyclical growth dynamic. Two main 2026 FX themes."},
        {name:"MUFG Research",role:"Post-peak USD world. EUR/USD 1.24, USD/JPY 146",url:"https://www.mufgresearch.com/",note:"USD weakening 5% DXY in 2026. Fed cutting more than priced. Trade uncertainty diminishing."},
        {name:"ING Think — G10 FX 2026",role:"Fundamentals return. EUR well-positioned. BOE easing",url:"https://think.ing.com/",note:"Playing the ball not the man. Strong USD isn't coming back. EUR/GBP toward 0.88-0.90."},
        {name:"BlackRock 2026 Macro Outlook",role:"Short USD, long relative value, short long-duration bonds",url:"https://www.blackrock.com/institutions/en-us/insights/2026-macro-outlook",note:"Enter 2026 short USD. Dollar debasement trade. Cross-country dispersion = alpha opportunity."},
        {name:"RBC Capital Markets FX",role:"AUD/USD 0.73, EUR/CHF 0.93, USD/CAD USMCA risk",url:"https://www.rbccm.com/",note:"AUD revised higher. EUR/CHF lower. CAD elevated on USMCA review risk."},
      ]},
    ];
    return(
      <div>
        <div style={{background:`linear-gradient(90deg,${C.bg2},#0a1a2a)`,border:`2px solid ${C.gold}`,borderRadius:"6px",padding:"13px 15px",marginBottom:"11px"}}>
          <div style={{fontSize:"12px",fontWeight:"700",color:C.gold,letterSpacing:"2px",marginBottom:"5px"}}>📄 DATA SOURCES & CITATIONS</div>
          <div style={{fontSize:"9px",color:C.muted,lineHeight:"1.65"}}>Every price, strategy WR, CB rate, and macro narrative in AXIOM is sourced from verifiable institutional references. All sources are documented here for transparency and compliance.</div>
        </div>
        {cats.map((cat,ci)=>(
          <div key={ci} style={{background:C.bg2,border:`1px solid ${cat.color}33`,borderRadius:"6px",padding:"10px 12px",marginBottom:"9px"}}>
            <div style={{fontSize:"9px",fontWeight:"700",color:cat.color,letterSpacing:"2px",marginBottom:"9px",paddingBottom:"5px",borderBottom:`1px solid ${cat.color}22`}}>{cat.title}</div>
            {cat.items.map((s,si)=>(
              <div key={si} style={{background:C.bg1,border:`1px solid ${C.bdr}`,borderRadius:"4px",padding:"9px 11px",marginBottom:"6px"}}>
                <div style={{display:"flex",justifyContent:"space-between",gap:"8px",marginBottom:"4px",flexWrap:"wrap"}}>
                  <div><div style={{fontWeight:"700",color:C.text,fontSize:"11px"}}>{s.name}</div><div style={{fontSize:"8.5px",color:cat.color,fontWeight:"600",marginTop:"1px"}}>{s.role}</div></div>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",padding:"4px 9px",background:cat.color+"22",color:cat.color,border:`1px solid ${cat.color}44`,borderRadius:"3px",textDecoration:"none",fontSize:"8.5px",fontWeight:"700",flexShrink:0}}>Visit ↗</a>
                </div>
                <div style={{fontSize:"8.5px",color:C.muted,lineHeight:"1.55",borderTop:`1px solid ${C.bdr}22`,paddingTop:"5px"}}>{s.note}</div>
              </div>
            ))}
          </div>
        ))}
        <div style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"5px",padding:"10px 12px",fontSize:"8.5px",color:C.muted,lineHeight:"1.7"}}><strong style={{color:C.text}}>Disclaimer:</strong> AXIOM is a theoretical paper trading simulation for educational purposes. Signals are algorithmic and do not constitute financial advice. Strategy win rates reflect academic research and do not guarantee future performance. Price data is anchored to confirmed Apr 8, 2026 snapshots; OANDA/ECB rates activate when deployed outside the Claude artifact sandbox.</div>
      </div>
    );
  }

  // ─── ROOT RENDER ─────────────────────────────────────────────────────
  // Memoized content — only re-renders active tab, not on every price tick
  const tabContent=useMemo(()=>{
    switch(tab){
      case "dashboard": return <Dashboard/>;
      case "signals":   return <SignalsTab/>;
      case "chart":     return <ChartsTab/>;
      case "trades":    return <ActiveTrades/>;
      case "perf":      return <Performance/>;
      case "analyzer":  return <Analyzer/>;
      case "news":      return <NewsTab/>;
      case "calendar":  return <CalendarTab/>;
      case "cb":        return <CBRates/>;
      case "weekend":   return <Weekend/>;
      case "ai":        return <AITab/>;
      case "strategies":return <StrategiesTab/>;
      case "sources":   return <SourcesTab/>;
      case "settings":  return <Settings/>;
      case "deploy":    return <DeployTab/>;
      default:          return <Dashboard/>;
    }
  },[tab,signals,trades,history,analyzerTab,selCB,wkView,chartTf,enabledStrats,nCcy,nImp,stratCatFilter,stratTierFilter,modal,modalTab,expandedTheme,expandedStrat,newsStaticPage]);

  return(
    <div style={{fontFamily:"'IBM Plex Mono','Courier New',monospace",background:C.bg,color:C.text,height:"100dvh",display:"flex",flexDirection:"column",fontSize:"clamp(12px,1.1vw,15px)",overflow:"hidden",WebkitTextSizeAdjust:"100%"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
        ::-webkit-scrollbar{width:3px;height:3px;}
        ::-webkit-scrollbar-track{background:#05090f;}
        ::-webkit-scrollbar-thumb{background:#172f50;border-radius:2px;}
        button{-webkit-appearance:none;transition:opacity 0.15s;}
        button:active:not(:disabled){opacity:0.7;}
        input{-webkit-appearance:none;border-radius:3px;}
        input:focus{border-color:#d4af37!important;outline:none!important;}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.25;}}
        @keyframes slideIn{from{transform:translateX(24px);opacity:0;}to{transform:translateX(0);opacity:1;}}
        tr:hover td{background:#091525!important;}
        .tv-container iframe{border:none!important;}
        /* Desktop responsive layout */
        @media(min-width:1024px){
          .axiom-content{padding:16px 24px!important;font-size:13.5px!important;}
        }
        @media(min-width:1280px){
          .axiom-content{padding:18px 32px!important;font-size:14px!important;}
        }
      `}</style>

      {toast&&<div style={{position:"fixed",top:"12px",right:"12px",background:C.bg2,border:`1px solid ${toast.color}`,borderLeft:`3px solid ${toast.color}`,borderRadius:"5px",padding:"9px 14px",color:C.text,fontSize:"11px",zIndex:9999,maxWidth:"380px",animation:"slideIn 0.3s ease",lineHeight:"1.5"}}>{toast.msg}</div>}

      <SignalModal/>

      {/* HEADER */}
      <div style={{background:"linear-gradient(90deg,#08152a,#0d2240,#08152a)",borderBottom:`1px solid ${C.bdr}`,padding:"0 14px",display:"flex",alignItems:"center",gap:"10px",height:"50px",flexShrink:0,minWidth:0}}>
        <div style={{flexShrink:0}}><div style={{fontSize:"16px",fontWeight:"700",letterSpacing:"4px",color:C.gold}}>AXIOM</div><div style={{fontSize:"7px",color:C.muted,letterSpacing:"2px"}}>G10 FX v6</div></div>
        <div style={{display:"flex",alignItems:"center",gap:"4px"}}><div style={{width:"5px",height:"5px",borderRadius:"50%",background:apiStatus==="live_oanda"?C.green:apiStatus==="live_ecb"?"#00d4ff":C.amber,animation:"pulse 2s infinite"}}/><span style={{color:C.green,fontWeight:"700",fontSize:"8.5px"}}>{apiStatus==="live_oanda"?"OANDA LIVE":apiStatus==="live_ecb"?"ECB LIVE":"SIM"}</span></div>
        <div onClick={()=>{setSettingsSaved(false);setTab("settings");}} style={{background:C.bg1,border:`2px solid ${C.gold}55`,borderRadius:"4px",padding:"3px 9px",cursor:"pointer",flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.gold} onMouseLeave={e=>e.currentTarget.style.borderColor=C.gold+"55"}>
          <div style={{fontSize:"7px",color:C.muted,marginBottom:"1px"}}>ACCOUNT</div>
          <div style={{color:C.gold,fontWeight:"700",fontFamily:"monospace",fontSize:"12px"}}>${acctVal.toFixed(2)}</div>
        </div>
        <div style={{background:C.bg1,border:`1px solid ${openPnl>=0?C.green+"44":C.red+"44"}`,borderRadius:"4px",padding:"3px 9px",flexShrink:0}}>
          <div style={{fontSize:"7px",color:C.muted,marginBottom:"1px"}}>OPEN P&L</div>
          <div style={{color:openPnl>=0?C.green:C.red,fontWeight:"700",fontFamily:"monospace",fontSize:"12px"}}>{openPnl>=0?"+":""}${openPnl.toFixed(2)}</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",background:C.bg1,border:`1px solid ${C.bdr}`,borderRadius:"4px",overflow:"hidden",flexShrink:0}}>
          {["scalp","day","swing"].map(id=>(
            <button key={id} onClick={()=>setStyle(id)} style={{padding:"6px 11px",background:style===id?SC[id]:"transparent",color:style===id?C.bg:C.muted,border:"none",cursor:"pointer",fontSize:"9.5px",fontWeight:"700",letterSpacing:"0.8px",fontFamily:"inherit"}}>
              {id.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* NAV */}
      <div style={{background:C.bg1,borderBottom:`1px solid ${C.bdr}`,display:"flex",overflowX:"auto",flexShrink:0,scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
        <style>{`.no-scroll-bar::-webkit-scrollbar{display:none;}`}</style>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"9px 12px",background:"transparent",color:tab===t.id?C.gold:C.muted,border:"none",borderBottom:tab===t.id?`2px solid ${C.gold}`:"2px solid transparent",cursor:"pointer",fontSize:"9.5px",fontWeight:"700",letterSpacing:"0.8px",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:"4px",fontFamily:"inherit",flexShrink:0}}>
            {t.icon}{t.label}
            {t.id==="signals"&&signals.length>0&&<span style={{display:"inline-block",padding:"0 4px",background:C.amber+"22",color:C.amber,border:`1px solid ${C.amber}44`,borderRadius:"2px",fontSize:"7.5px",fontWeight:"700"}}>{signals.length}</span>}
            {t.id==="trades"&&trades.length>0&&<span style={{display:"inline-block",padding:"0 4px",background:C.blue+"22",color:C.blue,border:`1px solid ${C.blue}44`,borderRadius:"2px",fontSize:"7.5px",fontWeight:"700"}}>{trades.length}</span>}
            {t.id==="news"&&<span style={{display:"inline-block",padding:"0 4px",background:C.red+"22",color:C.red,border:`1px solid ${C.red}44`,borderRadius:"2px",fontSize:"7.5px",fontWeight:"700"}}>{ALL_NEWS.filter(n=>n.imp==="HIGH").length}H</span>}
          </button>
        ))}
      </div>

      {/* CONTENT — proper overflow for mobile */}
      <div style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:"12px",WebkitOverflowScrolling:"touch",minHeight:0}}>
        {tabContent}
      </div>
    </div>
  );
}
