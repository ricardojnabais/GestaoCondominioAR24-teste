/**
 * Página: Mapa Mensal de Despesas · Admin
 *
 * Tabela cruzada estilo Excel:
 *   Linhas = meses (Janeiro a Dezembro + linhas Total e Média)
 *   Colunas = rúbricas + coluna Total
 *
 * Permite navegar por anos e exportar a vista atual para Excel.
 */

import * as store from '../../store/local-store.js';
import * as despesas from '../../modules/despesas.js';
import * as rubricas from '../../modules/rubricas.js';
import * as router from '../router.js';
import { icon } from '../icons.js';
import { formatMoney } from '../../utils/format.js';

let containerRef = null;
let anoSelecionado = new Date().getFullYear();

const MES_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export async function render(container) {
  containerRef = container;

  container.innerHTML = `
    <div class="app">
      <header class="header">
        <div class="brand" id="brand">
          <div class="brand-mark">${icon('logo-mark', 'brand-mark-svg')}</div>
          <div class="brand-text">
            <div class="name">Gestão do Condomínio AR24</div>
            <div class="sub">Av. Amália Rodrigues · 24</div>
          </div>
        </div>
        <div class="header-actions">
          <button class="btn-hamburger" id="hamburger"><span class="hl"></span><span class="hl"></span><span class="hl"></span></button>
        </div>
      </header>
      <main class="main">
        <div class="page-header">
          <div class="page-title">
            <button class="btn-home-circle" id="back-home">${icon('ic-home', 'btn-home-icon')}</button>
            <div>
              <div class="breadcrumb">Análise · Mapa Mensal</div>
              <h1>Despesas · Mapa Mensal</h1>
            </div>
            <div style="margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <select id="sel-ano" class="select-ano" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;font-weight:600;background:var(--white)"></select>
              <button class="btn ghost" id="btn-export">↓ Exportar Excel</button>
            </div>
          </div>
        </div>

        <div id="mapa-area"></div>
      </main>
    </div>
  `;

  containerRef.querySelector('#brand').addEventListener('click', () => router.navigate('admin/home'));
  containerRef.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));
  containerRef.querySelector('#btn-export').addEventListener('click', () => exportarExcel());

  await popularAnos();
  containerRef.querySelector('#sel-ano').addEventListener('change', e => {
    anoSelecionado = parseInt(e.target.value, 10);
    renderMapa();
  });
  await renderMapa();
}

async function popularAnos() {
  const todasDespesas = await despesas.listar({ incluirCanceladas: false });
  const anosSet = new Set([anoSelecionado]);
  todasDespesas.forEach(d => {
    if (d.data) {
      const y = parseInt(d.data.slice(0, 4), 10);
      if (!isNaN(y)) anosSet.add(y);
    }
  });
  const anos = [...anosSet].sort((a, b) => b - a);
  const sel = containerRef.querySelector('#sel-ano');
  sel.innerHTML = anos.map(a => `<option value="${a}" ${a === anoSelecionado ? 'selected' : ''}>${a}</option>`).join('');
}

