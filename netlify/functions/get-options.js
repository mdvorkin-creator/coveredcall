exports.handler = async function(event) {
  const ticker = event.queryStringParameters?.ticker;
  const expiry = event.queryStringParameters?.expiry; // YYYY-MM-DD
  const hdrs   = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (!ticker) return { statusCode: 400, headers: hdrs, body: JSON.stringify({ error: 'ticker requerido' }) };

  const TOKEN = process.env.MARKETDATA_TOKEN;
  if (!TOKEN) return { statusCode: 500, headers: hdrs, body: JSON.stringify({ error: 'MARKETDATA_TOKEN no configurado en Netlify' }) };

  try {
    // 1. Precio actual
    const qRes = await fetch(`https://api.marketdata.app/v1/stocks/quotes/${ticker}/`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    if (!qRes.ok) throw new Error(`No se pudo obtener precio de ${ticker} (${qRes.status})`);
    const qData = await qRes.json();
    if (!qData.last?.[0]) throw new Error(`Ticker ${ticker} no encontrado`);

    const stockPrice  = qData.last[0];
    const stockChange = qData.changepct?.[0] || 0;
    const high52      = qData['52weekHigh']?.[0] || 0;
    const low52       = qData['52weekLow']?.[0]  || 0;

    // 2. Cadena de opciones
    const expiryParam = expiry ? `&expiration=${expiry}` : '';
    const optRes = await fetch(
      `https://api.marketdata.app/v1/options/chain/${ticker}/?side=call&strikeLimit=15${expiryParam}`,
      { headers: { 'Authorization': `Bearer ${TOKEN}` } }
    );
    if (!optRes.ok) throw new Error(`No se pudo obtener opciones (${optRes.status})`);
    const optData = await optRes.json();

    if (!optData.strike || optData.strike.length === 0)
      throw new Error('Sin opciones disponibles para ese vencimiento');

    // Armar array de calls
    const allCalls = optData.strike.map((s, i) => ({
      strike:  s,
      prima:   parseFloat(((optData.last?.[i] || 0) > 0 ? optData.last[i] : ((optData.bid?.[i]||0) + (optData.ask?.[i]||0)) / 2).toFixed(2)),
      bid:     optData.bid?.[i]   || null,
      ask:     optData.ask?.[i]   || null,
      volumen: optData.volume?.[i] || null,
      oi:      optData.openInterest?.[i] || null,
      iv:      optData.iv?.[i] ? parseFloat((optData.iv[i] * 100).toFixed(1)) : null
    }));

    // Filtrar OTM, ordenar, top 10
    const calls = allCalls
      .filter(c => c.strike > stockPrice && c.prima > 0)
      .sort((a, b) => a.strike - b.strike)
      .slice(0, 10);

    if (calls.length === 0)
      throw new Error('Sin calls OTM con precio para ese vencimiento. Probá otra fecha.');

    // Fecha real del vencimiento
    const expLabel = expiry
      ? new Date(expiry + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
      : (optData.expiration?.[0] ? new Date(optData.expiration[0] * 1000).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : expiry);

    const hoy  = new Date(); hoy.setHours(0,0,0,0);
    const expD = expiry ? new Date(expiry + 'T12:00:00') : new Date(optData.expiration?.[0] * 1000);
    const dias = Math.max(1, Math.ceil((expD - hoy) / 86400000));

    return {
      statusCode: 200, headers: hdrs,
      body: JSON.stringify({ ticker, stockPrice, stockChange, high52, low52, expiryLabel: expLabel, dias, calls })
    };

  } catch(err) {
    return { statusCode: 500, headers: hdrs, body: JSON.stringify({ error: err.message }) };
  }
};
