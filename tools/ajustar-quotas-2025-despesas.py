"""
Ajustes do Ricardo (v1.0.12):
 1. 2025 quotas: forçar todos pagos. Sílvia mantém só 283€ pagos (em falta 149€)
 2. Adicionar meta.config.dividasAnoAnterior para mostrar dívida arrastada
 3. Despesas: remover 2024, manter só 2025 e 2026
"""
import json
from datetime import datetime
from collections import Counter

SEED = "/home/claude/GestaoCondominioAR24/data/seed-historico.json"
MES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
          'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

# Quotas mensais 2025 (do Excel L5)
QUOTA_2025 = {
    'cond_02': 3700, 'cond_01': 3200, 'cond_04': 3600, 'cond_03': 4800,
    'cond_06': 3600, 'cond_05': 4900, 'cond_08': 3600, 'cond_07': 4700,
    'cond_10': 3600, 'cond_09': 5100,
}

with open(SEED) as f:
    data = json.load(f)

tenants_map = {t['id']: t for t in data['tenants']}

# 1. Apagar TODOS os recibos virtuais de quota 2025 (vou regenerar)
n_antes = len(data['receipts'])
data['receipts'] = [r for r in data['receipts'] if not (r['tipo']=='quota' and r.get('ano')=='2025' and r.get('historico'))]
print(f"Apagados recibos virtuais 2025: {n_antes - len(data['receipts'])}")

# 2. Re-gerar 2025: todos com 12 meses pagos, Sílvia parcial (283€)
contador_seq = max((int(r['recibo_numero'].split('/')[0].replace('H','').replace('RCB ','').strip())
                    for r in data['receipts'] if r.get('ano')=='2025' and r['recibo_numero'].startswith('H')), default=0)

novos_2025 = []
for tid, qm in QUOTA_2025.items():
    tenant = tenants_map[tid]
    if tid == 'cond_04':  # Sílvia
        # 283€ = 7 × 36 + 31€ (Mar 2025 ficou parcial conforme Excel L24)
        # Cobre Jan, Fev, Mar (parcial 31), Abr, Mai, Jun, Jul, Ago → 7 meses inteiros + 1 parcial
        # Falta: 5€ restante de Mar + Set + Out + Nov + Dez = 5 + 4×36 = 149€ ✓
        pagamentos = [
            (1, 3600), (2, 3600), (3, 3100),  # Mar parcial 31€
            (4, 3600), (5, 3600), (6, 3600), (7, 3600), (8, 3600),
            # Set-Dez ficam em falta (4 × 36 = 144) + 5€ de Mar = 149€ em falta
        ]
    else:
        # 12 meses pagos com quota_mensal
        pagamentos = [(m, qm) for m in range(1, 13)]

    for mes, val_cent in pagamentos:
        contador_seq += 1
        novos_2025.append({
            'id': f'rcb_h_2025_{contador_seq:03d}',
            'recibo_numero': f'H{contador_seq:03d}/ADM2025',
            'ano': '2025',
            'tenantId': tid,
            'tenantName': tenant['name'],
            'fraction': tenant.get('fraction', ''),
            'data': f"2025-{mes:02d}-15",
            'valor_centimos': val_cent,
            'mesReferencia': [f"2025-{mes:02d}"],
            'descricao': f'Quota mensal {MES_PT[mes-1]} 2025' + (' (parcial)' if val_cent < QUOTA_2025[tid] else ''),
            'tipo': 'quota',
            'criadoEm': datetime(2025, mes, 15).timestamp() * 1000,
            'historico': True,
        })

data['receipts'].extend(novos_2025)
print(f"Novos recibos 2025: {len(novos_2025)}")

# Validar Sílvia 2025
silvia_2025 = [r for r in novos_2025 if r['tenantId']=='cond_04']
total_silvia = sum(r['valor_centimos'] for r in silvia_2025)
em_falta_silvia = 432_00 - total_silvia  # 432€ = 12×36
print(f"Sílvia 2025: pagou {total_silvia/100:.2f}€ · em falta neste ano: {em_falta_silvia/100:.2f}€")

# 3. Adicionar dívida arrastada (55€ de pré-2025 + 5€ de Mar 2025 não detectado pela matriz mensal)
# O Excel mostra 149€ em divida final. Como cobrimos 283€ dos 432€ esperados, faltam 149€ exatos!
# Não precisa de mecanismo extra · matriz já mostra os 149€ em falta.
# Mas o Ricardo quer também ver isto destacado na vista 2026.
data['meta']['config']['dividasAnoAnterior'] = {
    '2026': {  # ano corrente em que aparece a dívida
        'cond_04': {
            'tenantId': 'cond_04',
            'tenantName': 'Sílvia Gonçalves',
            'fraction': '1.º Direito',
            'valor_centimos': 14900,
            'origem': 'Quotas em atraso de 2025',
            'detalhe': '5€ parcial de Março 2025 + 144€ (Set-Dez 2025)',
        }
    }
}
print(f"Dívida arrastada 2026 registada: 149€ Sílvia")

# 4. Remover despesas 2024
n_desp_antes = len(data['pagamentosDespesa'])
data['pagamentosDespesa'] = [d for d in data['pagamentosDespesa'] if not d['data'].startswith('2024')]
print(f"Despesas 2024 removidas: {n_desp_antes - len(data['pagamentosDespesa'])}")
print(f"Despesas restantes (2025+2026): {len(data['pagamentosDespesa'])}")

# Salvar
with open(SEED, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

# Sanity: contagens
print(f"\n=== ESTADO FINAL ===")
tipos = Counter(r['tipo'] for r in data['receipts'])
print(f"Recibos: {dict(tipos)}")
por_ano = Counter(r.get('ano','?') for r in data['receipts'])
print(f"Recibos por ano: {dict(por_ano)}")
por_ano_d = Counter(d['data'][:4] for d in data['pagamentosDespesa'])
print(f"Despesas por ano: {dict(por_ano_d)}")
