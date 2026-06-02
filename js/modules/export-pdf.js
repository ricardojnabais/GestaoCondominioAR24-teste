/**
 * Geração de PDF de Recibo.
 *
 * Replica o layout do template usado na versão RecibosAR24 v3.0:
 *  - Caixa exterior com cabeçalho do condomínio (esq) + nº recibo (dir, vermelho)
 *  - Data formal por extenso
 *  - Linhas de "Recebi do(a) Sr.(ª)" + NIF + Fração
 *  - Importância por extenso + referente a
 *  - Valor numérico grande à esquerda
 *  - Carimbo azul rotacionado no canto inferior direito
 *
 * Regista no recibo `pdfGeradoEm` + `pdfGeradoPor` cada vez que se gera.
 */

import * as store from '../store/local-store.js';
import * as condominioInfo from './condominio-info.js';
import { valorPorExtenso, dataPorExtenso } from '../utils/extenso.js';

const COR_VERMELHA = [178, 34, 52];
const COR_AZUL = [30, 84, 199];
const COR_PRETA = [20, 26, 46];

const TIPO_LABEL = {
  quota: 'Quota mensal',
  prestacao: 'Prestação de Plano',
  outro: 'Outro recebimento',
  recebimento: 'Recebimento',
  estorno: 'Estorno'
};

/**
 * Gera e descarrega o PDF de um recibo.
 * @param {string} reciboId
 * @param {string} operatorName - quem está a gerar
 * @returns {Promise<string>} - nome do ficheiro
 */
