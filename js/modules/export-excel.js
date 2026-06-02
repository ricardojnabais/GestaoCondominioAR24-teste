/**
 * Export Excel anual · v2 com ExcelJS.
 *
 * Geração profissional usando ExcelJS:
 *  - Cores, bordas, autofilter, freeze panes
 *  - Formato monetário automático em colunas €
 *  - Linhas alternadas (zebra)
 *  - Linhas de total destacadas
 *  - Tabela visual no Resumo
 *
 * Folhas:
 *   Resumo · Quotas · Recibos · Despesas · Outros Receb. · Banco · Planos · Orçamento
 */

import * as store from '../store/local-store.js';
import * as receipts from './receipts.js';
import * as analise from './analise.js';
import * as planos from './planos.js';
import * as orcamento from './orcamento.js';
import * as saldoBanco from './saldo-banco.js';
import { monthsOfYear, currentMonthRef } from '../utils/format.js';

const MESES_LBL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// Cores (ARGB hex sem alpha, ExcelJS adiciona "FF" no início)
const C = {
  PRIMARY:    '1E54C7',
  PRIMARY_DK: '1640A0',
  PRIMARY_LT: 'D6E2F8',
  GREEN:      '10B981',
  GREEN_LT:   'D1FAE5',
  RED:        'EF4444',
  RED_LT:     'FEE2E2',
  AMBER:      'F59E0B',
  AMBER_LT:   'FEF3C7',
  GRAY_50:    'F8FAFC',
  GRAY_100:   'F1F5F9',
  GRAY_300:   'CBD5E1',
  TEXT:       '14182E',
  TEXT_MUTED: '64748B',
  WHITE:      'FFFFFF'
};

const EUR_FMT = '#,##0.00 €';
const PCT_FMT = '0"%"';

function centavosToEur(c) { return Math.round(c || 0) / 100; }

// ───────────────────────── EXPORT ANUAL ─────────────────────────

// Marco de auditoria · ano em que a app passou a ser fonte de verdade.
// Recibos/despesas de anos anteriores são históricos importados, não auditáveis pelo
// sistema. Exportações para esses anos são bloqueadas.
const ANO_AUDITORIA_MIN = 2026;

export async function exportarAno(ano) {
  if (ano < ANO_AUDITORIA_MIN) {
    throw new Error(`Exportação não disponível para ${ano}. A aplicação só audita dados a partir de ${ANO_AUDITORIA_MIN}. Para histórico de ${ano}, usa o ficheiro de arquivo externo.`);
  }
  if (!window.ExcelJS) throw new Error('ExcelJS não está disponível.');
  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'Gestão do Condomínio AR24';
  wb.created = new Date();

  await addFolhaResumo(wb, ano);
  await addFolhaQuotas(wb, ano);
  await addFolhaRecibos(wb, ano);
  await addFolhaDespesas(wb, ano);
  await addFolhaOutrosRec(wb, ano);
  await addFolhaBanco(wb, ano);
  await addFolhaPlanos(wb, ano);
  await addFolhaOrcamento(wb, ano);

  const filename = `Condominio_AR24_${ano}.xlsx`;
  await downloadWorkbook(wb, filename);
  return filename;
}

export async function exportarOrcamentoAno(ano) {
  if (ano < ANO_AUDITORIA_MIN) {
    throw new Error(`Exportação não disponível para ${ano}. A aplicação só audita dados a partir de ${ANO_AUDITORIA_MIN}.`);
  }
  if (!window.ExcelJS) throw new Error('ExcelJS não está disponível.');
  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'Gestão do Condomínio AR24';
  wb.created = new Date();
  await addFolhaOrcamento(wb, ano);
  const filename = `Orcamento_AR24_${ano}.xlsx`;
  await downloadWorkbook(wb, filename);
  return filename;
}

async function downloadWorkbook(wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ───────────────────────── HELPERS DE ESTILO ─────────────────────────

function setTitle(sheet, text, span = 6) {
  sheet.mergeCells(1, 1, 1, span);
  const c = sheet.getCell(1, 1);
  c.value = text;
  c.font = { bold: true, size: 16, color: { argb: C.PRIMARY } };
  c.alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 26;
}

function setSubtitle(sheet, text, span = 6, row = 2) {
  sheet.mergeCells(row, 1, row, span);
  const c = sheet.getCell(row, 1);
  c.value = text;
  c.font = { size: 10, italic: true, color: { argb: C.TEXT_MUTED } };
  sheet.getRow(row).height = 16;
}

function styleHeaderRow(sheet, rowIdx, ncols) {
  const row = sheet.getRow(rowIdx);
  row.height = 22;
  for (let i = 1; i <= ncols; i++) {
    const cell = row.getCell(i);
    cell.font = { bold: true, color: { argb: C.WHITE }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.PRIMARY } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      top:    { style: 'thin', color: { argb: C.PRIMARY_DK } },
      bottom: { style: 'thin', color: { argb: C.PRIMARY_DK } },
      left:   { style: 'thin', color: { argb: C.PRIMARY_DK } },
      right:  { style: 'thin', color: { argb: C.PRIMARY_DK } }
    };
  }
}

