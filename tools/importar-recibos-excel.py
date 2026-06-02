"""
Importa recibos do Excel exportado pela app antiga: recibos-condominio-completo-2026-05-26.xlsx
Substitui os recibos no seed-historico.json mantendo o resto.
"""
import openpyxl
import json
import re
from datetime import datetime
import os

EXCEL = "/mnt/user-data/uploads/recibos-condominio-completo-2026-05-26.xlsx"
SEED  = "/home/claude/GestaoCondominioAR24/data/seed-historico.json"

# Mapear NIF → tenant_id
NIF_TO_TENANT = {
    '129465380': 'cond_01',  # João Vaz
    '219481342': 'cond_02',  # Filipe Solha
    '209959746': 'cond_03',  # Leonel Venâncio
    '195084381': 'cond_04',  # Sílvia Gonçalves
    '214490041': 'cond_05',  # Ricardo Cordeiro
    '101744137': 'cond_06',  # António Figueiredo
    '195611004': 'cond_07',  # Nuno Silva
    '127143980': 'cond_08',  # Lurdes Serafim
    '182258637': 'cond_09',  # José Carlos Monteiro
    '178132730': 'cond_10',  # Vitor Barata
}

# Nomes EXATOS como no Excel (para atualizar tenants)
NIF_TO_NAME = {
    '129465380': 'João Vaz',
    '219481342': 'Filipe Solha',
    '209959746': 'Leonel Venâncio',
    '195084381': 'Sílvia Gonçalves',
    '214490041': 'Ricardo Nabais Cordeiro',
    '101744137': 'António José Figueiredo',
    '195611004': 'Nuno Pereira Silva',
    '127143980': 'Lurdes Serafim',
    '182258637': 'José Carlos Monteiro',
    '178132730': 'Ana Isabel Barata',
}

MESES = {
    'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4,
    'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8,
    'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12,
}
ABREV_MESES = {
    'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6,
    'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12,
}

def _todos_meses(desc_low):
    """Retorna todos os números de mês mencionados (full ou abrev)."""
    encontrados = set()
    for nome, num in MESES.items():
        if re.search(rf'\b{nome}\b', desc_low):
            encontrados.add(num)
    # Abreviaturas (só se o mês completo não foi encontrado para evitar dup)
    if not encontrados:
        for ab, num in ABREV_MESES.items():
            if re.search(rf'\b{ab}\.?\b', desc_low):
                encontrados.add(num)
    return sorted(encontrados)

def extrair_mes_referencia(desc, data_recibo):
    """Heurística para extrair mes(es) de referência da descrição."""
    if not desc:
        return [f"{data_recibo.year}-{data_recibo.month:02d}"]
    desc_low = desc.lower()

    # Ano explícito (4 dígitos)
    ano_match = re.search(r'\b(20\d{2})\b', desc_low)
    ano_target = int(ano_match.group(1)) if ano_match else data_recibo.year

    # Padrão range "Janeiro a Maio" ou "Jan a Mai" ou "Jan-Mar" ou "Jan/Maio"
    # 1) "Jan-Mar" ou "Jan-Maio"
    m = re.search(r'\b(\w{3,9})\s*[-–/]\s*(\w{3,9})\b', desc_low)
    if m:
        a, b = m.group(1), m.group(2)
        mes_a = MESES.get(a) or ABREV_MESES.get(a.rstrip('.'))
        mes_b = MESES.get(b) or ABREV_MESES.get(b.rstrip('.'))
        if mes_a and mes_b and mes_a <= mes_b:
            return [f"{ano_target}-{m:02d}" for m in range(mes_a, mes_b + 1)]

    # 2) "Janeiro a Maio"
    m = re.search(r'(\w+)\s+(?:a|até)\s+(\w+)', desc_low)
    if m:
        mes_a = MESES.get(m.group(1))
        mes_b = MESES.get(m.group(2))
        if mes_a and mes_b and mes_a <= mes_b:
            return [f"{ano_target}-{n:02d}" for n in range(mes_a, mes_b + 1)]

    # Lista de meses individuais
    meses = _todos_meses(desc_low)
    if meses:
        return [f"{ano_target}-{m:02d}" for m in meses]

    # Fallback: "Quota mensal" sem mês explícito → usa mês da data
    if 'quota' in desc_low and ('mensal' in desc_low or 'ordinária' in desc_low):
        return [f"{data_recibo.year}-{data_recibo.month:02d}"]

    return []

