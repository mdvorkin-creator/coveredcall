exports.handler = async function(event) {
  const results = {};
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  // Test 1: Yahoo Finance precio (sabemos que funciona)
  try {
    const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/META?interval=1d&range=1d', { headers: { 'User-Agent': UA } });
    const d = await r.json();
    results.yahoo_price = { status: r.status, price: d?.chart?.result?.[0]?.meta?.regularMarketPrice };
  } catch(e) { results.yahoo_price = { error: e.message }; }

  // Test 2: Yahoo opciones sin auth
  try {
    const r = await fetch('https://query1.finance.yahoo.com/v7/finance/options/META', { headers: { 'User-Agent': UA, 'Referer': 'https://finance.yahoo.com/' } });
    const d = await r.json();
    const calls = d?.optionChain?.result?.[0]?.options?.[0]?.calls;
    results.yahoo_options = { status: r.status, calls_count: calls?.length, first_strike: calls?.[0]?.strike };
  } catch(e) { results.yahoo_options = { error: e.message }; }

  // Test 3: Unusual Whales (free, delay)
  try {
    const r = await fetch('https://api.unusualwhales.com/api/stock/META/option-chains', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(5000) });
    results.unusual_whales = { status: r.status };
  } catch(e) { results.unusual_whales = { error: e.message }; }

  // Test 4: Tradier sandbox (sin key)
  try {
    const r = await fetch('https://sandbox.tradier.com/v1/markets/options/chains?symbol=META&expiration=2026-04-17', { headers: { 'Authorization': 'Bearer INVALID', 'Accept': 'application/json' }, signal: AbortSignal.timeout(5000) });
    results.tradier = { status: r.status };
  } catch(e) { results.tradier = { error: e.message }; }

  // Test 5: MarketData.app (free tier 100 req/day sin tarjeta)
  try {
    const r = await fetch('https://api.marketdata.app/v1/options/chain/META/?expiration=2026-04-17', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(5000) });
    const d = await r.json();
    results.marketdata_app = { status: r.status, body: JSON.stringify(d).slice(0, 150) };
  } catch(e) { results.marketdata_app = { error: e.message }; }

  // Test 6: Yahoo opciones con cookie flow
  try {
    const init = await fetch('https://finance.yahoo.com/quote/META', { headers: { 'User-Agent': UA } });
    const cookie = (init.headers.get('set-cookie') || '').split(',').map(c => c.trim().split(';')[0]).join('; ');
    const crumbR = await fetch('https://query1.finance.yahoo.com/v1/test/csrfToken', { headers: { 'User-Agent': UA, 'Cookie': cookie } });
    const crumb = (await crumbR.text()).trim();
    const optR = await fetch(`https://query1.finance.yahoo.com/v7/finance/options/META?crumb=${encodeURIComponent(crumb)}`, { headers: { 'User-Agent': UA, 'Cookie': cookie } });
    const d = await optR.json();
    const calls = d?.optionChain?.result?.[0]?.options?.[0]?.calls;
    results.yahoo_options_cookie = { status: optR.status, crumb_len: crumb.length, calls_count: calls?.length, first_strike: calls?.[0]?.strike };
  } catch(e) { results.yahoo_options_cookie = { error: e.message }; }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(results, null, 2)
  };
};
