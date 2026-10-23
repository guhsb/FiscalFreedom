# Freedom Fiscal

App da Freedom Tech para PC (Windows, `.exe`) e celular (Android, `.apk`) integrado à [API do Tributei](https://tributei.readme.io).

## Ferramentas

O app testa sozinho o que a sua chave do Tributei libera (Configurações › Verificar acessos, e automaticamente a cada 7 dias). Ferramentas sem acesso ficam cinza. Com uma chave que só tem a **Simulação rápida**, funcionam: calculadora, simulador, auditoria, preços e a conferência de notas (item a item).

| # | Ferramenta | O que faz | API do Tributei usada |
|---|---|---|---|
| ◆ | Margens e orçamentos | Por rede (Rede Sander já cadastrada com 40 itens e 90 lojas; dá para criar outras e importar lojas por CSV). Custo vem do CSV de Produtos do sistema (PRECOCUSTO), fica só no aparelho. Margem líquida = preço − ICMS próprio − custos variáveis (PIS/COFINS, comissão, frete, financeiro, verba, inadimplência…) − custo. Modo fácil com barra "para onde vai o dinheiro", botões mais barato/mais caro e margem alvo. Orçamento em PDF para o cliente (só Qtd, Vlr unit., Vlr total, ICMS-ST e DIFAL quando houver; PR, SP, RS, SC e RJ saem livres por terem filial). O PDF guarda os dados e, jogado de volta, mostra o que mudou e reabre o orçamento | `POST /simulador/pedidos/novo` (opcional, para conferir o ST) |
| ★ | Calculadora de pedidos | A antiga *Calculadora de ICMS-ST* (consulta_ncm_com_pdf.html) dentro do app: busca no cadastro (2.006 produtos, 266 NCMs), 1 produto ou pedido inteiro (CSV do sistema ou PDF de orçamento), ICMS-ST, FCP-ST, antecipação e DIFAL. Cada cálculo é conferido no Tributei (tabela × Tributei) e a MVA confirmada fica salva e passa na frente das estimativas. Cadastro atualizado por CSV fica salvo no aparelho | `POST /simulador/pedidos/novo` (1 consulta por NCM do pedido) |
| 0 | Simulação rápida | Todos os campos da API (venda/compra, ST/DIFAL, frete, IPI, descontos, Simples, regra MT, crédito SP), várias UFs de uma vez, cálculo automático, MVA original e aplicada e memória de cálculo. Sem chave ou sem internet, calcula com a tabela de MVA da ficha | `POST /simulador/pedidos/novo` |
| 1 | Simulador de ICMS-ST | MVA, % de ST e quem recolhe nas 27 UFs para cabos, carregadores, fones e suportes | `POST /simulador/pedidos/novo/lote` (e `/novo`) |
| 2 | Auditoria do sistema | Compara o CST cadastrado no sistema com o ST do Tributei e lista as divergências | resultado do simulador |
| 3 | Tabela de preços por UF | Custo + ICMS-ST de cada produto em cada estado; importa a ficha `.xlsx` | resultado do simulador |
| 4 | Conferir notas de saída | Lê o XML, confere CST e ST item a item e pede o cálculo oficial | `POST /calculo/xml/{DIFAL}` (saídas) |
| 5 | Conferir notas de entrada | Aponta compras de fora do estado sem ST e calcula ST/DIFAL de entrada | `POST /calculo/xml/{DIFAL}` (entrada) |
| 6 | Guias | Lista, emite e arquiva guias; manda notas para a área de guias | `/{cnpj}/guia/...` |
| 7 | Relatório de ICMS-ST | Total de ST do ano por UF e por mês, com exportação | `GET /{cnpj}/{ano}/{uf}/nfe/icmsst` |

Tudo segue a identidade visual Freedom (tema claro padrão, escuro automático).

## Como gerar os instaladores (sem instalar nada no PC)

1. Crie um repositório no GitHub e envie esta pasta inteira (inclusive a pasta `.github`).
2. A cada envio para a branch `main`, o GitHub monta os apps sozinho (aba **Actions** › "Gerar apps"). Leva uns 10 minutos.
3. Ao terminar, abra a execução e baixe em **Artifacts**:
   - `FreedomFiscal-Windows`: instalador (`Freedom Fiscal Setup 1.0.0.exe`) e versão portátil (`FreedomFiscal-portatil-1.0.0.exe`).
   - `FreedomFiscal-Android`: `FreedomFiscal.apk`.
4. Para publicar uma versão oficial com os arquivos na página **Releases**, crie uma tag: `git tag v1.0.0 && git push --tags`.

### Instalar
- **Windows:** rode o `.exe`. Como o app não tem certificado de assinatura, o Windows pode mostrar "O Windows protegeu o computador": clique em *Mais informações › Executar assim mesmo*.
- **Android:** copie o `.apk` para o celular e abra. Permita "instalar apps desconhecidos" para o gerenciador de arquivos quando o Android pedir.
- **iPhone:** não incluso (a Apple exige Mac e conta de desenvolvedor paga).

## Primeiro uso

1. No Tributei: **Perfil › Integração** › copie a **API Key**.
2. No app: **Configurações** (engrenagem) › cole a chave › **Testar conexão**.
3. Confira CNPJ, UF (PR), ano e a regra do MT (padrão: art. 2º-B "Demais").

A chave dá acesso total à conta do Tributei. No PC ela fica criptografada pelo Windows; no celular, só dentro do app. Não coloque a chave no código nem no GitHub.

## Rodar no computador (para quem for mexer no código)

```bash
npm install
npm run dev        # abre no navegador (a API pode bloquear por CORS; use o app)
npm run desktop    # abre o app de PC
```

## Versão web (GitHub Pages)

O mesmo workflow publica o app no GitHub Pages a cada push na `main`. Ative uma vez: **Settings › Pages › Source: GitHub Actions**. O endereço aparece no job "Publicar web".
- Repositório privado precisa de plano pago do GitHub para ter Pages, e a página publicada fica acessível para quem tiver o link.
- No navegador o Tributei pode bloquear as chamadas (CORS). Se acontecer, a web usa as tabelas da Freedom e o app de PC/celular continua com o Tributei.

## Produtos e custos embutidos

`tools/embutir-produtos.mjs` gera, a partir do CSV de Produtos do sistema, o cadastro (`src/motor/base-fiscal.json`) e os custos criptografados (`src/redes/custos.enc.json`, AES-GCM com senha). Para atualizar:

```bash
node tools/embutir-produtos.mjs Produtos.csv "SENHA"
```

Os custos só abrem no app com a senha (uma vez por aparelho). Nunca vão para o PDF do orçamento.

## Ligar e desligar pelo GitHub

O app lê o mesmo `controle.json` dos outros apps Freedom (repositório `guhsb/APPS-FREEDOM`, branch `main`) toda vez que abre, ao voltar para a tela e a cada 15 minutos.

| Para… | Mude no `controle.json` |
|---|---|
| Desligar **todos** os apps Freedom | `"bloqueado": true` |
| Desligar **só o Freedom Fiscal** | `"bloquear": ["fiscal"]` |
| Obrigar a atualizar | `"versaoMinima": "1.1.0"` (vale para versões abaixo) |
| Mostrar um recado na tela de bloqueio | `"mensagem": "Manutenção até 14h."` |

Sem internet, vale o último estado lido: se estava desligado, continua desligado.

## Observações

- A documentação do Tributei não mostra o formato das respostas. O app procura os campos pelo nome (MVA, valor do ICMS-ST, quem recolhe etc.) e sempre mostra a **Resposta completa** no fim de cada tela. Se algum número não aparecer, copie essa resposta e ajuste `src/extrair.js`.
- A tabela de CST do sistema e a lista de produtos vêm da ficha *Bazar Cable Box* revisada em 22/10/2026 e podem ser editadas no próprio app.
- Filiais com venda de dentro do estado: PR, RJ e SP (CE inativa). Para mudar, edite `FILIAIS` em `src/data.js`.

## Estrutura

```
src/            telas e lógica (JavaScript puro + Vite)
  screens/      uma tela por ferramenta
  api.js        chamadas à API do Tributei
  extrair.js    leitura tolerante das respostas
  xml.js        leitura do XML da NF-e
electron/       app de PC (as chamadas à API saem daqui)
assets/logo.png ícone do Android
build/icon.png  ícone do Windows
.github/workflows/build.yml   gera o .exe e o .apk
```