function styleDataRows(sheet, firstRow, lastRow, ncols, opts = {}) {
  for (let r = firstRow; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    const isOdd = (r - firstRow) % 2 === 0;
    for (let i = 1; i <= ncols; i++) {
      const cell = row.getCell(i);
      cell.font = { size: 10, color: { argb: C.TEXT } };
      cell.alignment = { vertical: 'middle' };
      cell.border = {
        top:    { style: 'hair', color: { argb: C.GRAY_300 } },
        bottom: { style: 'hair', color: { argb: C.GRAY_300 } },
        left:   { style: 'hair', color: { argb: C.GRAY_300 } },
        right:  { style: 'hair', color: { argb: C.GRAY_300 } }
      };
      if (!isOdd) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.GRAY_50 } };
      }
    }
  }
}

function styleTotalRow(sheet, rowIdx, ncols, bg = C.PRIMARY_LT, fg = C.PRIMARY_DK) {
  const row = sheet.getRow(rowIdx);
  row.height = 22;
  for (let i = 1; i <= ncols; i++) {
    const cell = row.getCell(i);
    cell.font = { bold: true, color: { argb: fg }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    cell.border = {
      top:    { style: 'medium', color: { argb: C.PRIMARY } },
      bottom: { style: 'medium', color: { argb: C.PRIMARY } },
      left:   { style: 'thin',   color: { argb: C.PRIMARY } },
      right:  { style: 'thin',   color: { argb: C.PRIMARY } }
    };
    cell.alignment = { vertical: 'middle' };
  }
}

function applyEur(sheet, colLetters) {
  colLetters.forEach(letter => {
    sheet.getColumn(letter).numFmt = EUR_FMT;
    sheet.getColumn(letter).alignment = { horizontal: 'right' };
  });
}

function applyFreeze(sheet, ySplit, xSplit = 0) {
  sheet.views = [{ state: 'frozen', ySplit, xSplit }];
}

// ───────────────────────── FOLHA · RESUMO ─────────────────────────

async function addFolhaResumo(wb, ano) {
  const sheet = wb.addWorksheet('Resumo', { properties: { tabColor: { argb: C.PRIMARY } } });
  const kpis = await analise.kpisYTD(ano);

  setTitle(sheet, `CONDOMÍNIO AV. AMÁLIA RODRIGUES, 24 · ${ano}`, 3);
  setSubtitle(sheet, `Exportado em ${new Date().toLocaleString('pt-PT')}`, 3);

  // Tabela KPIs
  sheet.getCell('A4').value = '';
  const headerRow = 5;
  sheet.getCell(`A${headerRow}`).value = 'INDICADOR';
  sheet.getCell(`B${headerRow}`).value = 'VALOR';
  sheet.getCell(`C${headerRow}`).value = 'NOTAS';
  styleHeaderRow(sheet, headerRow, 3);

  const data = [
    ['Saldo Bancário Atual',      centavosToEur(kpis.saldoBancarioAtual_centimos), 'À data de hoje'],
    ['Total Esperado YTD',        centavosToEur(kpis.esperadoYTD_centimos),       'Soma de todas as quotas previstas até este mês'],
    ['Total Recebido (Quotas)',   centavosToEur(kpis.recebidoYTD_centimos),       'Quotas efetivamente recebidas YTD'],
    ['Outros Recebimentos',       centavosToEur(kpis.outrosRecYTD_centimos),      'Receitas além de quotas'],
    ['Total Despesas YTD',        centavosToEur(kpis.despesasYTD_centimos),       ''],
    ['', null, ''],
    ['Taxa de Cobrança',          kpis.taxaCobrancaYTD,                            '% pago vs esperado YTD'],
    ['Total em Atraso',           centavosToEur(kpis.totalEmAtraso_centimos),     ''],
    ['Condóminos em Atraso',      `${kpis.condominosEmAtraso} / ${kpis.totalCondominos}`, '']
  ];
  let r = headerRow + 1;
  data.forEach(([ind, val, nota]) => {
    sheet.getCell(`A${r}`).value = ind;
    sheet.getCell(`B${r}`).value = val;
    sheet.getCell(`C${r}`).value = nota;
    r++;
  });
  styleDataRows(sheet, headerRow + 1, r - 1, 3);

  // Formatação para coluna B (mistura € e %)
  for (let i = headerRow + 1; i < r; i++) {
    const cell = sheet.getCell(`B${i}`);
    if (typeof cell.value === 'number') {
      if (i === headerRow + 7) cell.numFmt = PCT_FMT;
      else cell.numFmt = EUR_FMT;
      cell.alignment = { horizontal: 'right' };
      cell.font = { ...cell.font, bold: true };
    }
  }

  sheet.getColumn('A').width = 34;
  sheet.getColumn('B').width = 18;
  sheet.getColumn('C').width = 50;
}

// ───────────────────────── FOLHA · QUOTAS ─────────────────────────

async function addFolhaQuotas(wb, ano) {
  const sheet = wb.addWorksheet('Quotas');
  const tenants = (await store.listDocs('tenants')).sort((a, b) => (a.fraction || '').localeCompare(b.fraction || ''));
  const months = monthsOfYear(ano);
  const curr = currentMonthRef();

  setTitle(sheet, `QUOTAS · ${ano}`, 4 + months.length + 3);

  const headerRow = 3;
  const headers = ['Fração', 'Condómino', 'Quota Mensal', 'Permilagem (‰)', ...MESES_LBL, 'Total Pago', 'Em Falta', 'Saldo a Favor'];
  headers.forEach((h, i) => { sheet.getCell(headerRow, i + 1).value = h; });
  styleHeaderRow(sheet, headerRow, headers.length);

  let r = headerRow + 1;
  let totaisCol = new Array(headers.length + 1).fill(0);
  for (const t of tenants) {
    const quotaMensal = t.rentByYear?.[ano] || 0;
    sheet.getCell(r, 1).value = t.fraction;
    sheet.getCell(r, 2).value = t.name;
    sheet.getCell(r, 3).value = centavosToEur(quotaMensal);
    sheet.getCell(r, 4).value = t.permilage;

    let pagoTotal = 0;
    let esperadoTotal = 0;
    let col = 5;
    for (const m of months) {
      const pago = await receipts.valorPagoNoMes(t.id, m);
      sheet.getCell(r, col).value = pago > 0 ? centavosToEur(pago) : null;
      pagoTotal += pago;
      if (m <= curr) esperadoTotal += quotaMensal;
      col++;
    }
    const saldo = await receipts.saldoCondomino(t.id);
    sheet.getCell(r, col++).value = centavosToEur(pagoTotal);
    sheet.getCell(r, col++).value = centavosToEur(Math.max(0, esperadoTotal - pagoTotal));
    sheet.getCell(r, col++).value = centavosToEur(saldo);

    // acumular totais
    for (let i = 3; i <= headers.length; i++) {
      const v = sheet.getCell(r, i).value;
      if (typeof v === 'number') totaisCol[i] = (totaisCol[i] || 0) + v;
    }
    r++;
  }

  styleDataRows(sheet, headerRow + 1, r - 1, headers.length);

  // Linha total
  sheet.getCell(r, 1).value = 'TOTAL';
  for (let i = 3; i <= headers.length; i++) {
    sheet.getCell(r, i).value = totaisCol[i];
  }
  styleTotalRow(sheet, r, headers.length);

  // Aplicar formato € a colunas
  for (let i = 3; i <= headers.length; i++) {
    if (i !== 4) sheet.getColumn(i).numFmt = EUR_FMT;  // exceto Permilagem
  }
  sheet.getColumn(4).alignment = { horizontal: 'right' };

  // Larguras
  sheet.getColumn(1).width = 12;
  sheet.getColumn(2).width = 26;
  sheet.getColumn(3).width = 13;
  sheet.getColumn(4).width = 13;
  for (let i = 5; i < 5 + months.length; i++) sheet.getColumn(i).width = 10;
  for (let i = 5 + months.length; i <= headers.length; i++) sheet.getColumn(i).width = 13;

  applyFreeze(sheet, headerRow, 2);
  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: r - 1, column: headers.length } };
}

