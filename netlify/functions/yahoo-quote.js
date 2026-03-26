exports.handler = async function(event) {
  const ticker = event.queryStringParameters?.ticker;
  if (!ticker) return { statusCode: 400, body: JSON.stringify({ error: 'ticker requerido' }) };

  const hdrs = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  const BASE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/'
  };

  try {
    // 1. Obtener cookie de sesión
    let cookie = '';
    try {
      const cookieRes = await fetch('https://fc.yahoo.com', { headers: BASE_HEADERS, redirect: 'follow' });
      const rawCookie = cookieRes.headers.get('set-cookie') || '';
      const match = rawCookie.match(/A1=[^;]+/);
      if (match) cookie = match[0];
    } catch(e) {}

    // 2. Obtener crumb
    let crumb = '';
    try {
      const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/csrfToken', {
        headers: { ...BASE_HEADERS, ...(cookie ? { Cookie: cookie } : {}) }
      });
      crumb = (await crumbRes.text()).trim();
    } catch(e) {}

    // 3. Fetch quote con crumb
    const crumbQ = crumb ? `&crumb=${encodeURIComponent(crumb)}` : '';
    const cookieH = cookie ? { Cookie: cookie } : {};

    const endpoints = [
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d${crumbQ}`,
      `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d${crumbQ}`,
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${ticker}${crumbQ}`
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, { headers: { ...BASE_HEADERS, ...cookieH } });
        if (!res.ok) continue;
        const data = await res.json();

        // v8 chart
        const meta = data?.chart?.result?.[0]?.meta;
        if (meta?.regularMarketPrice) {
          return {
            statusCode: 200, headers: hdrs,
            body: JSON.stringify({
              price: meta.regularMarketPrice,
              change: ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose * 100),
              high52: meta.fiftyTwoWeekHigh || 0,
              low52: meta.fiftyTwoWeekLow || 0
            })
          };
        }

        // v7 quote
        const q = data?.quoteResponse?.result?.[0];
        if (q?.regularMarketPrice) {
          return {
            statusCode: 200, headers: hdrs,
            body: JSON.stringify({
              price: q.regularMarketPrice,
              change: q.regularMarketChangePercent || 0,
              high52: q.fiftyTwoWeekHigh || 0,
              low52: q.fiftyTwoWeekLow || 0
            })
          };
        }
      } catch(e) { continue; }
    }

    throw new Error(`No se pudo obtener el precio de ${ticker}. Intentá de nuevo en unos segundos.`);

  } catch (err) {
    return { statusCode: 500, headers: hdrs, body: JSON.stringify({ error: err.message }) };
  }
};
