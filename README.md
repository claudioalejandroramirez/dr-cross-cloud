# Plano de Contingenciamento & DR Cross-Cloud

Documento web estático para apresentação executiva e técnica de um plano de Disaster Recovery (DR) cross-cloud, com foco em leitura, edição rápida no navegador e exportação para PDF.

## Objetivo do projeto

Este repositório entrega uma página HTML única, visualmente estruturada como documento executivo, com:

- Conteúdo editável em modo de edição.
- Persistência local robusta no navegador.
- Exportação para PDF com layout otimizado para leitura.
- Deploy simples via GitHub Pages.

## Estrutura do projeto

- `index.html`: conteúdo principal do documento e painel de ações.
- `css/style.css`: tema visual, componentes e regras de impressão.
- `js/app.js`: lógica de edição, persistência e exportação.
- `.nojekyll`: garante compatibilidade no GitHub Pages para servir arquivos estáticos sem processamento Jekyll.

## Funcionalidades principais

### 1) Modo de edição

- Botão `Ativar Edição` habilita edição inline do conteúdo.
- Tabelas possuem controles para adicionar/remover linhas/colunas.
- Células de Gantt permitem ajustes visuais (cor, largura e texto).

### 2) Salvamento e persistência

Persistência foi implementada em duas camadas para reduzir risco de perda:

- `localStorage` (chave principal: `dr_plan_content_v5`)
- `IndexedDB` (banco: `dr_cross_cloud_editor`, store: `documents`, chave: `main-content`)

Além disso:

- A aplicação solicita `navigator.storage.persist()` quando suportado.
- Há auto-save durante edição com debounce.
- Existe migração automática da chave legada `dr_plan_content_v4`.

### 3) Exportação para PDF

- Botão `Exportar PDF` dispara `window.print()`.
- O modo de edição é desativado automaticamente antes da impressão.
- O CSS possui regras de `@media print` para:
  - margens A4,
  - preservação de cores,
  - redução de quebras ruins de bloco,
  - experiência de leitura mais limpa no PDF final.

## Como usar localmente

Como é um site estático, basta abrir o arquivo:

1. Abra `index.html` no navegador.
2. Clique em `Ativar Edição`.
3. Faça ajustes no texto/tabelas.
4. Clique em `Salvar Alterações`.
5. Use `Exportar PDF` quando quiser gerar uma versão para distribuição.

## Deploy no GitHub Pages

Este projeto é compatível com GitHub Pages sem backend.

### Fluxo recomendado

1. Faça commit das alterações no repositório.
2. Publique na branch configurada para Pages (geralmente `main` / root).
3. Aguarde a atualização do site (normalmente alguns minutos).

### Observação importante sobre persistência no Pages

GitHub Pages não grava conteúdo editado no servidor automaticamente (site estático).

O que fica persistente:

- Edições salvas no navegador do usuário (`localStorage` + `IndexedDB`).

O que não fica persistente sem backend:

- Gravação centralizada para todos os usuários no servidor.

## Diretrizes de edição de conteúdo

Para manter consistência do documento:

- Use o mesmo horizonte temporal em todos os blocos (ex.: trimestres).
- Alinhe narrativa textual com os períodos da tabela/Gantt.
- Evite números de custo sem referência oficial.
- Para dados de preços e vantagens, use apenas fontes oficiais dos provedores.

## Fontes oficiais (referências recomendadas)

- AWS Lambda Pricing: <https://aws.amazon.com/lambda/pricing/>
- Google Cloud Functions Pricing: <https://cloud.google.com/functions/pricing>
- Azure Functions Pricing: <https://azure.microsoft.com/en-us/pricing/details/functions/>
- Azure Event Grid Pricing: <https://azure.microsoft.com/en-us/pricing/details/event-grid/>
- OCI Networking Pricing: <https://oracle.com/cloud/networking/pricing/>
- OCI Always Free Resources: <https://docs.cloud.oracle.com/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm>
- GCS Interoperability (XML API/HMAC): <https://cloud.google.com/storage/docs/interoperability>
- OCI S3 Compatibility API: <https://docs.oracle.com/iaas/Content/Object/Tasks/s3compatibleapi.htm>
- Google Cloud Network Pricing: <https://cloud.google.com/vpc/network-pricing>
- Google Cloud Locations: <https://cloud.google.com/about/locations>

## Limitações conhecidas

- Não há autenticação/autoria por usuário.
- Não há versionamento de conteúdo no servidor.
- Persistência depende do navegador/dispositivo local.

## Próximas melhorias possíveis

- Exportação DOCX além de PDF.
- Histórico de versões local (snapshots com data/hora).
- Integração com backend (API + banco) para persistência compartilhada.
- Trilhas de auditoria (quem alterou o quê e quando).

