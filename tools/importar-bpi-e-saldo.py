"""
1. Importa movimentos BPI 2024-2026 como collection 'movimentosBPI'
2. Calcula saldo inicial necessário para fechar em 8226,12€ (saldo BPI 25-Mai-2026)
"""
import openpyxl, json, re
from datetime import datetime
from collections import Counter

BPI = "/mnt/user-data/uploads/bpinet_empresas20260525124334.xlsx"
SEED = "/home/claude/GestaoCondominioAR24/data/seed-historico.json"

# Parser
wb = openpyxl.load_workbook(BPI, data_only=True)
ws = wb['Download de MOVIMENTOS']

def parse_dat(s):
    if not s: return None
    try: return datetime.strptime(s, '%d-%m-%Y').date()
    except: return None

def parse_val(s):
    if not s: return None
    try: return float(s.replace('.', '').replace(',', '.'))
    except: return None

movimentos = []
for i, row in enumerate(ws.iter_rows(values_only=True)):
    if i < 18: continue
    dm = parse_dat(row[0])
    if not dm: continue
    desc = (row[2] or '').strip()
    val = parse_val(row[3])
    saldo_apos = parse_val(row[4])
    if val is None or not desc: continue
    if dm.year < 2024: continue  # ignorar pré-2024
    movimentos.append({
        'data': dm.isoformat(),
        'descricao': desc,
        'valor_centimos': int(round(val * 100)),
        'saldo_apos_centimos': int(round(saldo_apos * 100)) if saldo_apos else None,
        'tipo': 'entrada' if val > 0 else 'saida',
    })

print(f"Movimentos BPI 2024-2026: {len(movimentos)}")
por_ano = Counter(m['data'][:4] for m in movimentos)
print(f"Por ano: {dict(por_ano)}")
total_in = sum(m['valor_centimos'] for m in movimentos if m['valor_centimos']>0)
total_out = sum(m['valor_centimos'] for m in movimentos if m['valor_centimos']<0)
print(f"Total entradas: {total_in/100:.2f} €")
print(f"Total saídas:   {total_out/100:.2f} €")
print(f"Variação líquida: {(total_in+total_out)/100:.2f} €")

# Saldo do último movimento (mais recente) = saldo banco atual
movimentos.sort(key=lambda m: m['data'])
saldo_atual_banco = movimentos[-1].get('saldo_apos_centimos') or 822612
print(f"\nSaldo banco (último mov · {movimentos[-1]['data']}): {saldo_atual_banco/100:.2f} €")

# Saldo INICIAL implicado pelos movimentos: saldo_atual - variação
saldo_inicial_2024_implicado = saldo_atual_banco - (total_in + total_out)
print(f"Saldo inicial 2024 implicado: {saldo_inicial_2024_implicado/100:.2f} €")

# Atualizar JSON
with open(SEED) as f:
    data = json.load(f)

data['movimentosBPI'] = movimentos
data['meta']['config']['saldoInicial'] = {'2024': saldo_inicial_2024_implicado}
data['meta']['config']['saldoConhecido'] = {
    'data': '2026-05-25',
    'total_centimos': 822612,
    'contaOrdem_centimos': 752178,
    'contaPoupanca_centimos': 70434,
    'fonte': 'BPI Net Empresas',
    'manual': False,
}

with open(SEED, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print(f"\n✓ {len(movimentos)} movimentos BPI gravados")
print(f"✓ Saldo inicial 2024 = {saldo_inicial_2024_implicado/100:.2f} € (para fechar em 8226,12€)")