// ───────────────────────── FOLHA · RECIBOS ─────────────────────────

async function addFolhaRecibos(wb, ano) {
  const sheet = wb.addWorksheet('Recibos');
  const recs = (await receipts.listar({ ano })).sort((a, b) => (a.recibo_seq || 0) - (b.recibo_seq || 0));

  setTitle(sheet, `RECIBOS · ${ano}`, 11);

  const headerRow = 3;
  const headers = ['Nº Recibo', 'Data', 'Fração', 'Condómino', 'Tipo', 'Descrição', 'Meses Cobertos', 'Valor', 'Excesso', 'Saldo Usado', 'Estado'];
  headers.forEach((h, i) => sheet.getCell(headerRow, i + 1).value = h);
  styleHeaderRow(sheet, headerRow, headers.length);

  let r = headerRow + 1;
  for (const rec of recs) {
    sheet.getCell(r, 1).value = rec.recibo_numero || '';
    sheet.getCell(r, 2).value = rec.data || '';
    sheet.getCell(r, 3).value = rec.fraction || '';
    sheet.getCell(r, 4).value = rec.tenantName || '';
    sheet.getCell(r, 5).value = rec.tipo || '';
    sheet.getCell(r, 6).value = rec.descricao || '';
    sheet.getCell(r, 7).value = (rec.mesReferencia || []).join(', ');
    sheet.getCell(r, 8).value = centavosToEur(rec.valor_centimos);
    sheet.getCell(r, 9).value = centavosToEur(rec.excesso_centimos);
    sheet.getCell(r, 10).value = centavosToEur(rec.saldoUsado_centimos);
    let estado = 'Válido', estadoColor = null;
    if (rec.cancelado)    { estado = 'Cancelado'; estadoColor = C.RED_LT; }
    else if (rec.estornoDe) { estado = 'Estorno'; estadoColor = C.AMBER_LT; }
    sheet.getCell(r, 11).value = estado;
    if (estadoColor) {
      sheet.getCell(r, 11).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: estadoColor } };
    }
    r++;
  }
  styleDataRows(sheet, headerRow + 1, r - 1, headers.length);

  applyEur(sheet, ['H', 'I', 'J']);

  sheet.getColumn(1).width = 16;
  sheet.getColumn(2).width = 12;
  sheet.getColumn(3).width = 12;
  sheet.getColumn(4).width = 26;
  sheet.getColumn(5).width = 11;
  sheet.getColumn(6).width = 36;
  sheet.getColumn(7).width = 20;
  sheet.getColumn(8).width = 12;
  sheet.getColumn(9).width = 12;
  sheet.getColumn(10).width = 14;
  sheet.getColumn(11).width = 12;

  applyFreeze(sheet, headerRow);
  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: r - 1, column: headers.length } };
}

