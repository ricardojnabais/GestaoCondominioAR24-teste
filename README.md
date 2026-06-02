# Gestão do Condomínio AR24

Plataforma de gestão do **Condomínio Av. Amália Rodrigues, 24** (Amadora).
Sucessor do RecibosAR24 v3.0.

## Estado atual

**Versão de teste · v0.1.0** — primeira release funcional.

- Stack: HTML + CSS + JavaScript vanilla com ES Modules nativos (sem build).
- Persistência: **localStorage do browser** (versão de teste).
- Autenticação: simulada localmente.
- Próxima fase: módulos de quotas, despesas, recibos, análise.
- Fase final: migração para **Firebase Spark** para sincronização entre administradores.

## Estrutura

```
.
├── index.html                  Entry point
├── styles/main.css             Sistema de design azul/branco/cards
├── js/
│   ├── app.js                  Bootstrap
│   ├── store/                  Persistência (localStorage)
│   ├── auth/                   Autenticação
│   ├── ui/                     Componentes de interface
│   └── modules/                Lógica de negócio (próxima fase)
└── README.md
```

## Como testar localmente

Como a app usa ES Modules, **precisa de um servidor HTTP** — não dá só abrir
o `index.html` no browser.

**Opção A — Python (já instalado em macOS/Linux):**
```bash
cd GestaoCondominioAR24
python3 -m http.server 8000
```
Depois abrir `http://localhost:8000` no browser.

**Opção B — Node.js:**
```bash
npx serve .
```

**Opção C — Online (GitHub Pages):**
Aceder ao URL configurado.

## Como testar a app (versão de teste)

### Vista do Administrador
1. No ecrã de login, deixa a tab "Administrador" selecionada
2. Escolhe operador: `Ricardo Nabais Cordeiro` ou `Filipe Solha`
3. Clica "Entrar como Administrador"
4. Vês o menu principal com os 7 ícones.

### Vista do Condómino
1. **Primeiro tens de criar uma conta**:
   - Entra como administrador.
   - Vai a "Definições" > "Acessos Condóminos" (próxima fase).
   - **Por agora**, podes criar uma conta manualmente via consola do browser:
     ```js
     await __store.setDoc('users', {
       email: 'leonelvenancio@gmail.com',
       password: 'teste123',
       role: 'condomino',
       tenantId: 'cond_03',
       mustChangePassword: false,
       disabled: false,
       createdAt: Date.now()
     });
     ```
2. Faz logout. No login, escolhe tab "Condómino".
3. Email: `leonelvenancio@gmail.com` · Password: `teste123`
4. Clica "Entrar".

## Comandos úteis (consola do browser)

```js
// Ver todos os dados guardados
__store.exportAll()

// Apagar tudo e voltar ao estado inicial
__store.clearAll()

// Ver sessão atual
__auth.getSession()

// Logout
__auth.logout()
```

## Reset rápido para testes

Se quiseres voltar ao estado inicial limpo:
1. Abre a consola do browser (F12)
2. Executa: `__store.clearAll()`
3. A página recarrega com dados zerados.

## Roadmap

- [x] **Fase 0** · setup repo + esqueleto básico
- [x] **Fase 1** · login admin + login condómino + navegação + persistência local
- [ ] **Fase 2** · módulos críticos (quotas, recibos, registar pagamento)
- [ ] **Fase 3** · despesas + planos de pagamento
- [ ] **Fase 4** · análise + orçamento + export Excel/PDF
- [ ] **Fase 5** · vista condómino completa
- [ ] **Fase 6** · gestão de acessos + UI de criação de utilizadores
- [ ] **Fase 7** · testes finais
- [ ] **Fase 8** · migração para Firebase + lançamento
- [ ] **Fase 9** · manuais

## Licença

Uso interno do Condomínio Amália Rodrigues 24.
