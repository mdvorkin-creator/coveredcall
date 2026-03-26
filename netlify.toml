exports.handler = async function(event) {
  const results = {};
  
  // Test 1: Tradier sandbox (free, no real account needed for test)
  try {
    const r = await fetch('https://sandbox.tradier.com/v1/markets/quotes?symbols=META', {
      headers: { 'Authorization': 'Bearer SANDBOX_TOKEN', 'Accept': 'application/json' }
    });
    results.tradier_sandbox = r.status;
  } catch(e) { results.tradier_sandbox = 'ERROR: ' + e.message; }

  // Test 2: Polygon.io free (needs real key but reachability test)
  try {
    const r = await fetch('https://api.polygon.io/v2/aggs/ticker/META/range/1/day/2024-01-01/2024-01-02?apiKey=test', { signal: AbortSignal.timeout(5000) });
    results.polygon = r.status;
    const d = await r.json(); results.polygon_body = JSON.stringify(d).slice(0,100);
  } catch(e) { results.polygon = 'ERROR: ' + e.message; }

  // Test 3: Finnhub (free tier real key needed)
  try {
    const r = await fetch('https://finnhub.io/api/v1/quote?symbol=META&token=test', { signal: AbortSignal.timeout(5000) });
    results.finnhub = r.status;
  } catch(e) { results.finnhub = 'ERROR: ' + e.message; }

  // Test 4: Yahoo via different approach
  try {
    const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/META?range=1d&interval=1d', {
      headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000)
    });
    results.yahoo = r.status;
    if (r.ok) { const d = await r.json(); results.yahoo_price = d?.chart?.result?.[0]?.meta?.regularMarketPrice; }
  } catch(e) { results.yahoo = 'ERROR: ' + e.message; }

  // Test 5: Alpha Vantage (free 25 req/day)
  try {
    const r = await fetch('https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=META&apikey=demo', { signal: AbortSignal.timeout(5000) });
    results.alphavantage = r.status;
    const d = await r.json(); results.av_body = JSON.stringify(d).slice(0,150);
  } catch(e) { results.alphavantage = 'ERROR: ' + e.message; }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(results, null, 2)
  };
};
