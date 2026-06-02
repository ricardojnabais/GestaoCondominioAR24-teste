"""
Regenera mesReferencia dos recibos baseado no Excel principal.
- Reclassifica tipo (suplementar/obras → prestacao, mantém-se 'outro' restante)
- Distribui meses do Excel pelos recibos de quota cronologicamente (greedy)
"""
import openpyxl
import json
import re
from datetime import datetime

EXCEL_PRINCIPAL = "/mnt/user-data/uploads/Contas_Condominio_2023_2026_-_actualizado_a_25-05-2026.xlsx"
SEED = "/home/claude/GestaoCondominioAR24/data/seed-historico.json"

COL_TO_TENANT = {
    1: 'cond_02', 2: 'cond_01', 3: 'cond_04', 4: 'cond_03', 5: 'cond_06',
    6: 'cond_05', 7: 'cond_08', 8: 'cond_07', 9: 'cond_10', 10: 'cond_09',
}

# Reclassificar tipo (mais preciso)
PRESTACAO_KEYS = ['suplementar', 'obras', 'elevador', 'reparação', 'reparacao', 'extraordinária']
OUTRO_KEYS = ['videoporteiro', 'video porteiro', 'reabilita']

def classificar(desc):
    if not desc: return 'outro'
    d = desc.lower()
    if any(k in d for k in OUTRO_KEYS): return 'outro'
    if any(k in d for k in PRESTACAO_KEYS): return 'prestacao'
    if 'quota' in d or 'quotização' in d: return 'quota'
    return 'outro'

# Ler Excel principal · matriz por (tenant, ano, mês) → valor_centimos
wb = openpyxl.load_workbook(EXCEL_PRINCIPAL, data_only=True)
matriz = {}  # tenant → ano → mes → valor_cent
for ano in ['2024', '2025', '2026']:
    ws = wb[f'Quotas {ano}']
    for mes_num in range(1, 13):
        row = list(ws.iter_rows(min_row=mes_num + 9, max_row=mes_num + 9, values_only=True))[0]
        for col_idx, tid in COL_TO_TENANT.items():
            val = row[col_idx]
            if val and isinstance(val, (int, float)) and val > 0:
                matriz.setdefault(tid, {}).setdefault(ano, {})[mes_num] = int(round(val * 100))

# Carregar snapshot
with open(SEED) as f:
    data = json.load(f)

# Reclassificar todos os recibos
for r in data['receipts']:
    r['tipo'] = classificar(r['descricao'])

# Para cada tenant, distribuir greedy os meses do Excel pelos recibos de quota
contagem_atribuidos = 0
contagem_sem_cobertura = 0

for tid in COL_TO_TENANT.values():
    # Lista global cronológica de (ano, mes, valor_cent) com valor > 0
    meses_a_cobrir = []
    for ano in ['2024', '2025', '2026']:
        for mes_num in sorted(matriz.get(tid, {}).get(ano, {}).keys()):
            val = matriz[tid][ano][mes_num]
            meses_a_cobrir.append((ano, mes_num, val))

    # Recibos do tenant tipo='quota' ordenados por data (de qualquer ano emissor)
    recs = [r for r in data['receipts'] if r['tenantId']==tid and r['tipo']=='quota']
    recs.sort(key=lambda r: r['data'])

    # Resetar mesReferencia
    for r in recs:
        r['mesReferencia'] = []

    # Greedy: cada recibo absorve meses do excel até saturar o valor
    idx_mes = 0
    for r in recs:
        valor_restante = r['valor_centimos']
        while idx_mes < len(meses_a_cobrir) and valor_restante > 0:
            ano_m, mes_m, val_m = meses_a_cobrir[idx_mes]
            r['mesReferencia'].append(f"{ano_m}-{mes_m:02d}")
            valor_restante -= val_m
            idx_mes += 1
            contagem_atribuidos += 1
            # Permitir parar se já cobriu próximo do valor (evitar excesso)
            if valor_restante <= 50:  # tolerância 0,50€
                break

    # Verificar lacuna
    if idx_mes < len(meses_a_cobrir):
        contagem_sem_cobertura += len(meses_a_cobrir) - idx_mes

# Limpar mesRef dos não-quota
for r in data['receipts']:
    if r['tipo'] != 'quota':
        r['mesReferencia'] = []

# Salvar
with open(SEED, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

# Stats
from collections import Counter
tipos = Counter(r['tipo'] for r in data['receipts'])
print(f"Tipos: {dict(tipos)}")
print(f"Meses atribuídos: {contagem_atribuidos}")
print(f"Meses do Excel SEM cobertura por recibo: {contagem_sem_cobertura}")
print(f"\n✓ Snapshot atualizado")
