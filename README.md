# ⚙️ Motor de Integração: Indique e Ganhe

Este repositório contém a lógica de backend e a orquestração de dados para o programa de indicações. 

> ⚠️ **Escopo do Projeto:** Este repositório hospeda **exclusivamente o motor da aplicação** (Firebase Cloud Functions, Webhooks e integrações de API). A interface de usuário (UI), telas do formulário e o gerenciamento de estado do lado do cliente residem no repositório principal do aplicativo Flutter. O objetivo desta camada isolada é garantir a segurança das chaves de API, abstrair regras de negócio externas do front-end e manter a integridade da arquitetura de dados.

## 🎯 O que é este motor?
Uma ponte serverless construída em Node.js/TypeScript que conecta os usuários do aplicativo Gula ao funil comercial do mesmo na RD Station CRM. Ele é responsável por receber as indicações, higienizar o payload, revalidar tokens de autenticação dinamicamente e injetar os dados no CRM respeitando sua estrutura estritamente relacional (separando Contatos e Negociações).

## 🔄 Como funciona o fluxo?

O sistema opera em uma via de mão dupla entre o nosso banco de dados secundário (Firestore) e o CRM:

1. **Recepção via Callable:** O aplicativo aciona o endpoint `createReferral` (`onCall`), enviando os dados do estabelecimento e do indicador.
2. **Autorização Dinâmica:** O motor intercepta a requisição e garante um Access Token válido da RD Station antes de prosseguir.
3. **Mapeamento Relacional (Ida):**
   * Cria a entidade **Contato** (dono do restaurante) e captura o ID de retorno.
   * Cria a entidade **Negociação** (Deal) formatando os *Custom Fields* em hash e vinculando o ID do contato recém-criado.
4. **Persistência de Estado:** Os IDs de referência de ambas as plataformas são salvos no nosso Firestore secundário, criando o alicerce para rastreabilidade do lead.
5. **Rastreio via Webhooks (Volta):** O motor possui rotas que escutam as mudanças de estágio do funil na RD Station (ex: `won`, `lost`). Quando um vendedor movimenta o card, o webhook traduz os IDs, busca o motivo de perda (se aplicável) e atualiza automaticamente o status de comissão do usuário no banco de dados.

## 🛠️ Stack Tecnológico
* Node.js / TypeScript
* Firebase Cloud Functions (2nd Gen)
* Firebase Admin SDK (Firestore)
* Axios (Comunicação REST com RD Station)