// ───────────────────────── FOLHA · DESPESAS ─────────────────────────

async function addFolhaDespesas(wb, ano) {
  const sheet = wb.addWorksheet('Despesas');
  const desp = (await store.queryDocs('pagamentosDespesa', { ano }))
    .sort((a, b) => (a.data || '').localeCompare(b.data || ''));

  setTitle(sheet, `DESPESAS · ${ano}`, 7);

  const headerRow = 3;
  const headers = ['Data', 'Rúbrica', 'Fornecedor', 'Descrição', 'Método', 'Valor', 'Estado'];
  headers.forEach((h, i) => sheet.getCell(headerRow, i + 1).value = h);
  styleHeaderRow(sheet, headerRow, headers.length);

  let r = headerRow + 1;
  for (const d of desp) {
    sheet.getCell(r, 1).value = d.data || '';
    sheet.getCell(r, 2).value = d.rubricaNome || '';
    sheet.getCell(r, 3).value = d.fornecedor || '';
    sheet.getCell(r, 4).value = d.descricao || '';
    sheet.getCell(r, 5).value = d.metodoPagamento || '';
    sheet.getCell(r, 6).value = centavosToEur(d.valor_centimos);
    let estado = 'Válida', estadoColor = null;
    if (d.cancelada)     { estado = 'Cancelada'; estadoColor = C.RED_LT; }
    else if (d.estornoDe) { estado = 'Estorno'; estadoColor = C.AMBER_LT; }
    sheet.getCell(r, 7).value = estado;
    if (estadoColor) {
      sheet.getCell(r, 7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: estadoColor } };
    }
    r++;
  }
  const lastDataRow = r - 1;
  styleDataRows(sheet, headerRow + 1, lastDataRow, headers.length);
  applyEur(sheet, ['F']);

  // Breakdown por rúbrica
  r += 2;
  sheet.getCell(r, 1).value = 'BREAKDOWN POR RÚBRICA';
  sheet.getCell(r, 1).font = { bold: true, size: 12, color: { argb: C.PRIMARY } };
  r++;
  const headerBR = r;
  sheet.getCell(r, 1).value = 'Rúbrica';
  sheet.getCell(r, 2).value = 'Total';
  styleHeaderRow(sheet, r, 2);
  r++;

  const breakdown = await analise.despesasPorRubrica(ano);
  const firstBr = r;
  breakdown.forEach(b => {
    sheet.getCell(r, 1).value = b.nome;
    sheet.getCell(r, 2).value = centavosToEur(b.total_centimos);
    r++;
  });
  styleDataRows(sheet, firstBr, r - 1, 2);
  sheet.getColumn(2).numFmt = EUR_FMT;

  // Total
  const totalDesp = breakdown.reduce((s, b) => s + b.total_centimos, 0);
  sheet.getCell(r, 1).value = 'TOTAL';
  sheet.getCell(r, 2).value = centavosToEur(totalDesp);
  styleTotalRow(sheet, r, 2);

  sheet.getColumn(1).width = 14;
  sheet.getColumn(2).width = 22;
  sheet.getColumn(3).width = 22;
  sheet.getColumn(4).width = 30;
  sheet.getColumn(5).width = 14;
  sheet.getColumn(6).width = 12;
  sheet.getColumn(7).width = 12;

  applyFreeze(sheet, headerRow);
  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastDataRow, column: headers.length } };
}

// ───────────────────────── FOLHA · OUTROS RECEBIMENTOS ─────────────────────────

