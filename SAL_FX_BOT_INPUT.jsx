// ═══════════════════════════════════════════════════════════════════════════
// AXIOM FX — Institutional G10 Terminal — v7.2.0
// ═══════════════════════════════════════════════════════════════════════════
// v7.2 architecture + data-integrity release. Highlights:
//  • Price engine moved to a module-level store (useSyncExternalStore). Price
//    ticks no longer re-render the whole app — only the components that show
//    prices subscribe. Auto-pauses in hidden tabs; 60s slow-poll when the
//    market is closed (per-instrument OANDA tradeable flags).
//  • All tab components are module-level with stable identities — internal
//    state survives root re-renders (v7.1 nested definitions remounted every
//    render and silently wiped in-progress edits like regime toggles).
//  • TRUE daily change: CHG/CHG% measured from today's 5pm-NY daily open
//    (bulk daily-opens endpoint), not "since page load".
//  • Money math corrected end-to-end: pipValueUSD with live conversion legs
//    drives P&L; engine lot sizing and the Trades tab now agree.
//  • Signal cards show the ENGINE's style/timeframe/hold and the library-
//    joined primary strategy (name/tier/research WR clearly separated from
//    live probability).
//  • Regime editor: direction + STRENGTH (STRONG/MODERATE/WEAK) per currency,
//    state lifted to root, persisted as axiom_regimes_v2 (auto-migrates v1).
//  • Weekend Desk + Analyzer regime AI are manual Generate actions, grounded
//    ONLY in live data (FRED rates, regimes, prices, this week's calendar);
//    evidence links validated against a central-bank source whitelist.
//  • News tab is live Finnhub only — the AI article fallback is deleted.
//    Calendar tab consumes the new server-parsed JSON feed with local-time
//    rendering. CB Rates shows derived outlook/bias + per-series as-of dates.
//  • MARKET CLOSED state everywhere it matters; scans short-circuit with the
//    next Sunday-17:00-NY open time.
//  • 77 strategies wired (OPT_EXP merged into GAMMA_EXP; COT_REAL + COT_FADE
//    now run on live CFTC data). Library count asserted against the engine.
// ═══════════════════════════════════════════════════════════════════════════
const { useState, useEffect, useRef, useCallback, useMemo, memo, useSyncExternalStore } = React;

const VERSION = "7.2.0";

const ALL_PAIRS = ["AUD/CAD","AUD/CHF","AUD/JPY","AUD/NZD","AUD/USD","CAD/CHF","CAD/JPY","CHF/JPY","EUR/AUD","EUR/CAD","EUR/CHF","EUR/GBP","EUR/JPY","EUR/NZD","EUR/USD","GBP/AUD","GBP/CAD","GBP/CHF","GBP/JPY","GBP/NZD","GBP/USD","NZD/CAD","NZD/CHF","NZD/JPY","NZD/USD","USD/CAD","USD/CHF","USD/JPY"];
const G10 = ["USD","EUR","GBP","JPY","AUD","CAD","CHF","NZD","NOK","SEK"];

const C={bg:"#05090f",bg1:"#091525",bg2:"#0d1e35",bg3:"#112540",bdr:"#172f50",gold:"#d4af37",green:"#00e5a0",red:"#ff4560",blue:"#3b8cf7",amber:"#ff9f1c",text:"#dce8f5",muted:"#4a6a8a",dim:"#29415e",scalp:"#ff6b35",day:"#3b8cf7",swing:"#00e5a0"};
const SC={scalp:C.scalp,day:C.day,swing:C.swing};
const CATC={MOMENTUM:"#1d5c35",CARRY:"#7a5500","MEAN REVERT":"#005a5a",MACRO:"#1a3a6a",FLOW:"#4a1f6a",TECHNICAL:"#1a4a6a",CORRELATION:"#6a2a00","RISK MGMT":"#6a1111","PURE TECHNICAL":"#3a3a5a"};

