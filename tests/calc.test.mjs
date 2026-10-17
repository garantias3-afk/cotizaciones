import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = join(fileURLToPath(import.meta.url), "..");
const calcPath = join(__dirname, "..", "docs", "calc.js");
const calc = await import("file://" + calcPath);

describe("calc.js", () => {
  it("CEDEAR = (cant ÷ ratio) × precio_usd; directa = cant × precio_usd", () => {
    const ced = { ticker: "AAA", instrumento: "CEDEAR", cant: 120, ratio: 60, costo_usd: 1000 };
    const dir = { ticker: "BBB", instrumento: "DIRECTA", cant: 10, costo_usd: 500 };
    assert.strictEqual(calc.valorVivo(ced, 300), 600); // (120/60)*300 = 600
    assert.strictEqual(calc.valorVivo(dir, 40), 400);  // 10*40
    assert.strictEqual(calc.pnlNoRealizado(600, 1000), -400);
    assert.strictEqual(calc.pnlNoRealizado(400, 500), -100);
  });

  it("P&L no realizado y % sobre costo", () => {
    assert.strictEqual(calc.pnlNoRealizadoPct(100, 1000), 10);
    assert.strictEqual(calc.pnlNoRealizadoPct(-200, 1000), -20);
    assert.strictEqual(calc.pnlNoRealizadoPct(null, 1000), null);
    assert.strictEqual(calc.pnlNoRealizadoPct(100, 0), null);
  });

  it("realizado: suma, filtro por año, exclusión de filas con flag, null no rompe", () => {
    const ok = { filas: [
      { fecha: "2026-03-01", ticker: "AAA", tipo: "VENTA", cant: 2, ingreso_neto_usd: 200, costo_usd: 100, comisiones_usd: 5, resultado_usd: 95, motivo: "STOP", flags: [] },
      { fecha: "2025-01-01", ticker: "BBB", tipo: "DIVIDENDO", cant: 0, ingreso_neto_usd: 10, costo_usd: 0, comisiones_usd: 0, resultado_usd: 10, motivo: "DIVIDENDO", flags: [] },
      { fecha: "2026-06-01", ticker: "CCC", tipo: "VENTA", cant: 1, ingreso_neto_usd: 50, costo_usd: 60, comisiones_usd: 0, resultado_usd: -10, motivo: "TOMA", flags: ["REALIZADA_INCONSISTENTE"] },
    ], totales: null };
    const rt = calc.realizadoTotales(ok);
    assert.strictEqual(rt.totalUsd, 105); // 95 + 10 (excluye -10 con flag)
    assert.strictEqual(rt.dividendosUsd, 10);
    assert.strictEqual(rt.filasExcluidas, 1);
    assert.strictEqual(rt.porAnio["2026"], 95);
    assert.strictEqual(rt.porAnio["2025"], 10);
    assert.strictEqual(calc.realizadoTotales(null), null);
  });

  it("total = no realizado + realizado", () => {
    assert.strictEqual(calc.totalGeneral(10000, 500, 200, 300), 11000);
    assert.strictEqual(calc.totalGeneral(null, null, null, null), 0);
  });

  it("pesos vivos = 100% ± 0.01", () => {
    const ps = calc.pesosVivos([{ valorVivo: 100 }, { valorVivo: 200 }, { valorVivo: 300 }]);
    const suma = ps.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(suma - 100) < 0.01, "suma = " + suma);
    assert.ok(Math.abs(ps[0] - (100 / 6)) < 1e-9);
    assert.strictEqual(calc.pesosVivos([]).length, 0);
  });

  it("NO_VERIFICADO y RATIO_SOSPECHOSO usan valor_cierre", () => {
    assert.strictEqual(calc.usaValorcierre("NO_VERIFICADO", true, [], "AAA"), true);
    assert.strictEqual(calc.usaValorcierre("IOL", false, [], "AAA"), true);
    assert.strictEqual(calc.usaValorcierre("IOL", true, ["AAA"], "AAA"), true);
    assert.strictEqual(calc.usaValorcierre("IOL", true, [], "AAA"), false);
  });

  it("ordenar por valor vivo descendente", () => {
    const ord = calc.ordenarPorValorVivo([{ valorVivo: 10 }, { valorVivo: 50 }, { valorVivo: 30 }]);
    assert.strictEqual(ord[0].valorVivo, 50);
    assert.strictEqual(ord[2].valorVivo, 10);
  });

  it("formato es-AR", () => {
    assert.strictEqual(calc.formatAR(1234567.89, 2), "1.234.567,89");
    assert.strictEqual(calc.formatAR(-1234.5, 2), "-1.234,50");
    assert.strictEqual(calc.formatAR(null, 2), "N/D");
  });
});
