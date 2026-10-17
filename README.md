# cotizaciones — PWA portfolio iOS (código solo, sin datos)

Repo público con SOLO código de la app PWA. No contiene tickers de cartera, montos, ni ningún dato privado.

## Despliegue

- Repo: github.com/garantias3-afk/cotizaciones
- GitHub Pages: rama `main`, carpeta `/docs`
- URL: https://garantias3-afk.github.io/cotizaciones/

## Instalación en el iPhone

1. Safari → https://garantias3-afk.github.io/cotizaciones/
2. Compartir → "Añadir a pantalla de inicio"
3. Abrir la app DESDE el ícono de la pantalla de inicio
4. Configuración → pegar el token fine-grained de GitHub → "Verificar ahora"

El token se guarda solo en `localStorage` del dispositivo instalado. Nunca viaja al repo, a chats, a archivos ni a logs.

## Seguridad (D12)

- CSP: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://api.github.com; base-uri 'none'; form-action 'none'`. Sin inline scripts ni `eval`.
- Markdown del newsletter: `marked` + `DOMPurify`, vendorizados. Todo HTML pasa por `DOMPurify.sanitize`. Links externos con `rel="noopener noreferrer"`.
- El service worker cachea solo el shell; nunca respuestas de `api.github.com`.

## Vendor (versiones y sha256)

| Archivo | Versión | Licencia | sha256 |
|---------|---------|----------|--------|
| `docs/vendor/marked.min.js` | 12.0.2 | MIT | 15fabce5b65898b32b03f5ed25e9f891a729ad4c0d6d877110a7744aa847a894 |
| `docs/vendor/dompurify.min.js` | 3.1.7 | Apache 2.0 / MPL 2.0 | 6407576993a5aa1303eaf9fefb95e5cfc1c0c80645bd3717db671727e6b55b91 |

## Atribuciones (R-REUSO)

- Referencia de endpoints (sin copiar): `ezeprimo/py_iol` (MIT).
- Patrón Actions → JSON: `gusafig/cedear-dashboard` (solo referencia, sin copiar código).
- No se copió código sin licencia declarada ni GPL.

## Privacidad (D8)

Este repo no contiene cartera, costos, realizadas, newsletter, mapa, ratios ni datos reales. Los datos viven en el repo privado `garantias3-afk/pipeline-bursatil` (rama `app-data`) y se leen con un token de solo lectura.

## Pruebas

- `npm test` — `node --test tests/calc.test.mjs` (valoración, P&L, realizado, pesos vivos, formato es-AR).
- `tests/e2e.spec.mjs` — Playwright WebKit (viewport iPhone) con interceptación de `api.github.com`.

## Privacidad residual del token

Un token filtrado permite LEER TODO `pipeline-bursatil` (Excel, `mesa/`, `out/`) hasta que venza o se revoque. Es revocable al instante desde GitHub.
