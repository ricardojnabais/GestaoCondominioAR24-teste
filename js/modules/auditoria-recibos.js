/**
 * Auditoria de Recibos · v1.0.33
 *
 * Duas funções principais:
 *  1. alinharRecibos2026() · substitui TODOS os recibos com ano=2026 em Firestore
 *     pelos 64 recibos canónicos do dataset de auditoria (data/recibos-auditoria-2026.json).
 *     Operação destrutiva mas idempotente (re-executável). Merge inteligente preserva
 *     metadados da app (pdfGeradoEm, pdfGeracoes).
 *
 *  2. exportarAuditoria(ano) · gera Excel idêntico ao formato de auditoria externa
 *     (4 sheets: Recibos, Resumo Mensal, Por Condómino, Condóminos).
 *     Disponível para anos >= 2026.
 *
 * IMPORTANTE · COMPORTAMENTO HISTÓRICO/AUDITORIA-ONLY:
 *  Os 64 recibos canónicos têm flags excluirDoSaldo=true e excluirDeContagem=true.
 *  Servem como REGISTO HISTÓRICO/AUDITORIA · mantêm-se na lista, mantêm a numeração,
 *  mas NÃO contam para:
 *    - Tabela Quotas (em-aberto.js · não marcam meses como pagos)
 *    - Análise mensal (analise.js · não somam para receitas mensais)
 *    - Saldo bancário (saldo-banco.js · não somam para saldo)
 *    - Orçamento realizado (orcamento.js · não somam para realizado vs orçado)
 *
 *  Recibos emitidos após v1.0.33 (não-canónicos) NÃO têm estas flags por defeito,
 *  pelo que contam normalmente. A app é a fonte de verdade para emissões pós-go-live.
 */

import * as store from '../store/local-store.js';

const ANO_AUDITORIA = 2026;
const DATASET_URL = './data/recibos-auditoria-2026.json';

/**
 * Carrega o dataset canónico de recibos 2026 a partir do JSON.
 */