def determinar_tipo(desc):
    if not desc:
        return 'outro'
    desc_low = desc.lower()
    if 'reparação' in desc_low or 'elevador' in desc_low or 'obras' in desc_low or 'suplementar' in desc_low:
        return 'prestacao'
    if 'quota' in desc_low:
        return 'quota'
    return 'outro'

# Carregar snapshot existente
with open(SEED, 'r', encoding='utf-8') as f:
    snapshot = json.load(f)

# Ler Excel
wb = openpyxl.load_workbook(EXCEL, data_only=True)
ws = wb['Recibos']

recibos_novos = []
max_por_ano = {}
nao_mapeados = []
sem_mesref = []

for row in ws.iter_rows(min_row=6, values_only=True):
    num, data, nome, fracao, nif, desc, valor, extenso = row[:8]
    if num is None or num == 'TOTAL':
        continue
    if not isinstance(data, datetime):
        continue
    if not nif:
        nao_mapeados.append((num, nome))
        continue
    nif_str = str(nif).strip()
    tenant_id = NIF_TO_TENANT.get(nif_str)
    if not tenant_id:
        nao_mapeados.append((num, f"NIF {nif_str}"))
        continue

    # Extrair ano do número
    m_num = re.search(r'(\d+)/ADM(\d{4})', num)
    if not m_num:
        nao_mapeados.append((num, "formato número inválido"))
        continue
    n_recibo = int(m_num.group(1))
    ano_recibo = m_num.group(2)
    max_por_ano[ano_recibo] = max(max_por_ano.get(ano_recibo, 0), n_recibo)

    valor_cent = int(round(float(valor) * 100))
    mes_ref = extrair_mes_referencia(desc, data)
    tipo = determinar_tipo(desc)

    if not mes_ref:
        sem_mesref.append((num, desc))

    recibo_id = f"rcb_{ano_recibo}_{n_recibo:03d}"
    recibos_novos.append({
        'id': recibo_id,
        'recibo_numero': num,           # 'RCB 001/ADM2024' tal qual
        'ano': ano_recibo,
        'tenantId': tenant_id,
        'tenantName': nome or '',       # nome EXATO do recibo (pode diferir do nome canónico do tenant)
        'fraction': fracao or '',       # fração cached para o modal
        'data': data.strftime('%Y-%m-%d'),
        'valor_centimos': valor_cent,
        'mesReferencia': mes_ref,
        'descricao': desc,
        'tipo': tipo,
        'criadoEm': data.timestamp() * 1000,
    })

# Atualizar nomes dos tenants para o EXATO do Excel
for t in snapshot['tenants']:
    if t['nif'] in NIF_TO_NAME:
        t['name'] = NIF_TO_NAME[t['nif']]

# Substituir recibos
snapshot['receipts'] = sorted(recibos_novos, key=lambda r: (r['ano'], int(r['recibo_numero'].split('/')[0].replace('RCB ', ''))))

# Atualizar nextNumberByYear
snapshot['meta']['config']['nextNumberByYear'] = {
    ano: max_num + 1 for ano, max_num in max_por_ano.items()
}

# Atualizar info
snapshot['__importInfo']['recibos_origem'] = 'Excel exportado pela app antiga'
snapshot['__importInfo']['contagens']['receipts'] = len(recibos_novos)

with open(SEED, 'w', encoding='utf-8') as f:
    json.dump(snapshot, f, ensure_ascii=False, indent=2)

print(f"✓ {len(recibos_novos)} recibos importados do Excel")
print(f"  Numeração alinhada · próximo número por ano:")
for ano, n in sorted(snapshot['meta']['config']['nextNumberByYear'].items()):
    print(f"    {ano}: {n}")

if nao_mapeados:
    print(f"\n⚠ {len(nao_mapeados)} recibos NÃO mapeados:")
    for n in nao_mapeados[:5]:
        print(f"    {n}")

if sem_mesref:
    print(f"\n⚠ {len(sem_mesref)} recibos sem mesReferencia (provavelmente prestações):")
    for n in sem_mesref[:5]:
        print(f"    {n[0]}: {n[1][:60]}")

print(f"\n✓ Snapshot atualizado: {SEED}")
print(f"  Tamanho: {os.path.getsize(SEED)/1024:.1f} KB")