async function renderMapa() {
  const area = containerRef.querySelector('#mapa-area');
  const rubricasList = (await rubricas.listar()).sort((a, b) => (a.ordem || 99) - (b.ordem || 99));
  const todasDespesas = await despesas.listar({ incluirCanceladas: false });
  const despesasAno = todasDespesas.filter(d => d.data && d.data.slice(0, 4) === String(anoSelecionado));

  // Construir matriz: matriz[mes][rubricaId] = soma_centimos
  const matriz = Array.from({ length: 12 }, () => ({}));
  rubricasList.forEach(r => {
    for (let m = 0; m < 12; m++) matriz[m][r.id] = 0;
  });

  // Identificar rúbricas que têm valor neste ano · esconde as vazias
  const rubricasComDados = new Set();

  despesasAno.forEach(d => {
    const mes = parseInt(d.data.slice(5, 7), 10) - 1;
    if (mes < 0 || mes > 11) return;
    if (!matriz[mes][d.rubricaId]) matriz[mes][d.rubricaId] = 0;
    matriz[mes][d.rubricaId] += d.valor_centimos || 0;
    rubricasComDados.add(d.rubricaId);
  });

  const rubricasVisiveis = rubricasList.filter(r => rubricasComDados.has(r.id));
  if (rubricasVisiveis.length === 0) {
    area.innerHTML = `<div class="placeholder"><p>Sem despesas registadas em ${anoSelecionado}.</p></div>`;
    return;
  }

  // Totais por linha (mês) e por coluna (rúbrica)
  const totaisMes = matriz.map(m => rubricasVisiveis.reduce((s, r) => s + (m[r.id] || 0), 0));
  const totaisRubrica = {};
  rubricasVisiveis.forEach(r => {
    totaisRubrica[r.id] = matriz.reduce((s, m) => s + (m[r.id] || 0), 0);
  });
  const totalGeral = totaisMes.reduce((s, v) => s + v, 0);

  // Quantos meses têm valor (para calcular média mais útil)
  const mesesComValor = totaisMes.filter(v => v > 0).length;

  // Build HTML
  area.innerHTML = `
    <div class="mapa-mensal-wrap">
      <table class="mapa-mensal">
        <thead>
          <tr>
            <th class="mm-mes-col">Mês</th>
            ${rubricasVisiveis.map(r => `<th>${escapeHtml(r.nome)}</th>`).join('')}
            <th class="mm-total-col">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${MES_NAMES.map((mn, idx) => `
            <tr class="${totaisMes[idx] === 0 ? 'mm-row-empty' : ''}">
              <td class="mm-mes-col">${mn}</td>
              ${rubricasVisiveis.map(r => {
                const v = matriz[idx][r.id] || 0;
                return `<td class="${v === 0 ? 'mm-cell-empty' : 'mm-cell'}">${v === 0 ? '—' : formatMoney(v)}</td>`;
              }).join('')}
              <td class="mm-total-col mm-cell-bold">${totaisMes[idx] === 0 ? '—' : formatMoney(totaisMes[idx])}</td>
            </tr>
          `).join('')}
          <tr class="mm-row-total">
            <td class="mm-mes-col">TOTAL</td>
            ${rubricasVisiveis.map(r => `<td>${formatMoney(totaisRubrica[r.id])}</td>`).join('')}
            <td class="mm-total-col">${formatMoney(totalGeral)}</td>
          </tr>
          <tr class="mm-row-medio">
            <td class="mm-mes-col">Média / mês *</td>
            ${rubricasVisiveis.map(r => `<td>${formatMoney(Math.round(totaisRubrica[r.id] / Math.max(1, mesesComValor)))}</td>`).join('')}
            <td class="mm-total-col">${formatMoney(Math.round(totalGeral / Math.max(1, mesesComValor)))}</td>
          </tr>
        </tbody>
      </table>
      <p style="font-size:11px;color:var(--text-muted);margin:8px 0 0 0;padding:0 4px">
        * Média calculada sobre ${mesesComValor} ${mesesComValor === 1 ? 'mês com despesas' : 'meses com despesas'}.
      </p>
    </div>
  `;

  // Guardar para o export
  containerRef._mapaCache = { rubricasVisiveis, matriz, totaisMes, totaisRubrica, totalGeral, mesesComValor };
}