async function addFolhaOutrosRec(wb, ano) {
  const sheet = wb.addWorksheet('Outros Receb.');
  const outros = (await store.queryDocs('outrosRecebimentos', { ano }))
    .sort((a, b) => (a.data || '').localeCompare(b.data || ''));

  setTitle(sheet, `OUTROS RECEBIMENTOS · ${ano}`, 6);
  const headerRow = 3;
  const headers = ['Data', 'Descrição', 'Origem', 'Condómino Associado', 'Valor', 'Estado'];
  headers.forEach((h, i) => sheet.getCell(headerRow, i + 1).value = h);
  styleHeaderRow(sheet, headerRow, headers.length);

  let r = headerRow + 1;
  for (const o of outros) {
    sheet.getCell(r, 1).value = o.data || '';
    sheet.getCell(r, 2).value = o.descricao || '';
    sheet.getCell(r, 3).value = o.origem || '';
    sheet.getCell(r, 4).value = o.tenantName || '';
    sheet.getCell(r, 5).value = centavosToEur(o.valor_centimos);
    sheet.getCell(r, 6).value = o.cancelado ? 'Cancelado' : (o.estornoDe ? 'Estorno' : 'Válido');
    r++;
  }
  styleDataRows(sheet, headerRow + 1, r - 1, headers.length);
  applyEur(sheet, ['E']);

  sheet.getColumn(1).width = 12;
  sheet.getColumn(2).width = 36;
  sheet.getColumn(3).width = 22;
  sheet.getColumn(4).width = 22;
  sheet.getColumn(5).width = 12;
  sheet.getColumn(6).width = 12;

  applyFreeze(sheet, headerRow);
  if (outros.length > 0) {
    sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: r - 1, column: headers.length } };
  }
}

// ───────────────────────── FOLHA · BANCO ─────────────────────────

async function addFolhaBanco(wb, ano) {
  const sheet = wb.addWorksheet('Movimentos Banco');
  const { saldoInicial } = await saldoBanco.calcularSaldo(ano);

  const recs = (await store.queryDocs('receipts', { ano }))
    .map(r => ({ data: r.data, descricao: r.descricao, valor: r.valor_centimos, tipo: r.cancelado ? 'CANCELADO · Recibo' : (r.estornoDe ? 'Estorno' : 'Recibo'), origem: `${r.fraction || ''} ${r.tenantName || ''}`.trim() }));
  const outros = (await store.queryDocs('outrosRecebimentos', { ano }))
    .map(o => ({ data: o.data, descricao: o.descricao, valor: o.valor_centimos, tipo: o.cancelado ? 'CANCELADO · Outro' : 'Outro Recebimento', origem: o.origem || '' }));
  const desps = (await store.queryDocs('pagamentosDespesa', { ano }))
    .map(d => ({ data: d.data, descricao: d.descricao, valor: -Math.abs(d.valor_centimos), tipo: d.cancelada ? 'CANCELADO · Despesa' : (d.estornoDe ? 'Estorno Despesa' : 'Despesa'), origem: d.fornecedor || '' }));

  const all = [...recs, ...outros, ...desps].sort((a, b) => (a.data || '').localeCompare(b.data || ''));

  setTitle(sheet, `MOVIMENTOS BANCÁRIOS · ${ano}`, 7);
  const headerRow = 3;
  const headers = ['Data', 'Tipo', 'Descrição', 'Origem / Fornecedor', 'Entrada', 'Saída', 'Saldo Acumulado'];
  headers.forEach((h, i) => sheet.getCell(headerRow, i + 1).value = h);
  styleHeaderRow(sheet, headerRow, headers.length);

  let r = headerRow + 1;
  // Saldo inicial
  sheet.getCell(r, 2).value = 'SALDO INICIAL';
  sheet.getCell(r, 7).value = centavosToEur(saldoInicial);
  sheet.getCell(r, 2).font = { bold: true, color: { argb: C.PRIMARY }, size: 10 };
  r++;
  const firstMovRow = r;
  let acumulado = saldoInicial;
  for (const m of all) {
    if (!m.tipo.startsWith('CANCELADO')) acumulado += m.valor;
    sheet.getCell(r, 1).value = m.data || '';
    sheet.getCell(r, 2).value = m.tipo;
    sheet.getCell(r, 3).value = m.descricao || '';
    sheet.getCell(r, 4).value = m.origem || '';
    if (m.valor > 0) sheet.getCell(r, 5).value = centavosToEur(m.valor);
    if (m.valor < 0) sheet.getCell(r, 6).value = centavosToEur(-m.valor);
    sheet.getCell(r, 7).value = centavosToEur(acumulado);

    // Cancelados a cinza
    if (m.tipo.startsWith('CANCELADO')) {
      for (let i = 1; i <= 7; i++) {
        sheet.getCell(r, i).font = { color: { argb: C.TEXT_MUTED }, italic: true };
      }
    }
    r++;
  }
  styleDataRows(sheet, firstMovRow, r - 1, headers.length);
  applyEur(sheet, ['E', 'F', 'G']);

  // Coluna Saldo Acumulado destacada
  for (let i = firstMovRow - 1; i < r; i++) {
    const cell = sheet.getCell(i, 7);
    cell.font = { ...cell.font, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.PRIMARY_LT } };
  }
  // Receitas em verde, despesas em vermelho
  for (let i = firstMovRow; i < r; i++) {
    const eCell = sheet.getCell(i, 5);
    const sCell = sheet.getCell(i, 6);
    if (eCell.value) eCell.font = { ...eCell.font, color: { argb: '047857' }, bold: true };
    if (sCell.value) sCell.font = { ...sCell.font, color: { argb: 'B91C1C' }, bold: true };
  }

  sheet.getColumn(1).width = 12;
  sheet.getColumn(2).width = 22;
  sheet.getColumn(3).width = 36;
  sheet.getColumn(4).width = 26;
  sheet.getColumn(5).width = 13;
  sheet.getColumn(6).width = 13;
  sheet.getColumn(7).width = 17;

  applyFreeze(sheet, headerRow);
  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: r - 1, column: headers.length } };
}

