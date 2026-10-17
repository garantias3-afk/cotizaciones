// calc.js — Módulo ES puro, sin DOM. Testeable con `node --test`.
// Valoración SIN tipo de cambio: CEDEAR = (cant ÷ ratio) × precio_usd del subyacente;
// directa = cant × precio_usd.

export const APP_VERSION = "1.0.0-v5";

export function esNumero(v) {
  return typeof v === "number" && Number.isFinite(v);
}

// Formato es-AR: miles con punto, decimales con coma.
export function formatAR(value, decimales = 2) {
  if (!esNumero(value)) return "N/D";
  const neg = value < 0;
  const abs = Math.abs(value);
  const entero = Math.floor(abs).toLocaleString("es-AR").replace(/,/g, ".");
  const dec = (abs % 1).toFixed(decimales).slice(1).replace(".", ",");
  return (neg ? "-" : "") + entero + dec;
}

export function formatUSD2(value) {
  return formatAR(value, 2);
}

export function formatUSD0(value) {
  return formatAR(value, 0);
}

// Valor vivo de una posición (sin tipo de cambio).
export function valorVivo(position, precioUsd) {
  const cant = esNumero(position.cant) ? position.cant : 0;
  if (position.instrumento === "CEDEAR") {
    const ratio = esNumero(position.ratio) && position.ratio !== 0 ? position.ratio : null;
    if (!ratio) return null;
    return (cant / ratio) * precioUsd;
  }
  return cant * precioUsd;
}

// P&L no realizado = vivo − costo.
export function pnlNoRealizado(vivo, costoUsd) {
  const costo = esNumero(costoUsd) ? costoUsd : 0;
  if (!esNumero(vivo)) return null;
  return vivo - costo;
}

export function pnlNoRealizadoPct(pnl, costoUsd) {
  const costo = esNumero(costoUsd) ? costoUsd : 0;
  if (pnl === null || costo === 0) return null;
  return (pnl / costo) * 100;
}

// Determina si un precio usa valor_cierre del Excel (marcado).
export function usaValorcierre(source, ratioOk, unidadSospechosa, ticker) {
  return source === "NO_VERIFICADO" || ratioOk === false || (unidadSospechosa && unidadSospechosa.includes(ticker));
}

// P&L realizado: filas válidas (sin flags), suma y agregados.
export function realizadoTotales(realizadas) {
  if (!realizadas) return null;
  const filas = (realizadas.filas || []).filter((f) => !f.flags || f.flags.length === 0);
  const total = filas.reduce((a, f) => a + (esNumero(f.resultado_usd) ? f.resultado_usd : 0), 0);
  const porAnio = {};
  const porTicker = {};
  const porMotivo = {};
  let dividendos = 0;
  for (const f of filas) {
    const res = esNumero(f.resultado_usd) ? f.resultado_usd : 0;
    const anio = String(f.fecha || "").slice(0, 4) || "?";
    porAnio[anio] = (porAnio[anio] || 0) + res;
    porTicker[f.ticker] = (porTicker[f.ticker] || 0) + res;
    if (f.motivo) porMotivo[f.motivo] = (porMotivo[f.motivo] || 0) + res;
    if (f.tipo === "DIVIDENDO") dividendos += res;
  }
  const ganancias = filas.filter((f) => (esNumero(f.resultado_usd) ? f.resultado_usd : 0) > 0).reduce((a, f) => a + f.resultado_usd, 0);
  const perdidas = filas.filter((f) => (esNumero(f.resultado_usd) ? f.resultado_usd : 0) < 0).reduce((a, f) => a + f.resultado_usd, 0);
  return {
    filasValidas: filas.length,
    totalUsd: total,
    porAnio,
    porTicker,
    porMotivo,
    dividendosUsd: dividendos,
    ganancias,
    perdidas,
    filasExcluidas: (realizadas.filas || []).length - filas.length,
  };
}

export function totalGeneral(valorVivoTotal, pnlNoRealizadoTotal, realizadoTotal, efectivoUsd) {
  const vivo = esNumero(valorVivoTotal) ? valorVivoTotal : 0;
  const pnl = esNumero(pnlNoRealizadoTotal) ? pnlNoRealizadoTotal : 0;
  const real = esNumero(realizadoTotal) ? realizadoTotal : 0;
  const efec = esNumero(efectivoUsd) ? efectivoUsd : 0;
  return vivo + pnl + real + efec;
}

// Pesos vivos: cada ticker / total vivo. Debe dar 100% ± 0.01.
export function pesosVivos(posicionesConVivo) {
  const total = posicionesConVivo.reduce((a, p) => a + (esNumero(p.valorVivo) ? p.valorVivo : 0), 0);
  if (total === 0) return posicionesConVivo.map(() => 0);
  return posicionesConVivo.map((p) => ((esNumero(p.valorVivo) ? p.valorVivo : 0) / total) * 100);
}

// Ordenar posiciones por valor vivo descendente.
export function ordenarPorValorVivo(posiciones, asc = false) {
  return [...posiciones].sort((a, b) => {
    const va = esNumero(a.valorVivo) ? a.valorVivo : 0;
    const vb = esNumero(b.valorVivo) ? b.valorVivo : 0;
    return asc ? va - vb : vb - va;
  });
}

export function antiguedadHs(tsIso) {
  if (!tsIso) return null;
  const d = new Date(tsIso);
  if (Number.isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / 3600000;
}