async function exportarExcel() {
  if (!containerRef._mapaCache) {
    alert('Sem dados para exportar.');
    return;
  }
  const { rubricasVisiveis, matriz, totaisMes, totaisRubrica, totalGeral, mesesComValor } = containerRef._mapaCache;

  if (typeof ExcelJS === 'undefined') {
    alert('Biblioteca ExcelJS não carregada.');
    return;
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gestão do Condomínio AR24';
  wb.created = new Date();
  const ws = wb.addWorksheet(`Despesas ${anoSelecionado}`);

  // Título
  ws.mergeCells(1, 1, 1, rubricasVisiveis.length + 2);
  ws.getCell('A1').value = `Mapa Mensal de Despesas · ${anoSelecionado}`;
  ws.getCell('A1').font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1E54C7' } };
  ws.getCell('A1').alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(1).height = 24;

  // Sub-título
  ws.mergeCells(2, 1, 2, rubricasVisiveis.length + 2);
  ws.getCell('A2').value = `Administração Condomínio Av. Amália Rodrigues, 24 · Gerado em ${new Date().toLocaleString('pt-PT')}`;
  ws.getCell('A2').font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF6B7280' } };

  // Header (linha 4)
  const headerRow = ws.getRow(4);
  headerRow.values = ['Mês', ...rubricasVisiveis.map(r => r.nome), 'TOTAL'];
  styleHeaderRow(headerRow, rubricasVisiveis.length + 2);

  // Linhas dos meses (5 a 16)
  for (let m = 0; m < 12; m++) {
    const row = ws.getRow(5 + m);
    const values = [MES_NAMES[m]];
    rubricasVisiveis.forEach(r => {
      const v = matriz[m][r.id] || 0;
      values.push(v === 0 ? null : v / 100);
    });
    values.push(totaisMes[m] === 0 ? null : totaisMes[m] / 100);
    row.values = values;
    styleDataRow(row, rubricasVisiveis.length + 2, m % 2 === 1);
  }

  // Linha total (17)
  const totalRow = ws.getRow(17);
  totalRow.values = ['TOTAL', ...rubricasVisiveis.map(r => totaisRubrica[r.id] / 100), totalGeral / 100];
  styleTotalRow(totalRow, rubricasVisiveis.length + 2);

  // Média (18)
  const mediaRow = ws.getRow(18);
  const mc = Math.max(1, mesesComValor);
  mediaRow.values = [`Média / mês (${mc} m.)`,
                     ...rubricasVisiveis.map(r => Math.round(totaisRubrica[r.id] / mc) / 100),
                     Math.round(totalGeral / mc) / 100];
  styleMediaRow(mediaRow, rubricasVisiveis.length + 2);

  // Aplicar formato de moeda às cols numéricas
  for (let c = 2; c <= rubricasVisiveis.length + 2; c++) {
    ws.getColumn(c).numFmt = '#,##0.00 €';
    ws.getColumn(c).width = 14;
  }
  ws.getColumn(1).width = 18;

  // Freeze
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 4 }];

  // Download
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Despesas-Mensal-${anoSelecionado}-AR24.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ───────────────────────── HELPERS EXCEL ─────────────────────────

function styleHeaderRow(row, lastCol) {
  for (let c = 1; c <= lastCol; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E54C7' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder();
  }
  row.height = 32;
}

function styleDataRow(row, lastCol, zebra) {
  for (let c = 1; c <= lastCol; c++) {
    const cell = row.getCell(c);
    cell.font = { size: 10 };
    if (zebra) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
    }
    cell.border = thinBorder();
    if (c === 1) {
      cell.font = { bold: true, size: 10 };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
    } else if (c === lastCol) {
      cell.font = { bold: true, size: 10 };
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    } else {
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    }
  }
}

function styleTotalRow(row, lastCol) {
  for (let c = 1; c <= lastCol; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1640A0' } };
    cell.alignment = { horizontal: c === 1 ? 'left' : 'right', vertical: 'middle' };
    cell.border = thinBorder();
  }
}

function styleMediaRow(row, lastCol) {
  for (let c = 1; c <= lastCol; c++) {
    const cell = row.getCell(c);
    cell.font = { italic: true, size: 10, color: { argb: 'FF374151' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    cell.alignment = { horizontal: c === 1 ? 'left' : 'right', vertical: 'middle' };
    cell.border = thinBorder();
  }
}

function thinBorder() {
  return {
    top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
  };
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