// ── STRATEGY LIBRARY — 77 entries, 1:1 with engine SC keys (asserted) ───────
const STRATEGIES=[
  {id:"BOJ_NORM", tier:"S",wr:68,cat:"MACRO",      tf:"H4/D1", minC:4,name:"BOJ Normalization Trend",            note:"JPY-bullish regime on major yen pairs — the structural normalization theme.",url:"https://www.boj.or.jp/en/mopo/",desc:"BOJ: Policy normalization"},
  {id:"NEWS_DFT", tier:"S",wr:64,cat:"MOMENTUM",   tf:"M5/H1", minC:3,name:"Post-Release News Drift",             note:"High-impact CPI/NFP-class releases drive 2-4hr drift; live Finnhub surprise feed.",url:"https://www.nber.org/papers/w20427",desc:"NBER WP 20427: News and exchange rates"},
  {id:"TRI_ARB",  tier:"S",wr:74,cat:"FLOW",        tf:"M1/M5", minC:2,name:"Triangular Consistency Signal",       note:"Cross vs USD-leg synthetic deviation ≥1.5 pips, traded in the correction direction. Computed from the live 28-pair snapshot.",url:"https://www.jstor.org/stable/2329601",desc:"Journal of Finance: Arbitrage"},
  {id:"RATE_SRP", tier:"S",wr:67,cat:"CARRY",       tf:"H1/H4", minC:4,name:"Rate Surprise Extension",             note:"Post-CB drift 2-6hrs after decisions; strong live-FRED differential + news alignment extends.",url:"https://www.sciencedirect.com/science/article/abs/pii/S0261560604000026",desc:"Jansen/De Haan: CB statements and FX"},
  {id:"CB_DIV",   tier:"S",wr:66,cat:"MACRO",       tf:"H4/D1", minC:5,name:"Central Bank Divergence",              note:"Opposing policy regimes between the two central banks — the structural driver.",url:"https://www.bis.org/publ/work801.htm",desc:"BIS WP #801: Monetary policy divergence"},
  {id:"WMR_FIX",  tier:"S",wr:65,cat:"FLOW",        tf:"M15/H1",minC:3,name:"WMR 4PM Fix Anticipation",             note:"Pre-16:00-London fix order flow; month-end strongest. DST-aware London clock.",url:"https://www.lseg.com/en/data-analytics/financial-data/foreign-exchange/wm-reuters-rates",desc:"LSEG: WM/Reuters Fix methodology"},
  {id:"STRUCT_BK",tier:"S",wr:63,cat:"TECHNICAL",   tf:"H4/D1", minC:5,name:"Macro Structure Breakout",              note:"Break of multi-week structural level with ATR room to the next zone.",url:"https://www.tandfonline.com/doi/abs/10.1080/14697688.2011.613931",desc:"Quantitative Finance: Technical patterns"},
  {id:"GRW_DIV",  tier:"S",wr:63,cat:"MACRO",       tf:"D1/W1", minC:5,name:"Macro Growth Divergence",               note:"Relative growth-trajectory divergence between the two economies (regime-encoded).",url:"https://www.imf.org/en/Publications/WEO",desc:"IMF WEO: Growth and exchange rates"},
  {id:"REAL_YLD", tier:"S",wr:63,cat:"MACRO",       tf:"H4/D1", minC:4,name:"Real Yield Differential",               note:"Live FRED policy-rate differential >1% in the trade direction — no stale tables.",url:"https://www.federalreserve.gov/pubs/ifdp/2003/765/ifdp765.pdf",desc:"Fed IFDP 765: Real interest differentials"},
  {id:"SAFE_HVN", tier:"S",wr:63,cat:"CORRELATION", tf:"H1/H4", minC:4,name:"Safe Haven Demand Model",              note:"JPY/CHF bid in risk-off regime configurations.",url:"https://www.bis.org/publ/work570.htm",desc:"BIS WP #570: Safe haven currencies"},
  {id:"GAMMA_EXP",tier:"A",wr:61,cat:"FLOW",        tf:"M15/H1",minC:3,name:"Gamma Exposure Proxy",                  note:"Round-number gravity in the NY 10AM option-cut window with muted vol — dealer-gamma magnet (absorbs the former Option Expiry entry).",url:"https://www.cmegroup.com/trading/fx/g10/euro-fx.html",desc:"CME: FX option expiry magnetism"},
  {id:"YIELD_SPR",tier:"S",wr:66,cat:"MACRO",       tf:"H4/D1", minC:4,name:"10Y Yield Spread Momentum",             note:"US vs foreign 10Y spread level + momentum from live FRED. Most validated free signal.",url:"https://fred.stlouisfed.org/series/DGS10",desc:"FRED: 10-year government bond yield spreads"},
  {id:"ECO_SURP", tier:"A",wr:62,cat:"MACRO",       tf:"H4/D1", minC:4,name:"Economic Surprise Index",               note:"Rolling 8-release surprise index per CCY from live Finnhub calendar. Persistently beating = buy.",url:"https://finnhub.io/docs/api/economic-calendar",desc:"Finnhub: Economic calendar with actual vs estimate"},
  {id:"CB_INTV",  tier:"A",wr:65,cat:"RISK MGMT",   tf:"H1/H4", minC:3,name:"CB Intervention Watch",                 note:"Fires only for pairs with defined intervention thresholds when price is well clear; near-threshold trades are hard-vetoed.",url:"https://www.boj.or.jp/en/mopo/",desc:"BOJ: FX intervention history"},
  {id:"SWAP_TIME",tier:"B",wr:58,cat:"CARRY",       tf:"M15/H1",minC:3,name:"Overnight Swap Timing",                 note:"Enter aligned carry 5-45 min after the 5PM New York rollover (DST-aware NY clock).",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1343490",desc:"SSRN: Carry timing effects"},
  {id:"COT_REAL", tier:"A",wr:61,cat:"FLOW",        tf:"D1/W1", minC:4,name:"COT Positioning (CFTC Live)",           note:"Live CFTC TFF leveraged-funds z-score: ≥1.5σ crowding faded once short-term momentum turns with the trade. Weekly public Socrata feed.",url:"https://www.cftc.gov/MarketReports/CommitmentsofTraders/",desc:"CFTC: Commitments of Traders"},
  {id:"LIQ_SWEEP",tier:"A",wr:62,cat:"TECHNICAL",   tf:"M15/H1",minC:3,name:"Liquidity Sweep Refined",              note:"Spike beyond swing + reversal + VWAP filter. London session +1 bonus (local clock).",url:"https://www.bis.org/publ/work492.htm",desc:"BIS: Institutional order flow"},
  {id:"CB_COMM",  tier:"A",wr:62,cat:"MACRO",       tf:"H4/D1", minC:4,name:"CB Communication Drift",               note:"Persistent hawkish/dovish communication drift — encoded as STRONG regime conviction.",url:"https://www.bis.org/publ/work952.htm",desc:"BIS WP #952: CB communication and FX"},
  {id:"TSM_CTA",  tier:"A",wr:62,cat:"MOMENTUM",    tf:"D1/W1", minC:4,name:"CTA Time-Series Momentum",              note:"AQR: 12-month momentum across 58 markets including FX.",url:"https://www.aqr.com/Insights/Research/Journal-Article/Time-Series-Momentum",desc:"AQR: Time-Series Momentum"},
  {id:"CROSS_CAR",tier:"A",wr:62,cat:"CARRY",       tf:"D1/W1", minC:4,name:"Cross-Carry with Momentum Filter",      note:"AQR: carry + momentum improves Sharpe by 0.4+. Runs on live FRED differentials.",url:"https://www.aqr.com/Insights/Research/Working-Paper/Currency-Carry-Trades",desc:"AQR: Carry and momentum filter"},
  {id:"FX_VOL",   tier:"A",wr:61,cat:"FLOW",        tf:"D1/W1", minC:4,name:"FX Volatility Risk Premium",            note:"Low realized-vol environments favor carry-style premium capture.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1343490",desc:"SSRN: FX vol risk premium"},
  {id:"ICT_OB",   tier:"A",wr:61,cat:"TECHNICAL",   tf:"M15/H1",minC:4,name:"ICT Order Block + FVG Entry",            note:"Institutional order blocks; FVG fills precede continuation.",url:"https://www.bis.org/publ/work492.htm",desc:"BIS: Institutional order flow"},
  {id:"STOP_HNT", tier:"A",wr:61,cat:"TECHNICAL",   tf:"M5/M15",minC:4,name:"Liquidity Sweep Reversal",              note:"Equal highs/lows swept then reclaimed — high-probability reversal entry.",url:"https://www.bis.org/publ/work492.htm",desc:"BIS WP #492: Stop-loss orders"},
  {id:"GLOB_MAC", tier:"A",wr:61,cat:"MACRO",       tf:"D1/W1", minC:5,name:"Global Macro Thematic Trade",           note:"3+ STRONG regime alignments across G10 — thematic tailwind confirmation.",url:"https://www.bis.org/publ/arpdf/ar2023e2.htm",desc:"BIS Annual Report: Global macro FX"},
  {id:"CARRY_MOM",tier:"A",wr:60,cat:"CARRY",       tf:"D1/W1", minC:4,name:"Carry + Momentum Blend",                note:"High-yielder longs filtered by momentum confirmation (live FRED rates).",url:"https://www.aqr.com/Insights/Research/Working-Paper/Value-and-Momentum-Everywhere",desc:"AQR: Value and Momentum Everywhere"},
  {id:"CS_MOM",   tier:"A",wr:60,cat:"MOMENTUM",    tf:"D1/W1", minC:4,name:"Cross-Sectional FX Momentum",           note:"Long the strongest G10 momentum currency against the weakest.",url:"https://pages.stern.nyu.edu/~lpederse/papers/MomentumCurrencies.pdf",desc:"Pedersen/Frazzini: FX Momentum"},
  {id:"COT_FADE", tier:"A",wr:60,cat:"FLOW",        tf:"D1/W1", minC:4,name:"COT ≥2σ Extreme Fade",                  note:"Pure positioning fade at ≥2σ leveraged-funds extremes from live CFTC data — no momentum filter.",url:"https://www.cftc.gov/MarketReports/CommitmentsofTraders/",desc:"CFTC COT: Institutional positioning"},
  {id:"GOLD_USD", tier:"A",wr:60,cat:"CORRELATION", tf:"H4/D1", minC:3,name:"Gold / USD Divergence",                 note:"USD-debasement regime proxy: short USD vs CHF/JPY when the USD regime is bearish.",url:"https://www.gold.org/goldhub/research/relevance-of-gold-as-strategic-asset",desc:"WGC: Gold and USD correlation"},
  {id:"SESS_BRK", tier:"A",wr:60,cat:"TECHNICAL",   tf:"M15/H1",minC:3,name:"NY Open Session Breakout",              note:"New York open — highest institutional volume window (local NY clock, DST-aware).",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2837743",desc:"SSRN: Session open patterns"},
  {id:"VOL_BRK",  tier:"A",wr:60,cat:"TECHNICAL",   tf:"H1/H4", minC:3,name:"ATR Volatility Compression Break",      note:"Low ATR precedes breakout; calendar events act as catalysts.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2337011",desc:"SSRN: Volatility compression breakouts"},
  {id:"CORR_BRK", tier:"A",wr:60,cat:"CORRELATION", tf:"H4/D1", minC:4,name:"G10 Correlation Break Trade",           note:"Two STRONG opposing regimes on normally-correlated legs — divergence trade.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2840338",desc:"SSRN: Correlation-based pairs trading"},
  {id:"UIP_DEV",  tier:"A",wr:60,cat:"CARRY",       tf:"D1/W1", minC:4,name:"UIP Deviation (Forward Premium)",       note:"Fama 1984: the higher-rate currency tends to appreciate. Live differential >2%.",url:"https://www.nber.org/papers/w1393",desc:"Fama 1984: Forward rates — UIP puzzle"},
  {id:"ADX_BRK",  tier:"A",wr:59,cat:"TECHNICAL",   tf:"H1/H4", minC:3,name:"ADX Trend Acceleration",                note:"ADX >30 with DI alignment = trend entry. Best in directional markets.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1930932",desc:"SSRN: Trend indicators and FX returns"},
  {id:"LDN_BRK",  tier:"A",wr:59,cat:"TECHNICAL",   tf:"M15/H1",minC:3,name:"London Open Range Breakout",            note:"London session break of the Asian range (local London clock, DST-aware).",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1664718",desc:"SSRN: Session breakout strategies"},
  {id:"VWAP_REV", tier:"A",wr:59,cat:"MEAN REVERT", tf:"M15/H1",minC:3,name:"VWAP Mean Reversion",                   note:"Price >1.5 ATR from session VWAP reverts intraday with high frequency.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2995423",desc:"SSRN: VWAP trading strategies"},
  {id:"EARL_WRN", tier:"A",wr:59,cat:"MACRO",       tf:"D1/W1", minC:4,name:"Currency Stress Early Warning",         note:"RSI-vs-regime divergence as an early stress tell.",url:"https://www.imf.org/en/Publications/WP/Issues/2016/12/31/Currency-Crises-36154",desc:"IMF WP: Currency crisis warning"},
  {id:"MOMO_CRS", tier:"A",wr:59,cat:"MOMENTUM",    tf:"H1/H4", minC:3,name:"EMA Crossover Momentum",                note:"Fresh 20/50 EMA cross with MACD confirmation = momentum entry.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2550618",desc:"SSRN: EMA strategies in FX"},
  {id:"BOP_FLOW", tier:"A",wr:59,cat:"MACRO",       tf:"W1",    minC:4,name:"Balance of Payments Flow",              note:"Structural current-account-surplus currencies (JPY/CHF) attract flows in stress.",url:"https://www.imf.org/external/pubs/ft/wp/2010/wp10149.pdf",desc:"IMF WP: Capital flows and FX"},
  {id:"CARRY",    tier:"B",wr:57,cat:"CARRY",       tf:"D1/W1", minC:3,name:"G10 Carry Trade",                       note:"Long high-yielder vs low-yielder using live FRED policy differentials.",url:"https://www.nber.org/papers/w11631",desc:"NBER: Returns to currency speculation"},
  {id:"BB_FADE",  tier:"B",wr:57,cat:"MEAN REVERT", tf:"H1/H4", minC:3,name:"Bollinger Band 2σ Fade",                note:"Price at 2σ band in a non-trending tape — reversion to mean.",url:"https://www.investopedia.com/articles/technical/04/030304.asp",desc:"Bollinger: Mean reversion"},
  {id:"FIBO_PULL",tier:"B",wr:58,cat:"TECHNICAL",   tf:"H1/H4", minC:3,name:"Fibonacci 61.8% Pullback",              note:"38.2/61.8% retracement zones as continuation entries.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1293728",desc:"SSRN: Fibonacci as support/resistance"},
  {id:"ICHIMOKU", tier:"B",wr:57,cat:"TECHNICAL",   tf:"H4/D1", minC:4,name:"Ichimoku Cloud System",                 note:"Kumo breakout with Tenkan/Kijun alignment = trend confirmation.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1481600",desc:"SSRN: Ichimoku in forex"},
  {id:"MON_PULL", tier:"B",wr:57,cat:"MOMENTUM",    tf:"H1/H4", minC:3,name:"Monthly Range Pullback",                note:"Position inside the 22-day range extremes — pullback continuation zone.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1935275",desc:"SSRN: Day-of-week effects"},
  {id:"EQ_BETA",  tier:"B",wr:58,cat:"CORRELATION", tf:"H1/H4", minC:3,name:"Equity-FX Risk Beta Trade",             note:"AUD/NZD/CAD positive beta; JPY/CHF negative. Trade the regime.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2521095",desc:"SSRN: Equity-FX co-movement"},
  {id:"REGIME_SW",tier:"B",wr:58,cat:"MACRO",       tf:"H4/D1", minC:3,name:"EMA Regime Switching",                  note:"Fresh 20/50 EMA regime flip as a structural switch marker.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2965903",desc:"SSRN: Regime switching and carry"},
  {id:"COMD_CCY", tier:"B",wr:57,cat:"CORRELATION", tf:"H1/H4", minC:3,name:"Commodity Currency Correlation",        note:"AUD/CAD/NZD regime alignment with the commodity complex.",url:"https://www.rba.gov.au/publications/rdp/2012/pdf/rdp2012-06.pdf",desc:"RBA: Commodity prices and AUD"},
  {id:"TURT_TR",  tier:"B",wr:55,cat:"MOMENTUM",    tf:"D1/W1", minC:3,name:"Turtle Donchian Breakout",              note:"20-day high/low breakout. Classic systematic CTA strategy.",url:"https://www.trendfollowing.com/turtlerules.pdf",desc:"Turtle Rules: Donchian breakout"},
  {id:"STOCH_RSI",tier:"B",wr:57,cat:"MEAN REVERT", tf:"H1/H4", minC:3,name:"Stochastic RSI Reversal",               note:"StochRSI extreme + cross = high-probability reversal signal.",url:"https://www.investopedia.com/terms/s/stochrsi.asp",desc:"StochRSI: Divergence signals"},
  {id:"DUAL_THR", tier:"B",wr:58,cat:"MOMENTUM",    tf:"H1/H4", minC:3,name:"Dual Thrust Momentum System",           note:"Dynamic daily-range thrust breakout. Systematic edge confirmed.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1680057",desc:"SSRN: Systematic FX momentum"},
  {id:"KELTNER",  tier:"B",wr:55,cat:"TECHNICAL",   tf:"H4/D1", minC:3,name:"Keltner Squeeze Setup",                 note:"Bollinger-inside-Keltner squeeze with participation — pre-breakout state.",url:"https://www.investopedia.com/terms/k/keltnerchannel.asp",desc:"Keltner: Volatility breakout"},
  {id:"RISK_PAR", tier:"B",wr:57,cat:"RISK MGMT",   tf:"D1/W1", minC:4,name:"Risk Parity Filter",                    note:"Trend + participation present — portfolio-quality environment filter.",url:"https://www.aqr.com/Insights/Research/White-Papers/Risk-Parity-Portfolios",desc:"AQR: Risk parity portfolios"},
  {id:"SUPPLY_DEM",tier:"B",wr:57,cat:"TECHNICAL",  tf:"H1/H4", minC:3,name:"Supply & Demand Zone Entry",            note:"Institutional accumulation/distribution zones with room to target. High R:R.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2862935",desc:"SSRN: S/R levels and FX"},
  {id:"TOT_SHOCK",tier:"B",wr:56,cat:"MACRO",       tf:"H4/D1", minC:3,name:"Terms of Trade Shock",                  note:"Commodity-linked currencies in elevated-vol regimes — immediate transmission.",url:"https://www.rba.gov.au/publications/rdp/2014/pdf/rdp2014-01.pdf",desc:"RBA: Terms of trade and AUD"},
  {id:"ENG_CAN",  tier:"B",wr:55,cat:"TECHNICAL",   tf:"H4/D1", minC:4,name:"Engulfing Candle Reversal",             note:"Full engulfing on H4/H1 in the trade direction.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1013905",desc:"SSRN: Candlestick patterns in FX"},
  {id:"PPP_VAL",  tier:"B",wr:54,cat:"MACRO",       tf:"W1/MN", minC:4,name:"Long-Run Valuation Reversion",          note:"Price stretched ≥2.5× daily ATR from the D1 EMA200 long-run anchor, trading back toward it — a live proxy for valuation pull.",url:"https://stats.oecd.org/index.aspx?queryid=221",desc:"OECD PPP Database: FX valuation"},
  {id:"RSIMR",    tier:"B",wr:54,cat:"MEAN REVERT", tf:"H4/D1", minC:3,name:"RSI Mean Reversion",                    note:"Daily RSI >70 or <30 — fade the extreme with structure.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2995423",desc:"SSRN: RSI-based mean reversion"},
  {id:"ATR_FADE", tier:"B",wr:53,cat:"MEAN REVERT", tf:"H1/H4", minC:3,name:"ATR Overextension Fade",                note:"Multi-bar move beyond 1.5× the daily range without trend strength — reversion.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2337011",desc:"SSRN: ATR and intraday reversion"},
  // ── PURE-TA — Group A: EMA / Momentum ─────────────────────────────────────
  {id:"EMA_CROSS_55",        tier:"C",wr:57,cat:"PURE TECHNICAL",tf:"All",  minC:3,name:"EMA 55/200 Cross Pullback",         note:"Fresh EMA55/200 golden/death cross on primary TF + first pullback to EMA55 + RSI 40-60 neutral zone. Style-aware: H1/H4/D1.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2550618",desc:"EMA55 cross + pullback entry — no macro required"},
  {id:"PRICE_ACTION_PIN",    tier:"C",wr:58,cat:"PURE TECHNICAL",tf:"All",  minC:3,name:"Pin Bar at S/R Level",               note:"Hammer or shooting star with wick ≥2.5× body at defined swing S/R. RSI diverging from extreme. EMA55 aligned.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1013905",desc:"Pin bar reversal at structural level"},
  {id:"INSIDE_BAR_BO",       tier:"C",wr:56,cat:"PURE TECHNICAL",tf:"All",  minC:3,name:"Inside Bar Breakout",                note:"Inside bar (bar 2 within bar 1 range) on primary TF + directional break of mother bar high/low + ATR expansion or stoch cross. EMA55 direction confirmed.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1013905",desc:"Inside bar compression breakout"},
  {id:"SR_BOUNCE",           tier:"C",wr:57,cat:"PURE TECHNICAL",tf:"All",  minC:3,name:"Multi-Touch S/R Bounce",             note:"Price at swing level tested 2+ times (within 0.2%) + RSI extreme (<35 buy / >65 sell) + EMA200 aligned + stochastic pending cross. Not yet crossed.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2862935",desc:"Multi-touch S/R bounce with momentum"},
  {id:"MACD_HIST_DIVERGENCE",tier:"C",wr:58,cat:"PURE TECHNICAL",tf:"All",  minC:3,name:"MACD Histogram Divergence",          note:"MACD histogram making higher lows (bull) or lower highs (bear) while price makes opposing extreme. At S/R level. RSI confirming. Primary TF.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2995423",desc:"MACD histogram divergence at structure"},
  {id:"STOCH_SR_CONFLUENCE", tier:"C",wr:58,cat:"PURE TECHNICAL",tf:"All",  minC:3,name:"Slow Stoch + S/R Confluence",        note:"Slow stochastic (14,3,3) exhausted at extreme for 2+ bars, crosses at S/R level. Conviction close (body >60% of range). EMA200 aligned.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2995423",desc:"Slow stochastic exhaustion cross at S/R"},
  {id:"CANDLE_REVERSAL_CLUSTER",tier:"C",wr:56,cat:"PURE TECHNICAL",tf:"All",minC:3,name:"Candle Reversal Cluster",           note:"Morning/evening star or three white soldiers/black crows. RSI turning from extreme (prior RSI <35 bull / >65 bear). Within 3 ATR of EMA55.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1013905",desc:"Multi-candle reversal cluster pattern"},
  {id:"TREND_PULLBACK_EMA55",tier:"C",wr:57,cat:"PURE TECHNICAL",tf:"All",  minC:3,name:"EMA55 Trend Pullback",               note:"Trend established (EMA55 > EMA200 bull) + price pulls to EMA55 zone (within 0.8%) + RSI reset 38-58 + stoch between 25-55. Orderly pullback (ATR calm).",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2550618",desc:"Trend pullback to EMA55 with reset"},
  // ── PURE-TA — Group B: Candlestick Patterns ───────────────────────────────
  {id:"ENGULF_STRUCT",       tier:"C",wr:58,cat:"PURE TECHNICAL",tf:"All",  minC:3,name:"Engulfing at Structure",              note:"Full bullish/bearish engulfing candle at swing S/R with RSI divergence from prior candle. EMA55 not opposing. Fires on primary TF (H1/H4/D1 by style).",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1013905",desc:"Full engulfing candle at structural level"},
  {id:"THREE_BAR_PLAY",      tier:"C",wr:57,cat:"PURE TECHNICAL",tf:"All",  minC:3,name:"Three-Bar Play",                     note:"Bar 1 directional, bar 2 inside/narrow (≤60% of bar 1 range), bar 3 breaks bar 1 extreme. ATR expanding on bar 3 or stoch cross. EMA200 aligned.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1013905",desc:"Three-bar play breakout pattern"},
  {id:"OUTSIDE_BAR",         tier:"C",wr:56,cat:"PURE TECHNICAL",tf:"All",  minC:3,name:"Outside Bar / Outside Week",          note:"Outside bar engulfs prior bar's entire range (high > prior high AND low < prior low). Direction = close vs midpoint. At S/R or RSI turning from extreme.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1013905",desc:"Outside bar engulfing at S/R"},
  {id:"HAMMER_STAR",         tier:"C",wr:55,cat:"PURE TECHNICAL",tf:"All",  minC:3,name:"Hammer / Shooting Star",              note:"Shadow candle: lower wick ≥2.5× body (hammer) or upper wick ≥2.5× body (shooting star). At defined S/R level. EMA55 aligned or stochastic at extreme.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1013905",desc:"Hammer or shooting star at S/R"},
  {id:"THREE_SOLDIERS_CROWS",tier:"C",wr:57,cat:"PURE TECHNICAL",tf:"All",  minC:3,name:"Three White Soldiers / Black Crows",  note:"Three consecutive full-bodied candles (body >60% of range) each opening inside prior body. Preceded by low ATR or EMA55 sloping in direction. RSI in 40-65 zone.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1013905",desc:"Three soldiers/crows trend initiation"},
  {id:"MORNING_EVENING_STAR",tier:"C",wr:58,cat:"PURE TECHNICAL",tf:"All",  minC:3,name:"Morning Star / Evening Star",         note:"3-candle star: large directional, small-bodied doji/star, reversal candle closes >50% into first. At multi-touch S/R or RSI diverging or stoch crossing.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1013905",desc:"Morning/evening star reversal pattern"},
  // ── PURE-TA — Group C: Chart Patterns ─────────────────────────────────────
  {id:"HEAD_SHOULDERS",      tier:"C",wr:59,cat:"PURE TECHNICAL",tf:"D1/H4",minC:3,name:"Head & Shoulders Pattern",           note:"Day/swing only. Middle peak/trough most extreme, shoulders within 1.5% of each other. Price breaks neckline. RSI divergence on head vs shoulders or EMA55 aligned.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1293728",desc:"H&S and inverse H&S neckline break"},
  {id:"DOUBLE_TOP_BOTTOM",   tier:"C",wr:59,cat:"PURE TECHNICAL",tf:"D1/H4",minC:3,name:"Double Top / Double Bottom",         note:"Day/swing only. Two swing highs/lows within 0.3% of each other. Price breaks intervening swing low/high (neckline). RSI divergence between tests. EMA55 aligned.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1293728",desc:"Double top/bottom neckline breakout"},
  {id:"MARKET_STRUCTURE",    tier:"C",wr:58,cat:"PURE TECHNICAL",tf:"All",  minC:3,name:"Market Structure Break/Continuation", note:"HH/HL uptrend continuation or LH/LL downtrend. Market structure break (MSB): was trending but price breaks last HL or LH = reversal. RSI + EMA55 confirm.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2862935",desc:"Market structure continuation or break"},
  {id:"FLAG_PENNANT",        tier:"C",wr:57,cat:"PURE TECHNICAL",tf:"All",  minC:3,name:"Bull/Bear Flag & Pennant",            note:"Sharp impulse (≥2.5× ATR in 3-5 candles) + tight consolidation (range ≤45% of impulse). Breakout in impulse direction + ATR expands + EMA55 aligned.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1293728",desc:"Flag/pennant breakout after impulse"},
  // ── PURE-TA — Group D: Breakout Patterns ──────────────────────────────────
  {id:"RANGE_BREAKOUT",      tier:"C",wr:56,cat:"PURE TECHNICAL",tf:"All",  minC:3,name:"Range / Consolidation Breakout",      note:"Last 20 primary-TF candles in consolidation (range ≤1.8× ATR avg). Price closes decisively outside range + ATR expands. RSI not yet extreme. EMA55 aligned.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2337011",desc:"Range breakout with ATR expansion"},
  {id:"TREND_CONTINUATION_BREAK",tier:"C",wr:58,cat:"PURE TECHNICAL",tf:"All",minC:3,name:"Trend Continuation Break",          note:"Established trend (EMA55+200 aligned) + ATR compression in last 8 candles vs prior 8 + break to new 20-candle extreme + stochastic reset and re-cross in trend direction.",url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2550618",desc:"Trend continuation after compression breakout"},
];
const DEFAULT_ENABLED=STRATEGIES.filter(s=>s.tier==="S"||s.tier==="A").map(s=>s.id);
const STRAT_BY_ID={}; STRATEGIES.forEach(s=>{STRAT_BY_ID[s.id]=s;});

// Central-bank + FRED source whitelist — the ONLY URLs AI outputs may cite.
const CB_SOURCE_URLS={
  USD:"https://www.federalreserve.gov/monetarypolicy/openmarket.htm",
  EUR:"https://www.ecb.europa.eu/mopo/decisions/html/index.en.html",
  GBP:"https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes",
  JPY:"https://www.boj.or.jp/en/mopo/mpmdeci/",
  AUD:"https://www.rba.gov.au/monetary-policy/rba-board-minutes/",
  CAD:"https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/",
  CHF:"https://www.snb.ch/en/monetary-policy/monetary-policy-decisions",
  NZD:"https://www.rbnz.govt.nz/monetary-policy/official-cash-rate-decisions",
  NOK:"https://www.norges-bank.no/en/topics/Monetary-policy/monetary-policy-meetings/",
  SEK:"https://www.riksbank.se/en-gb/monetary-policy/the-policy-rate/policy-rate-table/",
};
const AI_URL_WHITELIST=[...Object.values(CB_SOURCE_URLS),"https://fred.stlouisfed.org","https://www.cftc.gov/MarketReports/CommitmentsofTraders/"];
const CB_NAMES={USD:"Federal Reserve",EUR:"ECB",GBP:"Bank of England",JPY:"Bank of Japan",AUD:"RBA",CAD:"Bank of Canada",CHF:"SNB",NZD:"RBNZ",NOK:"Norges Bank",SEK:"Riksbank"};

const DEFAULT_REGIMES={USD:{dir:"BEARISH",strength:"STRONG"},EUR:{dir:"BULLISH",strength:"MODERATE"},GBP:{dir:"NEUTRAL",strength:"WEAK"},JPY:{dir:"BULLISH",strength:"STRONG"},AUD:{dir:"NEUTRAL",strength:"MODERATE"},CAD:{dir:"BEARISH",strength:"MODERATE"},CHF:{dir:"BULLISH",strength:"MODERATE"},NZD:{dir:"NEUTRAL",strength:"WEAK"},NOK:{dir:"NEUTRAL",strength:"WEAK"},SEK:{dir:"NEUTRAL",strength:"WEAK"}};

function tvUrl(pair,tf="60"){
  const sym=pair.replace("/","");
  return `https://www.tradingview.com/chart/?symbol=FX%3A${sym}&interval=${tf}`;
}

// ── SHARED HELPERS ───────────────────────────────────────────────────────────
function fmtP(pair,v){ if(v==null||!isFinite(v))return "—"; return v.toFixed(pair.includes("JPY")?3:5); }
function pipMultOf(pair){ return pair.includes("JPY")?100:10000; }
function fmtUsd(v){ if(v==null||!isFinite(v))return "—"; const s=v<0?"-":""; return `${s}$${Math.abs(v).toFixed(2)}`; }
function timeAgo(ts){ const s=Math.floor((Date.now()-ts)/1000); if(s<60)return s+"s ago"; const m=Math.floor(s/60); if(m<60)return m+"m ago"; const h=Math.floor(m/60); if(h<24)return h+"h ago"; return Math.floor(h/24)+"d ago"; }
function localDT(iso){ const d=new Date(iso); return d.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}); }
function localTime(iso){ return new Date(iso).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}); }
function localDateKey(d){ const p=n=>String(n).padStart(2,"0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }

// Client copy of the engine's pip-value model — MUST stay in sync with
// analyze.js pipValueUSD. Value in USD of one pip on `lot` standard lots.
function pipValueUSDClient(pair, lot, prices){
  const quote=pair.split("/")[1];
  const vq=(quote==="JPY"?0.01:0.0001)*100000*lot;
  if(quote==="USD") return vq;
  if(quote==="JPY"||quote==="CHF"||quote==="CAD"){ const m=prices?.["USD/"+quote]?.mid; return m?vq/m:null; }
  const m=prices?.[quote+"/USD"]?.mid; return m?vq*m:null;
}

// ═══ PRICE STORE — module-level; components subscribe individually ══════════
const priceStore={
  snap:{status:"connecting",prices:null,marketClosed:false,error:null,staleSince:null,lastTick:0,dailyOpens:null,opensDate:null},
  listeners:new Set(),
  set(patch){ priceStore.snap={...priceStore.snap,...patch}; priceStore.listeners.forEach(f=>{try{f();}catch(_){}}); },
  subscribe(f){ priceStore.listeners.add(f); return ()=>priceStore.listeners.delete(f); },
  get(){ return priceStore.snap; },
};
function usePriceSnap(){ return useSyncExternalStore(priceStore.subscribe, priceStore.get); }

// Session change (vs last tick baseline captured at first load) is replaced by
// TRUE daily change: mid − dailyOpen (5pm-NY FX day). Helper:
function dailyChg(pair,snap){
  const p=snap.prices?.[pair], o=snap.dailyOpens?.[pair]?.open;
  if(!p||o==null) return null;
  const chg=p.mid-o;
  return {chg, pct:(chg/o)*100, pips:chg*pipMultOf(pair)};
}

// ── UI ATOMS ─────────────────────────────────────────────────────────────────
const Bdg=memo(({label,color,sz="8.5px"})=>(<span style={{display:"inline-block",padding:"2px 7px",background:color+"22",color,border:`1px solid ${color}44`,borderRadius:"2px",fontSize:sz,fontWeight:"700",letterSpacing:"0.8px",lineHeight:"1.4"}}>{label}</span>));
const Btn=memo(({label,color=C.gold,ghost=false,onClick,style:cs,disabled})=>(<button onClick={onClick} disabled={disabled} style={{padding:"7px 13px",background:ghost?"transparent":color,color:ghost?color:"#05090f",border:`1px solid ${color}`,borderRadius:"3px",cursor:disabled?"not-allowed":"pointer",fontSize:"10.5px",fontWeight:"700",letterSpacing:"0.8px",fontFamily:"inherit",opacity:disabled?0.5:1,...cs}}>{label}</button>));
const Sm=memo(({label,color=C.gold,onClick,active})=>(<button onClick={onClick} style={{padding:"4px 9px",background:active?color+"22":"transparent",color:active?color:C.muted,border:`1px solid ${active?color:C.bdr}`,borderRadius:"2px",cursor:"pointer",fontSize:"9px",fontWeight:"700",letterSpacing:"0.5px",fontFamily:"inherit"}}>{label}</button>));
const Kv=memo(({k,v,vc=C.text})=>(<div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.bdr}22`,fontSize:"10.5px"}}><span style={{color:C.muted,flexShrink:0}}>{k}</span><span style={{color:vc,fontWeight:"700",textAlign:"right",marginLeft:"8px"}}>{v}</span></div>));
const Tag=memo(({label,color})=>(<span style={{padding:"2px 8px",background:color+"22",color,border:`1px solid ${color}44`,borderRadius:"3px",fontSize:"8px",fontWeight:"700",marginRight:"5px"}}>{label}</span>));
const Card=memo(({children,style:cs})=>(<div style={{background:C.bg1,border:`1px solid ${C.bdr}`,borderRadius:"4px",padding:"14px",...cs}}>{children}</div>));
const SecT=memo(({t,sub})=>(<div style={{marginBottom:"10px"}}><div style={{fontSize:"11px",fontWeight:"800",letterSpacing:"1.5px",color:C.gold}}>{t}</div>{sub&&<div style={{fontSize:"9px",color:C.muted,marginTop:"3px",lineHeight:"1.5"}}>{sub}</div>}</div>));

// Sparkline (guards <2 points — v7.1 rendered NaN paths)
const Spark=memo(({data,w=64,h=20,color=C.blue})=>{
  if(!data||data.length<2) return <span style={{fontSize:"8px",color:C.dim}}>—</span>;
  const mn=Math.min(...data),mx=Math.max(...data),rg=mx-mn||1e-9;
  const pts=data.map((v,i)=>`${(i/(data.length-1))*w},${h-((v-mn)/rg)*h}`).join(" ");
  return(<svg width={w} height={h} style={{display:"block"}}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.3"/></svg>);
});

// Self-ticking age label — updates itself every 30s without re-rendering parents
const SigAge=memo(({ts,color=C.muted})=>{
  const [,force]=useState(0);
  useEffect(()=>{const iv=setInterval(()=>force(x=>x+1),30000);return()=>clearInterval(iv);},[]);
  return <span style={{fontSize:"8.5px",color}}>{timeAgo(ts)}</span>;
});

// Header connection status — the ONLY header piece that ticks with prices
const ConnStatus=memo(()=>{
  const s=usePriceSnap();
  let color=C.amber,label="CONNECTING",pulse=true;
  if(s.status==="live"&&s.marketClosed){color=C.amber;label="MARKET CLOSED";pulse=false;}
  else if(s.status==="live"){color=C.green;label="LIVE · OANDA";pulse=false;}
  else if(s.status==="error"){color=C.red;label=s.prices?"STALE · FEED ERROR":"FEED DOWN";pulse=true;}
  return(<span style={{display:"inline-flex",alignItems:"center",gap:"6px",fontSize:"9px",fontWeight:"700",color,letterSpacing:"1px"}}>
    <span style={{width:"7px",height:"7px",borderRadius:"50%",background:color,animation:pulse?"axpulse 1.2s infinite":"none"}}/>{label}
  </span>);
});

// Amber note used inside Signals tab when the market is closed
const MarketClosedNote=memo(()=>{
  const s=usePriceSnap();
  if(!s.marketClosed) return null;
  return(<div style={{padding:"9px 12px",background:C.amber+"14",border:`1px solid ${C.amber}55`,borderRadius:"4px",fontSize:"10px",color:C.amber,marginBottom:"10px"}}>
    ◈ FX MARKET CLOSED — all OANDA instruments report non-tradeable. Scans resume at the Sunday 17:00 New York open. Prices poll at 60s until then.
  </div>);
});

// ═══ MODULE PRICE HISTORY (sparklines) — pushed by the root price engine ════
const priceHistory={};
function pushPriceHistory(prices){
  if(!prices) return;
  for(const pair of ALL_PAIRS){
    const m=prices[pair]&&prices[pair].mid;
    if(m==null) continue;
    if(!priceHistory[pair]) priceHistory[pair]=[];
    const arr=priceHistory[pair];
    arr.push(m);
    if(arr.length>48) arr.shift();
  }
}

// ═══ MARKET PULSE (subscriber) ═══════════════════════════════════════════════
const USD_PAIRS_FOR_IDX=["EUR/USD","GBP/USD","AUD/USD","NZD/USD","USD/JPY","USD/CAD","USD/CHF"];
const RISK_PAIRS=["AUD/JPY","NZD/JPY","CAD/JPY"];

const MarketPulse=memo(()=>{
  const s=usePriceSnap();
  const haveOpens=!!s.dailyOpens;
  let usdIdx=null,risk=null,top=null;
  if(s.prices&&haveOpens){
    const usdParts=[];
    for(const p of USD_PAIRS_FOR_IDX){
      const d=dailyChg(p,s); if(!d) continue;
      usdParts.push(p.startsWith("USD/")?d.pct:-d.pct);
    }
    if(usdParts.length>=4) usdIdx=usdParts.reduce((a,b)=>a+b,0)/usdParts.length;
    const rp=[];
    for(const p of RISK_PAIRS){ const d=dailyChg(p,s); if(d) rp.push(d.pct); }
    if(rp.length>=2) risk=rp.reduce((a,b)=>a+b,0)/rp.length;
    let best=null;
    for(const p of ALL_PAIRS){ const d=dailyChg(p,s); if(d&&(!best||Math.abs(d.pct)>Math.abs(best.pct))) best={pair:p,...d}; }
    top=best;
  }
  const riskLabel=risk==null?"—":risk>0.10?"RISK-ON":risk<-0.10?"RISK-OFF":"NEUTRAL";
  const riskColor=risk==null?C.muted:risk>0.10?C.green:risk<-0.10?C.red:C.amber;
  const Tile=({t,v,vc,sub})=>(
    <div style={{flex:"1 1 140px",background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"4px",padding:"10px 12px"}}>
      <div style={{fontSize:"8px",color:C.muted,letterSpacing:"1px",fontWeight:"700"}}>{t}</div>
      <div style={{fontSize:"15px",fontWeight:"800",color:vc||C.text,marginTop:"3px"}}>{v}</div>
      {sub&&<div style={{fontSize:"8.5px",color:C.muted,marginTop:"2px"}}>{sub}</div>}
    </div>);
  const eu=s.prices&&s.prices["EUR/USD"], uj=s.prices&&s.prices["USD/JPY"];
  const euD=dailyChg("EUR/USD",s), ujD=dailyChg("USD/JPY",s);
  return(
    <div style={{display:"flex",gap:"8px",flexWrap:"wrap",marginBottom:"12px"}}>
      <Tile t="SYNTHETIC USD INDEX (DAILY)" v={usdIdx==null?"—":(usdIdx>=0?"+":"")+usdIdx.toFixed(2)+"%"} vc={usdIdx==null?C.muted:usdIdx>=0?C.green:C.red} sub={haveOpens?"vs 5pm-NY daily open":"awaiting daily opens"}/>
      <Tile t="RISK GAUGE (JPY CROSSES)" v={riskLabel} vc={riskColor} sub={risk==null?"awaiting data":`avg ${risk>=0?"+":""}${risk.toFixed(2)}% daily`}/>
      <Tile t="TOP MOVER" v={top?top.pair:"—"} vc={top?(top.pct>=0?C.green:C.red):C.muted} sub={top?`${top.pct>=0?"+":""}${top.pct.toFixed(2)}% · ${top.pips>=0?"+":""}${top.pips.toFixed(0)}p`:""}/>
      <Tile t="EUR/USD" v={eu?fmtP("EUR/USD",eu.mid):"—"} vc={euD?(euD.pct>=0?C.green:C.red):C.text} sub={eu?`${fmtP("EUR/USD",eu.bid)} / ${fmtP("EUR/USD",eu.ask)}`:""}/>
      <Tile t="USD/JPY" v={uj?fmtP("USD/JPY",uj.mid):"—"} vc={ujD?(ujD.pct>=0?C.green:C.red):C.text} sub={uj?`${fmtP("USD/JPY",uj.bid)} / ${fmtP("USD/JPY",uj.ask)}`:""}/>
    </div>);
});

// ═══ 28-PAIR PRICE BOARD (subscriber) ════════════════════════════════════════
const PriceTable28=memo(({cbRates,onGoPair})=>{
  const s=usePriceSnap();
  const th={padding:"6px 8px",fontSize:"8px",color:C.muted,letterSpacing:"1px",textAlign:"right",fontWeight:"700",borderBottom:`1px solid ${C.bdr}`};
  const td={padding:"6px 8px",fontSize:"10.5px",textAlign:"right",borderBottom:`1px solid ${C.bdr}33`,fontVariantNumeric:"tabular-nums"};
  const carryOf=(pair)=>{
    if(!cbRates) return null;
    const [b,q]=pair.split("/");
    const rb=cbRates[b]&&cbRates[b].rate, rq=cbRates[q]&&cbRates[q].rate;
    if(rb==null||rq==null) return null;
    return rb-rq;
  };
  return(
    <Card style={{padding:"0",overflow:"hidden"}}>
      <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.bdr}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:"11px",fontWeight:"800",letterSpacing:"1.5px",color:C.gold}}>G10 BOARD — 28 PAIRS</span>
        <span style={{fontSize:"8.5px",color:C.muted}}>{s.dailyOpens?`Δ vs ${s.opensDate||"today"}'s 5pm-NY open`:"daily opens loading…"}{cbRates?" · carry: live FRED":" · carry: load CB Rates tab"}</span>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr>
            <th style={{...th,textAlign:"left"}}>PAIR</th><th style={th}>BID</th><th style={th}>ASK</th><th style={th}>SPREAD</th>
            <th style={{...th,color:C.gold}}>DAILY Δ</th><th style={{...th,color:C.gold}}>DAILY Δ%</th><th style={{...th,textAlign:"center"}}>TREND</th><th style={th}>CARRY</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {ALL_PAIRS.map(pair=>{
              const p=s.prices&&s.prices[pair];
              const d=dailyChg(pair,s);
              const carry=carryOf(pair);
              const hist=priceHistory[pair];
              return(
                <tr key={pair} style={{opacity:p&&p.tradeable===false?0.45:1}}>
                  <td style={{...td,textAlign:"left",fontWeight:"800",color:C.text}}>{pair}{p&&p.tradeable===false&&<span style={{fontSize:"7px",color:C.amber,marginLeft:"5px"}}>CLOSED</span>}</td>
                  <td style={td}>{p?fmtP(pair,p.bid):<span style={{color:C.dim}}>—</span>}</td>
                  <td style={td}>{p?fmtP(pair,p.ask):<span style={{color:C.dim}}>—</span>}</td>
                  <td style={{...td,color:C.muted}}>{p?(p.spread*pipMultOf(pair)).toFixed(1):"—"}</td>
                  <td style={{...td,color:d?(d.pips>=0?C.green:C.red):C.dim,fontWeight:"700"}}>{d?`${d.pips>=0?"+":""}${d.pips.toFixed(0)}p`:"—"}</td>
                  <td style={{...td,color:d?(d.pct>=0?C.green:C.red):C.dim}}>{d?`${d.pct>=0?"+":""}${d.pct.toFixed(2)}%`:"—"}</td>
                  <td style={{...td,textAlign:"center"}}><Spark data={hist} color={d?(d.pct>=0?C.green:C.red):C.blue}/></td>
                  <td style={{...td,color:carry==null?C.dim:carry>0?C.green:carry<0?C.red:C.muted}}>{carry==null?"n/a":`${carry>0?"+":""}${carry.toFixed(2)}%`}</td>
                  <td style={td}><button onClick={()=>onGoPair&&onGoPair(pair)} style={{background:"transparent",border:`1px solid ${C.bdr}`,color:C.blue,borderRadius:"2px",cursor:"pointer",fontSize:"9px",padding:"2px 7px",fontFamily:"inherit"}}>▸</button></td>
                </tr>);
            })}
          </tbody>
        </table>
      </div>
    </Card>);
});

// ═══ MOMENTUM GRID (subscriber heat tiles) ═══════════════════════════════════
const MomentumGrid=memo(({onSelect})=>{
  const s=usePriceSnap();
  return(
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(96px,1fr))",gap:"6px"}}>
      {ALL_PAIRS.map(pair=>{
        const d=dailyChg(pair,s);
        const pct=d?d.pct:null;
        const bg=pct==null?C.bg2:pct>=0?`rgba(0,229,160,${Math.min(0.55,0.10+Math.abs(pct)*0.55)})`:`rgba(255,69,96,${Math.min(0.55,0.10+Math.abs(pct)*0.55)})`;
        return(
          <div key={pair} onClick={()=>onSelect&&onSelect(pair)} style={{background:bg,border:`1px solid ${C.bdr}`,borderRadius:"3px",padding:"8px 6px",textAlign:"center",cursor:onSelect?"pointer":"default"}}>
            <div style={{fontSize:"9px",fontWeight:"800",color:C.text}}>{pair}</div>
            <div style={{fontSize:"10px",fontWeight:"700",marginTop:"2px",color:pct==null?C.dim:pct>=0?C.green:C.red}}>{pct==null?"—":`${pct>=0?"+":""}${pct.toFixed(2)}%`}</div>
          </div>);
      })}
    </div>);
});

// ═══ CHARTS TAB — module-level cache + canvas painter ════════════════════════
const chartCache=new Map(); // `${pair}|${tf}` → {ts,candles}
async function getChartCandles(pair,tf){
  const key=pair+"|"+tf;
  const hit=chartCache.get(key);
  if(hit&&Date.now()-hit.ts<60000) return hit.candles;
  const res=await fetch(`/api/candles?pair=${encodeURIComponent(pair)}&tf=${tf}&count=160`);
  if(!res.ok){ let msg="Candles "+res.status; try{const j=await res.json(); if(j.error)msg=j.error;}catch(_){} throw new Error(msg); }
  const data=await res.json();
  const candles=data.candles||[];
  chartCache.set(key,{ts:Date.now(),candles});
  return candles;
}
function drawChart(canvas,candles,pair){
  if(!canvas) return;
  const dpr=window.devicePixelRatio||1;
  const W=canvas.clientWidth||640, H=canvas.clientHeight||360;
  canvas.width=W*dpr; canvas.height=H*dpr;
  const ctx=canvas.getContext("2d"); ctx.scale(dpr,dpr);
  ctx.fillStyle=C.bg1; ctx.fillRect(0,0,W,H);
  if(!candles||candles.length<2){ ctx.fillStyle=C.muted; ctx.font="10px monospace"; ctx.fillText("No candle data",14,20); return; }
  const padL=8,padR=58,padT=10,padB=18;
  const cw=(W-padL-padR)/candles.length;
  const hi=Math.max(...candles.map(c=>c.h)), lo=Math.min(...candles.map(c=>c.l)), rg=hi-lo||1e-9;
  const y=v=>padT+(1-(v-lo)/rg)*(H-padT-padB);
  ctx.strokeStyle=C.bdr+"66"; ctx.fillStyle=C.muted; ctx.font="8.5px monospace"; ctx.textAlign="left";
  for(let i=0;i<=4;i++){
    const v=lo+rg*(i/4), yy=y(v);
    ctx.beginPath(); ctx.moveTo(padL,yy); ctx.lineTo(W-padR,yy); ctx.stroke();
    ctx.fillText(fmtP(pair,v),W-padR+5,yy+3);
  }
  candles.forEach((c,i)=>{
    const x=padL+i*cw+cw/2, up=c.c>=c.o, col=up?C.green:C.red;
    ctx.strokeStyle=col; ctx.beginPath(); ctx.moveTo(x,y(c.h)); ctx.lineTo(x,y(c.l)); ctx.stroke();
    ctx.fillStyle=col;
    const bt=y(Math.max(c.o,c.c)), bb=y(Math.min(c.o,c.c));
    ctx.fillRect(x-Math.max(1,cw*0.32),bt,Math.max(2,cw*0.64),Math.max(1,bb-bt));
  });
  const last=candles[candles.length-1].c, ly=y(last);
  ctx.strokeStyle=C.gold; ctx.setLineDash([4,3]); ctx.beginPath(); ctx.moveTo(padL,ly); ctx.lineTo(W-padR,ly); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle=C.gold; ctx.fillText(fmtP(pair,last),W-padR+5,ly+3);
}

const CHART_TFS=[["M15","M15"],["H1","H1"],["H4","H4"],["D1","D"]];
const ChartsTab=memo(({navigated})=>{
  const [pair,setPair]=useState(navigated||"EUR/USD");
  const [tf,setTf]=useState("H4");
  const [candles,setCandles]=useState(null);
  const [err,setErr]=useState(null);
  const [loading,setLoading]=useState(false);
  const canvasRef=useRef(null);
  const snap=usePriceSnap();
  useEffect(()=>{ if(navigated) setPair(navigated); },[navigated]);
  useEffect(()=>{
    let dead=false;
    setLoading(true); setErr(null);
    const apiTf=(CHART_TFS.find(t=>t[0]===tf)||["H4","H4"])[1];
    getChartCandles(pair,apiTf)
      .then(c=>{ if(!dead){ setCandles(c); setLoading(false);} })
      .catch(e=>{ if(!dead){ setErr(e.message); setCandles(null); setLoading(false);} });
    return()=>{dead=true;};
  },[pair,tf]);
  useEffect(()=>{ drawChart(canvasRef.current,candles,pair); },[candles,pair]);
  useEffect(()=>{
    const onR=()=>drawChart(canvasRef.current,candles,pair);
    window.addEventListener("resize",onR);
    return()=>window.removeEventListener("resize",onR);
  },[candles,pair]);
  const p=snap.prices&&snap.prices[pair], d=dailyChg(pair,snap);
  return(
    <div>
      <Card style={{marginBottom:"10px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px"}}>
          <div>
            <span style={{fontSize:"16px",fontWeight:"900",color:C.text,letterSpacing:"1px"}}>{pair}</span>
            <span style={{fontSize:"12px",marginLeft:"12px",color:C.text,fontWeight:"700"}}>{p?fmtP(pair,p.mid):"—"}</span>
            {d&&<span style={{fontSize:"10px",marginLeft:"8px",color:d.pct>=0?C.green:C.red,fontWeight:"700"}}>{`${d.pct>=0?"+":""}${d.pct.toFixed(2)}% · ${d.pips>=0?"+":""}${d.pips.toFixed(0)}p today`}</span>}
          </div>
          <div style={{display:"flex",gap:"5px",alignItems:"center"}}>
            {CHART_TFS.map(([k])=>(<Sm key={k} label={k} color={C.blue} active={tf===k} onClick={()=>setTf(k)}/>))}
            <a href={tvUrl(pair,tf==="D1"?"D":tf.replace("H","")==="1"?"60":tf==="H4"?"240":"15")} target="_blank" rel="noreferrer" style={{fontSize:"9px",color:C.muted,marginLeft:"6px",textDecoration:"none"}}>TradingView ↗</a>
          </div>
        </div>
        <div style={{marginTop:"10px",position:"relative"}}>
          <canvas ref={canvasRef} style={{width:"100%",height:"380px",display:"block",borderRadius:"3px"}}/>
          {loading&&<div style={{position:"absolute",top:"8px",left:"10px",fontSize:"9px",color:C.muted}}>loading…</div>}
          {err&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:C.bg1+"dd"}}>
            <span style={{color:C.red,fontSize:"10px"}}>◈ CHART FEED ERROR — {err}</span>
          </div>}
        </div>
        <div style={{fontSize:"8.5px",color:C.muted,marginTop:"6px"}}>OANDA mid candles · complete bars only · cached 60s</div>
      </Card>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(88px,1fr))",gap:"5px"}}>
        {ALL_PAIRS.map(pp=>(<Sm key={pp} label={pp} color={C.gold} active={pp===pair} onClick={()=>setPair(pp)}/>))}
      </div>
    </div>);
});