// ───────────────────────── FOLHA · PLANOS ─────────────────────────

async function addFolhaPlanos(wb, ano) {
  const sheet = wb.addWorksheet('Planos');
  const list = await planos.listar({ ano });

  setTitle(sheet, `PLANOS DE PAGAMENTO · ${ano}`, 9);

  if (list.length === 0) {
    sheet.getCell('A3').value = `Sem planos de pagamento no ano ${ano}`;
    sheet.getCell('A3').font = { italic: true, color: { argb: C.TEXT_MUTED } };
    return;
  }

  let r = 3;
  // Tabela geral
  const headers = ['Plano', 'Valor Total', 'Prestações', 'Base Cálculo', 'Início', 'Fim', 'Estado', 'Pagas', 'Em Atraso'];
  headers.forEach((h, i) => sheet.getCell(r, i + 1).value = h);
  styleHeaderRow(sheet, r, headers.length);
  r++;
  const firstPlanoRow = r;

  for (const p of list) {
    const prog = await planos.progresso(p.id);
    sheet.getCell(r, 1).value = p.nome;
    sheet.getCell(r, 2).value = centavosToEur(p.valorTotal_centimos);
    sheet.getCell(r, 3).value = p.numeroPrestacoes;
    sheet.getCell(r, 4).value = p.baseCalculo;
    sheet.getCell(r, 5).value = p.dataInicio;
    sheet.getCell(r, 6).value = p.dataPrevisaoFim;
    sheet.getCell(r, 7).value = p.estado;
    sheet.getCell(r, 8).value = `${prog.pagas}/${prog.total}`;
    sheet.getCell(r, 9).value = prog.emAtraso;
    if (prog.emAtraso > 0) {
      sheet.getCell(r, 9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.RED_LT } };
      sheet.getCell(r, 9).font = { color: { argb: 'B91C1C' }, bold: true };
    }
    r++;
  }
  styleDataRows(sheet, firstPlanoRow, r - 1, headers.length);
  sheet.getColumn(2).numFmt = EUR_FMT;

  // Detalhe de cada plano
  for (const p of list) {
    r += 2;
    sheet.mergeCells(r, 1, r, 7);
    sheet.getCell(r, 1).value = `PRESTAÇÕES · ${p.nome}`;
    sheet.getCell(r, 1).font = { bold: true, size: 12, color: { argb: C.PRIMARY } };
    r++;
    const subHeader = ['Fração', 'Condómino', 'Nº Prest.', 'Mês', 'Valor', 'Estado', 'Recibo'];
    subHeader.forEach((h, i) => sheet.getCell(r, i + 1).value = h);
    styleHeaderRow(sheet, r, 7);
    r++;
    const firstPrestRow = r;
    const prestacoes = (await store.queryDocs('prestacoes', { planoId: p.id }))
      .sort((a, b) => {
        const c = (a.fraction || '').localeCompare(b.fraction || '');
        if (c !== 0) return c;
        return (a.numeroPrestacao || 0) - (b.numeroPrestacao || 0);
      });
    for (const pr of prestacoes) {
      sheet.getCell(r, 1).value = pr.fraction || '';
      sheet.getCell(r, 2).value = pr.tenantName || '';
      sheet.getCell(r, 3).value = `${pr.numeroPrestacao}/${pr.totalPrestacoes}`;
      sheet.getCell(r, 4).value = pr.mesReferencia || '';
      sheet.getCell(r, 5).value = centavosToEur(pr.valor_centimos);
      sheet.getCell(r, 6).value = pr.estado || '';
      sheet.getCell(r, 7).value = pr.reciboId || '';

      // Cor por estado
      if (pr.estado === 'paga') {
        sheet.getCell(r, 6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.GREEN_LT } };
        sheet.getCell(r, 6).font = { color: { argb: '047857' }, bold: true };
      } else if (pr.estado === 'atraso') {
        sheet.getCell(r, 6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.RED_LT } };
        sheet.getCell(r, 6).font = { color: { argb: 'B91C1C' }, bold: true };
      }
      r++;
    }
    styleDataRows(sheet, firstPrestRow, r - 1, 7);
    sheet.getColumn(5).numFmt = EUR_FMT;
  }

  sheet.getColumn(1).width = 22;
  sheet.getColumn(2).width = 22;
  sheet.getColumn(3).width = 12;
  sheet.getColumn(4).width = 12;
  sheet.getColumn(5).width = 14;
  sheet.getColumn(6).width = 14;
  sheet.getColumn(7).width = 14;
  sheet.getColumn(8).width = 10;
  sheet.getColumn(9).width = 12;
}

// ───────────────────────── FOLHA · ORÇAMENTO ─────────────────────────

