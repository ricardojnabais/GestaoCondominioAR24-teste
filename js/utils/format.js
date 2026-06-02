/**
 * Utilitários de formatação · €, datas, meses, etc.
 *
 * IMPORTANTE: a app guarda todos os valores monetários em CÊNTIMOS (integer).
 * Estas funções fazem a conversão para apresentação ao utilizador.
 */

const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const MESES_PT_LONG = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                       'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/**
 * Cêntimos → string formatada (ex: 4700 → "47,00 €")
 * @param {number} cents - valor em cêntimos
 * @param {boolean} symbol - incluir símbolo € (default true)
 */
export function formatMoney(cents, symbol = true) {
  if (cents === null || cents === undefined || isNaN(cents)) return symbol ? '— €' : '—';
  const v = (cents / 100).toLocaleString('pt-PT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return symbol ? `${v} €` : v;
}

/**
 * String "47,00" ou "47" → cêntimos (4700)
 * Aceita ponto ou vírgula como decimal.
 */
export function parseMoney(input) {
  if (typeof input === 'number') return Math.round(input * 100);
  const cleaned = String(input)
    .replace(/[€\s]/g, '')
    .replace(',', '.');
  const n = parseFloat(cleaned);
  if (isNaN(n)) return null;
  return Math.round(n * 100);
}

/**
 * Data ISO "2026-05-08" → "08/05/2026"
 */
export function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Data ISO → "8 de Maio de 2026"
 */
export function formatDateLong(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  const mes = MESES_PT_LONG[parseInt(m) - 1] || m;
  return `${parseInt(d)} de ${mes} de ${y}`;
}

/**
 * Mês ano "2026-05" → "Maio 2026"
 */
export function formatMonth(monthRef, short = false) {
  if (!monthRef) return '—';
  const [y, m] = monthRef.split('-');
  const arr = short ? MESES_PT : MESES_PT_LONG;
  return `${arr[parseInt(m) - 1] || m} ${y}`;
}

/**
 * Mês ano "2026-05" → "Mai/26"
 */
export function formatMonthShort(monthRef) {
  if (!monthRef) return '—';
  const [y, m] = monthRef.split('-');
  return `${MESES_PT[parseInt(m) - 1]}/${y.slice(2)}`;
}

/**
 * Hoje em formato ISO YYYY-MM-DD
 */
export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Mês atual em formato YYYY-MM
 */
export function currentMonthRef() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Gera array de meses YYYY-MM de um ano (12 elementos)
 */
export function monthsOfYear(year) {
  const y = String(year);
  return Array.from({ length: 12 }, (_, i) =>
    `${y}-${String(i + 1).padStart(2, '0')}`
  );
}

/**
 * Compara dois month refs (-1, 0, 1)
 */
export function compareMonthRef(a, b) {
  return a.localeCompare(b);
}

/**
 * Próximo mês YYYY-MM
 */
export function nextMonth(monthRef) {
  let [y, m] = monthRef.split('-').map(Number);
  m++;
  if (m > 12) { m = 1; y++; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * Mês anterior YYYY-MM
 */
export function prevMonth(monthRef) {
  let [y, m] = monthRef.split('-').map(Number);
  m--;
  if (m < 1) { m = 12; y--; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * Gera array contínuo de meses entre dois month refs (inclusive)
 */
export function monthsBetween(from, to) {
  const result = [];
  let curr = from;
  while (curr <= to) {
    result.push(curr);
    curr = nextMonth(curr);
    if (result.length > 240) break;  // safety: máx 20 anos
  }
  return result;
}

/**
 * Iniciais de um nome (para avatares)
 */
export function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