// ═══ DASHBOARD ═══════════════════════════════════════════════════════════════
const Dashboard=memo(({regimes,cbRates,cbAsOf,sigs,news,onGoTab,onOpenSig,onGoPair})=>{
  const dirColor=d=>d==="BULLISH"?C.green:d==="BEARISH"?C.red:C.amber;
  const dirArrow=d=>d==="BULLISH"?"▲":d==="BEARISH"?"▼":"◆";
  const carryRank=useMemo(()=>{
    if(!cbRates) return null;
    const rows=G10.filter(c=>cbRates[c]&&cbRates[c].rate!=null).map(c=>({c,r:cbRates[c].rate})).sort((a,b)=>b.r-a.r);
    const m={}; rows.forEach((x,i)=>{m[x.c]=i+1;}); return m;
  },[cbRates]);
  return(
    <div>
      <MarketPulse/>
      <Card style={{marginBottom:"12px"}}>
        <SecT t="G10 MACRO RECAP" sub={cbRates?"Regimes (Settings) + live FRED policy rates":"Regimes (Settings) — open CB RATES tab to load live policy rates"}/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(168px,1fr))",gap:"8px"}}>
          {G10.map(ccy=>{
            const r=regimes[ccy]||{dir:"NEUTRAL",strength:"WEAK"};
            const cb=cbRates&&cbRates[ccy];
            return(
              <div key={ccy} style={{background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"4px",padding:"9px 11px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:"13px",fontWeight:"900",color:C.text}}>{ccy}</span>
                  <span style={{fontSize:"11px",color:dirColor(r.dir),fontWeight:"800"}}>{dirArrow(r.dir)} {r.dir}</span>
                </div>
                <div style={{marginTop:"4px"}}><Bdg label={r.strength} color={r.strength==="STRONG"?C.gold:r.strength==="MODERATE"?C.blue:C.muted}/></div>
                <div style={{fontSize:"8.5px",color:C.muted,marginTop:"6px",lineHeight:"1.6"}}>
                  {cb?(
                    <span>{CB_NAMES[ccy]} <span style={{color:C.text,fontWeight:"700"}}>{cb.rate.toFixed(2)}%</span>{cb.outlook?<span style={{color:cb.outlook==="Hiking"?C.green:cb.outlook==="Cutting"?C.red:C.muted}}> · {cb.outlook}</span>:null}<br/>as of {cb.asOf}{carryRank&&carryRank[ccy]?` · carry #${carryRank[ccy]}`:""}</span>
                  ):(<span style={{color:C.dim}}>rate: not loaded</span>)}
                </div>
              </div>);
          })}
        </div>
      </Card>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"12px"}}>
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
            <SecT t="LATEST SIGNALS"/>
            <Btn label="VIEW ALL" ghost color={C.blue} onClick={()=>onGoTab("signals")} style={{padding:"4px 9px",fontSize:"9px"}}/>
          </div>
          {(!sigs||sigs.length===0)?(
            <div style={{fontSize:"9.5px",color:C.muted,padding:"12px 0"}}>No signals in memory. Open SIGNALS and RUN SCAN.</div>
          ):sigs.slice(0,4).map(sg=>(
            <div key={sg.id} onClick={()=>onOpenSig(sg)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${C.bdr}33`,cursor:"pointer"}}>
              <span style={{fontSize:"11px",fontWeight:"800",color:C.text}}>{sg.pair} <span style={{color:sg.direction==="BUY"?C.green:C.red}}>{sg.direction}</span></span>
              <span style={{fontSize:"9px",color:C.muted}}>{sg.probability}% · <SigAge ts={sg.ts}/></span>
            </div>))}
        </Card>
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
            <SecT t="LIVE HEADLINES"/>
            <Btn label="NEWS" ghost color={C.blue} onClick={()=>onGoTab("news")} style={{padding:"4px 9px",fontSize:"9px"}}/>
          </div>
          {(!news||news.length===0)?(
            <div style={{fontSize:"9.5px",color:C.muted,padding:"12px 0"}}>Open the NEWS tab to load live Finnhub headlines.</div>
          ):news.slice(0,3).map((a,i)=>(
            <div key={i} style={{padding:"6px 0",borderBottom:`1px solid ${C.bdr}33`}}>
              <a href={a.url} target="_blank" rel="noreferrer" style={{fontSize:"10px",color:C.text,textDecoration:"none",fontWeight:"600",lineHeight:"1.4"}}>{a.hl}</a>
              <div style={{fontSize:"8px",color:C.muted,marginTop:"2px"}}>{a.source} · {a.ts?timeAgo(a.ts):a.dt}</div>
            </div>))}
        </Card>
      </div>
      <PriceTable28 cbRates={cbRates} onGoPair={onGoPair}/>
    </div>);
});

// ═══ SIGNAL CARD ═════════════════════════════════════════════════════════════
const SignalCard=memo(({sig,onOpen,onTake})=>{
  const dc=sig.direction==="BUY"?C.green:C.red;
  const pc=sig.probability>=62?C.green:sig.probability>=55?C.gold:C.amber;
  const styleColor=SC[sig.tradeStyle]||C.blue;
  const lib=sig.lib;
  return(
    <div style={{background:C.bg1,border:`1px solid ${C.bdr}`,borderLeft:`3px solid ${dc}`,borderRadius:"4px",padding:"12px 14px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <span style={{fontSize:"15px",fontWeight:"900",color:C.text,letterSpacing:"0.5px"}}>{sig.pair}</span>
          <span style={{fontSize:"12px",fontWeight:"800",color:dc,marginLeft:"9px"}}>{sig.direction}</span>
          <div style={{marginTop:"5px",display:"flex",gap:"5px",flexWrap:"wrap",alignItems:"center"}}>
            <Bdg label={(sig.tradeStyle||"day").toUpperCase()} color={styleColor}/>
            <Bdg label={sig.timeframe||"H4"} color={C.blue}/>
            <span style={{fontSize:"8.5px",color:C.muted}}>hold {sig.holdTime||"1-3 days"}</span>
            {sig.isPureTASignal&&<Bdg label="PURE TA" color="#8f8fd0"/>}
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:"20px",fontWeight:"900",color:pc}}>{sig.probability}%</div>
          <div style={{fontSize:"7.5px",color:C.muted,letterSpacing:"1px"}}>LIVE PROB</div>
          <div style={{marginTop:"3px"}}><SigAge ts={sig.ts}/></div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"6px",marginTop:"10px"}}>
        {[["ENTRY",fmtP(sig.pair,sig.entry),C.text],["STOP",fmtP(sig.pair,sig.sl),C.red],["TP1",fmtP(sig.pair,sig.tp1),C.green]].map(([k,v,vc])=>(
          <div key={k} style={{background:C.bg2,borderRadius:"3px",padding:"6px 8px",textAlign:"center"}}>
            <div style={{fontSize:"7px",color:C.muted,letterSpacing:"1px"}}>{k}</div>
            <div style={{fontSize:"11px",fontWeight:"800",color:vc,marginTop:"2px"}}>{v}</div>
          </div>))}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:"9px",color:C.muted,marginTop:"8px"}}>
        <span>lot <span style={{color:C.text,fontWeight:"700"}}>{sig.lotSize}</span> · risk <span style={{color:C.amber,fontWeight:"700"}}>{fmtUsd(sig.riskAmount)}</span> · SL {sig.slPips}p · R:R {sig.rr1}</span>
        <span>{sig.strategiesTriggered} strats · score {sig.technicalScore}</span>
      </div>
      {lib&&(
        <div style={{marginTop:"8px",padding:"7px 9px",background:C.bg2,borderRadius:"3px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:"6px"}}>
            <span style={{fontSize:"9.5px",color:C.text,fontWeight:"700"}}>{lib.name}</span>
            <span style={{display:"flex",gap:"4px",alignItems:"center",flexShrink:0}}>
              <Bdg label={lib.tier} color={C.gold} sz="7.5px"/>
              <span style={{fontSize:"7.5px",color:C.muted}}>RESEARCH WR {lib.wr}%</span>
            </span>
          </div>
        </div>)}
      {sig.confluences&&sig.confluences.length>0&&(
        <div style={{marginTop:"7px",fontSize:"8.5px",color:C.muted,lineHeight:"1.7"}}>
          {sig.confluences.slice(0,2).map((cf,i)=>(<div key={i}>◆ {cf}</div>))}
        </div>)}
      <div style={{display:"flex",gap:"7px",marginTop:"10px"}}>
        <Btn label="DETAIL" ghost color={C.blue} onClick={()=>onOpen(sig)} style={{flex:1,padding:"6px"}}/>
        <Btn label="TAKE TRADE" color={dc} onClick={()=>onTake(sig)} style={{flex:1,padding:"6px"}}/>
      </div>
    </div>);
});

// ═══ SIGNALS TAB ═════════════════════════════════════════════════════════════
const SIG_CATS=["ALL","MACRO","TECHNICAL","MOMENTUM","CARRY","FLOW","MEAN REVERT","CORRELATION","RISK MGMT","PURE TECHNICAL"];
const SignalsTab=memo(({sigs,scanning,scanStatus,scanPartial,scanUnscanned,scanErrors,scanEngineErr,onScan,onOpenSig,onTake,stratCount})=>{
  const [cat,setCat]=useState("ALL");
  const [sortBy,setSortBy]=useState("PROB");
  const shown=useMemo(()=>{
    let list=[...(sigs||[])];
    if(cat!=="ALL") list=list.filter(s=>s.lib&&s.lib.cat===cat);
    list.sort((a,b)=>sortBy==="PROB"?b.probability-a.probability:b.ts-a.ts);
    return list;
  },[sigs,cat,sortBy]);
  return(
    <div>
      <Card style={{marginBottom:"10px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px"}}>
          <div>
            <div style={{fontSize:"11px",fontWeight:"800",letterSpacing:"1.5px",color:C.gold}}>SIGNAL ENGINE</div>
            <div style={{fontSize:"8.5px",color:C.muted,marginTop:"3px"}}>{stratCount} strategies wired · auto-scan every 5 min while this tab is visible · manual scan any time</div>
          </div>
          <Btn label={scanning?"SCANNING…":"RUN SCAN"} color={C.gold} disabled={scanning} onClick={onScan}/>
        </div>
        {scanStatus&&<div style={{fontSize:"9px",color:C.muted,marginTop:"8px"}}>{scanStatus}</div>}
      </Card>
      <MarketClosedNote/>
      {scanEngineErr&&(
        <div style={{padding:"10px 12px",background:C.red+"14",border:`1px solid ${C.red}66`,borderRadius:"4px",fontSize:"10px",color:C.red,marginBottom:"10px",lineHeight:"1.6"}}>
          ◈ ENGINE ERROR — {scanEngineErr.error}{scanEngineErr.action&&<div style={{color:C.amber,marginTop:"4px"}}>→ {scanEngineErr.action}</div>}
        </div>)}
      {scanPartial&&(
        <div style={{padding:"9px 12px",background:C.amber+"14",border:`1px solid ${C.amber}55`,borderRadius:"4px",fontSize:"9.5px",color:C.amber,marginBottom:"10px"}}>
          ◈ PARTIAL SCAN — time guard hit before {scanUnscanned&&scanUnscanned.length} pair(s): {(scanUnscanned||[]).join(", ")}. Re-run to cover them.
        </div>)}
      {scanErrors&&scanErrors.length>0&&(
        <div style={{padding:"9px 12px",background:C.red+"10",border:`1px solid ${C.red}44`,borderRadius:"4px",fontSize:"9px",color:C.red,marginBottom:"10px",lineHeight:"1.7"}}>
          ◈ {scanErrors.length} pair fetch error(s): {scanErrors.slice(0,4).join(" · ")}{scanErrors.length>4?" · …":""}
        </div>)}
      <div style={{display:"flex",gap:"5px",flexWrap:"wrap",marginBottom:"10px",alignItems:"center"}}>
        {SIG_CATS.map(cc=>(<Sm key={cc} label={cc} color={cc==="PURE TECHNICAL"?"#8f8fd0":C.blue} active={cat===cc} onClick={()=>setCat(cc)}/>))}
        <span style={{width:"10px"}}/>
        <Sm label="↓ PROB" color={C.gold} active={sortBy==="PROB"} onClick={()=>setSortBy("PROB")}/>
        <Sm label="↓ NEWEST" color={C.gold} active={sortBy==="TIME"} onClick={()=>setSortBy("TIME")}/>
      </div>
      {shown.length===0?(
        <Card><div style={{fontSize:"10px",color:C.muted,textAlign:"center",padding:"22px 0"}}>{sigs&&sigs.length>0?"No signals match this filter.":"No signals yet — RUN SCAN to analyze all 28 pairs against the live engine."}</div></Card>
      ):(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:"10px"}}>
          {shown.map(sg=>(<SignalCard key={sg.id} sig={sg} onOpen={onOpenSig} onTake={onTake}/>))}
        </div>)}
    </div>);
});

// ═══ STRATEGY LIBRARY TAB ════════════════════════════════════════════════════
const StrategiesTab=memo(({onOpenStrat,enabledMap})=>{
  const [tier,setTier]=useState("ALL");
  const [cat,setCat]=useState("ALL");
  const [pureOnly,setPureOnly]=useState(false);
  const counts=useMemo(()=>{
    const c={S:0,A:0,B:0,C:0};
    STRATEGIES.forEach(s=>{c[s.tier]=(c[s.tier]||0)+1;});
    return c;
  },[]);
  const cats=useMemo(()=>["ALL",...Object.keys(CATC)],[]);
  const shown=STRATEGIES.filter(s=>
    (tier==="ALL"||s.tier===tier)&&
    (cat==="ALL"||s.cat===cat)&&
    (!pureOnly||s.cat==="PURE TECHNICAL"));
  return(
    <div>
      <Card style={{marginBottom:"10px"}}>
        <SecT t="STRATEGY LIBRARY" sub={`${STRATEGIES.length} strategies — every entry is 1:1 wired to a live engine condition. Research WRs are literature-derived baselines, not live performance.`}/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"7px",marginTop:"8px"}}>
          {[["TOTAL",STRATEGIES.length,C.gold],["S-TIER",counts.S,C.gold],["A-TIER",counts.A,C.blue],["B-TIER",counts.B,C.muted],["C-TIER (PURE TA)",counts.C,"#8f8fd0"]].map(([k,v,vc])=>(
            <div key={k} style={{background:C.bg2,borderRadius:"3px",padding:"8px",textAlign:"center"}}>
              <div style={{fontSize:"16px",fontWeight:"900",color:vc}}>{v}</div>
              <div style={{fontSize:"7px",color:C.muted,letterSpacing:"1px",marginTop:"2px"}}>{k}</div>
            </div>))}
        </div>
      </Card>
      <div style={{display:"flex",gap:"5px",flexWrap:"wrap",marginBottom:"10px",alignItems:"center"}}>
        {["ALL","S","A","B","C"].map(t=>(<Sm key={t} label={t} color={C.gold} active={tier===t} onClick={()=>setTier(t)}/>))}
        <span style={{width:"8px"}}/>
        {cats.map(cc=>(<Sm key={cc} label={cc} color={cc==="PURE TECHNICAL"?"#8f8fd0":C.blue} active={cat===cc} onClick={()=>setCat(cc)}/>))}
        <span style={{width:"8px"}}/>
        <Sm label="PURE TA ONLY" color="#8f8fd0" active={pureOnly} onClick={()=>setPureOnly(!pureOnly)}/>
      </div>
      <Card style={{padding:"0",overflow:"hidden"}}>
        {shown.map((s,i)=>(
          <div key={s.id} onClick={()=>onOpenStrat(s)} style={{display:"flex",alignItems:"center",gap:"10px",padding:"9px 14px",borderBottom:i<shown.length-1?`1px solid ${C.bdr}33`:"none",cursor:"pointer"}}>
            <Bdg label={s.tier} color={s.tier==="S"?C.gold:s.tier==="A"?C.blue:s.tier==="C"?"#8f8fd0":C.muted}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"baseline",gap:"7px",flexWrap:"wrap"}}>
                <span style={{fontSize:"10.5px",fontWeight:"800",color:C.text}}>{s.name}</span>
                <span style={{fontSize:"7.5px",color:C.dim}}>{s.id}</span>
                {enabledMap&&enabledMap[s.id]===false&&<Bdg label="OFF" color={C.dim} sz="7px"/>}
              </div>
              <div style={{fontSize:"8.5px",color:C.muted,marginTop:"2px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.note}</div>
            </div>
            <Tag label={s.cat} color={CATC[s.cat]||C.muted}/>
            <span style={{fontSize:"8.5px",color:C.muted,width:"52px",textAlign:"right",flexShrink:0}}>{s.tf}</span>
            <span style={{fontSize:"9.5px",color:C.gold,fontWeight:"800",width:"64px",textAlign:"right",flexShrink:0}}>WR {s.wr}%</span>
          </div>))}
      </Card>
    </div>);
});

// ═══ ANALYZER TAB — manual AI regime assessment, grounded + whitelisted ══════
const AnalyzerTab=memo(({regimes,regimeAI,onGenerate,onCopyJSON}) =>{
  const {cards,loading,error,generatedAt}=regimeAI;
  const dirColor=d=>d==="BULLISH"?C.green:d==="BEARISH"?C.red:C.amber;
  return(
    <div>
      <Card style={{marginBottom:"10px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px"}}>
          <SecT t="AI REGIME ANALYZER" sub="Manual on-demand. The model receives ONLY live terminal data (FRED policy rates, prices, your current regimes) and may cite only official central-bank sources. Nothing runs automatically."/>
          <Btn label={loading?"GENERATING…":"GENERATE ASSESSMENT"} color={C.gold} disabled={loading} onClick={onGenerate}/>
        </div>
        {generatedAt&&<div style={{fontSize:"8.5px",color:C.muted,marginTop:"6px"}}>Generated {timeAgo(generatedAt)} · pinned server-side model</div>}
      </Card>
      {error&&(
        <div style={{padding:"10px 12px",background:C.red+"14",border:`1px solid ${C.red}66`,borderRadius:"4px",fontSize:"10px",color:C.red,marginBottom:"10px"}}>◈ ANALYZER ERROR — {error}</div>)}
      <Card style={{marginBottom:"10px"}}>
        <SecT t="CURRENT REGIMES (SETTINGS → ENGINE)" sub="These drive the live engine via the AXIOM_REGIMES env var. Edit in Settings."/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:"6px"}}>
          {G10.map(ccy=>{const r=regimes[ccy]||{dir:"NEUTRAL",strength:"WEAK"};
            return(<div key={ccy} style={{background:C.bg2,borderRadius:"3px",padding:"7px 9px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:"10px",fontWeight:"800",color:C.text}}>{ccy}</span>
              <span style={{fontSize:"8.5px",fontWeight:"700",color:dirColor(r.dir)}}>{r.dir.slice(0,4)} · {r.strength.slice(0,3)}</span>
            </div>);})}
        </div>
      </Card>
      {cards&&cards.length>0&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
            <span style={{fontSize:"10px",fontWeight:"800",color:C.gold,letterSpacing:"1px"}}>AI SUGGESTED REGIMES</span>
            <Btn label="COPY AXIOM_REGIMES JSON" ghost color={C.blue} onClick={onCopyJSON} style={{padding:"5px 10px",fontSize:"8.5px"}}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:"10px"}}>
            {cards.map(cd=>(
              <Card key={cd.ccy}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:"14px",fontWeight:"900",color:C.text}}>{cd.ccy}</span>
                  <span style={{display:"flex",gap:"5px"}}>
                    <Bdg label={cd.regime} color={dirColor(cd.regime)}/>
                    <Bdg label={cd.strength} color={cd.strength==="STRONG"?C.gold:cd.strength==="MODERATE"?C.blue:C.muted}/>
                  </span>
                </div>
                <div style={{fontSize:"9.5px",color:C.text,marginTop:"8px",lineHeight:"1.7"}}>{cd.detail}</div>
                {cd.summary&&<div style={{fontSize:"8.5px",color:C.muted,marginTop:"6px",fontStyle:"italic"}}>{cd.summary}</div>}
                {cd.best_strat&&cd.best_strat.length>0&&(
                  <div style={{marginTop:"8px",fontSize:"8.5px",color:C.muted}}>Favors: {cd.best_strat.map(id=>(<Tag key={id} label={id} color={C.green}/>))}</div>)}
                {cd.avoid&&cd.avoid.length>0&&(
                  <div style={{marginTop:"5px",fontSize:"8.5px",color:C.muted}}>Avoid: {cd.avoid.map(id=>(<Tag key={id} label={id} color={C.red}/>))}</div>)}
                {cd.url&&<a href={cd.url} target="_blank" rel="noreferrer" style={{display:"inline-block",marginTop:"9px",fontSize:"8.5px",color:C.blue,textDecoration:"none"}}>{cd.evidence||"Official source"} ↗</a>}
              </Card>))}
          </div>
        </div>)}
      {!cards&&!loading&&!error&&(
        <Card><div style={{fontSize:"9.5px",color:C.muted,textAlign:"center",padding:"18px 0"}}>No assessment generated this session. GENERATE runs one grounded pass — review, then apply via Settings → Regime editor if you agree.</div></Card>)}
      <div style={{marginTop:"12px"}}>
        <SecT t="MOMENTUM MAP (DAILY Δ)"/>
        <MomentumGrid/>
      </div>
    </div>);
});

// ═══ WEEKEND DESK — manual, grounded in live rates + calendar ════════════════
const WeekendTab=memo(({weekend,onGenerate})=>{
  const {themes,loading,error,generatedAt}=weekend;
  return(
    <div>
      <Card style={{marginBottom:"10px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px"}}>
          <SecT t="WEEKEND STRATEGY DESK" sub="Manual on-demand macro brief. Grounded exclusively in this terminal's live data: FRED policy rates (with as-of dates), your regimes, live prices, and THIS WEEK's high-impact calendar. Evidence links restricted to official central-bank sources."/>
          <Btn label={loading?"GENERATING…":"GENERATE BRIEF"} color={C.gold} disabled={loading} onClick={onGenerate}/>
        </div>
        {generatedAt&&<div style={{fontSize:"8.5px",color:C.muted,marginTop:"6px"}}>Generated {timeAgo(generatedAt)}</div>}
      </Card>
      {error&&(<div style={{padding:"10px 12px",background:C.red+"14",border:`1px solid ${C.red}66`,borderRadius:"4px",fontSize:"10px",color:C.red,marginBottom:"10px",lineHeight:"1.6"}}>◈ WEEKEND DESK ERROR — {error}</div>)}
      {!themes&&!loading&&!error&&(
        <Card><div style={{fontSize:"9.5px",color:C.muted,textAlign:"center",padding:"18px 0"}}>No brief generated this session. GENERATE pulls live CB rates + this week's calendar first, then writes themes from that data only.</div></Card>)}
      {themes&&themes.map((t,i)=>(
        <Card key={i} style={{marginBottom:"10px",borderLeft:`3px solid ${t.color||C.gold}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"8px",flexWrap:"wrap"}}>
            <div>
              <span style={{fontSize:"13px",fontWeight:"900",color:C.text}}>{t.ccy} — {t.title}</span>
              <div style={{marginTop:"4px",display:"flex",gap:"5px"}}>
                <Bdg label={t.dir} color={t.dir==="BULLISH"?C.green:t.dir==="BEARISH"?C.red:C.amber}/>
                {t.priority&&<Bdg label={t.priority+" PRIORITY"} color={t.priority==="HIGH"?C.red:C.amber}/>}
              </div>
            </div>
            {(t.pairs||[]).length>0&&(
              <div style={{display:"flex",gap:"5px",flexWrap:"wrap"}}>
                {t.pairs.map((p,j)=>(<Bdg key={p} label={`${p} ${(t.dirs&&t.dirs[j])||""}`} color={(t.dirs&&t.dirs[j])==="BUY"?C.green:(t.dirs&&t.dirs[j])==="SELL"?C.red:C.blue}/>))}
              </div>)}
          </div>
          <div style={{fontSize:"10px",color:C.text,marginTop:"9px",lineHeight:"1.8"}}>{t.detail}</div>
          {t.deepAnalysis&&<div style={{fontSize:"9px",color:C.muted,marginTop:"7px",lineHeight:"1.8"}}>{t.deepAnalysis}</div>}
          {(t.support||t.resistance||t.pivot)&&(
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"6px",marginTop:"9px"}}>
              {[["SUPPORT",t.support,C.green],["PIVOT",t.pivot,C.gold],["RESISTANCE",t.resistance,C.red]].map(([k,v,vc])=>(
                <div key={k} style={{background:C.bg2,borderRadius:"3px",padding:"6px",textAlign:"center"}}>
                  <div style={{fontSize:"7px",color:C.muted,letterSpacing:"1px"}}>{k}</div>
                  <div style={{fontSize:"10.5px",fontWeight:"800",color:vc,marginTop:"2px"}}>{v||"—"}</div>
                </div>))}
            </div>)}
          {t.watchFor&&<div style={{fontSize:"9px",color:C.amber,marginTop:"8px"}}>◈ WATCH: {t.watchFor}</div>}
          {t.evidence&&t.evidence.length>0&&(
            <div style={{marginTop:"9px",display:"flex",gap:"10px",flexWrap:"wrap"}}>
              {t.evidence.map((e,j)=>(<a key={j} href={e.url} target="_blank" rel="noreferrer" style={{fontSize:"8.5px",color:C.blue,textDecoration:"none"}}>{e.source||e.title} ↗</a>))}
            </div>)}
        </Card>))}
    </div>);
});

