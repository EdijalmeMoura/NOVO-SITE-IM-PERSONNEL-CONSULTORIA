# IM Personnel Consultoria — site institucional e portal de oportunidades

Site institucional responsivo em português brasileiro para a IM Personnel, com portal de vagas, candidatura sem criação de conta, banco de talentos com autorização, formulário comercial/CRM e painel administrativo protegido.

## O que está incluído

- Página inicial com posicionamento, soluções, metodologia em quatro etapas, oportunidades ativas, conteúdos e chamada comercial.
- Páginas de empresa, soluções e páginas individuais para recrutamento e seleção, Executive Search/C-Level, seleção industrial, consultoria de RH, gestão de pessoas e desempenho, mapeamento de processos e gestão de negócios/processos.
- Portal de vagas com pesquisa, filtros, ordenação, paginação, estados vazios/erro/carregamento e detalhes indexáveis de oportunidades ativas.
- Candidatura sem conta obrigatória; arquivo PDF/DOCX validado por extensão, MIME, assinatura e tamanho no servidor, guardado fora da pasta pública.
- Banco de talentos com autorização explícita registrada, versão do aviso de privacidade e ação administrativa de remoção.
- Formulário empresarial conectado a um CRM simples, com etapas, responsável e observações.
- Painel protegido: dashboard baseado em dados reais, gestão de vagas (rascunho/publicação/duplicação/encerramento), candidaturas, currículo protegido, banco de talentos, leads, pedidos de privacidade, artigos e trilha de auditoria.
- Gestão editorial para conteúdos/insights; os três artigos iniciais são carregados pela aplicação e podem ser editados e despublicados no painel.
- Páginas de privacidade e preferências de cookies, sitemap dinâmico e `robots.txt`.
- E-mail transacional opcional por SMTP. Os formulários continuam registrando os dados mesmo sem SMTP configurado.
- Teste automatizado de integração para os principais fluxos do portal e do painel.

**Não há vagas, clientes, depoimentos, resultados, certificações, telefones ou endereço físico inventados.** O portal começa sem oportunidades até que uma vaga real seja cadastrada. O endereço informado no site limita-se a Recife, Pernambuco, conforme o escopo recebido. WhatsApp só aparece se um número oficial for configurado.

## Requisitos

- Node.js 22.12+ recomendado.
- npm 10+.

## Desenvolvimento local

```bash
npm ci
cp .env.example .env
npm run dev
```

A aplicação é servida em `http://localhost:5173` (ou na porta definida por `PORT`). O backend Express e o frontend Vite compartilham a mesma origem. Em desenvolvimento, os dados são gravados em `storage/im-personnel.sqlite` e os arquivos privados em `storage/private-resumes/`.

### Criar o primeiro acesso administrativo

Em um terminal interativo, execute:

```bash
npm run admin:create -- admin@empresa.com.br
```

O script solicita uma senha sem exibi-la no terminal. A senha deve ter pelo menos 14 caracteres e conter letras maiúsculas, minúsculas e números. Depois, acesse `/admin`. Não há usuário ou senha padrão embutidos no repositório. O script pode ser executado novamente para cadastrar outra conta administrativa.

### Criar o primeiro acesso administrativo sem Shell (Render ou outra plataforma sem terminal)

Quando a plataforma não oferece terminal (Shell) para executar `npm run admin:create`, o administrador inicial pode ser criado pelas variáveis de ambiente do próprio serviço. Nenhuma senha em texto puro é gravada no painel de variáveis:

1. Em um computador seguro, gere o hash da senha (mesmas regras de 14+ caracteres com maiúsculas, minúsculas e números):

   ```bash
   npm ci
   npm run admin:hash
   ```

   O script pede a senha sem exibi-la e imprime uma linha no formato `salt:digest`. Esse valor não permite recuperar a senha, mas trate-o como segredo.

2. No serviço, defina as variáveis:

   - `ADMIN_BOOTSTRAP_EMAIL`: e-mail do administrador inicial.
   - `ADMIN_BOOTSTRAP_PASSWORD_HASH`: a linha gerada no passo anterior (marque como **secreta**).