export async function gerarReciboPDF(reciboId, operatorName) {
  if (!window.jspdf) {
    throw new Error('jsPDF não disponível. Verifica que vendor/jspdf.umd.min.js foi carregado.');
  }
  const { jsPDF } = window.jspdf;

  const recibo = await store.getDoc('receipts', reciboId);
  if (!recibo) throw new Error('Recibo não encontrado.');

  const tenant = recibo.tenantId ? await store.getDoc('tenants', recibo.tenantId) : null;
  const cond = await condominioInfo.obter();

  // Construir descrição contextualizada
  let descricao = recibo.descricao || TIPO_LABEL[recibo.tipo] || 'Pagamento';
  if (recibo.tipo === 'quota' && recibo.mesReferencia?.length > 0) {
    descricao = mapearDescricaoQuota(recibo);
  } else if (recibo.tipo === 'prestacao' && recibo.planoId) {
    const plano = await store.getDoc('planos', recibo.planoId);
    descricao = `Prestação(ões) · ${plano?.nome || 'Plano'} · ${recibo.mesReferencia.join(', ')}`;
  }

  const doc = new jsPDF('p', 'mm', 'a4');
  desenharRecibo(doc, recibo, tenant, cond, descricao);

  // Registar emissão no recibo · APENAS quando o gerador é admin.
  // O condómino não tem Firebase Auth e a regra Firestore de `receipts`
  // exige request.auth != null para write, pelo que tentar gravar daria
  // "missing or insufficient permissions" e bloqueava o download.
  try {
    const { getSession } = await import('../auth/local-auth.js');
    const role = getSession()?.role;
    if (role === 'admin') {
      recibo.pdfGeradoEm = Date.now();
      recibo.pdfGeradoPor = operatorName || null;
      recibo.pdfGeracoes = (recibo.pdfGeracoes || 0) + 1;
      await store.setDoc('receipts', recibo);
    }
  } catch (e) {
    // Nunca bloquear a geração do PDF por causa do log de emissão.
    console.warn('[export-pdf] Registo de emissão falhou (continua sem registar):', e.message);
  }

  // Nome do ficheiro
  const reciboNum = (recibo.recibo_numero || 'sn').replace(/[/\\?%*:|"<>]/g, '_').replace(/ /g, '_');
  const fracaoSlug = (tenant?.fraction || '').replace(/[^a-zA-Z0-9]/g, '');
  const filename = `RCB_${reciboNum}_${fracaoSlug}.pdf`;

  doc.save(filename);
  return filename;
}

function mapearDescricaoQuota(recibo) {
  const meses = (recibo.mesReferencia || []).slice().sort();
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  if (meses.length === 1) {
    const [y, m] = meses[0].split('-');
    return `Quota mensal de ${MESES[parseInt(m, 10) - 1]} de ${y}`;
  }
  // Múltiplos meses
  const [y1, m1] = meses[0].split('-');
  const [y2, m2] = meses[meses.length - 1].split('-');
  if (y1 === y2) {
    return `Quotas de ${MESES[parseInt(m1, 10) - 1]} a ${MESES[parseInt(m2, 10) - 1]} de ${y1}`;
  }
  return `Quotas de ${MESES[parseInt(m1, 10) - 1]} ${y1} a ${MESES[parseInt(m2, 10) - 1]} ${y2}`;
}

/** Desenha 1 recibo na página A4. */
function desenharRecibo(doc, recibo, tenant, cond, descricao) {
  // A4: 210 x 297 mm
  const PAGE_W = 210, MARGIN = 12;
  const BOX_X = MARGIN, BOX_Y = MARGIN, BOX_W = PAGE_W - 2 * MARGIN, BOX_H = 115;

  // Caixa exterior
  doc.setLineWidth(0.5);
  doc.setDrawColor(...COR_PRETA);
  doc.rect(BOX_X, BOX_Y, BOX_W, BOX_H);

  // ─── CABEÇALHO ESQUERDO ───
  doc.setTextColor(...COR_PRETA);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(cond.nome, BOX_X + 4, BOX_Y + 7);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(cond.morada, BOX_X + 4, BOX_Y + 12);
  doc.text(`${cond.codigoPostal} ${cond.localidade}`, BOX_X + 4, BOX_Y + 16);
  doc.setFont('helvetica', 'bold');
  doc.text(`NIF: ${cond.nif}`, BOX_X + 4, BOX_Y + 20.5);

  // ─── CABEÇALHO DIREITO (recibo nº + data) ───
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COR_VERMELHA);
  doc.text(`RECIBO ${recibo.recibo_numero || ''}`, BOX_X + BOX_W - 4, BOX_Y + 7, { align: 'right' });

  // Data
  const dataLabel = formatarDataLinha(recibo.data, cond.localidade);
  doc.setTextColor(...COR_PRETA);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(dataLabel, BOX_X + BOX_W - 4, BOX_Y + 17, { align: 'right' });

  // ─── CORPO ───
  const labelX = BOX_X + 4;
  const valueX = BOX_X + 45;
  const lineEndX = BOX_X + BOX_W - 4;
  let y = BOX_Y + 35;

  // Linha "Recebi do(a) Sr.(ª)"
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Recebi do(a) Sr.(ª)', labelX, y);
  doc.setFont('helvetica', 'bold');
  doc.text(recibo.tenantName || '', valueX, y);
  doc.setLineWidth(0.3);
  doc.line(valueX, y + 0.8, lineEndX, y + 0.8);

  y += 9;

  // NIF + Andar/Fração na mesma linha
  doc.setFont('helvetica', 'normal');
  doc.text('NIF', labelX, y);
  doc.text(tenant?.nif || recibo.pagadorNif || '', labelX + 12, y);
  doc.line(labelX + 12, y + 0.8, labelX + 60, y + 0.8);

  doc.text('Andar/Fração:', labelX + 75, y);
  doc.text(tenant?.fraction || '', labelX + 100, y);
  doc.line(labelX + 100, y + 0.8, lineEndX, y + 0.8);

  y += 9;

  // a importância de
  doc.text('a importância de', labelX, y);
  doc.text(valorPorExtenso(recibo.valor_centimos || 0), valueX, y);
  doc.line(valueX, y + 0.8, lineEndX, y + 0.8);

  y += 9;

  // referente a
  doc.text('referente a', labelX, y);
  doc.text(descricao, valueX, y);
  doc.line(valueX, y + 0.8, lineEndX, y + 0.8);

  // ─── VALOR GRANDE (canto inferior esquerdo) ───
  const valorStr = `${formatValor(recibo.valor_centimos || 0)} €`;
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(valorStr, labelX + 4, BOX_Y + BOX_H - 12);

  // ─── CARIMBO ROTACIONADO (canto inferior direito) ───
  // O carimbo é colocado bem no canto inferior direito, fora do espaço do "A administração"
  const stampCenterX = BOX_X + BOX_W - 32;
  const stampCenterY = BOX_Y + BOX_H - 14;
  desenharCarimbo(doc, cond, stampCenterX, stampCenterY);

  // "A administração" · acima do carimbo, fora da caixa do carimbo
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COR_PRETA);
  doc.text('A administração', BOX_X + BOX_W - 60, BOX_Y + BOX_H - 26);

  // Rodapé · pequena nota
  doc.setFontSize(7);
  doc.setTextColor(140, 140, 140);
  const geradoEm = new Date().toLocaleString('pt-PT');
  doc.text(`Documento gerado por Gestão do Condomínio AR24 · ${geradoEm}`, PAGE_W / 2, 290, { align: 'center' });
}