// ═══ CALENDAR TAB — server-parsed feed, local-time render ════════════════════
const CAL_TYPES=["ALL","CB Decision","CB Speech","Inflation","Employment","GDP","PMI","Retail","Trade","Housing","Sentiment","Manufacturing","Other"];
const CalendarTab=memo(({calThis,calNext,calError,calLoading,onReload})=>{
  const [view,setView]=useState("THIS WEEK");
  const [ccy,setCcy]=useState("ALL");
  const [typ,setTyp]=useState("ALL");
  const [impOnly,setImpOnly]=useState(false);
  const source=view==="NEXT WEEK"?calNext:calThis;
  const events=useMemo(()=>{
    if(!source) return null;
    let ev=source.map(e=>({...e,local:new Date(e.utc)}));
    if(view==="TODAY"){ const today=localDateKey(new Date()); ev=ev.filter(e=>localDateKey(e.local)===today); }
    if(ccy!=="ALL") ev=ev.filter(e=>e.ccy===ccy);
    if(typ!=="ALL") ev=ev.filter(e=>e.type===typ);
    if(impOnly) ev=ev.filter(e=>e.imp==="HIGH");
    return ev;
  },[source,view,ccy,typ,impOnly]);
  const grouped=useMemo(()=>{
    if(!events) return [];
    const g={};
    events.forEach(e=>{const k=localDateKey(e.local); (g[k]=g[k]||[]).push(e);});
    return Object.entries(g).sort((a,b)=>a[0].localeCompare(b[0]));
  },[events]);
  const impColor=i=>i==="HIGH"?C.red:i==="MED"?C.amber:C.muted;
  return(
    <div>
      <Card style={{marginBottom:"10px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px"}}>
          <SecT t="ECONOMIC CALENDAR" sub={source?`✓ LIVE — ForexFactory feed · ${source.length} events this ${view==="NEXT WEEK"?"(next) week":"week"} · all times local`:calLoading?"loading…":"feed not loaded"}/>
          <div style={{display:"flex",gap:"5px"}}>
            {["TODAY","THIS WEEK","NEXT WEEK"].map(v=>(<Sm key={v} label={v} color={C.gold} active={view===v} onClick={()=>setView(v)}/>))}
            <Sm label="↻" color={C.blue} onClick={()=>onReload(view==="NEXT WEEK"?"next":"this")}/>
          </div>
        </div>
      </Card>
      {calError&&(
        <div style={{padding:"12px 14px",background:C.red+"14",border:`1px solid ${C.red}66`,borderRadius:"4px",marginBottom:"10px"}}>
          <div style={{fontSize:"11px",color:C.red,fontWeight:"800"}}>◈ CALENDAR FEED DOWN</div>
          <div style={{fontSize:"9.5px",color:C.text,marginTop:"5px",lineHeight:"1.7"}}>{calError}</div>
          <div style={{fontSize:"9px",color:C.muted,marginTop:"5px"}}>No cached or substituted events are shown. Retry, or check the ForexFactory feed status.</div>
        </div>)}
      <div style={{display:"flex",gap:"5px",flexWrap:"wrap",marginBottom:"10px",alignItems:"center"}}>
        {["ALL",...G10.filter(c=>c!=="NOK"&&c!=="SEK"),"CNY"].map(cc=>(<Sm key={cc} label={cc} color={C.blue} active={ccy===cc} onClick={()=>setCcy(cc)}/>))}
        <span style={{width:"8px"}}/>
        <Sm label="HIGH ONLY" color={C.red} active={impOnly} onClick={()=>setImpOnly(!impOnly)}/>
      </div>
      <div style={{display:"flex",gap:"5px",flexWrap:"wrap",marginBottom:"10px"}}>
        {CAL_TYPES.map(t=>(<Sm key={t} label={t} color="#8f8fd0" active={typ===t} onClick={()=>setTyp(t)}/>))}
      </div>
      {!calError&&events&&events.length===0&&(
        <Card><div style={{fontSize:"10px",color:C.muted,textAlign:"center",padding:"18px 0"}}>No events match the current filters{view==="TODAY"?" today":""}.</div></Card>)}
      {grouped.map(([day,evs])=>(
        <Card key={day} style={{marginBottom:"10px",padding:"0",overflow:"hidden"}}>
          <div style={{padding:"8px 14px",background:C.bg2,fontSize:"9.5px",fontWeight:"800",color:C.gold,letterSpacing:"1px"}}>
            {new Date(evs[0].local).toLocaleDateString([],{weekday:"long",month:"short",day:"numeric"})}
          </div>
          {evs.map((e,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 14px",borderBottom:i<evs.length-1?`1px solid ${C.bdr}33`:"none"}}>
              <span style={{fontSize:"9.5px",color:C.muted,width:"58px",flexShrink:0,fontVariantNumeric:"tabular-nums"}}>{e.allDay?"All day":e.local.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
              <span style={{fontSize:"10px",fontWeight:"800",color:C.text,width:"36px",flexShrink:0}}>{e.ccy}</span>
              <Tag label={e.type} color="#3a3a5a"/>
              <span style={{fontSize:"10px",color:C.text,flex:1}}>{e.ev}</span>
              <Bdg label={e.imp} color={impColor(e.imp)} sz="7.5px"/>
              <span style={{fontSize:"8.5px",color:C.muted,width:"110px",textAlign:"right",flexShrink:0}}>{e.fc?`F: ${e.fc}`:""}{e.fc&&e.pr?" · ":""}{e.pr?`P: ${e.pr}`:""}</span>
            </div>))}
        </Card>))}
    </div>);
});

// ═══ NEWS TAB — live Finnhub only ════════════════════════════════════════════
const NewsTab=memo(({articles,newsError,newsLoading,onRefresh,onLoadMore})=>{
  const [ccy,setCcy]=useState("ALL");
  const [impOnly,setImpOnly]=useState(false);
  const shown=useMemo(()=>{
    let a=articles||[];
    if(ccy!=="ALL") a=a.filter(x=>x.ccy===ccy);
    if(impOnly) a=a.filter(x=>x.imp==="HIGH");
    return a;
  },[articles,ccy,impOnly]);
  return(
    <div>
      <Card style={{marginBottom:"10px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px"}}>
          <SecT t="FX NEWS WIRE" sub={articles?`✓ LIVE — Finnhub forex feed · ${articles.length} articles · real sources only, no AI-generated content`:newsLoading?"loading…":"feed not loaded"}/>
          <div style={{display:"flex",gap:"6px"}}>
            <Btn label={newsLoading?"…":"REFRESH"} ghost color={C.blue} disabled={newsLoading} onClick={onRefresh} style={{padding:"5px 10px",fontSize:"9px"}}/>
            <Btn label="LOAD MORE" ghost color={C.muted} disabled={newsLoading} onClick={onLoadMore} style={{padding:"5px 10px",fontSize:"9px"}}/>
          </div>
        </div>
      </Card>
      {newsError&&(
        <div style={{padding:"12px 14px",background:C.red+"14",border:`1px solid ${C.red}66`,borderRadius:"4px",marginBottom:"10px"}}>
          <div style={{fontSize:"11px",color:C.red,fontWeight:"800"}}>◈ NEWS FEED DOWN</div>
          <div style={{fontSize:"9.5px",color:C.text,marginTop:"5px",lineHeight:"1.7"}}>{newsError}</div>
          <div style={{fontSize:"9px",color:C.muted,marginTop:"5px"}}>Nothing substituted. Check FINNHUB_API_KEY in Netlify env vars, then REFRESH.</div>
        </div>)}
      <div style={{display:"flex",gap:"5px",flexWrap:"wrap",marginBottom:"10px",alignItems:"center"}}>
        {["ALL",...G10,"FX"].map(cc=>(<Sm key={cc} label={cc} color={C.blue} active={ccy===cc} onClick={()=>setCcy(cc)}/>))}
        <span style={{width:"8px"}}/>
        <Sm label="HIGH IMPACT" color={C.red} active={impOnly} onClick={()=>setImpOnly(!impOnly)}/>
      </div>
      {articles&&shown.length===0&&(<Card><div style={{fontSize:"10px",color:C.muted,textAlign:"center",padding:"18px 0"}}>No articles match this filter.</div></Card>)}
      {shown.map((a,i)=>(
        <Card key={a.id||i} style={{marginBottom:"8px"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:"10px",alignItems:"flex-start"}}>
            <a href={a.url} target="_blank" rel="noreferrer" style={{fontSize:"11px",fontWeight:"700",color:C.text,textDecoration:"none",lineHeight:"1.5",flex:1}}>{a.hl}</a>
            <div style={{display:"flex",gap:"4px",flexShrink:0}}>
              {a.ccy&&<Bdg label={a.ccy} color={C.blue} sz="7.5px"/>}
              {a.imp&&<Bdg label={a.imp} color={a.imp==="HIGH"?C.red:a.imp==="MED"?C.amber:C.muted} sz="7.5px"/>}
            </div>
          </div>
          {a.detail&&<div style={{fontSize:"9px",color:C.muted,marginTop:"6px",lineHeight:"1.7"}}>{a.detail}</div>}
          <div style={{fontSize:"8px",color:C.dim,marginTop:"6px"}}>{a.source} · {a.ts?timeAgo(a.ts):a.dt} · <a href={a.url} target="_blank" rel="noreferrer" style={{color:C.blue,textDecoration:"none"}}>read ↗</a></div>
        </Card>))}
    </div>);
});

// ═══ CB RATES TAB — live FRED, derived outlook/bias, as-of transparency ══════
const CBRatesTab=memo(({cbRates,cbSource,cbErrors,cbLoading,onOpenCB,onReload})=>{
  const loaded=cbRates?Object.keys(cbRates).length:0;
  return(
    <div>
      <Card style={{marginBottom:"10px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px"}}>
          <SecT t="CENTRAL BANK POLICY RATES" sub={cbRates?`✓ LIVE — FRED · ${loaded}/10 currencies · outlook & bias are DERIVED from each series' 12-month history (change ≤8 months → trajectory), not editorial claims`:cbLoading?"loading…":"feed not loaded"}/>
          <Btn label={cbLoading?"…":"RELOAD"} ghost color={C.blue} disabled={cbLoading} onClick={onReload} style={{padding:"5px 10px",fontSize:"9px"}}/>
        </div>
      </Card>
      {cbSource==="FRED_PARTIAL"&&(
        <div style={{padding:"9px 12px",background:C.amber+"14",border:`1px solid ${C.amber}55`,borderRadius:"4px",fontSize:"9.5px",color:C.amber,marginBottom:"10px"}}>
          ◈ PARTIAL — {loaded}/10 loaded. Missing: {(cbErrors||[]).map(e=>e.split(":")[0]).join(", ")}. Carry strategies treat missing legs as unavailable (never guessed).
        </div>)}
      {cbSource==="error"&&(
        <div style={{padding:"12px 14px",background:C.red+"14",border:`1px solid ${C.red}66`,borderRadius:"4px",marginBottom:"10px"}}>
          <div style={{fontSize:"11px",color:C.red,fontWeight:"800"}}>◈ CB RATES FEED DOWN</div>
          <div style={{fontSize:"9.5px",color:C.text,marginTop:"5px"}}>{(cbErrors&&cbErrors[0])||"FRED unreachable"}</div>
          <div style={{fontSize:"9px",color:C.muted,marginTop:"5px"}}>All carry-family strategies are inert until this recovers. Check FRED_API_KEY.</div>
        </div>)}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))",gap:"10px"}}>
        {G10.map(ccy=>{
          const r=cbRates&&cbRates[ccy];
          if(!r) return(
            <Card key={ccy} style={{opacity:0.55}}>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:"13px",fontWeight:"900",color:C.text}}>{ccy}</span><Bdg label="NO DATA" color={C.red} sz="7.5px"/></div>
              <div style={{fontSize:"8.5px",color:C.muted,marginTop:"8px"}}>{CB_NAMES[ccy]} — series unavailable this load.</div>
            </Card>);
          const delta=r.prev!=null?r.rate-r.prev:null;
          return(
            <Card key={ccy} style={{cursor:"pointer"}} >
              <div onClick={()=>onOpenCB(ccy)}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:"13px",fontWeight:"900",color:C.text}}>{ccy}</span>
                  <span style={{fontSize:"17px",fontWeight:"900",color:C.gold}}>{r.rate.toFixed(2)}%</span>
                </div>
                <div style={{fontSize:"8.5px",color:C.muted,marginTop:"3px"}}>{CB_NAMES[ccy]}{delta!=null&&delta!==0?<span style={{color:delta>0?C.green:C.red}}> · last Δ {delta>0?"+":""}{(delta*100).toFixed(0)}bp</span>:null}</div>
                <div style={{display:"flex",gap:"5px",marginTop:"8px",flexWrap:"wrap"}}>
                  {r.outlook&&<Bdg label={r.outlook.toUpperCase()} color={r.outlook==="Hiking"?C.green:r.outlook==="Cutting"?C.red:C.muted} sz="7.5px"/>}
                  {r.bias&&<Bdg label={r.bias.toUpperCase()} color={r.bias==="Hawkish"?C.green:r.bias==="Dovish"?C.red:C.muted} sz="7.5px"/>}
                  {r.freq&&<Bdg label={r.freq==="monthly"?"MONTHLY SERIES":"DAILY SERIES"} color={C.dim} sz="7px"/>}
                </div>
                <div style={{marginTop:"9px"}}><Spark data={(r.hist||[]).map(h=>h.r)} w={180} h={26} color={C.gold}/></div>
                <div style={{fontSize:"8px",color:C.muted,marginTop:"6px"}}>as of {r.asOf}</div>
              </div>
              <a href={CB_SOURCE_URLS[ccy]} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{display:"inline-block",marginTop:"7px",fontSize:"8.5px",color:C.blue,textDecoration:"none"}}>Official {CB_NAMES[ccy]} ↗</a>
            </Card>);
        })}
      </div>
    </div>);
});