3. Publique o serviço. Na inicialização, o servidor cria o usuário (ou atualiza a senha, se o e-mail já existir com outro hash) e registra a ação na trilha de auditoria como `bootstrap`. A mensagem `Administrador inicial criado...` aparece nos logs. Depois acesse `/admin`.

Regras de comportamento:

- Sem as duas variáveis, nada acontece. Definir somente uma delas, um e-mail inválido ou um hash fora do formato faz o servidor **recusar a inicialização** com mensagem explícita nos logs.
- A operação é idempotente: reinicializações com as mesmas variáveis não duplicam a conta.
- Para trocar a senha desse acesso, gere um novo hash e substitua a variável; no próximo start a senha do e-mail é atualizada.
- **Se o banco não estiver em disco persistente**, a conta é recriada a cada reinício a partir dessas variáveis, portanto mantenha-as definidas. Com disco persistente, após o primeiro acesso elas podem ser removidas.

### Testes

```bash
npm test
```

O comando compila o frontend e executa um servidor de teste isolado com uma base temporária. O fluxo cobre: ausência inicial de vagas fictícias; login e proteção CSRF; criação/publicação/expiração/duplicação de vagas; busca pública; candidatura; assinatura e privacidade do upload; atualização de status; cadastro e exclusão de perfil do banco de talentos; leads e solicitações de privacidade; CMS; sitemap; trilha de auditoria e logout.

## Configuração

As variáveis estão documentadas em `.env.example`:

- `DATA_DIR` e `DB_FILE`: local da base SQLite e dos currículos privados.
- `SITE_URL` e `VITE_SITE_URL`: domínio canônico em produção.
- `ADMIN_BOOTSTRAP_EMAIL` e `ADMIN_BOOTSTRAP_PASSWORD_HASH`: administrador inicial sem Shell (veja a seção específica acima).
- `VITE_WHATSAPP_NUMBER`: número oficial no formato internacional, somente dígitos.
- `LEADS_NOTIFICATION_EMAIL`: caixa corporativa para notificações.
- `SMTP_*` e `EMAIL_FROM`: configuração de e-mail transacional.
- `APPLICATION_RETENTION_DAYS`, `TALENT_RETENTION_DAYS`, `LEAD_RETENTION_DAYS`, `PRIVACY_REQUEST_RETENTION_DAYS` e `AUDIT_RETENTION_DAYS`: prazos em dias definidos pela IM Personnel.

**O servidor recusa inicialização com `NODE_ENV=production` se algum prazo de retenção estiver ausente ou inválido.** Os valores devem ser definidos e aprovados pela pessoa responsável por privacidade, não copiados sem análise. A rotina de descarte remove registros vencidos e currículos associados na inicialização e uma vez ao dia. Pedidos de exclusão/retirada de autorização também podem ser encaminhados manualmente no painel.

## Persistência de dados no Render

**Os dados da aplicação não são um banco gerenciado do Render.** A aplicação grava em um arquivo SQLite (`DATA_DIR/DB_FILE`) e em `DATA_DIR/private-resumes/`. O Render Postgres, mesmo sendo persistente, não é usado por este código.

Por padrão, serviços web do Render têm sistema de arquivos **efêmero**: qualquer reinício, novo deploy ou troca de instância apaga o arquivo SQLite, os currículos e todas as candidaturas, leads e artigos. Para evitar isso:

- Use um serviço web **pago** (o plano Free não suporta disco persistente nem Shell).
- Anexe um **Persistent Disk** com mount path, por exemplo, `/var/data`.
- Defina `DATA_DIR=/var/data`. Sem essa variável, o padrão `./storage` fica dentro da pasta da aplicação e **não** é persistente.
- Lembre-se: discos não são acessíveis em build command, pre-deploy command nem em jobs one-off, por isso o bootstrap acima roda na inicialização do próprio servidor. Adicionar disco impede deploys sem indisponibilidade e restringe o serviço a uma instância.
- Faça backup do disco e dos currículos conforme a seção de backup abaixo.

