/**
 * Conversão de número para extenso em PT-PT.
 *
 * Suporta até milhões. Para valores monetários separados em euros e cêntimos.
 *
 * Exemplos:
 *   4900  → "quarenta e nove euros"
 *   4950  → "quarenta e nove euros e cinquenta cêntimos"
 *   100   → "um euro"
 *   12345 → "cento e vinte e três euros e quarenta e cinco cêntimos"
 */

const UNI = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const TEENS = ['dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezasseis', 'dezassete', 'dezoito', 'dezanove'];
const DEZ = ['', 'dez', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENT = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

/** Converte 0-999 para extenso. */
function tresDigitos(n, isolated = true) {
  if (n === 0) return '';
  if (n === 100 && isolated) return 'cem';

  const c = Math.floor(n / 100);
  const dezena = Math.floor((n % 100) / 10);
  const u = n % 10;

  const parts = [];
  if (c > 0) parts.push(CENT[c]);

  if (dezena === 1) {
    parts.push(TEENS[u]);
  } else {
    if (dezena > 1) parts.push(DEZ[dezena]);
    if (u > 0) parts.push(UNI[u]);
  }

  return parts.join(' e ');
}

/** Converte qualquer inteiro positivo para extenso. */
function inteiroPorExtenso(n) {
  if (n === 0) return 'zero';
  if (n < 0) return 'menos ' + inteiroPorExtenso(-n);

  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;

  const parts = [];

  if (milhoes > 0) {
    parts.push((milhoes === 1 ? 'um milhão' : tresDigitos(milhoes, false) + ' milhões'));
  }

  if (milhares > 0) {
    if (milhares === 1) parts.push('mil');
    else parts.push(tresDigitos(milhares, false) + ' mil');
  }

  if (resto > 0) {
    parts.push(tresDigitos(resto));
  }

  // Conector "e" entre o último bloco e o anterior se aplicável
  // Regra simplificada: usar " e " quando há transição de milhares para centenas baixas,
  // caso contrário usar espaço.
  if (parts.length === 1) return parts[0];

  // Para o caso comum (milhares + resto), usar " e " se resto < 100 ou resto é múltiplo de 100
  if (parts.length === 2 && milhares > 0 && resto > 0) {
    if (resto < 100 || resto % 100 === 0) {
      return parts.join(' e ');
    }
    return parts.join(' ');
  }

  return parts.join(' ');
}

/**
 * Valor em cêntimos para extenso ("X euros e Y cêntimos").
 */
export function valorPorExtenso(centimos) {
  centimos = Math.round(Math.abs(centimos));
  const euros = Math.floor(centimos / 100);
  const cents = centimos % 100;

  const parts = [];

  if (euros === 0 && cents === 0) return 'zero euros';

  if (euros > 0) {
    if (euros === 1) parts.push('um euro');
    else parts.push(inteiroPorExtenso(euros) + ' euros');
  }

  if (cents > 0) {
    if (cents === 1) parts.push('um cêntimo');
    else parts.push(inteiroPorExtenso(cents) + ' cêntimos');
  }

  return parts.join(' e ');
}

/** Data ISO para extenso em PT (ex: "3 de Maio de 2026"). */
export function dataPorExtenso(iso) {
  if (!iso) return '';
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}