// ═══ AI TAB (messages view — input is fixed at root) ═════════════════════════
const AITabView=memo(({msgs,sending})=>{
  const endRef=useRef(null);
  useEffect(()=>{ if(endRef.current) endRef.current.scrollIntoView({behavior:"smooth",block:"end"}); },[msgs,sending]);
  return(
    <div style={{paddingBottom:"64px"}}>
      <Card style={{marginBottom:"10px"}}>
        <SecT t="AXIOM AI DESK" sub="Grounded assistant: every message carries a live snapshot (prices, regimes, FRED rates, your open trades). It is instructed to say 'unavailable' rather than invent any number. Model pinned server-side."/>
      </Card>
      {(!msgs||msgs.length===0)&&(
        <Card><div style={{fontSize:"9.5px",color:C.muted,textAlign:"center",padding:"16px 0"}}>Ask about live carry rankings, a pair's regime setup, or an open trade. The desk sees exactly what the terminal sees — nothing more.</div></Card>)}
      {(msgs||[]).map((m,i)=>(
        <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",marginBottom:"8px"}}>
          <div style={{maxWidth:"78%",background:m.role==="user"?C.bg3:C.bg1,border:`1px solid ${m.role==="user"?C.blue+"44":C.bdr}`,borderRadius:"6px",padding:"9px 12px"}}>
            <div style={{fontSize:"7.5px",color:m.role==="user"?C.blue:C.gold,fontWeight:"800",letterSpacing:"1px",marginBottom:"4px"}}>{m.role==="user"?"YOU":"AXIOM"}</div>
            <div style={{fontSize:"10.5px",color:C.text,lineHeight:"1.75",whiteSpace:"pre-wrap"}}>{m.content}</div>
          </div>
        </div>))}
      {sending&&<div style={{fontSize:"9px",color:C.muted}}>AXIOM is thinking…</div>}
      <div ref={endRef}/>
    </div>);
});

// ═══ TRADES TAB — paper positions, live P&L from the same math as the engine ═
const TradesTab=memo(({trades,history,onBE,onCloseHalf,onClose,acct})=>{
  const openPnl=(trades||[]).reduce((a,t)=>a+(t.pnl||0),0);
  return(
    <div>
      <Card style={{marginBottom:"10px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px"}}>
          <SecT t="OPEN PAPER TRADES" sub={`P&L uses live mid + the engine's pip-value model (USD conversion legs) — the same math that sized the position. Account ${fmtUsd(acct)}.`}/>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:"16px",fontWeight:"900",color:openPnl>=0?C.green:C.red}}>{fmtUsd(openPnl)}</div>
            <div style={{fontSize:"7.5px",color:C.muted,letterSpacing:"1px"}}>OPEN P&L</div>
          </div>
        </div>
      </Card>
      {(!trades||trades.length===0)&&(
        <Card style={{marginBottom:"12px"}}><div style={{fontSize:"10px",color:C.muted,textAlign:"center",padding:"18px 0"}}>No open trades. TAKE a signal from the Signals tab to paper-trade it here.</div></Card>)}
      {(trades||[]).map(t=>{
        const dc=t.direction==="BUY"?C.green:C.red;
        const atBE=Math.abs(t.sl-t.entry)<1e-9;
        return(
          <Card key={t.id} style={{marginBottom:"10px",borderLeft:`3px solid ${dc}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:"8px"}}>
              <div>
                <span style={{fontSize:"14px",fontWeight:"900",color:C.text}}>{t.pair}</span>
                <span style={{fontSize:"11px",fontWeight:"800",color:dc,marginLeft:"8px"}}>{t.direction}</span>
                <span style={{fontSize:"9px",color:C.muted,marginLeft:"8px"}}>{t.lotSize} lot · {t.strategyName||t.strategyId}</span>
                {atBE&&<Bdg label="SL @ BE" color={C.blue} sz="7px"/>}
                {t.partialTaken&&<Bdg label="50% BANKED" color={C.gold} sz="7px"/>}
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:"15px",fontWeight:"900",color:(t.pnl||0)>=0?C.green:C.red}}>{fmtUsd(t.pnl)}</div>
                <div style={{fontSize:"8px",color:C.muted}}>{(t.pips||0)>=0?"+":""}{(t.pips||0).toFixed(1)} pips</div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"6px",marginTop:"9px"}}>
              {[["ENTRY",fmtP(t.pair,t.entry),C.text],["STOP",fmtP(t.pair,t.sl),atBE?C.blue:C.red],["TP1",fmtP(t.pair,t.tp1),C.green],["RISK",fmtUsd(atBE?0:t.riskAmount),atBE?C.blue:C.amber]].map(([k,v,vc])=>(
                <div key={k} style={{background:C.bg2,borderRadius:"3px",padding:"5px",textAlign:"center"}}>
                  <div style={{fontSize:"6.5px",color:C.muted,letterSpacing:"1px"}}>{k}</div>
                  <div style={{fontSize:"10px",fontWeight:"800",color:vc,marginTop:"2px"}}>{v}</div>
                </div>))}
            </div>
            <div style={{display:"flex",gap:"6px",marginTop:"10px"}}>
              <Btn label="SL → BE" ghost color={C.blue} disabled={atBE} onClick={()=>onBE(t.id)} style={{flex:1,padding:"6px",fontSize:"9px"}}/>
              <Btn label="CLOSE 50%" ghost color={C.gold} disabled={t.lotSize<0.02} onClick={()=>onCloseHalf(t.id)} style={{flex:1,padding:"6px",fontSize:"9px"}}/>
              <Btn label="CLOSE" color={C.red} onClick={()=>onClose(t.id)} style={{flex:1,padding:"6px",fontSize:"9px"}}/>
            </div>
            <div style={{fontSize:"8px",color:C.dim,marginTop:"7px"}}>opened {timeAgo(t.openTime)} · pip value {fmtUsd((t.pipValuePerLot||0)*t.lotSize)}/pip</div>
          </Card>);
      })}
      {history&&history.length>0&&(
        <Card style={{padding:"0",overflow:"hidden"}}>
          <div style={{padding:"9px 14px",borderBottom:`1px solid ${C.bdr}`,fontSize:"10px",fontWeight:"800",color:C.gold,letterSpacing:"1px"}}>RECENT CLOSES</div>
          {history.slice(0,8).map(hh=>(
            <div key={hh.id+String(hh.closeTime)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 14px",borderBottom:`1px solid ${C.bdr}22`,fontSize:"9.5px"}}>
              <span style={{color:C.text,fontWeight:"700"}}>{hh.pair} <span style={{color:hh.direction==="BUY"?C.green:C.red}}>{hh.direction}</span>{hh.partial&&<span style={{color:C.gold,fontSize:"7.5px"}}> · PARTIAL</span>}</span>
              <span style={{color:C.muted}}>{(hh.finalPips||0)>=0?"+":""}{(hh.finalPips||0).toFixed(1)}p</span>
              <span style={{color:(hh.finalPnl||0)>=0?C.green:C.red,fontWeight:"800"}}>{fmtUsd(hh.finalPnl)}</span>
            </div>))}
        </Card>)}
    </div>);
});

// ═══ PERFORMANCE TAB ═════════════════════════════════════════════════════════
const PerformanceTab=memo(({history,onExport})=>{
  const [range,setRange]=useState("ALL");
  const filtered=useMemo(()=>{
    const h=history||[];
    if(range==="ALL") return h;
    const days=range==="7D"?7:range==="30D"?30:90;
    const cut=Date.now()-days*864e5;
    return h.filter(x=>(x.closeTime||0)>=cut);
  },[history,range]);
  const stats=useMemo(()=>{
    const h=filtered;
    if(!h.length) return null;
    const wins=h.filter(x=>(x.finalPnl||0)>0), losses=h.filter(x=>(x.finalPnl||0)<=0);
    const totalPnl=h.reduce((a,x)=>a+(x.finalPnl||0),0);
    const gw=wins.reduce((a,x)=>a+x.finalPnl,0), gl=Math.abs(losses.reduce((a,x)=>a+x.finalPnl,0));
    const sorted=[...h].sort((a,b)=>(a.closeTime||0)-(b.closeTime||0));
    let eq=0,peak=0,maxDD=0,consecL=0,maxConsecL=0;
    const curve=sorted.map(x=>{eq+=(x.finalPnl||0);peak=Math.max(peak,eq);maxDD=Math.max(maxDD,peak-eq);
      if((x.finalPnl||0)<=0){consecL++;maxConsecL=Math.max(maxConsecL,consecL);}else consecL=0;
      return eq;});
    const wr=wins.length/h.length*100;
    const avgW=wins.length?gw/wins.length:0, avgL=losses.length?gl/losses.length:0;
    const byStyle={}, byStrat={};
    h.forEach(x=>{
      const st=x.style||"day"; (byStyle[st]=byStyle[st]||{n:0,pnl:0,w:0}); byStyle[st].n++; byStyle[st].pnl+=(x.finalPnl||0); if((x.finalPnl||0)>0)byStyle[st].w++;
      const sg=x.strategyId||"?"; (byStrat[sg]=byStrat[sg]||{n:0,pnl:0,w:0}); byStrat[sg].n++; byStrat[sg].pnl+=(x.finalPnl||0); if((x.finalPnl||0)>0)byStrat[sg].w++;
    });
    return{n:h.length,wins:wins.length,losses:losses.length,wr,totalPnl,pf:gl>0?gw/gl:gw>0?99:0,avgW,avgL,
      expectancy:(wr/100)*avgW-(1-wr/100)*avgL,maxDD,maxConsecL,curve,byStyle,byStrat};
  },[filtered]);
  const Stat=({k,v,vc})=>(
    <div style={{background:C.bg2,borderRadius:"3px",padding:"9px",textAlign:"center"}}>
      <div style={{fontSize:"14px",fontWeight:"900",color:vc||C.text}}>{v}</div>
      <div style={{fontSize:"6.5px",color:C.muted,letterSpacing:"1px",marginTop:"3px"}}>{k}</div>
    </div>);
  return(
    <div>
      <Card style={{marginBottom:"10px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px"}}>
          <SecT t="PAPER PERFORMANCE" sub="Closed paper trades only. Partial closes count as separate history entries at their banked P&L."/>
          <div style={{display:"flex",gap:"5px"}}>
            {["7D","30D","90D","ALL"].map(r=>(<Sm key={r} label={r} color={C.gold} active={range===r} onClick={()=>setRange(r)}/>))}
            <Sm label="EXPORT CSV" color={C.blue} onClick={onExport}/>
          </div>
        </div>
      </Card>
      {!stats?(
        <Card><div style={{fontSize:"10px",color:C.muted,textAlign:"center",padding:"22px 0"}}>No closed trades in this range yet.</div></Card>
      ):(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(105px,1fr))",gap:"7px",marginBottom:"12px"}}>
            <Stat k="TRADES" v={stats.n}/>
            <Stat k="WIN RATE" v={stats.wr.toFixed(0)+"%"} vc={stats.wr>=50?C.green:C.red}/>
            <Stat k="TOTAL P&L" v={fmtUsd(stats.totalPnl)} vc={stats.totalPnl>=0?C.green:C.red}/>
            <Stat k="PROFIT FACTOR" v={stats.pf.toFixed(2)} vc={stats.pf>=1.5?C.green:stats.pf>=1?C.amber:C.red}/>
            <Stat k="AVG WIN" v={fmtUsd(stats.avgW)} vc={C.green}/>
            <Stat k="AVG LOSS" v={fmtUsd(-stats.avgL)} vc={C.red}/>
            <Stat k="EXPECTANCY/TRADE" v={fmtUsd(stats.expectancy)} vc={stats.expectancy>=0?C.green:C.red}/>
            <Stat k="MAX DRAWDOWN" v={fmtUsd(-stats.maxDD)} vc={C.red}/>
            <Stat k="MAX CONSEC L" v={stats.maxConsecL} vc={C.amber}/>
          </div>
          <Card style={{marginBottom:"12px"}}>
            <SecT t="EQUITY CURVE"/>
            {stats.curve.length>=2?(
              <svg width="100%" height="120" viewBox={`0 0 600 120`} preserveAspectRatio="none" style={{display:"block"}}>
                {(()=>{const mn=Math.min(0,...stats.curve),mx=Math.max(0,...stats.curve),rg=(mx-mn)||1;
                  const pts=stats.curve.map((v,i)=>`${(i/(stats.curve.length-1))*600},${110-((v-mn)/rg)*100}`).join(" ");
                  const zy=110-((0-mn)/rg)*100;
                  return(<g>
                    <line x1="0" y1={zy} x2="600" y2={zy} stroke={C.bdr} strokeDasharray="4,3"/>
                    <polyline points={pts} fill="none" stroke={stats.totalPnl>=0?C.green:C.red} strokeWidth="1.8"/>
                  </g>);})()}
              </svg>
            ):(<div style={{fontSize:"9px",color:C.muted}}>Need 2+ closes for a curve.</div>)}
          </Card>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
            <Card>
              <SecT t="BY STYLE"/>
              {Object.entries(stats.byStyle).map(([st,v])=>(
                <div key={st} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.bdr}22`,fontSize:"10px"}}>
                  <span style={{color:SC[st]||C.text,fontWeight:"800"}}>{st.toUpperCase()}</span>
                  <span style={{color:C.muted}}>{v.n} · {((v.w/v.n)*100).toFixed(0)}% WR</span>
                  <span style={{color:v.pnl>=0?C.green:C.red,fontWeight:"800"}}>{fmtUsd(v.pnl)}</span>
                </div>))}
            </Card>
            <Card>
              <SecT t="BY STRATEGY (TOP)"/>
              {Object.entries(stats.byStrat).sort((a,b)=>b[1].pnl-a[1].pnl).slice(0,7).map(([sg,v])=>(
                <div key={sg} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.bdr}22`,fontSize:"9.5px"}}>
                  <span style={{color:C.text,fontWeight:"700"}}>{(STRAT_BY_ID[sg]&&STRAT_BY_ID[sg].name)||sg}</span>
                  <span style={{color:C.muted}}>{v.n}</span>
                  <span style={{color:v.pnl>=0?C.green:C.red,fontWeight:"800"}}>{fmtUsd(v.pnl)}</span>
                </div>))}
            </Card>
          </div>
        </div>)}
    </div>);
});

// ═══ SETTINGS TAB ════════════════════════════════════════════════════════════
const REG_DIRS=["BULLISH","NEUTRAL","BEARISH"];
const REG_STR=["STRONG","MODERATE","WEAK"];
const SettingsTab=memo(({settings,setSettings,regimes,setRegimes,onSaveRegimes,systemStatus,onTestAI,aiTest,onClear})=>{
  const snap=usePriceSnap();
  const set=(k,v)=>setSettings(s=>({...s,[k]:v}));
  const togglePair=(p)=>set("pairs",settings.pairs.includes(p)?settings.pairs.filter(x=>x!==p):[...settings.pairs,p]);
  const toggleStrat=(id)=>set("strategies",{...settings.strategies,[id]:!settings.strategies[id]});
  const setTier=(tier,on)=>{
    const patch={...settings.strategies};
    STRATEGIES.filter(s=>s.tier===tier).forEach(s=>{patch[s.id]=on;});
    set("strategies",patch);
  };
  const enabledCount=STRATEGIES.filter(s=>settings.strategies[s.id]).length;
  const regJSON=JSON.stringify(regimes);
  const dirColor=d=>d==="BULLISH"?C.green:d==="BEARISH"?C.red:C.amber;
  const Row=({label,ok,detail,warn})=>(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${C.bdr}22`}}>
      <span style={{fontSize:"9.5px",color:C.text}}>{label}</span>
      <span style={{fontSize:"9px",fontWeight:"800",color:ok===true?C.green:ok===false?C.red:warn?C.amber:C.muted}}>{detail}</span>
    </div>);
  return(
    <div>
      <Card style={{marginBottom:"12px"}}>
        <SecT t="RISK & ACCOUNT" sub="These values are sent to the engine on every scan (clamped server-side: account ≥ $100, risk 0.1–5%). They size every signal's lot."/>
        <div style={{display:"flex",gap:"12px",flexWrap:"wrap",marginTop:"6px"}}>
          <div>
            <div style={{fontSize:"8px",color:C.muted,letterSpacing:"1px",marginBottom:"4px"}}>ACCOUNT (USD)</div>
            <input type="number" value={settings.acct} min="100" step="500"
              onChange={e=>set("acct",e.target.value===""?"":Number(e.target.value))}
              onBlur={e=>set("acct",Math.max(100,Math.min(10000000,Number(e.target.value)||10000)))}
              style={{background:C.bg2,border:`1px solid ${C.bdr}`,color:C.text,padding:"8px 10px",borderRadius:"3px",fontFamily:"inherit",fontSize:"12px",width:"130px"}}/>
          </div>
          <div>
            <div style={{fontSize:"8px",color:C.muted,letterSpacing:"1px",marginBottom:"4px"}}>RISK PER TRADE (%)</div>
            <input type="number" value={settings.riskPct} min="0.1" max="5" step="0.1"
              onChange={e=>set("riskPct",e.target.value===""?"":Number(e.target.value))}
              onBlur={e=>set("riskPct",Math.max(0.1,Math.min(5,Number(e.target.value)||2)))}
              style={{background:C.bg2,border:`1px solid ${C.bdr}`,color:C.text,padding:"8px 10px",borderRadius:"3px",fontFamily:"inherit",fontSize:"12px",width:"100px"}}/>
          </div>
          <div>
            <div style={{fontSize:"8px",color:C.muted,letterSpacing:"1px",marginBottom:"4px"}}>TRADE STYLE (engine timeframe)</div>
            <div style={{display:"flex",gap:"5px"}}>
              {[["scalp","SCALP · H1"],["day","DAY · H4"],["swing","SWING · D1"]].map(([k,l])=>(
                <Sm key={k} label={l} color={SC[k]} active={settings.style===k} onClick={()=>set("style",k)}/>))}
            </div>
          </div>
        </div>
        <div style={{fontSize:"9px",color:C.muted,marginTop:"10px"}}>Risk per trade at current settings: <span style={{color:C.amber,fontWeight:"800"}}>{fmtUsd((Number(settings.acct)||0)*(Number(settings.riskPct)||0)/100)}</span></div>
      </Card>

      <Card style={{marginBottom:"12px"}}>
        <SecT t={`SCAN UNIVERSE — ${settings.pairs.length}/28 PAIRS`} sub="Selected pairs are passed to the engine on each scan. Pricing legs for the other pairs are still fetched (needed for pip-value and triangle math)."/>
        <div style={{display:"flex",gap:"6px",marginBottom:"8px"}}>
          <Sm label="ALL" color={C.gold} onClick={()=>set("pairs",[...ALL_PAIRS])}/>
          <Sm label="MAJORS" color={C.blue} onClick={()=>set("pairs",["EUR/USD","GBP/USD","USD/JPY","USD/CHF","USD/CAD","AUD/USD","NZD/USD"])}/>
          <Sm label="NONE" color={C.muted} onClick={()=>set("pairs",[])}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(88px,1fr))",gap:"5px"}}>
          {ALL_PAIRS.map(p=>(<Sm key={p} label={p} color={C.green} active={settings.pairs.includes(p)} onClick={()=>togglePair(p)}/>))}
        </div>
      </Card>

      <Card style={{marginBottom:"12px"}}>
        <SecT t={`STRATEGY TOGGLES — ${enabledCount}/${STRATEGIES.length} ENABLED`} sub="Every toggle is wired: disabled strategies are excluded from the engine's confluence evaluation on the next scan."/>
        {["S","A","B","C"].map(tier=>{
          const list=STRATEGIES.filter(s=>s.tier===tier);
          const on=list.filter(s=>settings.strategies[s.id]).length;
          return(
            <div key={tier} style={{marginBottom:"12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}>
                <span style={{fontSize:"9.5px",fontWeight:"800",color:tier==="S"?C.gold:tier==="A"?C.blue:tier==="C"?"#8f8fd0":C.muted,letterSpacing:"1px"}}>{tier}-TIER {tier==="C"?"(PURE TA)":""} · {on}/{list.length}</span>
                <span style={{display:"flex",gap:"5px"}}>
                  <Sm label="ALL ON" color={C.green} onClick={()=>setTier(tier,true)}/>
                  <Sm label="ALL OFF" color={C.red} onClick={()=>setTier(tier,false)}/>
                </span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:"4px"}}>
                {list.map(s=>(
                  <div key={s.id} onClick={()=>toggleStrat(s.id)} title={s.name}
                    style={{padding:"5px 8px",background:settings.strategies[s.id]?C.green+"14":C.bg2,border:`1px solid ${settings.strategies[s.id]?C.green+"55":C.bdr}`,borderRadius:"2px",cursor:"pointer",fontSize:"8px",color:settings.strategies[s.id]?C.text:C.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {settings.strategies[s.id]?"●":"○"} {s.id}
                  </div>))}
              </div>
            </div>);
        })}
      </Card>

      <Card style={{marginBottom:"12px"}}>
        <SecT t="MACRO REGIME EDITOR" sub="The ENGINE reads regimes from the AXIOM_REGIMES env var in Netlify (single source of truth for scans). This editor drives the terminal UI + AI grounding, and produces the exact JSON to paste into Netlify."/>
        {G10.map(ccy=>{
          const r=regimes[ccy]||{dir:"NEUTRAL",strength:"WEAK"};
          return(
            <div key={ccy} style={{display:"flex",alignItems:"center",gap:"10px",padding:"7px 0",borderBottom:`1px solid ${C.bdr}22`,flexWrap:"wrap"}}>
              <span style={{fontSize:"11px",fontWeight:"900",color:C.text,width:"38px"}}>{ccy}</span>
              <div style={{display:"flex",gap:"4px"}}>
                {REG_DIRS.map(d=>(<Sm key={d} label={d.slice(0,4)} color={dirColor(d)} active={r.dir===d} onClick={()=>setRegimes(rr=>({...rr,[ccy]:{...(rr[ccy]||{strength:"MODERATE"}),dir:d}}))}/>))}
              </div>
              <div style={{display:"flex",gap:"4px"}}>
                {REG_STR.map(st=>(<Sm key={st} label={st.slice(0,3)} color={st==="STRONG"?C.gold:st==="MODERATE"?C.blue:C.muted} active={r.strength===st} onClick={()=>setRegimes(rr=>({...rr,[ccy]:{...(rr[ccy]||{dir:"NEUTRAL"}),strength:st}}))}/>))}
              </div>
            </div>);
        })}
        <div style={{display:"flex",gap:"8px",marginTop:"12px",alignItems:"center",flexWrap:"wrap"}}>
          <Btn label="SAVE REGIMES (LOCAL)" color={C.gold} onClick={onSaveRegimes}/>
          <Btn label="COPY JSON FOR NETLIFY" ghost color={C.blue} onClick={()=>{try{navigator.clipboard.writeText(regJSON);}catch(_){}}}/>
        </div>
        <div style={{marginTop:"10px",background:C.bg2,border:`1px solid ${C.bdr}`,borderRadius:"3px",padding:"9px",fontSize:"8.5px",color:C.muted,wordBreak:"break-all",lineHeight:"1.7"}}>
          <span style={{color:C.gold,fontWeight:"800"}}>AXIOM_REGIMES = </span>{regJSON}
        </div>
        <div style={{fontSize:"8.5px",color:C.amber,marginTop:"7px",lineHeight:"1.7"}}>◈ After pasting into Netlify → Site settings → Environment variables, redeploy (or wait for the next deploy) for the engine to pick it up. The engine hard-fails with a clear 503 if this variable is missing or malformed — by design.</div>
      </Card>

      <Card style={{marginBottom:"12px"}}>
        <SecT t="SYSTEM STATUS" sub="Live health of every feed this terminal depends on."/>
        <Row label="OANDA prices (3s poll)" ok={snap.status==="live"} warn={snap.status==="connecting"} detail={snap.status==="live"?(snap.marketClosed?"LIVE · MARKET CLOSED":"LIVE"):snap.status==="connecting"?"CONNECTING":"DOWN — "+(snap.error||"")}/>
        <Row label="Daily opens (5pm-NY)" ok={!!snap.dailyOpens} detail={snap.dailyOpens?`LOADED · ${snap.opensDate||""}`:"NOT LOADED"}/>
        <Row label="FRED CB policy rates" ok={systemStatus.cb==="FRED"} warn={systemStatus.cb==="FRED_PARTIAL"} detail={systemStatus.cb==="FRED"?"LIVE 10/10":systemStatus.cb==="FRED_PARTIAL"?`PARTIAL ${systemStatus.cbLoaded||"?"}/10`:systemStatus.cb==="error"?"DOWN":"NOT LOADED"}/>
        <Row label="Finnhub news wire" ok={systemStatus.news==="finnhub"} detail={systemStatus.news==="finnhub"?"LIVE":systemStatus.news==="error"?"DOWN":"NOT LOADED"}/>
        <Row label="Calendar (ForexFactory)" ok={systemStatus.cal==="ok"} detail={systemStatus.cal==="ok"?"LIVE":systemStatus.cal==="error"?"DOWN":"NOT LOADED"}/>
        <Row label="Signal engine (last scan)" ok={systemStatus.scan==="ok"} warn={systemStatus.scan==="partial"} detail={systemStatus.scan==="ok"?`OK · ${systemStatus.scanInfo||""}`:systemStatus.scan==="partial"?"PARTIAL":systemStatus.scan==="error"?"ERROR":"NOT RUN"}/>
        <Row label="CFTC COT (via engine)" ok={systemStatus.cot===true} detail={systemStatus.cot===true?`LIVE · as of ${systemStatus.cotAsOf||"?"}`:systemStatus.cot===false?"DOWN — COT strategies inert":"UNKNOWN (run a scan)"}/>
        <div style={{display:"flex",gap:"8px",marginTop:"12px",alignItems:"center"}}>
          <Btn label={aiTest.testing?"TESTING…":"TEST AI PROXY"} ghost color={C.blue} disabled={aiTest.testing} onClick={onTestAI}/>
          {aiTest.result&&<span style={{fontSize:"9px",color:aiTest.ok?C.green:C.red}}>{aiTest.result}</span>}
        </div>
      </Card>

      <Card style={{borderColor:C.red+"44"}}>
        <SecT t="DANGER ZONE"/>
        <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
          <Btn label="CLEAR SIGNALS" ghost color={C.amber} onClick={()=>onClear("signals")}/>
          <Btn label="CLEAR TRADES + HISTORY" ghost color={C.red} onClick={()=>onClear("trades")}/>
          <Btn label="FACTORY RESET (ALL LOCAL DATA)" color={C.red} onClick={()=>onClear("all")}/>
        </div>
      </Card>
    </div>);
});

// ═══ DEPLOY TAB — accurate runbook ═══════════════════════════════════════════
const ENV_VARS=[
  ["OANDA_API_KEY","REQUIRED","OANDA v20 REST token. Live: fxTrade → Manage API Access."],
  ["OANDA_ACCOUNT_ID","REQUIRED","OANDA account ID (format 000-000-0000000-000). Used for the bulk pricing endpoint."],
  ["OANDA_ENV","optional","live (default) or practice — selects api-fxtrade vs api-fxpractice hosts across all functions."],
  ["ANTHROPIC_API_KEY","REQUIRED for AI","Powers AI Desk, Analyzer, Weekend Desk via the server proxy."],
  ["ANTHROPIC_MODEL","optional","Server-side model pin override. Default claude-sonnet-4-5. Client requests can never change it."],
  ["FINNHUB_API_KEY","REQUIRED","News wire + economic-surprise inputs to the engine."],
  ["FRED_API_KEY","REQUIRED","Live CB policy rates + 10Y yield spreads. Without it, carry/yield strategies are inert and the CB Rates tab errors."],
  ["AXIOM_REGIMES","REQUIRED","JSON regime map — copy from Settings → Regime editor. Engine 503s without it (no silent defaults)."],
  ["AXIOM_ACCT / AXIOM_RISK","optional","Server-side default account/risk if the UI omits params. UI values win."],
  ["AXIOM_ALLOWED_ORIGIN","optional","If set (e.g. https://your-site.netlify.app), functions reject other origins — locks your keys to your deployment."],
  ["CAL_SOURCE_TZ","optional","Calendar source wall-clock TZ. Default America/New_York (correct for the ForexFactory feed)."],
];
const DeployTab=memo(()=>{
  const Sec=({t,children})=>(<Card style={{marginBottom:"12px"}}><SecT t={t}/>{children}</Card>);
  return(
    <div>
      <Sec t="WHAT IS LIVE IN v7.2">
        <div style={{fontSize:"9.5px",color:C.text,lineHeight:"2"}}>
          ✓ Prices/candles: OANDA v20 (env-selectable live/practice) · per-instrument tradeable flags → MARKET CLOSED handling<br/>
          ✓ Daily change vs the true 5pm-NY open · ✓ CB policy rates: live FRED with derived outlook/bias · ✓ COT: live CFTC (Socrata TFF)<br/>
          ✓ News: Finnhub live wire (no AI fallback exists) · ✓ Calendar: ForexFactory parsed server-side, rendered in your local time<br/>
          ✓ Money math: pip-value USD conversion legs, engine + UI identical · ✓ 77 strategies wired incl. real triangular check<br/>
          ✓ AI (Desk / Analyzer / Weekend): manual, grounded in live terminal data, CB-source whitelist, model pinned server-side<br/>
          ◈ Notifications: in-app only while the page is open (no push service) · ◈ Trades are paper — nothing is sent to a broker
        </div>
      </Sec>
      <Sec t="NETLIFY ENVIRONMENT VARIABLES">
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <tbody>
              {ENV_VARS.map(([k,req,d])=>(
                <tr key={k}>
                  <td style={{padding:"6px 8px",fontSize:"9.5px",color:C.gold,fontWeight:"800",whiteSpace:"nowrap",borderBottom:`1px solid ${C.bdr}22`,verticalAlign:"top"}}>{k}</td>
                  <td style={{padding:"6px 8px",fontSize:"8px",color:req.startsWith("REQ")?C.red:C.muted,whiteSpace:"nowrap",borderBottom:`1px solid ${C.bdr}22`,verticalAlign:"top"}}>{req}</td>
                  <td style={{padding:"6px 8px",fontSize:"9px",color:C.text,lineHeight:"1.6",borderBottom:`1px solid ${C.bdr}22`}}>{d}</td>
                </tr>))}
            </tbody>
          </table>
        </div>
        <div style={{fontSize:"8.5px",color:C.amber,marginTop:"8px"}}>◈ Netlify Pro raises the function timeout to 26s (Site configuration → Functions). The engine also self-guards at 20s and returns PARTIAL results rather than timing out.</div>
      </Sec>
      <Sec t="DEPLOY PIPELINE (GITHUB → NETLIFY)">
        <div style={{fontSize:"9.5px",color:C.text,lineHeight:"2"}}>
          1. Repo layout: <span style={{color:C.gold}}>index.html · SAL_FX_BOT_INPUT.jsx · netlify.toml · netlify/functions/*.js</span> (7 functions)<br/>
          2. Push to <span style={{color:C.gold}}>SGalvan15/sal-fx-bot</span> main — Netlify auto-builds (no build step; functions deploy from netlify.toml)<br/>
          3. Set every REQUIRED env var above → trigger a redeploy so functions pick them up<br/>
          4. Verify: Settings → SYSTEM STATUS all green · run one scan · open Calendar/News/CB Rates tabs
        </div>
      </Sec>
      <Sec t="IPHONE (PWA)">
        <div style={{fontSize:"9.5px",color:C.text,lineHeight:"2"}}>
          Safari → open your Netlify URL → Share → <span style={{color:C.gold}}>Add to Home Screen</span>. Full-screen app with the AXIOM icon. Prices pause automatically when the app is backgrounded and resume instantly on focus.
        </div>
      </Sec>
      <Sec t="BROKER ENDPOINTS">
        <div style={{fontSize:"9.5px",color:C.text,lineHeight:"2"}}>
          Live: <span style={{color:C.gold}}>api-fxtrade.oanda.com</span> · Practice: <span style={{color:C.gold}}>api-fxpractice.oanda.com</span> — switch with <span style={{color:C.gold}}>OANDA_ENV=practice</span> (the account ID must belong to the matching environment).
        </div>
      </Sec>
    </div>);
});

// ═══ SOURCES TAB ═════════════════════════════════════════════════════════════
const SOURCES=[
  ["OANDA v20","Prices (3s), candles, tradeable flags","Live REST — the only price source; no synthetic or cached substitution"],
  ["FRED (St. Louis Fed)","CB policy rates (10 ccy) + 10Y yields","Live — outlook/bias DERIVED from series history; per-ccy as-of shown"],
  ["CFTC — Socrata","Traders in Financial Futures (futures-only) weekly","Live public API — leveraged-funds net % of OI, z-scored vs trailing 26 reports"],
  ["Finnhub","Forex news wire + economic calendar (surprises)","Live — sentiment intentionally NOT displayed (feed provides none; nothing is fabricated)"],
  ["ForexFactory (nfs.faireconomy.media)","Weekly economic calendar XML","Parsed server-side to JSON with source-TZ→UTC conversion; rendered in your local time"],
  ["Anthropic API (server proxy)","AI Desk · Analyzer · Weekend Desk","Model pinned server-side; prompts grounded in live terminal data; CB-source citation whitelist"],
];
const SourcesTab=memo(()=>(
  <div>
    <Card style={{marginBottom:"12px"}}>
      <SecT t="DATA SOURCES & ROLES" sub="Every feed is live. When a feed fails you see a red error — never stale numbers wearing a live badge."/>
      {SOURCES.map(([name,role,note])=>(
        <div key={name} style={{padding:"9px 0",borderBottom:`1px solid ${C.bdr}22`}}>
          <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:"6px"}}>
            <span style={{fontSize:"10.5px",fontWeight:"800",color:C.gold}}>{name}</span>
            <span style={{fontSize:"9px",color:C.text}}>{role}</span>
          </div>
          <div style={{fontSize:"8.5px",color:C.muted,marginTop:"3px",lineHeight:"1.6"}}>{note}</div>
        </div>))}
    </Card>
    <Card>
      <SecT t="DISCLAIMER"/>
      <div style={{fontSize:"9px",color:C.muted,lineHeight:"1.9"}}>
        AXIOM is a personal research terminal. Trades placed here are paper simulations — no orders reach any broker. Strategy "research WR" figures are literature-derived baselines from the cited papers, not this system's live performance; live probabilities are engine confluence outputs, and the Performance tab tracks actual paper results, which is the number that matters. Live prices, rates, positioning, and calendar data come from the sources above and can be delayed, revised, or wrong at the source. Nothing here is investment advice.
      </div>
    </Card>
  </div>));

// ═══ MODALS ══════════════════════════════════════════════════════════════════
const Overlay=({onClose,children,maxWidth="560px"})=>(
  <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(3,6,10,0.82)",zIndex:200,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"36px 14px",overflowY:"auto"}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.bg1,border:`1px solid ${C.bdr}`,borderRadius:"6px",width:"100%",maxWidth,padding:"16px"}}>{children}</div>
  </div>);

const SignalModal=({sig,onTake,onClose,regimes,cbRates})=>{
  const [tab,setTab]=useState("OVERVIEW");
  if(!sig) return null;
  const dc=sig.direction==="BUY"?C.green:C.red;
  const lib=sig.lib;
  const [b,q]=sig.pair.split("/");
  const rb=regimes[b]||{dir:"NEUTRAL",strength:"WEAK"}, rq=regimes[q]||{dir:"NEUTRAL",strength:"WEAK"};
  const cbB=cbRates&&cbRates[b], cbQ=cbRates&&cbRates[q];
  const carry=(cbB&&cbQ)?cbB.rate-cbQ.rate:null;
  const dirColor=d=>d==="BULLISH"?C.green:d==="BEARISH"?C.red:C.amber;
  return(
    <Overlay onClose={onClose}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <span style={{fontSize:"17px",fontWeight:"900",color:C.text}}>{sig.pair}</span>
          <span style={{fontSize:"13px",fontWeight:"800",color:dc,marginLeft:"9px"}}>{sig.direction}</span>
          <div style={{marginTop:"5px",display:"flex",gap:"5px",alignItems:"center",flexWrap:"wrap"}}>
            <Bdg label={(sig.tradeStyle||"day").toUpperCase()} color={SC[sig.tradeStyle]||C.blue}/>
            <Bdg label={sig.timeframe} color={C.blue}/>
            {sig.isPureTASignal&&<Bdg label="PURE TA · CAPPED 62%" color="#8f8fd0"/>}
            <SigAge ts={sig.ts}/>
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:"22px",fontWeight:"900",color:sig.probability>=62?C.green:sig.probability>=55?C.gold:C.amber}}>{sig.probability}%</div>
          <div style={{fontSize:"7px",color:C.muted,letterSpacing:"1px"}}>LIVE PROB</div>
        </div>
      </div>
      <div style={{display:"flex",gap:"5px",margin:"12px 0"}}>
        {["OVERVIEW","LEVELS","EVIDENCE","CONTEXT"].map(t=>(<Sm key={t} label={t} color={C.gold} active={tab===t} onClick={()=>setTab(t)}/>))}
      </div>
      {tab==="OVERVIEW"&&(
        <div>
          <Kv k="Hold horizon" v={sig.holdTime}/>
          <Kv k="Strategies fired / score" v={`${sig.strategiesTriggered} / ${sig.technicalScore}`}/>
          <Kv k="Macro · Tech · Pure-TA" v={`${sig.macroTriggered} · ${sig.techTriggered} · ${sig.pureTA_T||0}`}/>
          {sig.technicalDetails&&(
            <div style={{marginTop:"10px",fontSize:"9px",color:C.muted,lineHeight:"1.9",background:C.bg2,borderRadius:"3px",padding:"9px"}}>
              <div>{sig.technicalDetails.techNote}</div>
              <div>{sig.technicalDetails.sessionNote}</div>
              <div>{sig.technicalDetails.regimeNote}</div>
            </div>)}
          {sig.indicators&&(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(96px,1fr))",gap:"6px",marginTop:"10px"}}>
              {Object.entries(sig.indicators).map(([k,v])=>(
                <div key={k} style={{background:C.bg2,borderRadius:"3px",padding:"6px",textAlign:"center"}}>
                  <div style={{fontSize:"6.5px",color:C.muted,letterSpacing:"0.5px"}}>{k}</div>
                  <div style={{fontSize:"10px",fontWeight:"800",color:C.text,marginTop:"2px"}}>{String(v)}</div>
                </div>))}
            </div>)}
        </div>)}
      {tab==="LEVELS"&&(
        <div>
          <Kv k="Entry" v={fmtP(sig.pair,sig.entry)}/>
          <Kv k={`Stop (${sig.slPips}p)`} v={fmtP(sig.pair,sig.sl)} vc={C.red}/>
          <Kv k={`TP1 (${sig.tp1Pips}p · R:R ${sig.rr1})`} v={fmtP(sig.pair,sig.tp1)} vc={C.green}/>
          <Kv k={`TP2 (${sig.tp2Pips}p · R:R ${sig.rr2})`} v={fmtP(sig.pair,sig.tp2)} vc={C.green}/>
          <Kv k={`TP3 (${sig.tp3Pips}p · R:R ${sig.rr3})`} v={fmtP(sig.pair,sig.tp3)} vc={C.green}/>
          <Kv k="Lot size (clamped 0.01–2.00)" v={String(sig.lotSize)}/>
          <Kv k="Pip value / lot (live legs)" v={fmtUsd(sig.pipValuePerLot)+" per pip"}/>
          <Kv k="Risk at stop" v={fmtUsd(sig.riskAmount)} vc={C.amber}/>
        </div>)}
      {tab==="EVIDENCE"&&(
        <div>
          <div style={{fontSize:"8.5px",color:C.muted,background:C.bg2,borderRadius:"3px",padding:"9px",lineHeight:"1.8",marginBottom:"10px"}}>
            <span style={{color:C.gold,fontWeight:"800"}}>LIVE PROB</span> is this signal's confluence output right now. <span style={{color:C.gold,fontWeight:"800"}}>RESEARCH WR</span> on each strategy is a literature baseline from the cited paper — not this system's live record. Your actual record lives in the Performance tab.
          </div>
          {(sig.allTriggered||[]).map((t,i)=>{
            const ls=STRAT_BY_ID[t.id];
            return(
              <div key={i} style={{display:"flex",gap:"8px",alignItems:"flex-start",padding:"7px 0",borderBottom:`1px solid ${C.bdr}22`}}>
                <span style={{fontSize:"9px",fontWeight:"900",color:C.gold,width:"22px",flexShrink:0}}>+{t.score}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:"9.5px",fontWeight:"800",color:C.text}}>{ls?ls.name:t.id} {ls&&<span style={{fontSize:"7.5px",color:C.muted,fontWeight:"400"}}>· {ls.tier} · research WR {ls.wr}%</span>}</div>
                  <div style={{fontSize:"8.5px",color:C.muted,marginTop:"2px",lineHeight:"1.6"}}>{t.desc}</div>
                </div>
                {ls&&<a href={ls.url} target="_blank" rel="noreferrer" style={{fontSize:"8px",color:C.blue,textDecoration:"none",flexShrink:0}}>src ↗</a>}
              </div>);
          })}
        </div>)}
      {tab==="CONTEXT"&&(
        <div>
          <div style={{fontSize:"8px",color:C.gold,fontWeight:"800",letterSpacing:"1px",marginBottom:"8px"}}>LIVE CONTEXT — {new Date(sig.ts).toLocaleString()}</div>
          <Kv k={`${b} regime`} v={`${rb.dir} · ${rb.strength}`} vc={dirColor(rb.dir)}/>
          <Kv k={`${q} regime`} v={`${rq.dir} · ${rq.strength}`} vc={dirColor(rq.dir)}/>
          <Kv k={`${b} policy rate`} v={cbB?`${cbB.rate.toFixed(2)}% · ${cbB.outlook||""} · as of ${cbB.asOf}`:"not loaded"} vc={cbB?C.text:C.dim}/>
          <Kv k={`${q} policy rate`} v={cbQ?`${cbQ.rate.toFixed(2)}% · ${cbQ.outlook||""} · as of ${cbQ.asOf}`:"not loaded"} vc={cbQ?C.text:C.dim}/>
          <Kv k="Carry differential" v={carry!=null?`${carry>0?"+":""}${carry.toFixed(2)}% (base − quote)`:"n/a"} vc={carry==null?C.dim:carry>0?C.green:C.red}/>
          <div style={{fontSize:"8.5px",color:C.muted,marginTop:"9px",lineHeight:"1.7"}}>Context reflects the terminal's live regime settings and FRED rates at render time — no dated narratives are stored with the signal.</div>
        </div>)}
      <div style={{display:"flex",gap:"8px",marginTop:"14px"}}>
        <Btn label="CLOSE" ghost color={C.muted} onClick={onClose} style={{flex:1}}/>
        <Btn label="TAKE TRADE" color={dc} onClick={()=>{onTake(sig);onClose();}} style={{flex:1}}/>
      </div>
    </Overlay>);
};

const StratModal=({strat,onClose,regimes,cbRates})=>{
  if(!strat) return null;
  const relevant=G10.filter(c=>regimes[c]&&regimes[c].strength==="STRONG");
  return(
    <Overlay onClose={onClose} maxWidth="480px">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{fontSize:"14px",fontWeight:"900",color:C.text}}>{strat.name}</div>
          <div style={{fontSize:"8px",color:C.dim,marginTop:"2px"}}>{strat.id}</div>
        </div>
        <div style={{display:"flex",gap:"5px"}}>
          <Bdg label={strat.tier} color={strat.tier==="S"?C.gold:strat.tier==="A"?C.blue:strat.tier==="C"?"#8f8fd0":C.muted}/>
          <Tag label={strat.cat} color={CATC[strat.cat]||C.muted}/>
        </div>
      </div>
      <div style={{marginTop:"12px"}}>
        <Kv k="Timeframes" v={strat.tf}/>
        <Kv k="Research win rate (literature)" v={strat.wr+"%"} vc={C.gold}/>
        <Kv k="Min confluence" v={String(strat.minC)}/>
      </div>
      <div style={{fontSize:"10px",color:C.text,lineHeight:"1.9",marginTop:"10px"}}>{strat.note}</div>
      <div style={{fontSize:"8.5px",color:C.muted,marginTop:"8px"}}>{strat.desc}</div>
      {cbRates&&(strat.cat==="CARRY"||strat.id==="REAL_YLD")&&(
        <div style={{fontSize:"8.5px",color:C.green,marginTop:"9px"}}>◈ LIVE: FRED policy rates loaded — this strategy is active in scans.</div>)}
      {!cbRates&&(strat.cat==="CARRY"||strat.id==="REAL_YLD")&&(
        <div style={{fontSize:"8.5px",color:C.amber,marginTop:"9px"}}>◈ CB rates not loaded in this session — during scans the engine fetches them independently; if FRED is down, this strategy is inert.</div>)}
      {relevant.length>0&&strat.cat==="MACRO"&&(
        <div style={{fontSize:"8.5px",color:C.muted,marginTop:"9px"}}>Live context: STRONG regimes on {relevant.join(", ")}.</div>)}
      <a href={strat.url} target="_blank" rel="noreferrer" style={{display:"inline-block",marginTop:"12px",fontSize:"9px",color:C.blue,textDecoration:"none"}}>Research source ↗</a>
      <div style={{marginTop:"12px"}}><Btn label="CLOSE" ghost color={C.muted} onClick={onClose} style={{width:"100%"}}/></div>
    </Overlay>);
};

const CBModal=({ccy,cbRates,onClose})=>{
  if(!ccy) return null;
  const r=cbRates&&cbRates[ccy];
  return(
    <Overlay onClose={onClose} maxWidth="440px">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:"15px",fontWeight:"900",color:C.text}}>{ccy} — {CB_NAMES[ccy]}</div>
          {r&&<div style={{fontSize:"8.5px",color:C.muted,marginTop:"3px"}}>as of {r.asOf} · {r.freq} FRED series</div>}
        </div>
        {r&&<div style={{fontSize:"24px",fontWeight:"900",color:C.gold}}>{r.rate.toFixed(2)}%</div>}
      </div>
      {!r?(
        <div style={{fontSize:"9.5px",color:C.red,marginTop:"12px"}}>◈ No live data for {ccy} in the current load.</div>
      ):(
        <div>
          <div style={{display:"flex",gap:"6px",marginTop:"10px"}}>
            {r.outlook&&<Bdg label={"OUTLOOK: "+r.outlook.toUpperCase()} color={r.outlook==="Hiking"?C.green:r.outlook==="Cutting"?C.red:C.muted}/>}
            {r.bias&&<Bdg label={"12M BIAS: "+r.bias.toUpperCase()} color={r.bias==="Hawkish"?C.green:r.bias==="Dovish"?C.red:C.muted}/>}
          </div>
          <div style={{marginTop:"12px",background:C.bg2,borderRadius:"3px",padding:"10px"}}>
            <div style={{fontSize:"7.5px",color:C.muted,letterSpacing:"1px",marginBottom:"6px"}}>POLICY PATH — LAST 14 CHANGES (4Y WINDOW)</div>
            <Spark data={(r.hist||[]).map(h=>h.r)} w={380} h={64} color={C.gold}/>
          </div>
          <div style={{fontSize:"8.5px",color:C.muted,marginTop:"9px",lineHeight:"1.7"}}>Outlook is derived mechanically: a change within the last 8 months sets the trajectory; the 12-month net move sets the bias. No editorial next-meeting guesses are stored.</div>
          <a href={CB_SOURCE_URLS[ccy]} target="_blank" rel="noreferrer" style={{display:"inline-block",marginTop:"10px",fontSize:"9px",color:C.blue,textDecoration:"none"}}>Official decisions page ↗</a>
        </div>)}
      <div style={{marginTop:"12px"}}><Btn label="CLOSE" ghost color={C.muted} onClick={onClose} style={{width:"100%"}}/></div>
    </Overlay>);
};

// ═══ GLOBAL PRICE-FEED BANNER (subscriber) ═══════════════════════════════════
const GlobalFeedBanner=memo(()=>{
  const s=usePriceSnap();
  if(s.status!=="error") return null;
  return(
    <div style={{padding:"9px 14px",background:C.red+"1a",borderBottom:`1px solid ${C.red}66`,fontSize:"10px",color:C.red,fontWeight:"700"}}>
      ◈ PRICE FEED DOWN — {s.error||"OANDA unreachable"} · retrying every 3s{s.lastTick?` · last good tick ${timeAgo(s.lastTick)}`:""}{s.prices?" · board shows STALE data flagged red":""}
    </div>);
});

// ═══ STORAGE + MIGRATION ═════════════════════════════════════════════════════
function loadJSON(key,fallback){ try{const v=localStorage.getItem(key); return v?JSON.parse(v):fallback;}catch(_){return fallback;} }
function saveJSON(key,val){ try{localStorage.setItem(key,JSON.stringify(val));}catch(_){}}

function migrateSettings(){
  const v72=loadJSON("axiom_settings_v72",null);
  if(v72&&v72.strategies) return v72;
  const old=loadJSON("axiom_settings",null)||{};
  const strategies={};
  STRATEGIES.forEach(s=>{
    if(old.strategies&&typeof old.strategies[s.id]==="boolean") strategies[s.id]=old.strategies[s.id];
    else strategies[s.id]=DEFAULT_ENABLED.includes(s.id);
  });
  return{
    acct:Number(old.acct)||10000,
    riskPct:Number(old.riskPct)||2,
    style:["scalp","day","swing"].includes(old.style)?old.style:"day",
    pairs:Array.isArray(old.pairs)&&old.pairs.length?old.pairs.filter(p=>ALL_PAIRS.includes(p)):[...ALL_PAIRS],
    strategies,
  };
}
function migrateRegimes(){
  const v2=loadJSON("axiom_regimes_v2",null);
  if(v2&&v2.USD&&v2.USD.dir) return {...DEFAULT_REGIMES,...v2};
  const old=loadJSON("axiom_regimes",null);
  if(old&&typeof old.USD==="string"){
    const out={};
    G10.forEach(c=>{out[c]={dir:["BULLISH","BEARISH","NEUTRAL"].includes(old[c])?old[c]:"NEUTRAL",strength:"MODERATE"};});
    return out;
  }
  return {...DEFAULT_REGIMES};
}

const TABS=[["dashboard","DASHBOARD"],["signals","SIGNALS"],["strategies","STRATEGIES"],["charts","CHARTS"],["analyzer","ANALYZER"],["weekend","WEEKEND"],["calendar","CALENDAR"],["news","NEWS"],["cbrates","CB RATES"],["ai","AI DESK"],["trades","TRADES"],["performance","PERFORMANCE"],["settings","SETTINGS"],["deploy","DEPLOY"],["sources","SOURCES"]];

// ═══ ROOT ════════════════════════════════════════════════════════════════════
function AxiomFX(){
  const [tab,setTab]=useState("dashboard");
  const [settings,setSettings]=useState(migrateSettings);
  const [regimes,setRegimes]=useState(migrateRegimes);
  const [sigs,setSigs]=useState(()=>loadJSON("axiom_sigs_v72",[]));
  const [trades,setTrades]=useState(()=>loadJSON("axiom_trades_v72",[]));
  const [history,setHistory]=useState(()=>loadJSON("axiom_history_v72",[]));
  const [aiMsgs,setAiMsgs]=useState(()=>loadJSON("axiom_ai_v72",[]));

  const [scanning,setScanning]=useState(false);
  const [scanStatus,setScanStatus]=useState("");
  const [scanPartial,setScanPartial]=useState(false);
  const [scanUnscanned,setScanUnscanned]=useState([]);
  const [scanErrors,setScanErrors]=useState([]);
  const [scanEngineErr,setScanEngineErr]=useState(null);
  const [lastScanMeta,setLastScanMeta]=useState(null);

  const [cbRates,setCbRates]=useState(null);
  const [cbSource,setCbSource]=useState(null);
  const [cbErrors,setCbErrors]=useState([]);
  const [cbLoading,setCbLoading]=useState(false);
  const [cbAsOf,setCbAsOf]=useState(null);

  const [newsArts,setNewsArts]=useState(null);
  const [newsError,setNewsError]=useState(null);
  const [newsLoading,setNewsLoading]=useState(false);

  const [calThis,setCalThis]=useState(null);
  const [calNext,setCalNext]=useState(null);
  const [calError,setCalError]=useState(null);
  const [calLoading,setCalLoading]=useState(false);

  const [weekend,setWeekend]=useState({themes:null,loading:false,error:null,generatedAt:null});
  const [regimeAI,setRegimeAI]=useState({cards:null,loading:false,error:null,generatedAt:null});

  const [modalSig,setModalSig]=useState(null);
  const [stratModal,setStratModal]=useState(null);
  const [cbModal,setCbModal]=useState(null);
  const [chartPair,setChartPair]=useState("EUR/USD");

  const [aiInput,setAiInput]=useState("");
  const [aiSending,setAiSending]=useState(false);
  const [aiTest,setAiTest]=useState({testing:false,ok:null,result:null});
  const [toast,setToast]=useState(null);

  const toastTimer=useRef(null);
  const toastMsg=useCallback((msg,color)=>{
    setToast({msg,color:color||C.gold});
    if(toastTimer.current)clearTimeout(toastTimer.current);
    toastTimer.current=setTimeout(()=>setToast(null),4200);
  },[]);

  // ── PRICE ENGINE — writes the module store; root does NOT subscribe ────────
  useEffect(()=>{
    let dead=false, lastAttempt=0;
    const instruments=ALL_PAIRS.map(p=>p.replace("/","_")).join(",");
    async function tick(force){
      if(dead||document.hidden) return;
      const snap=priceStore.get();
      const now=Date.now();
      if(!force&&snap.marketClosed&&now-lastAttempt<60000) return;
      lastAttempt=now;
      try{
        const res=await fetch(`/api/prices?instruments=${instruments}`);
        if(!res.ok){ let m="Prices "+res.status; try{const j=await res.json(); if(j.error)m=typeof j.error==="string"?j.error:(j.error.message||m);}catch(_){/*noop*/} throw new Error(m); }
        const data=await res.json();
        const map={}; let anyTradeable=false;
        (data.prices||[]).forEach(p=>{
          const pair=p.instrument.replace("_","/");
          const bid=parseFloat(p.bids&&p.bids[0]&&p.bids[0].price);
          const ask=parseFloat(p.asks&&p.asks[0]&&p.asks[0].price);
          if(!isFinite(bid)||!isFinite(ask)) return;
          const tradeable=p.tradeable!==false;
          if(tradeable) anyTradeable=true;
          map[pair]={bid,ask,mid:(bid+ask)/2,spread:ask-bid,tradeable,time:p.time};
        });
        if(!Object.keys(map).length) throw new Error("Empty pricing response");
        pushPriceHistory(map);
        priceStore.set({status:"live",prices:map,marketClosed:!anyTradeable,error:null,staleSince:null,lastTick:Date.now()});
      }catch(e){
        if(dead) return;
        const prev=priceStore.get();
        priceStore.set({status:"error",error:e.message,staleSince:prev.staleSince||Date.now()});
      }
    }
    tick(true);
    const iv=setInterval(()=>tick(false),3000);
    const onVis=()=>{ if(!document.hidden) tick(true); };
    document.addEventListener("visibilitychange",onVis);
    return()=>{dead=true;clearInterval(iv);document.removeEventListener("visibilitychange",onVis);};
  },[]);

  // ── DAILY OPENS (5pm-NY FX day) — mount + every 30 min ────────────────────
  useEffect(()=>{
    let dead=false;
    async function loadOpens(){
      try{
        const res=await fetch(`/api/candles?bulk=daily-opens&pairs=${encodeURIComponent(ALL_PAIRS.join(","))}`);
        if(!res.ok) return;
        const data=await res.json();
        if(!dead&&data.opens) priceStore.set({dailyOpens:data.opens,opensDate:data.date||null});
      }catch(_){/* board shows 'daily opens loading…' */}
    }
    loadOpens();
    const iv=setInterval(loadOpens,1800000);
    return()=>{dead=true;clearInterval(iv);};
  },[]);

  // ── P&L LOOP — 2s; exit-side pricing; engine-identical pip values ──────────
  const tradesRef=useRef(trades); useEffect(()=>{tradesRef.current=trades;},[trades]);
  useEffect(()=>{
    const iv=setInterval(()=>{
      const list=tradesRef.current;
      if(!list||!list.length) return;
      const snap=priceStore.get();
      const prices=snap.prices;
      if(!prices) return;
      let changed=false;
      const next=list.map(t=>{
        const p=prices[t.pair];
        if(!p) return t;
        const exit=t.direction==="BUY"?p.bid:p.ask;
        const dir=t.direction==="BUY"?1:-1;
        const pips=(exit-t.entry)*dir*pipMultOf(t.pair);
        let pv=pipValueUSDClient(t.pair,t.lotSize,prices);
        if(pv==null&&t.pipValuePerLot) pv=t.pipValuePerLot*t.lotSize;
        const pnl=pv!=null?pips*pv:t.pnl;
        if(Math.abs((t.pnl||0)-(pnl||0))>0.005||Math.abs((t.pips||0)-pips)>0.05){changed=true;return{...t,pnl:pnl!=null?Math.round(pnl*100)/100:t.pnl,pips};}
        return t;
      });
      if(changed) setTrades(next);
    },2000);
    return()=>clearInterval(iv);
  },[]);

  // ── PERSISTENCE ────────────────────────────────────────────────────────────
  useEffect(()=>{saveJSON("axiom_settings_v72",settings);},[settings]);
  useEffect(()=>{saveJSON("axiom_regimes_v2",regimes);},[regimes]);
  useEffect(()=>{saveJSON("axiom_sigs_v72",sigs.slice(0,40));},[sigs]);
  useEffect(()=>{saveJSON("axiom_trades_v72",trades);},[trades]);
  useEffect(()=>{saveJSON("axiom_history_v72",history.slice(0,500));},[history]);
  useEffect(()=>{saveJSON("axiom_ai_v72",aiMsgs.slice(-60));},[aiMsgs]);

  // ── FEED LOADERS (promise-returning for AI grounding chains) ───────────────
  const cbLoadingRef=useRef(false);
  const cbPromiseRef=useRef(null);
  const loadCBRates=useCallback(async()=>{
    if(cbPromiseRef.current) return cbPromiseRef.current; // share the in-flight fetch
    cbLoadingRef.current=true; setCbLoading(true);
    const promise=(async()=>{
      try{
        const res=await fetch("/api/cbrates");
        const body=await res.json();
        if(!res.ok||!body.rates){ throw new Error(body.error||("CB rates "+res.status)); }
        setCbRates(body.rates); setCbSource(body.source); setCbErrors(body.errors||[]); setCbAsOf(Object.values(body.rates).map(function(r){return r.asOf;}).sort()[0]||null);
        return body.rates;
      }catch(e){
        setCbSource("error"); setCbErrors([e.message]);
        throw e;
      }finally{ cbLoadingRef.current=false; setCbLoading(false); cbPromiseRef.current=null; }
    })();
    cbPromiseRef.current=promise;
    return promise;
  },[]);

  const loadNews=useCallback(async(more)=>{
    setNewsLoading(true);
    try{
      const res=await fetch("/api/news");
      const body=await res.json();
      if(!res.ok||!body.articles) throw new Error(body.error||("News "+res.status));
      setNewsError(null);
      setNewsArts(prev=>{
        if(!more||!prev) return body.articles;
        const seen=new Set(prev.map(a=>a.id));
        return [...prev,...body.articles.filter(a=>!seen.has(a.id))].slice(0,120);
      });
    }catch(e){ setNewsError(e.message); }
    finally{ setNewsLoading(false); }
  },[]);

  const loadCalendar=useCallback(async(week)=>{
    setCalLoading(true);
    try{
      const res=await fetch(`/api/calendar?week=${week==="next"?"next":"this"}`);
      const body=await res.json();
      if(!res.ok||!body.events) throw new Error(body.error||("Calendar "+res.status));
      setCalError(null);
      if(week==="next") setCalNext(body.events); else setCalThis(body.events);
      return body.events;
    }catch(e){ setCalError(e.message); throw e; }
    finally{ setCalLoading(false); }
  },[]);

  // Tab-triggered lazy loads
  useEffect(()=>{
    if((tab==="cbrates"||tab==="dashboard")&&!cbRates&&cbSource!=="error"&&!cbLoadingRef.current) loadCBRates().catch(()=>{});
    if((tab==="news"||tab==="dashboard")&&!newsArts&&!newsError&&!newsLoading) loadNews(false);
    if(tab==="calendar"&&!calThis&&!calError&&!calLoading){ loadCalendar("this").catch(()=>{}); loadCalendar("next").catch(()=>{}); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[tab]);

  // ── SIGNAL SCAN ────────────────────────────────────────────────────────────
  const scanningRef=useRef(false);
  const runSignalScan=useCallback(async()=>{
    if(scanningRef.current) return;
    const snap=priceStore.get();
    if(snap.marketClosed){ setScanStatus("Market closed — engine idle until the Sunday 17:00 NY open."); return; }
    scanningRef.current=true; setScanning(true); setScanStatus("Scanning "+(settings.pairs.length||28)+" pairs against "+STRATEGIES.filter(s=>settings.strategies[s.id]).length+" enabled strategies…");
    try{
      const enabled=STRATEGIES.filter(s=>settings.strategies[s.id]).map(s=>s.id);
      const params=new URLSearchParams({style:settings.style,acct:String(settings.acct||10000),risk:String(settings.riskPct||2)});
      if(enabled.length>0&&enabled.length<STRATEGIES.length) params.set("strategies",enabled.join(","));
      if(settings.pairs.length>0&&settings.pairs.length<ALL_PAIRS.length) params.set("pairs",settings.pairs.join(","));
      const res=await fetch(`/api/analyze?${params.toString()}`);
      const body=await res.json();
      if(!res.ok||body.source==="error"){
        setScanEngineErr({error:body.error||("Engine "+res.status),action:body.action});
        setScanStatus("Engine error — see banner.");
        return;
      }
      setScanEngineErr(null);
      if(body.marketClosed){
        priceStore.set({marketClosed:true});
        setScanStatus(`Market closed — next open ${body.nextOpen?localDT(body.nextOpen):"Sunday 17:00 NY"}.`);
        setScanPartial(false); setScanUnscanned([]); setScanErrors([]);
        return;
      }
      const now=Date.now();
      const fresh=(body.signals||[]).map((s,i)=>({...s,id:`${s.pair}-${s.direction}-${now}-${i}`,ts:now,lib:STRAT_BY_ID[(s.primaryStrategy&&s.primaryStrategy.id)]||null}));
      setSigs(prev=>{
        const replaced=new Set(fresh.map(s=>s.pair+"|"+s.direction));
        return [...fresh,...prev.filter(s=>!replaced.has(s.pair+"|"+s.direction))].slice(0,40);
      });
      setScanPartial(!!body.partial);
      setScanUnscanned(body.unscanned||[]);
      setScanErrors(body.errors||[]);
      setLastScanMeta({ts:now,feeds:body.feeds||{},elapsed:body.elapsedMs,scanned:body.scanned,requested:body.requested,count:body.count});
      if(body.feedErrors&&body.feedErrors.length) toastMsg("Feed issues: "+body.feedErrors.map(f=>f.feed).join(" · "),C.amber);
      setScanStatus(`Last scan: ${body.count} signal${body.count===1?"":"s"} · ${body.scanned}/${body.requested} pairs · ${body.skipped} gated · ${body.correlationFiltered||0} corr-filtered · ${body.elapsedMs}ms`);
    }catch(e){
      setScanEngineErr({error:e.message});
      setScanStatus("Scan failed — see banner.");
    }finally{
      scanningRef.current=false; setScanning(false);
    }
  },[settings,toastMsg]);

  // Auto-scan every 5 min while visible + market open
  const runScanRef=useRef(runSignalScan); useEffect(()=>{runScanRef.current=runSignalScan;},[runSignalScan]);
  useEffect(()=>{
    const iv=setInterval(()=>{
      if(document.hidden||scanningRef.current) return;
      if(priceStore.get().marketClosed) return;
      runScanRef.current();
    },300000);
    return()=>clearInterval(iv);
  },[]);

  // ── TRADES ─────────────────────────────────────────────────────────────────
  const takeTrade=useCallback((sig)=>{
    const t={id:"T"+Date.now()+Math.random().toString(36).slice(2,6),pair:sig.pair,direction:sig.direction,
      entry:sig.entry,sl:sig.sl,tp1:sig.tp1,tp2:sig.tp2,tp3:sig.tp3,lotSize:sig.lotSize,riskAmount:sig.riskAmount,
      pipValuePerLot:sig.pipValuePerLot,style:sig.tradeStyle||"day",
      strategyId:(sig.primaryStrategy&&sig.primaryStrategy.id)||null,
      strategyName:(sig.lib&&sig.lib.name)||null,
      openTime:Date.now(),pnl:0,pips:0};
    setTrades(prev=>[t,...prev]);
    toastMsg(`Paper trade opened: ${t.pair} ${t.direction} ${t.lotSize} lot`,C.green);
  },[toastMsg]);

  const moveBE=useCallback((id)=>{
    setTrades(prev=>prev.map(t=>t.id===id?{...t,sl:t.entry}:t));
    toastMsg("Stop moved to break-even",C.blue);
  },[toastMsg]);

  const closeTrade=useCallback((id)=>{
    setTrades(prev=>{
      const t=prev.find(x=>x.id===id);
      if(t){
        setHistory(h=>[{...t,finalPnl:t.pnl||0,finalPips:t.pips||0,status:(t.pnl||0)>0?"WIN":"LOSS",closeTime:Date.now()},...h].slice(0,500));
        toastMsg(`Closed ${t.pair}: ${fmtUsd(t.pnl)}`,(t.pnl||0)>=0?C.green:C.red);
      }
      return prev.filter(x=>x.id!==id);
    });
  },[toastMsg]);

  const closeHalf=useCallback((id)=>{
    setTrades(prev=>{
      const t=prev.find(x=>x.id===id);
      if(!t) return prev;
      if(t.lotSize<0.02){ toastMsg("Lot too small to split (min 0.01 each side)",C.amber); return prev; }
      const half=Math.round((t.lotSize/2)*100)/100;
      const remain=Math.round((t.lotSize-half)*100)/100;
      const bank=Math.round(((t.pnl||0)*(half/t.lotSize))*100)/100;
      setHistory(h=>[{...t,lotSize:half,finalPnl:bank,finalPips:t.pips||0,status:bank>0?"WIN":"LOSS",partial:true,closeTime:Date.now()},...h].slice(0,500));
      toastMsg(`Banked 50% of ${t.pair}: ${fmtUsd(bank)} · remainder SL → BE`,C.gold);
      return prev.map(x=>x.id===id?{...x,lotSize:remain,sl:x.entry,partialTaken:true,pnl:(x.pnl||0)-bank}:x);
    });
  },[toastMsg]);

  const exportCSV=useCallback(()=>{
    const rows=[["pair","direction","style","strategy","entry","sl","tp1","lots","pips","pnl","result","partial","openTime","closeTime"]];
    history.forEach(h=>rows.push([h.pair,h.direction,h.style||"",h.strategyId||"",h.entry,h.sl,h.tp1,h.lotSize,(h.finalPips||0).toFixed(1),(h.finalPnl||0).toFixed(2),h.status||"",h.partial?"Y":"",new Date(h.openTime).toISOString(),new Date(h.closeTime).toISOString()]));
    const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a");
    a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
    a.download="axiom_history.csv"; a.click();
  },[history]);

  // ── AI GROUNDING ───────────────────────────────────────────────────────────
  const buildLiveContext=useCallback(()=>{
    const snap=priceStore.get();
    const px=(p)=>snap.prices&&snap.prices[p]?fmtP(p,snap.prices[p].mid):"unavailable";
    const lines=[];
    lines.push(`TIMESTAMP: ${new Date().toISOString()} · MARKET: ${snap.marketClosed?"CLOSED":"OPEN"} · FEED: ${snap.status.toUpperCase()}`);
    lines.push(`PRICES (live mid): EUR/USD ${px("EUR/USD")} · GBP/USD ${px("GBP/USD")} · USD/JPY ${px("USD/JPY")} · AUD/USD ${px("AUD/USD")} · USD/CHF ${px("USD/CHF")} · USD/CAD ${px("USD/CAD")} — 28 pairs streaming in-app`);
    lines.push("REGIMES (user-set): "+G10.map(c=>`${c}:${(regimes[c]||{}).dir||"?"}/${((regimes[c]||{}).strength||"?").slice(0,3)}`).join(" "));
    if(cbRates){
      lines.push("CB POLICY RATES (live FRED): "+G10.filter(c=>cbRates[c]).map(c=>`${c} ${cbRates[c].rate.toFixed(2)}%${cbRates[c].outlook?"("+cbRates[c].outlook+")":""} asOf ${cbRates[c].asOf}`).join(" · "));
      const ranked=G10.filter(c=>cbRates[c]).sort((a,b)=>cbRates[b].rate-cbRates[a].rate);
      lines.push(`CARRY RANK: high ${ranked.slice(0,3).join(">")} · low ${ranked.slice(-3).join("<")}`);
    } else lines.push("CB POLICY RATES: unavailable this session (feed not loaded)");
    if(trades.length) lines.push("OPEN PAPER TRADES: "+trades.map(t=>`${t.pair} ${t.direction} ${t.lotSize}lot pnl ${fmtUsd(t.pnl)}`).join(" · "));
    else lines.push("OPEN PAPER TRADES: none");
    lines.push(`SIGNALS IN MEMORY: ${sigs.length}`);
    return lines.join("\n");
  },[regimes,cbRates,trades,sigs]);

  const callAI=useCallback(async(system,messages,maxTokens)=>{
    const res=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({system,messages,max_tokens:maxTokens||1200})});
    const body=await res.json();
    if(!res.ok) throw new Error((body.error&&(body.error.message||body.error))||("AI proxy "+res.status));
    const text=(body.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n");
    if(!text) throw new Error("Empty AI response");
    return text;
  },[]);

  const sendAI=useCallback(async()=>{
    const q=aiInput.trim();
    if(!q||aiSending) return;
    setAiInput("");
    const userMsg={role:"user",content:q};
    setAiMsgs(prev=>[...prev,userMsg]);
    setAiSending(true);
    try{
      const system=`You are AXIOM, the AI desk inside a live G10 FX terminal. Ground every answer EXCLUSIVELY in the LIVE DATA block below. If a number, event, or fact is not in that block, say it is unavailable in this terminal — NEVER invent prices, rates, news, events, dates, or probabilities. Keep answers tight and desk-style. Trades here are paper simulations.\n\nLIVE DATA\n${buildLiveContext()}`;
      const msgs=[...aiMsgs,userMsg].slice(-24).map(m=>({role:m.role,content:m.content}));
      const text=await callAI(system,msgs,1200);
      setAiMsgs(prev=>[...prev,{role:"assistant",content:text}]);
    }catch(e){
      setAiMsgs(prev=>[...prev,{role:"assistant",content:"⚠ AI proxy error: "+e.message}]);
    }finally{ setAiSending(false); }
  },[aiInput,aiSending,aiMsgs,buildLiveContext,callAI]);

  // ── WEEKEND DESK (grounded, whitelisted) ───────────────────────────────────
  const loadWeekend=useCallback(async()=>{
    if(weekend.loading) return;
    setWeekend(w=>({...w,loading:true,error:null}));
    try{
      let rates=cbRates;
      if(!rates) rates=await loadCBRates();
      if(!rates) throw new Error("CB rates unavailable — cannot ground a weekend brief without live policy rates");
      let ev=calThis;
      if(!ev) ev=await loadCalendar("this");
      const snap=priceStore.get();
      const px=(p)=>snap.prices&&snap.prices[p]?fmtP(p,snap.prices[p].mid):null;
      const priceLines=["EUR/USD","GBP/USD","USD/JPY","AUD/USD","USD/CHF","EUR/GBP"].map(p=>`${p}: ${px(p)||"unavailable"}`).join(" · ");
      const rateLines=G10.filter(c=>rates[c]).map(c=>`${c}: ${rates[c].rate.toFixed(2)}% (${rates[c].outlook||"Hold"}, as of ${rates[c].asOf})`).join("\n");
      const highEv=(ev||[]).filter(e=>e.imp==="HIGH").slice(0,14).map(e=>`${localDT(e.utc)} — ${e.ccy} — ${e.ev}`).join("\n")||"(no high-impact events listed)";
      const regimeLines=G10.map(c=>`${c}: ${(regimes[c]||{}).dir} ${(regimes[c]||{}).strength}`).join(" · ");
      const allowed=AI_URL_WHITELIST.join("\n");
      const prompt=`DATA (the ONLY facts you may use — nothing else exists):\n\n[LIVE CB POLICY RATES — FRED]\n${rateLines}\n\n[USER REGIMES]\n${regimeLines}\n\n[LIVE PRICES]\n${priceLines}\n\n[THIS WEEK'S HIGH-IMPACT CALENDAR]\n${highEv}\n\n[ALLOWED SOURCE URLS]\n${allowed}\n\nTASK: Write 3-5 weekly FX macro themes as a JSON array. Schema per theme: {"ccy":"USD","dir":"BULLISH|BEARISH|NEUTRAL","priority":"HIGH|MEDIUM","color":"#hex","title":"...","detail":"2-3 sentences","deepAnalysis":"2-3 sentences","support":"level","resistance":"level","pivot":"level","pairs":["EUR/USD"],"dirs":["BUY"],"watchFor":"must name events from the calendar above","evidence":[{"title":"...","source":"...","url":"EXACT string from ALLOWED SOURCE URLS"}]}.\nRULES: Every number must come from DATA (levels may be simple round levels near the listed prices). Reference only listed calendar events. Every evidence.url must be copied verbatim from ALLOWED SOURCE URLS. If DATA is insufficient respond {"error":"reason"}. Respond ONLY with JSON — no prose, no markdown fences.`;
      const text=await callAI("You are a disciplined FX macro strategist. You never introduce facts beyond the DATA block. JSON only.",[{role:"user",content:prompt}],3000);
      const clean=text.replace(/```json|```/g,"").trim();
      const parsed=JSON.parse(clean);
      if(parsed&&parsed.error) throw new Error("Model declined: "+parsed.error);
      if(!Array.isArray(parsed)||!parsed.length) throw new Error("Malformed themes payload");
      const themes=parsed.filter(t=>t&&G10.includes(t.ccy)).map(t=>({
        ...t,
        dir:["BULLISH","BEARISH","NEUTRAL"].includes(t.dir)?t.dir:"NEUTRAL",
        evidence:(t.evidence||[]).filter(e=>e&&e.url&&AI_URL_WHITELIST.some(w=>e.url===w||e.url.startsWith(w))),
      }));
      if(!themes.length) throw new Error("No valid themes after validation");
      setWeekend({themes,loading:false,error:null,generatedAt:Date.now()});
    }catch(e){
      setWeekend(w=>({...w,loading:false,error:e.message}));
    }
  },[weekend.loading,cbRates,calThis,regimes,loadCBRates,loadCalendar,callAI]);

  // ── ANALYZER (grounded regime suggestions) ─────────────────────────────────
  const loadRegimeAI=useCallback(async()=>{
    if(regimeAI.loading) return;
    setRegimeAI(r=>({...r,loading:true,error:null}));
    try{
      let rates=cbRates;
      if(!rates) rates=await loadCBRates().catch(()=>{throw new Error("CB rates feed down — refusing to generate regimes without live policy rates");});
      const snap=priceStore.get();
      const px=(p)=>snap.prices&&snap.prices[p]?fmtP(p,snap.prices[p].mid):"unavailable";
      const rateLines=G10.filter(c=>rates[c]).map(c=>`${c}: ${rates[c].rate.toFixed(2)}% (${rates[c].outlook||"Hold"}/${rates[c].bias||"Neutral"}, as of ${rates[c].asOf})`).join("\n");
      const stratIds=STRATEGIES.map(s=>s.id).join(",");
      const prompt=`DATA:\n[LIVE CB RATES — FRED]\n${rateLines}\n\n[LIVE PRICES] EUR/USD ${px("EUR/USD")} · USD/JPY ${px("USD/JPY")} · GBP/USD ${px("GBP/USD")}\n\n[CURRENT USER REGIMES] ${G10.map(c=>`${c}:${(regimes[c]||{}).dir}/${(regimes[c]||{}).strength}`).join(" ")}\n\n[VALID STRATEGY IDS] ${stratIds}\n\nTASK: Assess a policy regime per G10 currency FROM THE RATES DATA ONLY (trajectory = outlook field; conviction = clarity of the path). JSON array, one object per currency, schema: {"ccy":"USD","regime":"BULLISH|BEARISH|NEUTRAL","strength":"STRONG|MODERATE|WEAK","detail":"1-2 sentences citing the rate/outlook from DATA","best_strat":["ids from VALID STRATEGY IDS"],"avoid":["ids"],"evidence":"official page name","url":"one of: ${Object.values(CB_SOURCE_URLS).join(" | ")}","summary":"5-8 words"}.\nRULES: rates/outlooks only from DATA; url must match the listed official URLs verbatim; cover all 10 currencies. Respond ONLY with JSON.`;
      const text=await callAI("You derive FX regimes strictly from provided central-bank rate data. JSON only.",[{role:"user",content:prompt}],2600);
      const clean=text.replace(/```json|```/g,"").trim();
      const parsed=JSON.parse(clean);
      if(parsed&&parsed.error) throw new Error("Model declined: "+parsed.error);
      if(!Array.isArray(parsed)) throw new Error("Malformed analyzer payload");
      const order={}; G10.forEach((c,i)=>{order[c]=i;});
      const cards=parsed.filter(c=>c&&G10.includes(c.ccy)).map(c=>({
        ...c,
        regime:["BULLISH","BEARISH","NEUTRAL"].includes(c.regime)?c.regime:"NEUTRAL",
        strength:["STRONG","MODERATE","WEAK"].includes(c.strength)?c.strength:"MODERATE",
        best_strat:(c.best_strat||[]).filter(id=>STRAT_BY_ID[id]).slice(0,4),
        avoid:(c.avoid||[]).filter(id=>STRAT_BY_ID[id]).slice(0,3),
        url:Object.values(CB_SOURCE_URLS).includes(c.url)?c.url:CB_SOURCE_URLS[c.ccy],
      })).sort((a,b)=>order[a.ccy]-order[b.ccy]);
      if(!cards.length) throw new Error("No valid cards after validation");
      setRegimeAI({cards,loading:false,error:null,generatedAt:Date.now()});
    }catch(e){
      setRegimeAI(r=>({...r,loading:false,error:e.message}));
    }
  },[regimeAI.loading,cbRates,regimes,loadCBRates,callAI]);

  const copyRegimeJSON=useCallback(()=>{
    const cards=regimeAI.cards||[];
    const out={...regimes};
    cards.forEach(c=>{out[c.ccy]={dir:c.regime,strength:c.strength};});
    try{navigator.clipboard.writeText(JSON.stringify(out)); toastMsg("Suggested AXIOM_REGIMES JSON copied",C.blue);}catch(_){toastMsg("Clipboard blocked — copy from Settings instead",C.amber);}
  },[regimeAI.cards,regimes,toastMsg]);

  const testAIProxy=useCallback(async()=>{
    setAiTest({testing:true,ok:null,result:null});
    const t0=Date.now();
    try{
      await callAI("Reply with exactly: OK",[{role:"user",content:"ping"}],16);
      setAiTest({testing:false,ok:true,result:`✓ ${Date.now()-t0}ms · model pinned server-side`});
    }catch(e){ setAiTest({testing:false,ok:false,result:"✗ "+e.message}); }
  },[callAI]);

  const saveRegimes=useCallback(()=>{
    saveJSON("axiom_regimes_v2",regimes);
    toastMsg("Regimes saved locally — paste the JSON into Netlify AXIOM_REGIMES for the engine",C.gold);
  },[regimes,toastMsg]);

  const doClear=useCallback((kind)=>{
    if(kind==="signals"){ setSigs([]); toastMsg("Signals cleared",C.amber); }
    else if(kind==="trades"){ setTrades([]); setHistory([]); toastMsg("Trades + history cleared",C.red); }
    else if(kind==="all"){
      ["axiom_settings_v72","axiom_regimes_v2","axiom_sigs_v72","axiom_trades_v72","axiom_history_v72","axiom_ai_v72","axiom_settings","axiom_regimes"].forEach(k=>{try{localStorage.removeItem(k);}catch(_){}});
      window.location.reload();
    }
  },[toastMsg]);

  // ── SYSTEM STATUS (non-price feeds; price rows are a subscriber in Settings) ─
  const systemStatus=useMemo(()=>({
    cb:cbSource,cbLoaded:cbRates?Object.keys(cbRates).length:0,
    news:newsError?"error":(newsArts?"finnhub":null),
    cal:calError?"error":(calThis?"ok":null),
    scan:scanEngineErr?"error":(lastScanMeta?(scanPartial?"partial":"ok"):null),
    scanInfo:lastScanMeta?`${lastScanMeta.count} sigs · ${timeAgo(lastScanMeta.ts)}`:null,
    cot:lastScanMeta?!!(lastScanMeta.feeds&&lastScanMeta.feeds.cot):null,
    cotAsOf:lastScanMeta&&lastScanMeta.feeds?lastScanMeta.feeds.cotAsOf:null,
  }),[cbSource,cbRates,newsError,newsArts,calError,calThis,scanEngineErr,lastScanMeta,scanPartial]);

  const openPnl=trades.reduce((a,t)=>a+(t.pnl||0),0);
  const goPair=useCallback((p)=>{setChartPair(p);setTab("charts");},[]);

  // ── RENDER ─────────────────────────────────────────────────────────────────
  const renderTab=()=>{
    switch(tab){
      case "dashboard": return <Dashboard regimes={regimes} cbRates={cbRates} cbAsOf={cbAsOf} sigs={sigs} news={newsArts} onGoTab={setTab} onOpenSig={setModalSig} onGoPair={goPair}/>;
      case "signals": return <SignalsTab sigs={sigs} scanning={scanning} scanStatus={scanStatus} scanPartial={scanPartial} scanUnscanned={scanUnscanned} scanErrors={scanErrors} scanEngineErr={scanEngineErr} onScan={runSignalScan} onOpenSig={setModalSig} onTake={takeTrade} stratCount={STRATEGIES.length}/>;
      case "strategies": return <StrategiesTab onOpenStrat={setStratModal} enabledMap={settings.strategies}/>;
      case "charts": return <ChartsTab navigated={chartPair}/>;
      case "analyzer": return <AnalyzerTab regimes={regimes} regimeAI={regimeAI} onGenerate={loadRegimeAI} onCopyJSON={copyRegimeJSON}/>;
      case "weekend": return <WeekendTab weekend={weekend} onGenerate={loadWeekend}/>;
      case "calendar": return <CalendarTab calThis={calThis} calNext={calNext} calError={calError} calLoading={calLoading} onReload={(w)=>loadCalendar(w).catch(()=>{})}/>;
      case "news": return <NewsTab articles={newsArts} newsError={newsError} newsLoading={newsLoading} onRefresh={()=>loadNews(false)} onLoadMore={()=>loadNews(true)}/>;
      case "cbrates": return <CBRatesTab cbRates={cbRates} cbSource={cbSource} cbErrors={cbErrors} cbLoading={cbLoading} onOpenCB={setCbModal} onReload={()=>loadCBRates().catch(()=>{})}/>;
      case "ai": return <AITabView msgs={aiMsgs} sending={aiSending}/>;
      case "trades": return <TradesTab trades={trades} history={history} onBE={moveBE} onCloseHalf={closeHalf} onClose={closeTrade} acct={Number(settings.acct)||0}/>;
      case "performance": return <PerformanceTab history={history} onExport={exportCSV}/>;
      case "settings": return <SettingsTab settings={settings} setSettings={setSettings} regimes={regimes} setRegimes={setRegimes} onSaveRegimes={saveRegimes} systemStatus={systemStatus} onTestAI={testAIProxy} aiTest={aiTest} onClear={doClear}/>;
      case "deploy": return <DeployTab/>;
      case "sources": return <SourcesTab/>;
      default: return null;
    }
  };

  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'SF Mono','Cascadia Code',Menlo,Consolas,monospace"}}>
      <style>{`@keyframes axpulse{0%{opacity:1}50%{opacity:.25}100%{opacity:1}} *{box-sizing:border-box} ::selection{background:${C.gold}44} input:focus,textarea:focus{outline:1px solid ${C.gold}88} body{margin:0}`}</style>
      <div style={{position:"sticky",top:0,zIndex:100,background:C.bg,borderBottom:`1px solid ${C.bdr}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",flexWrap:"wrap",gap:"8px"}}>
          <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
            <span style={{fontSize:"15px",fontWeight:"900",letterSpacing:"5px",color:C.gold}}>A X I O M</span>
            <span style={{fontSize:"8px",color:C.muted,letterSpacing:"2px"}}>G10 TERMINAL · v{VERSION}</span>
            <ConnStatus/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            {trades.length>0&&(
              <span style={{fontSize:"10px",fontWeight:"800",color:openPnl>=0?C.green:C.red}}>{trades.length} open · {fmtUsd(openPnl)}</span>)}
            <span style={{fontSize:"9px",color:C.muted}}>acct <span style={{color:C.text,fontWeight:"800"}}>{fmtUsd(Number(settings.acct)||0)}</span> · risk {settings.riskPct}%</span>
          </div>
        </div>
        <GlobalFeedBanner/>
        <div style={{display:"flex",gap:"2px",overflowX:"auto",padding:"0 10px 8px"}}>
          {TABS.map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{padding:"6px 11px",background:tab===k?C.bg3:"transparent",color:tab===k?C.gold:C.muted,border:`1px solid ${tab===k?C.bdr:"transparent"}`,borderRadius:"3px",cursor:"pointer",fontSize:"9px",fontWeight:"800",letterSpacing:"0.8px",fontFamily:"inherit",whiteSpace:"nowrap"}}>{l}</button>))}
        </div>
      </div>
      <div style={{maxWidth:"1180px",margin:"0 auto",padding:"14px 14px 60px"}}>
        {renderTab()}
      </div>
      {tab==="ai"&&(
        <div style={{position:"fixed",bottom:0,left:0,right:0,background:C.bg1,borderTop:`1px solid ${C.bdr}`,padding:"10px 14px",zIndex:150}}>
          <div style={{maxWidth:"1180px",margin:"0 auto",display:"flex",gap:"8px"}}>
            <input value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")sendAI();}}
              placeholder="Ask the desk — grounded in live terminal data only…"
              style={{flex:1,background:C.bg2,border:`1px solid ${C.bdr}`,color:C.text,padding:"10px 12px",borderRadius:"3px",fontFamily:"inherit",fontSize:"11px"}}/>
            <Btn label={aiSending?"…":"SEND"} color={C.gold} disabled={aiSending||!aiInput.trim()} onClick={sendAI}/>
          </div>
        </div>)}
      {modalSig&&<SignalModal sig={modalSig} onTake={takeTrade} onClose={()=>setModalSig(null)} regimes={regimes} cbRates={cbRates}/>}
      {stratModal&&<StratModal strat={stratModal} onClose={()=>setStratModal(null)} regimes={regimes} cbRates={cbRates}/>}
      {cbModal&&<CBModal ccy={cbModal} cbRates={cbRates} onClose={()=>setCbModal(null)}/>}
      {toast&&(
        <div style={{position:"fixed",bottom:"18px",right:"18px",zIndex:300,background:C.bg1,border:`1px solid ${toast.color}66`,borderLeft:`3px solid ${toast.color}`,borderRadius:"4px",padding:"10px 14px",fontSize:"10px",color:C.text,maxWidth:"340px",boxShadow:"0 4px 18px rgba(0,0,0,0.5)"}}>
          {toast.msg}
        </div>)}
    </div>);
}

window.AxiomFX = AxiomFX;
