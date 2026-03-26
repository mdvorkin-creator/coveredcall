exports.handler = async function(event) {
  const ticker = event.queryStringParameters?.ticker;
  const hdrs   = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (!ticker) return { statusCode: 400, headers: hdrs, body: JSON.stringify({ error: 'ticker requerido' }) };

  const TOKEN = process.env.MARKETDATA_TOKEN;
  if (!TOKEN) return { statusCode: 500, headers: hdrs, body: JSON.stringify({ error: 'MARKETDATA_TOKEN no configurado' }) };

  try {
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const seisMeses = new Date(hoy); seisMeses.setMonth(seisMeses.getMonth() + 6);

    const fromDate = hoy.toISOString().split('T')[0];
    const toDate   = seisMeses.toISOString().split('T')[0];

    // Pedir la cadena completa sin filtrar — así trae todas las fechas disponibles
    const res = await fetch(
      `https://api.marketdata.app/v1/options/chain/${ticker}/?side=call&from=${fromDate}&to=${toDate}`,
      { headers: { 'Authorization': `Bearer ${TOKEN}` } }
    );

    if (!res.ok) throw new Error(`MarketData respondió ${res.status}`);
    const data = await res.json();

    if (!data.expiration || data.expiration.length === 0)
      throw new Error('Sin fechas de expiración disponibles para ' + ticker);

    // Agrupar por fecha sumando volumen y OI
    const fechaMap = {};
    data.expiration.forEach((ts, i) => {
      const d = new Date(ts * 1000);
      const key = d.toISOString().split('T')[0]; // YYYY-MM-DD
      if (!fechaMap[key]) fechaMap[key] = { vol: 0, oi: 0 };
      fechaMap[key].vol += data.volume?.[i]       || 0;
      fechaMap[key].oi  += data.openInterest?.[i] || 0;
    });

    // Convertir a array, ordenar por fecha
    const expiries = Object.entries(fechaMap)
      .map(([date, v]) => ({
        date,
        label: new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
        }),
        dias: Math.ceil((new Date(date + 'T12:00:00') - hoy) / 86400000),
        vol:  v.vol,
        oi:   v.oi
      }))
      .filter(e => e.dias > 0)
      .sort((a, b) => a.dias - b.dias);

    // Marcar las de mayor volumen (top 50% del máximo)
    const maxVol = Math.max(...expiries.map(e => e.vol), 1);
    expiries.forEach(e => { e.topVol = e.vol >= maxVol * 0.5; });

    return {
      statusCode: 200, headers: hdrs,
      body: JSON.stringify({ ticker, expiries })
    };

  } catch(err) {
    return { statusCode: 500, headers: hdrs, body: JSON.stringify({ error: err.message }) };
  }
};