async function addFolhaOrcamento(wb, ano) {
  const sheet = wb.addWorksheet('Orçamento');
  const orc = await orcamento.obterAtivo(ano);

  setTitle(sheet, `ORÇAMENTO · ${ano}`, 6);

  if (!orc) {
    sheet.getCell('A3').value = `Sem orçamento criado para ${ano}`;
    sheet.getCell('A3').font = { italic: true, color: { argb: C.TEXT_MUTED } };
    return;
  }

  const totais = orcamento.calcularTotais(orc);
  const execucao = await orcamento.execucaoPorRubrica(ano);
  const sumario = await orcamento.execucaoSumario(ano);
  const tenants = (await store.listDocs('tenants')).sort((a, b) => (a.fraction || '').localeCompare(b.fraction || ''));
  const anoAnt = String(parseInt(ano, 10) - 1);

  // Subtítulo com estado
  const estado = orc.estado === 'aprovado'
    ? `Aprovado · v${orc.versao} · ${new Date(orc.aprovadoEm).toLocaleString('pt-PT')}${orc.aprovadoPor ? ' por ' + orc.aprovadoPor : ''}`
    : `Rascunho · v${orc.versao}`;
  setSubtitle(sheet, estado, 6, 2);

  let r = 4;

  // RESUMO
  sheet.mergeCells(r, 1, r, 4);
  sheet.getCell(r, 1).value = 'RESUMO';
  sheet.getCell(r, 1).font = { bold: true, size: 12, color: { argb: C.PRIMARY } };
  r++;
  ['Linha', 'Orçado', 'Realizado', 'Diferença'].forEach((h, i) => sheet.getCell(r, i + 1).value = h);
  styleHeaderRow(sheet, r, 4);
  r++;
  const resumoStart = r;

  const linhas = [
    ['Saldo Inicial Transitado',  totais.saldoInicial,        null, null],
    ['Quotas Previstas (anual)',  totais.valorAnualQuotas,    null, null],
    ['Outras Receitas',           totais.outrasReceitas,      null, null],
    ['Total Receitas',            totais.receitasTotal,       sumario?.receitas.realizado || 0,  (sumario?.receitas.realizado || 0) - totais.receitasTotal],
    ['Despesas por Rúbrica',      totais.despesasPorRub,      null, null],
    ['Despesas Manuais',          totais.despesasManuais,     null, null],
    ['Total Despesas',            totais.despesasTotal,       sumario?.despesas.realizado || 0,  totais.despesasTotal - (sumario?.despesas.realizado || 0)],
    ['Fundo de Reserva',          totais.fundoReserva,        null, null],
    ['Resultado Esperado',        totais.resultadoEsperado,   sumario?.resultadoReal || 0,        (sumario?.resultadoReal || 0) - totais.resultadoEsperado]
  ];
  linhas.forEach(([lbl, orcado, real, dif]) => {
    sheet.getCell(r, 1).value = lbl;
    sheet.getCell(r, 2).value = centavosToEur(orcado);
    if (real !== null) sheet.getCell(r, 3).value = centavosToEur(real);
    if (dif !== null) sheet.getCell(r, 4).value = centavosToEur(dif);
    r++;
  });
  styleDataRows(sheet, resumoStart, r - 1, 4);
  // Destacar Total Receitas, Total Despesas, Resultado Esperado
  [resumoStart + 3, resumoStart + 6, resumoStart + 8].forEach(rowIdx => {
    styleTotalRow(sheet, rowIdx, 4);
  });
  applyEur(sheet, ['B', 'C', 'D']);

  // QUOTAS POR FRAÇÃO
  r += 2;
  sheet.mergeCells(r, 1, r, 6);
  sheet.getCell(r, 1).value = `QUOTAS POR FRAÇÃO · incremento ${orc.quotas?.incrementoPct || 0}% · arredondamento ${orc.quotas?.arredondamento || 'inteiro'}`;
  sheet.getCell(r, 1).font = { bold: true, size: 12, color: { argb: C.PRIMARY } };
  r++;
  ['Fração', 'Condómino', 'Permil.', `Mensal ${anoAnt}`, `Mensal ${ano}`, `Anual ${ano}`]
    .forEach((h, i) => sheet.getCell(r, i + 1).value = h);
  styleHeaderRow(sheet, r, 6);
  r++;
  const firstQ = r;
  const qAnt = orc.quotas?.quotasMensaisAnoAnt || {};
  const qNov = orc.quotas?.quotasMensaisPorTenant || {};
  for (const t of tenants) {
    const ant = qAnt[t.id] || 0;
    const nov = qNov[t.id] || 0;
    sheet.getCell(r, 1).value = t.fraction;
    sheet.getCell(r, 2).value = t.name;
    sheet.getCell(r, 3).value = t.permilage || 0;
    sheet.getCell(r, 4).value = centavosToEur(ant);
    sheet.getCell(r, 5).value = centavosToEur(nov);
    sheet.getCell(r, 6).value = centavosToEur(nov * 12);
    r++;
  }
  styleDataRows(sheet, firstQ, r - 1, 6);
  // Total quotas
  sheet.getCell(r, 1).value = 'TOTAL';
  sheet.getCell(r, 4).value = centavosToEur(Object.values(qAnt).reduce((s, v) => s + v, 0));
  sheet.getCell(r, 5).value = centavosToEur(totais.totalMensalQuotas);
  sheet.getCell(r, 6).value = centavosToEur(totais.valorAnualQuotas);
  styleTotalRow(sheet, r, 6);
  // Aplicar formato € colunas D/E/F
  ['D', 'E', 'F'].forEach(c => sheet.getColumn(c).numFmt = EUR_FMT);

  // OUTRAS RECEITAS
  if ((orc.outrasReceitas || []).length > 0) {
    r += 2;
    sheet.mergeCells(r, 1, r, 2);
    sheet.getCell(r, 1).value = 'OUTRAS RECEITAS';
    sheet.getCell(r, 1).font = { bold: true, size: 12, color: { argb: C.PRIMARY } };
    r++;
    ['Descrição', 'Valor'].forEach((h, i) => sheet.getCell(r, i + 1).value = h);
    styleHeaderRow(sheet, r, 2);
    r++;
    const firstOR = r;
    orc.outrasReceitas.forEach(rec => {
      sheet.getCell(r, 1).value = rec.descricao;
      sheet.getCell(r, 2).value = centavosToEur(rec.valor_centimos);
      r++;
    });
    styleDataRows(sheet, firstOR, r - 1, 2);
  }

  // EXECUÇÃO POR RÚBRICA
  if (execucao.length > 0) {
    r += 2;
    sheet.mergeCells(r, 1, r, 6);
    sheet.getCell(r, 1).value = 'DESPESAS · Execução por Rúbrica';
    sheet.getCell(r, 1).font = { bold: true, size: 12, color: { argb: C.PRIMARY } };
    r++;
    ['Rúbrica', 'Orçado', 'Realizado', '%', 'Diferença', 'Estado']
      .forEach((h, i) => sheet.getCell(r, i + 1).value = h);
    styleHeaderRow(sheet, r, 6);
    r++;
    const firstER = r;
    execucao.forEach(e => {
      sheet.getCell(r, 1).value = e.nome;
      sheet.getCell(r, 2).value = centavosToEur(e.orcado_centimos);
      sheet.getCell(r, 3).value = centavosToEur(e.realizado_centimos);
      sheet.getCell(r, 4).value = e.percentagem === null ? '' : e.percentagem;
      sheet.getCell(r, 5).value = centavosToEur(e.diferenca_centimos);
      sheet.getCell(r, 6).value = e.status;

      // Cor por estado
      let bg = null, fg = null;
      if (e.status === 'ultrapassado' || e.status === 'fora-orcamento') { bg = C.RED_LT; fg = 'B91C1C'; }
      else if (e.status === 'alerta') { bg = C.AMBER_LT; fg = '92400E'; }
      else if (e.status === 'ok') { bg = C.GREEN_LT; fg = '047857'; }
      if (bg) {
        sheet.getCell(r, 6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        sheet.getCell(r, 6).font = { color: { argb: fg }, bold: true };
      }
      r++;
    });
    styleDataRows(sheet, firstER, r - 1, 6);
    sheet.getCell('D' + (firstER)).numFmt = PCT_FMT;
    sheet.getColumn(4).numFmt = PCT_FMT;
  }

  // DESPESAS MANUAIS
  if ((orc.despesas?.manuais || []).length > 0) {
    r += 2;
    sheet.mergeCells(r, 1, r, 2);
    sheet.getCell(r, 1).value = 'DESPESAS MANUAIS';
    sheet.getCell(r, 1).font = { bold: true, size: 12, color: { argb: C.PRIMARY } };
    r++;
    ['Descrição', 'Valor'].forEach((h, i) => sheet.getCell(r, i + 1).value = h);
    styleHeaderRow(sheet, r, 2);
    r++;
    const firstDM = r;
    orc.despesas.manuais.forEach(m => {
      sheet.getCell(r, 1).value = m.descricao;
      sheet.getCell(r, 2).value = centavosToEur(m.valor_centimos);
      r++;
    });
    styleDataRows(sheet, firstDM, r - 1, 2);
  }

  if (orc.observacoes) {
    r += 2;
    sheet.mergeCells(r, 1, r, 6);
    sheet.getCell(r, 1).value = 'OBSERVAÇÕES';
    sheet.getCell(r, 1).font = { bold: true, size: 12, color: { argb: C.PRIMARY } };
    r++;
    sheet.mergeCells(r, 1, r, 6);
    sheet.getCell(r, 1).value = orc.observacoes;
    sheet.getCell(r, 1).alignment = { wrapText: true, vertical: 'top' };
    sheet.getRow(r).height = 60;
  }

  // Larguras
  sheet.getColumn(1).width = 32;
  sheet.getColumn(2).width = 22;
  sheet.getColumn(3).width = 14;
  sheet.getColumn(4).width = 14;
  sheet.getColumn(5).width = 14;
  sheet.getColumn(6).width = 16;
}