async function carregarDataset() {
  // O JSON está no GitHub Pages · usar URL relativo
  const url = new URL(DATASET_URL, document.baseURI).href;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Não foi possível ler ${DATASET_URL} (HTTP ${r.status})`);
  const data = await r.json();
  if (!Array.isArray(data)) throw new Error('Formato inválido em ' + DATASET_URL);
  return data;
}

/**
 * Alinha os recibos 2026 em Firestore com o dataset de auditoria.
 *
 * Procedimento:
 *  1. Carrega o dataset canónico (63 recibos)
 *  2. Lista todos os recibos atuais com ano=2026
 *  3. Apaga os que não estão no dataset (cleanup)
 *  4. Insere/sobrescreve os 63 com setDoc (id determinístico)
 *
 * @param {function} onProgress - callback({stage, current, total, action, detail})
 * @returns {Promise<{lidos, apagados, escritos, erros}>}
 */
export async function alinharRecibos2026(onProgress = () => {}) {
  const stats = { lidos: 0, apagados: 0, escritos: 0, erros: [] };

  onProgress({ stage: 'loading', detail: 'A carregar dataset de auditoria...' });
  const dataset = await carregarDataset();
  stats.lidos = dataset.length;

  onProgress({ stage: 'reading', detail: 'A ler recibos atuais em Firestore...' });
  const todos = await store.listDocs('receipts');
  const atuais2026 = todos.filter(r => String(r.ano) === String(ANO_AUDITORIA));
  const idsCanonicos = new Set(dataset.map(r => r.id));

  // Apagar recibos 2026 que NÃO estão no dataset canónico
  onProgress({ stage: 'cleaning', total: atuais2026.length, current: 0, detail: 'A limpar recibos extra...' });
  let i = 0;
  for (const r of atuais2026) {
    i++;
    if (!idsCanonicos.has(r.id)) {
      try {
        await store.deleteDoc('receipts', r.id);
        stats.apagados++;
        onProgress({ stage: 'cleaning', total: atuais2026.length, current: i, action: 'apagado', detail: r.recibo_numero || r.id });
      } catch (e) {
        stats.erros.push(`apagar ${r.id}: ${e.message}`);
      }
    }
  }

  // Inserir/sobrescrever os recibos do dataset com merge inteligente:
  // preservar campos próprios da app (pdfGeradoEm, pdfGeracoes, lastModifiedBy)
  // e atualizar só os campos canónicos (data, valor, descricao, tipo, mesReferencia, etc.)
  onProgress({ stage: 'writing', total: dataset.length, current: 0, detail: 'A escrever recibos canónicos...' });
  i = 0;
  for (const r of dataset) {
    i++;
    try {
      // Procurar doc atual com o mesmo id para preservar metadados da app
      const atual = atuais2026.find(a => a.id === r.id) || {};
      const camposPreservados = {
        pdfGeradoEm: atual.pdfGeradoEm,
        pdfGeradoPor: atual.pdfGeradoPor,
        pdfGeracoes: atual.pdfGeracoes,
        lastModifiedBy: atual.lastModifiedBy,
        lastModifiedAt: atual.lastModifiedAt
      };
      // Filtra undefined
      for (const k of Object.keys(camposPreservados)) {
        if (camposPreservados[k] === undefined) delete camposPreservados[k];
      }
      await store.setDoc('receipts', { ...r, ...camposPreservados });
      stats.escritos++;
      onProgress({ stage: 'writing', total: dataset.length, current: i, action: 'escrito', detail: r.recibo_numero });
    } catch (e) {
      stats.erros.push(`escrever ${r.id}: ${e.message}`);
    }
  }

  onProgress({ stage: 'done', detail: 'Alinhamento concluído', stats });
  return stats;
}

/**
 * Compara o estado atual com o dataset · não modifica nada.
 * Útil para preview antes de alinhar.
 */
export async function compararComDataset() {
  const dataset = await carregarDataset();
  const todos = await store.listDocs('receipts');
  const atuais2026 = todos.filter(r => String(r.ano) === String(ANO_AUDITORIA));

  const idsCanonicos = new Set(dataset.map(r => r.id));
  const idsAtuais = new Set(atuais2026.map(r => r.id));

  const apenasAtual = atuais2026.filter(r => !idsCanonicos.has(r.id));
  const apenasDataset = dataset.filter(r => !idsAtuais.has(r.id));
  const ambos = atuais2026.filter(r => idsCanonicos.has(r.id));

  // Comparar valores nos que existem em ambos
  const divergem = [];
  for (const atual of ambos) {
    const canon = dataset.find(r => r.id === atual.id);
    if (!canon) continue;
    const diffs = {};
    if (atual.valor_centimos !== canon.valor_centimos) diffs.valor = { atual: atual.valor_centimos, canon: canon.valor_centimos };
    if (atual.data !== canon.data) diffs.data = { atual: atual.data, canon: canon.data };
    if ((atual.descricao || '') !== (canon.descricao || '')) diffs.descricao = { atual: atual.descricao, canon: canon.descricao };
    if (Object.keys(diffs).length > 0) divergem.push({ id: atual.id, recibo: atual.recibo_numero, diffs });
  }

  return {
    totalCanonico: dataset.length,
    totalAtual: atuais2026.length,
    apenasAtual: apenasAtual.length,
    apenasDataset: apenasDataset.length,
    iguais: ambos.length - divergem.length,
    divergem: divergem.length,
    divergemDetalhe: divergem.slice(0, 20) // primeiros 20 para inspeção
  };
}

// ────────────────────────────────────────────────────────────
// EXPORTAÇÃO AUDITORIA · formato igual ao Excel externo
// ────────────────────────────────────────────────────────────

const C = {
  PRIMARY: '1A2740',      // azul-escuro
  PRIMARY_LT: 'D4AF37',   // dourado (totais)
  PRIMARY_DK: 'FFFFFF',
  HEADER_BG: '1A2740',
  HEADER_FG: 'FFFFFF',
  ZEBRA: 'F6F1DE',
  IVORY: 'FAF8F2'
};

const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function centavosToEur(c) { return Math.round(c || 0) / 100; }

function styleHeader(sheet, rowIdx, ncols) {
  for (let i = 1; i <= ncols; i++) {
    const cell = sheet.getCell(rowIdx, i);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.HEADER_BG } };
    cell.font = { color: { argb: C.HEADER_FG }, bold: true, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = { bottom: { style: 'thin', color: { argb: C.PRIMARY_LT } } };
  }
  sheet.getRow(rowIdx).height = 22;
}

function styleZebra(sheet, firstRow, lastRow, ncols) {
  for (let r = firstRow; r <= lastRow; r++) {
    const isZebra = (r - firstRow) % 2 === 1;
    for (let c = 1; c <= ncols; c++) {
      const cell = sheet.getCell(r, c);
      if (isZebra) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.ZEBRA } };
      }
      cell.alignment = cell.alignment || { vertical: 'middle' };
    }
  }
}

function styleTotal(sheet, rowIdx, ncols) {
  for (let c = 1; c <= ncols; c++) {
    const cell = sheet.getCell(rowIdx, c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.PRIMARY_LT } };
    cell.font = { bold: true, color: { argb: C.PRIMARY } };
  }
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

/**
 * Exporta Excel de auditoria para o ano indicado.
 * Formato idêntico ao ficheiro de auditoria externo:
 *  Sheet 1 · Recibos (8 colunas: Nº, Data, Condómino, Fração, NIF, Descrição, Valor, Extenso)
 *  Sheet 2 · Resumo Mensal (4 colunas)
 *  Sheet 3 · Por Condómino (5 colunas)
 *  Sheet 4 · Condóminos (5 colunas)
 *
 * Apenas anos >= 2026 são auditáveis. Anos anteriores são históricos importados.
 *
 * @param {number} ano - ano a exportar (default: 2026)
 */
export async function exportarAuditoria(ano = ANO_AUDITORIA) {
  if (typeof ExcelJS === 'undefined') {
    throw new Error('ExcelJS não carregado. Recarrega a página.');
  }
  if (typeof ano !== 'number' || ano < ANO_AUDITORIA) {
    throw new Error(`Exportação de auditoria só está disponível a partir de ${ANO_AUDITORIA}.`);
  }

  // Carregar dados
  const todos = await store.listDocs('receipts');
  const recibos = todos
    .filter(r => r.ano === ano)
    .sort((a, b) => {
      // Ordenar por número de recibo (extrair os 3 dígitos)
      const na = parseInt(String(a.recibo_numero || '').replace(/[^0-9]/g, '').slice(0, 3), 10) || 0;
      const nb = parseInt(String(b.recibo_numero || '').replace(/[^0-9]/g, '').slice(0, 3), 10) || 0;
      return na - nb;
    });

  if (recibos.length === 0) throw new Error(`Não há recibos de ${ano} para exportar.`);

  const tenants = await store.listDocs('tenants');
  const tenantById = {};
  for (const t of tenants) tenantById[t.id] = t;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gestão do Condomínio AR24';
  wb.created = new Date();

  // ──────── SHEET 1 · RECIBOS ────────
  const wsRec = wb.addWorksheet('Recibos');
  wsRec.mergeCells('A1:H1');
  wsRec.getCell('A1').value = 'CONDOMÍNIO AV. AMÁLIA RODRIGUES, 24';
  wsRec.getCell('A1').font = { bold: true, size: 14, color: { argb: C.PRIMARY } };
  wsRec.mergeCells('A2:H2');
  wsRec.getCell('A2').value = `Histórico de Recibos Emitidos · Ano ${ano} (Auditoria)`;
  wsRec.getCell('A2').font = { italic: true, color: { argb: C.PRIMARY } };
  wsRec.mergeCells('A3:H3');
  const hoje = new Date();
  wsRec.getCell('A3').value = `Exportado em: ${hoje.toLocaleDateString('pt-PT')}`;
  wsRec.getCell('A3').font = { italic: true, size: 9, color: { argb: '707070' } };

  const recHeaders = ['Nº Recibo', 'Data', 'Condómino', 'Fração', 'NIF', 'Descrição', 'Valor (€)', 'Por Extenso'];
  wsRec.addRow([]); // linha 4 em branco
  wsRec.addRow(recHeaders); // linha 5
  styleHeader(wsRec, 5, 8);

  for (const r of recibos) {
    const tenant = tenantById[r.tenantId] || {};
    wsRec.addRow([
      r.recibo_numero || '',
      r.data ? new Date(r.data + 'T12:00:00') : '',
      r.tenantName || tenant.name || '',
      r.fraction || tenant.fraction || '',
      r.nif || tenant.nif || '',
      r.descricao || '',
      centavosToEur(r.valor_centimos),
      r.extenso || ''
    ]);
  }

  // Formatos
  wsRec.getColumn(2).numFmt = 'dd/mm/yyyy';
  wsRec.getColumn(7).numFmt = '#,##0.00';
  wsRec.columns = [
    { width: 18 }, { width: 12 }, { width: 28 }, { width: 14 },
    { width: 14 }, { width: 50 }, { width: 12 }, { width: 60 }
  ];
  const lastRow = 5 + recibos.length;
  styleZebra(wsRec, 6, lastRow, 8);

  // Total
  wsRec.addRow([]);
  const totalRow = wsRec.addRow(['', '', '', '', '', 'TOTAL', { formula: `SUM(G6:G${lastRow})` }, '']);
  styleTotal(wsRec, totalRow.number, 8);
  totalRow.getCell(7).numFmt = '#,##0.00';

  wsRec.views = [{ state: 'frozen', xSplit: 0, ySplit: 5 }];

  // ──────── SHEET 2 · RESUMO MENSAL ────────
  const wsRm = wb.addWorksheet('Resumo Mensal');
  wsRm.mergeCells('A1:D1');
  wsRm.getCell('A1').value = `Resumo Mensal · Ano ${ano}`;
  wsRm.getCell('A1').font = { bold: true, size: 14, color: { argb: C.PRIMARY } };
  wsRm.addRow([]);
  wsRm.addRow(['Mês', 'Nº Recibos', 'Total Recebido (€)', 'Média por Recibo (€)']);
  styleHeader(wsRm, 3, 4);

  const porMes = {};
  for (const r of recibos) {
    const m = (r.data || '').slice(0, 7);
    if (!porMes[m]) porMes[m] = { count: 0, sum: 0 };
    porMes[m].count++;
    porMes[m].sum += centavosToEur(r.valor_centimos);
  }
  const mesesOrdenados = Object.keys(porMes).sort();
  for (const m of mesesOrdenados) {
    const [ano, mes] = m.split('-');
    const label = `${MESES_PT[parseInt(mes, 10) - 1]} ${ano}`;
    const d = porMes[m];
    wsRm.addRow([label, d.count, d.sum, d.sum / d.count]);
  }
  wsRm.addRow([]);
  const totalMes = wsRm.addRow([
    'TOTAL',
    recibos.length,
    recibos.reduce((s, r) => s + centavosToEur(r.valor_centimos), 0),
    recibos.length > 0 ? recibos.reduce((s, r) => s + centavosToEur(r.valor_centimos), 0) / recibos.length : 0
  ]);
  styleTotal(wsRm, totalMes.number, 4);
  wsRm.getColumn(3).numFmt = '#,##0.00';
  wsRm.getColumn(4).numFmt = '#,##0.00';
  wsRm.columns = [{ width: 20 }, { width: 12 }, { width: 20 }, { width: 22 }];
  styleZebra(wsRm, 4, 3 + mesesOrdenados.length, 4);
  wsRm.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];

  // ──────── SHEET 3 · POR CONDÓMINO ────────
  const wsPc = wb.addWorksheet('Por Condómino');
  wsPc.mergeCells('A1:E1');
  wsPc.getCell('A1').value = `Resumo por Condómino · Ano ${ano}`;
  wsPc.getCell('A1').font = { bold: true, size: 14, color: { argb: C.PRIMARY } };
  wsPc.addRow([]);
  wsPc.addRow(['Condómino', 'Fração', 'NIF', 'Nº Recibos', 'Total Pago (€)']);
  styleHeader(wsPc, 3, 5);

  const porCond = {};
  for (const r of recibos) {
    const k = r.tenantId;
    const t = tenantById[k] || {};
    if (!porCond[k]) {
      porCond[k] = {
        nome: r.tenantName || t.name || '',
        fraction: r.fraction || t.fraction || '',
        nif: r.nif || t.nif || '',
        count: 0, sum: 0
      };
    }
    porCond[k].count++;
    porCond[k].sum += centavosToEur(r.valor_centimos);
  }
  const condsOrdenados = Object.values(porCond).sort((a, b) => b.sum - a.sum);
  for (const c of condsOrdenados) {
    wsPc.addRow([c.nome, c.fraction, c.nif, c.count, c.sum]);
  }
  const totalPc = wsPc.addRow([
    'TOTAL', '', '',
    condsOrdenados.reduce((s, c) => s + c.count, 0),
    condsOrdenados.reduce((s, c) => s + c.sum, 0)
  ]);
  styleTotal(wsPc, totalPc.number, 5);
  wsPc.getColumn(5).numFmt = '#,##0.00';
  wsPc.columns = [{ width: 30 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 18 }];
  styleZebra(wsPc, 4, 3 + condsOrdenados.length, 5);
  wsPc.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];

  // ──────── SHEET 4 · CONDÓMINOS ────────
  const wsCo = wb.addWorksheet('Condóminos');
  wsCo.mergeCells('A1:E1');
  wsCo.getCell('A1').value = 'Lista de Condóminos';
  wsCo.getCell('A1').font = { bold: true, size: 14, color: { argb: C.PRIMARY } };
  wsCo.addRow([]);
  wsCo.addRow(['Nome', 'Fração', 'NIF', 'Email', 'Quota Mensal (€)']);
  styleHeader(wsCo, 3, 5);

  const tenantsOrdenados = [...tenants].sort((a, b) => (a.fraction || '').localeCompare(b.fraction || ''));
  for (const t of tenantsOrdenados) {
    const quota = (t.rentByYear || {})[ano];
    wsCo.addRow([
      t.name || '',
      t.fraction || '',
      t.nif || '',
      t.email || '(sem email)',
      quota != null ? centavosToEur(quota) : ''
    ]);
  }
  wsCo.getColumn(5).numFmt = '#,##0.00';
  wsCo.columns = [{ width: 30 }, { width: 14 }, { width: 14 }, { width: 36 }, { width: 18 }];
  styleZebra(wsCo, 4, 3 + tenantsOrdenados.length, 5);
  wsCo.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];

  // Download
  const filename = `auditoria-recibos-AR24-${ano}-${hoje.toISOString().slice(0, 10)}.xlsx`;
  await downloadWorkbook(wb, filename);
  return filename;
}