Antes de publicar, confirme no painel do Render, em **Disk** do serviço, que o disco está ativo, que o mount path coincide com `DATA_DIR` e que o plano é pago. Crie uma candidatura de teste, reinicie o serviço e confirme que ela continua disponível.

## Build e publicação

```bash
npm run build
npm start
```

O servidor escuta em `0.0.0.0` e usa `PORT` (padrão 5173). Configure um proxy reverso com HTTPS, limite o acesso administrativo, mantenha o diretório de dados em volume persistente e configure `NODE_ENV=production`, URL canônica, e-mail e prazos de retenção aprovados. O modo produção adiciona cookies `Secure`, cabeçalhos de segurança e bloqueio de enquadramento. O servidor confia em um proxy reverso (`trust proxy = 1`); ajuste essa premissa se a infraestrutura usar outra topologia.

### Arquitetura e limites operacionais

- Frontend: React 19, TypeScript, Vite, React Router e componentes Lucide; fontes DM Sans e Manrope são servidas localmente.
- Backend: Express 5, API na mesma origem, sessão administrativa por cookie `HttpOnly`/`SameSite=Strict`, token CSRF, limitação de tentativas, `scrypt` para senhas e trilha de auditoria.
- Persistência: SQLite compilado para WebAssembly (`sql.js`) com arquivo binário persistente, sem dependência de módulos nativos. É adequado a uma instância de baixo volume; **não compartilhe a mesma base de arquivo entre réplicas e não use NFS como substituto de um banco distribuído**. Para maior concorrência/escala, migre o adaptador para PostgreSQL/MySQL gerenciado.
- Sessões são mantidas em memória e terminam ao reiniciar o processo. Operação prevista em uma instância. Para múltiplas instâncias, substitua por store de sessão compartilhado e banco transacional central.
- Currículos ficam em `DATA_DIR/private-resumes`, fora de `public/` e acessíveis somente por endpoint administrativo autenticado. O servidor limita uploads a 5 MB e aceita apenas PDF/DOCX. Proteja também o volume do servidor, use criptografia de disco em produção e restrinja os backups.
- O banco não cifra cada campo individualmente. Use armazenamento de produção com criptografia em repouso, controles de acesso e política de backup/rotação.
- Todos os usuários criados pelo utilitário têm acesso administrativo completo. Gestão granular de papéis e permissões não está habilitada nesta primeira entrega; crie acessos somente para pessoas autorizadas.
- A área de candidato com conta, autenticação própria e recuperação de senha foi deixada opcional/desabilitada: a candidatura e o banco de talentos funcionam sem criar conta.

### Backup e recuperação

Faça backup consistente do arquivo SQLite e de `private-resumes/` como um conjunto, com retenção e acesso restritos. Para uma cópia manual simples, pare o processo e copie ambos para armazenamento protegido. Na restauração, mantenha a relação entre os nomes aleatórios dos arquivos e as chaves da base; teste a restauração em ambiente separado antes de substituir produção. Documente responsável, frequência, criptografia, retenção e procedimento de recuperação para a operação real.

## Validações necessárias antes da publicação institucional

1. Aprovar bases legais por finalidade, prazos e critérios de descarte, operadores, canal oficial para titulares e o texto final do Aviso de Privacidade.
2. Confirmar telefone/WhatsApp, e-mail corporativo, endereço institucional completo, links sociais e dados de contato.
3. Validar a metodologia de quatro etapas, textos de serviço e artigos editoriais.
4. Definir o SMTP, endereço que recebe leads e modelos de notificação.
5. Configurar prazos aprovados no ambiente de produção, HTTPS, domínio, backups, monitoramento e controles operacionais.
6. Cadastrar vagas reais e revisar requisitos, benefícios, autorização de publicação, data de encerramento e aviso de privacidade aplicável.

O conteúdo institucional foi produzido como base original de projeto; a aprovação da IM Personnel é necessária antes de tratá-lo como publicação final.
