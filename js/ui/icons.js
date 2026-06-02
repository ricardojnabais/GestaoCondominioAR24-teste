/**
 * Pacote de ícones SVG inline.
 * Cada símbolo definido aqui pode ser referenciado em qualquer elemento via:
 *   <svg><use href="#ic-quota-in" /></svg>
 *
 * Paleta: usa currentColor — herda a cor do contexto onde aparece.
 * Estilo: line-art coerente, stroke-width 2.6, terminações arredondadas.
 */

export const ICON_SPRITE_HTML = `
<svg width="0" height="0" style="position:absolute;" aria-hidden="true">
  <defs>

    <!-- 1. Inserir Quota (recebimento: seta a entrar + €) -->
    <symbol id="ic-quota-in" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 50,16 A 22,22 0 1,0 54,30"/>
      <polyline points="50,12 50,22 60,22"/>
      <path d="M 40,26 C 36,24 28,25 28,32 C 28,39 36,40 40,38"/>
      <line x1="23" y1="30" x2="36" y2="30"/>
      <line x1="23" y1="34" x2="34" y2="34"/>
    </symbol>

    <!-- 2. Enviar Recibo -->
    <symbol id="ic-receipt" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 16,12 H 48 V 52 L 44,48 L 40,52 L 36,48 L 32,52 L 28,48 L 24,52 L 20,48 L 16,52 Z"/>
      <line x1="22" y1="22" x2="42" y2="22"/>
      <line x1="22" y1="30" x2="42" y2="30"/>
      <line x1="22" y1="38" x2="36" y2="38"/>
    </symbol>

    <!-- 3. Inserir Pagamento (saída: seta a sair + €) -->
    <symbol id="ic-payment-out" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 14,34 A 22,22 0 1,0 30,12"/>
      <polyline points="58,28 58,38 48,38"/>
      <polyline points="46,38 56,28"/>
      <path d="M 36,26 C 32,24 24,25 24,32 C 24,39 32,40 36,38"/>
      <line x1="19" y1="30" x2="32" y2="30"/>
      <line x1="19" y1="34" x2="30" y2="34"/>
    </symbol>

    <!-- Comunicações · balão de conversa -->
    <symbol id="ic-chat" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 12,18 Q 12,12 18,12 L 46,12 Q 52,12 52,18 L 52,38 Q 52,44 46,44 L 30,44 L 20,52 L 20,44 L 18,44 Q 12,44 12,38 Z"/>
      <circle cx="22" cy="28" r="2" fill="currentColor" stroke="none"/>
      <circle cx="32" cy="28" r="2" fill="currentColor" stroke="none"/>
      <circle cx="42" cy="28" r="2" fill="currentColor" stroke="none"/>
    </symbol>

    <!-- 4. Consultar Pagamentos (lista com lupa) -->
    <symbol id="ic-search-list" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <rect x="10" y="12" width="32" height="40" rx="3"/>
      <line x1="16" y1="22" x2="36" y2="22"/>
      <line x1="16" y1="30" x2="32" y2="30"/>
      <line x1="16" y1="38" x2="28" y2="38"/>
      <circle cx="46" cy="40" r="8"/>
      <line x1="52" y1="46" x2="58" y2="52"/>
    </symbol>

    <!-- 5. Situação Bancária -->
    <symbol id="ic-bank" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="32,8 56,20 8,20"/>
      <line x1="12" y1="24" x2="52" y2="24"/>
      <line x1="16" y1="28" x2="16" y2="46"/>
      <line x1="24" y1="28" x2="24" y2="46"/>
      <line x1="32" y1="28" x2="32" y2="46"/>
      <line x1="40" y1="28" x2="40" y2="46"/>
      <line x1="48" y1="28" x2="48" y2="46"/>
      <line x1="8" y1="50" x2="56" y2="50"/>
      <line x1="6" y1="56" x2="58" y2="56"/>
    </symbol>

    <!-- 6. Análise -->
    <symbol id="ic-dashboard" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <rect x="6" y="10" width="52" height="36" rx="3"/>
      <line x1="6" y1="40" x2="58" y2="40"/>
      <line x1="26" y1="46" x2="22" y2="54"/>
      <line x1="38" y1="46" x2="42" y2="54"/>
      <line x1="18" y1="54" x2="46" y2="54"/>
      <path d="M 14,30 A 8,8 0 1,0 22,22 L 22,30 Z"/>
      <line x1="36" y1="34" x2="36" y2="26"/>
      <line x1="42" y1="34" x2="42" y2="22"/>
      <line x1="48" y1="34" x2="48" y2="18"/>
    </symbol>

    <!-- 7. Definições -->
    <symbol id="ic-settings" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="32" cy="32" r="6"/>
      <path d="M 32,6 L 36,12 L 42,10 L 44,16 L 50,16 L 50,22 L 56,26 L 54,32 L 56,38 L 50,42 L 50,48 L 44,48 L 42,54 L 36,52 L 32,58 L 28,52 L 22,54 L 20,48 L 14,48 L 14,42 L 8,38 L 10,32 L 8,26 L 14,22 L 14,16 L 20,16 L 22,10 L 28,12 Z"/>
    </symbol>

    <!-- 8. Casa -->
    <symbol id="ic-home" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 10,30 L 32,10 L 54,30 V 54 H 38 V 38 H 26 V 54 H 10 Z"/>
    </symbol>

    <!-- LOGO completo · CONDOMÍNIO AR24 · AMÁLIA RODRIGUES 24 -->
    <symbol id="logo-full" viewBox="0 0 200 200">
      <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" stroke-width="1.5"/>
      <circle cx="100" cy="100" r="88" fill="none" stroke="currentColor" stroke-width=".5" opacity=".4"/>
      <path id="logo-arc-top" d="M 30,100 A 70,70 0 0,1 170,100" fill="none"/>
      <text font-family="Plus Jakarta Sans" font-size="11" font-weight="700" fill="currentColor" letter-spacing="3.5">
        <textPath href="#logo-arc-top" startOffset="50%" text-anchor="middle">CONDOMÍNIO</textPath>
      </text>
      <path id="logo-arc-bot" d="M 30,100 A 70,70 0 0,0 170,100" fill="none"/>
      <text font-family="Plus Jakarta Sans" font-size="10" font-weight="600" fill="currentColor" letter-spacing="3">
        <textPath href="#logo-arc-bot" startOffset="50%" text-anchor="middle" side="right">AMÁLIA RODRIGUES 24</textPath>
      </text>
      <g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round">
        <path d="M 32,100 Q 42,94 52,100 Q 56,103 60,100"/>
        <path d="M 140,100 Q 144,97 148,100 Q 158,106 168,100"/>
        <circle cx="36" cy="100" r="1.5" fill="currentColor"/>
        <circle cx="164" cy="100" r="1.5" fill="currentColor"/>
      </g>
      <text x="100" y="118" text-anchor="middle" font-family="Allura, cursive" font-size="54" fill="currentColor" font-weight="400">AR24</text>
    </symbol>

    <!-- LOGO compacto -->
    <symbol id="logo-mark" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="18" fill="currentColor" opacity=".08"/>
      <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" stroke-width="1.2"/>
      <text x="20" y="27" text-anchor="middle" font-family="Allura, cursive" font-size="20" fill="currentColor" font-weight="400">AR24</text>
    </symbol>

  </defs>
</svg>
`;

/**
 * Helper para criar um <svg> com referência a um símbolo.
 * @param {string} iconId - ID do símbolo (ex: 'ic-home', 'logo-mark')
 * @param {string} className - classe CSS a aplicar
 * @returns {string} HTML do <svg>
 */
export function icon(iconId, className = '') {
  return `<svg class="${className}"><use href="#${iconId}"/></svg>`;
}

/**
 * Monta o sprite no DOM. Deve ser chamado uma vez no arranque da app.
 */
export function mountIconSprite() {
  const mount = document.getElementById('icon-sprite-mount');
  if (mount) mount.innerHTML = ICON_SPRITE_HTML;
}