function formatarDataLinha(iso, localidade) {
  if (!iso) return '';
  return `${capitalize(localidade || 'Amadora')}, ${dataPorExtenso(iso)}`;
}

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function formatValor(centimos) {
  const v = (centimos / 100).toFixed(2).replace('.', ',');
  // Adicionar separador de milhares
  const [int, dec] = v.split(',');
  const intWithSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${intWithSep},${dec}`;
}

/**
 * Desenha o carimbo "Condomínio + morada + NIF" rotacionado.
 * Replica visualmente o carimbo do template v3.0.
 */
function desenharCarimbo(doc, cond, centerX, centerY) {
  const ANGLE_DEG = -8;
  const w = 52, h = 18;

  doc.setDrawColor(...COR_AZUL);
  doc.setTextColor(...COR_AZUL);
  doc.setLineWidth(0.5);

  // 2 retângulos concêntricos rotacionados (borda dupla azul)
  retanguloRotacionado(doc, centerX, centerY, w, h, ANGLE_DEG);
  retanguloRotacionado(doc, centerX, centerY, w - 1.8, h - 1.8, ANGLE_DEG);

  // 4 linhas de texto, centradas, rotacionadas
  const linhas = [
    { texto: 'CONDOMÍNIO',                                              bold: true,  size: 7.5 },
    { texto: cond.morada,                                                bold: false, size: 7   },
    { texto: `${cond.codigoPostal} ${capitalize(cond.localidade)}`,      bold: false, size: 7   },
    { texto: `NIF: ${formatarNif(cond.nif)}`,                            bold: true,  size: 7   }
  ];

  const rad = ANGLE_DEG * Math.PI / 180;
  const sinA = Math.sin(rad), cosA = Math.cos(rad);
  const lineHeight = 2.9;
  const startOffset = -((linhas.length - 1) * lineHeight) / 2;

  linhas.forEach((linha, i) => {
    const offY = startOffset + i * lineHeight;
    // Posição da linha (centro do texto) rotacionada
    const x = centerX - offY * sinA;
    const y = centerY + offY * cosA;
    doc.setFont('helvetica', linha.bold ? 'bold' : 'normal');
    doc.setFontSize(linha.size);
    doc.text(linha.texto, x, y, { angle: -ANGLE_DEG, align: 'center' });
  });

  // Resetar cor para o resto do documento
  doc.setTextColor(...COR_PRETA);
  doc.setDrawColor(...COR_PRETA);
}

/** Desenha retângulo com rotação em torno do centro. */
function retanguloRotacionado(doc, cx, cy, w, h, angleDeg) {
  const rad = angleDeg * Math.PI / 180;
  const c = Math.cos(rad), s = Math.sin(rad);
  const corners = [
    [-w / 2, -h / 2],
    [+w / 2, -h / 2],
    [+w / 2, +h / 2],
    [-w / 2, +h / 2]
  ].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);

  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    doc.line(a[0], a[1], b[0], b[1]);
  }
}

function formatarNif(nif) {
  if (!nif) return '';
  const s = String(nif).replace(/\s/g, '');
  if (s.length !== 9) return s;
  return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 9)}`;
}
