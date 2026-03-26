exports.handler = async function(event) {
  const ticker  = event.queryStringParameters?.ticker;
  const expiry  = event.queryStringParameters?.expiry;
  const hdrs    = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (!ticker)  return { statusCode: 400, headers: hdrs, body: JSON.stringify({ error: 'ticker requerido' }) };

  const YH = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/'
  };

  try {
    // 1. Precio actual
    const qRes = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
      { headers: YH }
    );
    if (!qRes.ok) throw new Error(`No se pudo obtener precio de ${ticker} (${qRes.status})`);
    const qData = await qRes.json();
    const meta  = qData?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) throw new Error(`Ticker ${ticker} no encontrado`);

    const stockPrice  = meta.regularMarketPrice;
    const prevClose   = meta.chartPreviousClose || meta.previousClose || stockPrice;
    const stockChange = ((stockPrice - prevClose) / prevClose * 100);
    const high52      = meta.fiftyTwoWeekHigh || 0;
    const low52       = meta.fiftyTwoWeekLow  || 0;

    // 2. Opciones — si viene expiry usamos ese timestamp, sino Yahoo devuelve el más cercano
    const expTimestamp = expiry ? Math.floor(new Date(expiry + 'T12:00:00').getTime() / 1000) : '';
    const optUrl = `https://query2.finance.yahoo.com/v7/finance/options/${ticker}${expTimestamp ? '?date=' + expTimestamp : ''}`;

    const oRes = await fetch(optUrl, { headers: YH });
    if (!oRes.ok) throw new Error(`No se pudo obtener opciones (${oRes.status})`);
    const oData = await oRes.json();

    const result = oData?.optionChain?.result?.[0];
    if (!result) throw new Error('Sin datos de opciones para ' + ticker);

    const rawCalls = result?.options?.[0]?.calls || [];
    const expirationDates = result.expirationDates || [];

    // Fecha real del vencimiento que devolvió Yahoo
    const actualTs   = result?.options?.[0]?.expirationDate || (expTimestamp || expirationDates[0]);
    const actualDate = new Date(actualTs * 1000);
    const expiryLabel = actualDate.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
    const hoy  = new Date(); hoy.setHours(0,0,0,0);
    const dias = Math.max(1, Math.ceil((actualDate - hoy) / 86400000));

    // Filtrar calls OTM con precio
    const calls = rawCalls
      .map(c => {
        let prima = (c.lastPrice && c.lastPrice > 0) ? c.lastPrice : 0;
        if (!prima && c.bid > 0 && c.ask > 0) prima = (c.bid + c.ask) / 2;
        return {
          strike:  parseFloat(c.strike),
          prima:   parseFloat(prima.toFixed(2)),
          bid:     c.bid   || null,
          ask:     c.ask   || null,
          volumen: c.volume        || null,
          oi:      c.openInterest  || null,
          iv:      c.impliedVolatility ? parseFloat((c.impliedVolatility * 100).toFixed(1)) : null
        };
      })
      .filter(c => c.strike > stockPrice && c.prima > 0)
      .sort((a, b) => a.strike - b.strike)
      .slice(0, 10);

    if (calls.length === 0) {
      // Devolver los vencimientos disponibles para que el usuario elija
      const available = expirationDates.map(ts => {
        const d = new Date(ts * 1000);
        return d.toISOString().split('T')[0];
      });
      throw new Error(`Sin calls OTM para ese vencimiento. Fechas disponibles: ${available.slice(0,6).join(', ')}`);
    }

    return {
      statusCode: 200, headers: hdrs,
      body: JSON.stringify({ ticker, stockPrice, stockChange, high52, low52, expiryLabel, dias, calls })
    };

  } catch (err) {
    return { statusCode: 500, headers: hdrs, body: JSON.stringify({ error: err.message }) };
  }
};
