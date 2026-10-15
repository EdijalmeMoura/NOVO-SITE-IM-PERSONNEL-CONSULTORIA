# IM Personnel Consultoria — site institucional e portal de oportunidades

Site institucional responsivo em português brasileiro para a IM Personnel, com portal de vagas, candidatura sem criação de conta, banco de talentos com autorização, formulário comercial/CRM e painel administrativo protegido.

## O que está incluído

- Página inicial com posicionamento, soluções, metodologia em quatro etapas, oportunidades ativas, conteúdos e chamada comercial.
- Páginas de empresa, soluções e páginas individuais para recrutamento e seleção, Executive Search/C-Level, seleção industrial, consultoria de RH, gestão de pessoas e desempenho, mapeamento de processos e gestão de negócios/processos.
- Portal de vagas com pesquisa, filtros, ordenação, paginação, estados vazios/erro/carregamento e detalhes indexáveis de oportunidades ativas.
- Candidatura sem conta obrigatória; arquivo PDF/DOCX validado por extensão, MIME, assinatura e tamanho no servidor, guardado fora da pasta pública.
- Banco de talentos com autorização explícita registrada, versão do aviso de privacidade e ação administrativa de remoção.
- Formulário empresarial conectado a um CRM simples, com etapas, responsável e observações.
- Painel protegido: dashboard baseado em dados reais, gestão de vagas (rascunho/publicação/duplicação/encerramento), candidaturas, currículo protegido, banco de talentos, leads, pedidos de privacidade, artigos, **slides da página inicial**, **notificações por e-mail**, usuários administrativos e trilha de auditoria.
- Gestão editorial para conteúdos/insights; os três artigos iniciais são carregados pela aplicação e podem ser editados e despublicados no painel, com **imagem de capa opcional** por conteúdo (JPG, PNG, WebP ou AVIF até 5 MB, validada por assinatura no servidor, com texto alternativo e saída no sitemap/dados estruturados).
- **Gestão de usuários administrativos no painel**: criar contas com nome e senha forte, desativar e reativar acessos, trocar senhas e acompanhar o último acesso. Desativar derruba na hora a sessão aberta e bloqueia novo login, preservando a trilha de auditoria.
- **Slides da página inicial no painel**: menu *Página inicial* para editar os destaques do carrossel — etiqueta, título em várias linhas com a linha destacada, texto de apoio, botões (somente caminhos internos), rodapé, imagem de fundo opcional, ordem de exibição e ativação/desativação sem perder o conteúdo.
- **Notificações por e-mail no painel**: menu *Notificações* para configurar o servidor SMTP (host, porta, SSL/TLS, usuário, senha, remetente e caixa da equipe), testar a conexão com um envio real e revisar assunto e corpo de cada mensagem disparada pelos formulários, com variáveis como `{{nome}}`, `{{vaga}}` e `{{protocolo}}`.
- Páginas de privacidade e preferências de cookies, sitemap dinâmico e `robots.txt`.
- E-mail transacional opcional por SMTP. O que for salvo no painel tem prioridade sobre as variáveis de ambiente. Os formulários continuam registrando os dados mesmo sem SMTP configurado, e o dashboard avisa quando o SMTP ou a caixa de notificações estão desligados.
- **Saúde da entrega de e-mail**: cada tentativa de envio fica registrada e o dashboard avisa quando o último envio falhou, mostrando o erro do provedor — sem isso uma senha de SMTP expirada deixaria o candidato sem confirmação e a equipe sem o aviso, sem ninguém perceber.
- **Listas administrativas paginadas com busca no servidor**: candidaturas, banco de talentos, leads, pedidos de privacidade e auditoria informam o total real, mostram "exibindo X de Y" e permitem carregar o restante — a busca encontra registros antigos que não cabem na primeira página.
- **Exportação em CSV e backup completo**: cada lista baixa o que está filtrado na tela (ponto e vírgula, BOM e acentos preservados, prontos para o Excel em português) e o dashboard entrega um ZIP com a base, os currículos e as imagens, com instruções de restauração. Toda exportação e todo backup entram na auditoria.
- **Verificação em duas etapas (TOTP)** para a conta administrativa, com aplicativos como Google Authenticator, Authy e 1Password, mais códigos de recuperação de uso único.
- **Segredos protegidos**: a senha do SMTP gravada pelo painel fica cifrada (AES-256-GCM) no arquivo do banco quando `APP_SECRET` está definido.
- **Prévia correta ao compartilhar**: o HTML de vagas e conteúdos é montado no servidor com título, descrição, endereço canônico e imagem absoluta, para o cartão sair certo no WhatsApp, LinkedIn e Facebook.
- **Imagens leves**: as fotos escolhidas no painel são reduzidas no próprio navegador (maior lado até 1920 px, WebP) antes do envio, e o painel informa a economia obtida.
- Testes automatizados de integração para os fluxos do portal, do painel, da operação, da exportação e da segurança (20 casos, com integração contínua em `.github/workflows/ci.yml`).

**Não há vagas, clientes, depoimentos, resultados ou certificações inventados.** O portal começa sem oportunidades até que uma vaga real seja cadastrada. O endereço, telefone, WhatsApp e e-mail públicos foram informados pela solicitante e são centralizados em `src/lib/contact.ts`; revise-os com a IM Personnel antes de qualquer alteração. O primeiro slide preserva a imagem existente e os demais usam novas imagens criadas por IA para este site.

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

ou 
```bash
https://seudominio.com/configuracao-inicial/
```
Configure o primeiro acesso.
Use esta etapa somente na instalação inicial. Depois que a primeira conta for criada, os demais acessos devem ser cadastrados pela operação autorizada.


### Criar o primeiro acesso pela página de configuração

Em uma instalação nova, também é possível abrir `/configuracao-inicial` e cadastrar o primeiro administrador pelo navegador. A página exige e-mail válido e a mesma regra de senha forte do utilitário de terminal; a conta é armazenada com `scrypt` e a criação é registrada na auditoria.

Essa rota **só aceita uma criação enquanto a base não tiver nenhum administrador**; depois ela responde com conflito e o painel volta a exigir login e token CSRF para ações administrativas. Ainda assim, como uma instalação sem administrador não possui autenticação prévia, use essa página imediatamente após o deploy em uma URL protegida/restrita à equipe responsável. Para um serviço já público, prefira o bootstrap por variáveis de ambiente descrito abaixo.

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

### Ativar os formulários de contato e de currículo

Os três formulários públicos já funcionam sem configuração adicional: cada envio é validado no servidor, gravado na base e exibido no painel administrativo.

| Formulário | Rotas públicas | Endpoint | Onde a equipe acompanha |
| --- | --- | --- | --- |
| Contato / solicitar proposta | `/contato`, `/solicitar-proposta` | `POST /api/leads` | Painel › Leads empresariais |
| Candidatura a uma vaga | `/vagas/{slug}/candidatar` | `POST /api/applications` | Painel › Candidaturas |
| Currículo no banco de talentos | `/curriculo`, `/banco-de-talentos` | `POST /api/talent` | Painel › Banco de talentos |

O que **só** funciona com configuração é o envio de e-mails. Sem SMTP, quem envia não recebe confirmação e a equipe não é avisada — ainda assim os dados ficam gravados e visíveis no painel. Para ativar as notificações, defina no ambiente:

```
SMTP_HOST=smtp.seuprovedor.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=usuario@seudominio.com.br
SMTP_PASS=segredo
EMAIL_FROM="IM Personnel <noreply@seudominio.com.br>"
LEADS_NOTIFICATION_EMAIL=contato@seudominio.com.br
```

`LEADS_NOTIFICATION_EMAIL` é a caixa da equipe que recebe os avisos de novos contatos, candidaturas e currículos cadastrados. O dashboard exibe um aviso explícito enquanto essas variáveis estiverem ausentes, para que a falta de notificação não seja confundida com formulário inativo.

Os formulários públicos têm limite de 6 envios por IP a cada 15 minutos. Se o site estiver atrás de um proxy reverso com outra topologia, reveja o `trust proxy` para não fazer todos os visitantes compartilharem o mesmo limite.

### Configurar e-mail e mensagens pelo painel

O menu **Notificações** faz o mesmo papel das variáveis acima, sem redeploy: o que é salvo ali vai para a base SQLite e tem **prioridade sobre o `.env`**. Um campo limpo no painel devolve o valor ao ambiente.

| Campo | O que faz |
| --- | --- |
| Servidor (host), Porta, Usuário, Senha | Credenciais SMTP do provedor. Porta 465 costuma exigir **Conexão segura (SSL/TLS)** marcada; 587 usa STARTTLS com a opção desmarcada. |
| Remetente | Aceita `Nome <endereco@dominio.com.br>`. Junto com o host, é o que torna o envio ativo. |
| Caixa que recebe os avisos da equipe | Equivale a `LEADS_NOTIFICATION_EMAIL` e é o destino padrão do botão **Testar conexão**. |

A senha é gravada na base e nunca é devolvida pela API nem escrita na trilha de auditoria (o histórico registra apenas `definida`/`removida`). **Com `APP_SECRET` definido no ambiente ela fica cifrada (AES-256-GCM) dentro do arquivo SQLite**; sem a chave, o painel avisa que o valor está em texto puro. Mesmo cifrada, ela vive no mesmo volume dos currículos: proteja o disco, restrinja o acesso aos backups e prefira uma credencial exclusiva para envio. O passo a passo está em [Proteger a senha do SMTP em repouso](#proteger-a-senha-do-smtp-em-repouso).

O painel mostra ainda a **saúde da entrega**: último envio confirmado, falhas nas últimas 24 horas, motivo resumido da última falha (com a senha mascarada) e o histórico dos 25 envios mais recentes, com o resultado de cada um. É por ali que se percebe uma credencial expirada antes que a equipe reclame de não receber avisos.

Cada mensagem disparada pelos formulários tem um modelo editável (assunto, corpo e liga/desliga). As variáveis entre chaves duplas são substituídas a cada envio, o botão **Ver prévia** mostra o resultado com dados de exemplo e o servidor recusa variáveis que não existem naquele modelo.

| Modelo | Vai para | Variáveis |
| --- | --- | --- |
| `application_candidate` | Quem se candidatou | `{{nome}}`, `{{vaga}}`, `{{protocolo}}` |
| `application_team` | Equipe (caixa de avisos) | `{{nome}}`, `{{email}}`, `{{telefone}}`, `{{vaga}}`, `{{protocolo}}` |
| `talent_candidate` | Quem cadastrou o currículo | `{{nome}}`, `{{area}}`, `{{protocolo}}` |
| `talent_team` | Equipe (caixa de avisos) | `{{nome}}`, `{{email}}`, `{{area}}`, `{{cidade}}`, `{{estado}}`, `{{protocolo}}` |
| `lead_customer` | Quem enviou o formulário comercial | `{{nome}}`, `{{empresa}}`, `{{servico}}`, `{{protocolo}}` |
| `lead_team` | Equipe (caixa de avisos) | `{{nome}}`, `{{empresa}}`, `{{servico}}`, `{{protocolo}}` |
| `privacy_customer` | Titular dos dados | `{{nome}}`, `{{tipo}}`, `{{protocolo}}` |

Desligar um modelo não interrompe o formulário: o envio continua validado, gravado e visível no painel — apenas aquele e-mail deixa de sair. Os textos revisados de fábrica ficam em `content/email-templates.json` e só são usados na primeira instalação.

### Editar os slides da página inicial

O menu **Página inicial** edita o carrossel de abertura. A instalação carrega os seis destaques revisados de `content/hero-slides.json`; a partir daí eles vivem na base e passam a ser editáveis pelo painel, sem rebuild.

- **Textos**: etiqueta acima do título, localidade, rótulo lateral, nome do slide (usado na navegação e em leitores de tela), título com uma linha por vez, número da linha que recebe a cor de destaque, texto de apoio e rodapé.
- **Botões**: texto e destino do principal (obrigatórios) e do secundário (opcional). O destino precisa ser um caminho interno começando com `/` — links externos são recusados para o carrossel não virar porta de saída do site.
- **Imagem de fundo**: opcional, JPG/PNG/WebP/AVIF até 5 MB, validada por assinatura no servidor, com texto alternativo e posição de foco (por exemplo `center 52%`). Sem imagem própria o slide usa `/images/hero-team.jpg`; excluir o slide remove também a imagem enviada.
- **Ordem e visibilidade**: as setas reordenam o carrossel na hora e desativar tira o slide do site mantendo o conteúdo no painel. Mantenha ao menos um slide ativo — sem nenhum ativo, a página inicial volta a mostrar os destaques revisados de fábrica — e o último slide não pode ser excluído.

O conteúdo público é servido por `GET /api/hero-slides`, consultado pelo site a cada visita.

### Proteger o acesso ao painel

Quem entra no painel vê currículos, telefones e observações internas. O menu **Segurança** ativa a verificação em duas etapas na sua conta:

1. Clique em **Começar a ativação**: o painel mostra uma chave em base32.
2. No aplicativo autenticador (Google Authenticator, Authy, 1Password, Microsoft Authenticator), adicione uma conta e digite a chave — ou cole o endereço `otpauth://` quando o aplicativo aceitar.
3. Confirme com o código de seis dígitos exibido. **Guarde os oito códigos de recuperação** que aparecem em seguida: eles são mostrados uma única vez e cada um entra no lugar do aplicativo uma só vez.

Depois disso, o login pede senha e código. Desativar a proteção ou gerar novos códigos exige confirmar a senha atual. Ativar, desativar, verificar, falhar e usar um código de recuperação — tudo entra na auditoria.

Se alguém perder o celular e os códigos, o caminho é o terminal do servidor:

```bash
npm run admin:hash          # gera um hash novo para a senha
# depois atualize a conta na base e entre para reconfigurar o 2FA
```

Mantenha a conta de maior privilégio com 2FA ativo e crie contas individuais: contas compartilhadas anulam o valor da auditoria.

### Proteger a senha do SMTP em repouso

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Guarde o resultado como `APP_SECRET` no ambiente. Com a chave definida, a senha gravada pelo painel é cifrada com AES-256-GCM no arquivo do banco; a primeira inicialização também regrava em forma protegida qualquer senha que tenha ficado em texto puro. Sem `APP_SECRET`, o painel avisa que a senha está exposta e o valor continua sendo gravado como veio.

Duas consequências práticas: **não troque `APP_SECRET` sem digitar a senha de novo** (valores antigos deixam de ser legíveis e o envio para até a senha ser reconfigurada) e mantenha a chave fora do Git, junto com os demais segredos do ambiente.

### Testes

```bash
npm test
```

O comando compila o frontend e executa servidores de teste isolados, cada um com base temporária própria. O fluxo principal (`test/flows.test.mjs`) cobre: ausência inicial de vagas fictícias; login e proteção CSRF; criação/publicação/expiração/duplicação de vagas; busca pública; candidatura; assinatura e privacidade do upload; atualização de status; cadastro e exclusão de perfil do banco de talentos; leads e solicitações de privacidade; CMS com upload, substituição, remoção e validação de assinatura da imagem de capa; criação, desativação, reativação e troca de senha de usuários administrativos (incluindo bloqueio de auto-desativação e derrubada de sessão aberta); sitemap; trilha de auditoria e logout.

`test/operations.test.mjs` cobre a operação: paginação e busca no servidor, registro da falha de envio, exportação em CSV (BOM, separador, escape de aspas e filtro aplicado) e integridade do ZIP de backup.

`test/security.test.mjs` cobre a segurança: vetores oficiais da RFC 6238, senha do SMTP cifrada no arquivo do banco e nunca devolvida, ativação do 2FA, recusa de código inválido, consumo único do código de recuperação, exigência de senha para desativar e proteção das rotas.

O repositório roda `npm ci` e `npm test` a cada push e pull request pelo GitHub Actions (`.github/workflows/ci.yml`).

`test/site-settings.test.mjs` cobre as duas áreas configuráveis pelo painel: slides da página inicial (seis destaques de fábrica, edição de textos e imagem com upload, reordenação, desativação com efeito no endpoint público, recusa de destino externo e de título vazio, remoção da imagem junto com o slide e proteção do último slide) e notificações (SMTP salvo com prioridade sobre o ambiente, senha nunca devolvida nem auditada, validação de porta e remetente, modelos com variável desconhecida recusada, prévia renderizada e trilha de auditoria). Os demais arquivos verificam a instalação inicial e a criação do administrador sem Shell.

## Configuração

As variáveis estão documentadas em `.env.example`:

- `DATA_DIR` e `DB_FILE`: local da base SQLite e dos currículos privados.
- `SITE_URL` e `VITE_SITE_URL`: domínio canônico em produção.
- `ADMIN_BOOTSTRAP_EMAIL` e `ADMIN_BOOTSTRAP_PASSWORD_HASH`: administrador inicial sem Shell (veja a seção específica acima).
- `LEADS_NOTIFICATION_EMAIL`: caixa corporativa para notificações.
- `SMTP_*` e `EMAIL_FROM`: configuração de e-mail transacional.
- `APP_SECRET`: chave de 32 bytes em hexadecimal que cifra a senha do SMTP gravada pelo painel. Sem ela, o painel avisa que a senha está em texto puro no arquivo do banco.
- `FORM_RATE_LIMIT` e `LOGIN_RATE_LIMIT`: opcionais, ajustam os limites por IP a cada 15 minutos (padrões 6 e 8).
- `APPLICATION_RETENTION_DAYS`, `TALENT_RETENTION_DAYS`, `LEAD_RETENTION_DAYS`, `PRIVACY_REQUEST_RETENTION_DAYS` e `AUDIT_RETENTION_DAYS`: prazos em dias definidos pela IM Personnel.

**O servidor recusa inicialização com `NODE_ENV=production` se algum prazo de retenção estiver ausente ou inválido.** Os valores devem ser definidos e aprovados pela pessoa responsável por privacidade, não copiados sem análise. A rotina de descarte remove registros vencidos e currículos associados na inicialização e uma vez ao dia. Pedidos de exclusão/retirada de autorização também podem ser encaminhados manualmente no painel.

## Persistência de dados no Render

**Os dados da aplicação não são um banco gerenciado do Render.** A aplicação grava em um arquivo SQLite (`DATA_DIR/DB_FILE`), nos currículos em `DATA_DIR/private-resumes/` e nas imagens de conteúdo em `DATA_DIR/content-images/`. O Render Postgres, mesmo sendo persistente, não é usado por este código.

Por padrão, serviços web do Render têm sistema de arquivos **efêmero**: qualquer reinício, novo deploy ou troca de instância apaga o arquivo SQLite, os currículos, as imagens de conteúdo e todas as candidaturas, leads e artigos. Para evitar isso:

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
- Imagens de conteúdo ficam em `DATA_DIR/content-images` e são públicas por natureza (servidas em `/media/content-images/{chave}`). O nome do arquivo é sempre um UUID gerado no servidor com extensão fixa, a chave é validada por expressão regular antes de qualquer acesso a disco e a assinatura do arquivo é conferida no envio, o que impede traversal e upload de não-imagens.
- O banco não cifra cada campo individualmente: apenas a senha do SMTP recebe proteção própria (AES-256-GCM com chave derivada de `APP_SECRET`). Os demais dados pessoais continuam dependendo de criptografia em repouso no volume, controles de acesso e política de backup/rotação.
- A verificação em duas etapas cobre a conta administrativa (TOTP). Os códigos de recuperação são guardados como hash e consumidos no primeiro uso; o desafio intermediário do login vive em memória e expira em cinco minutos.
- Os limites de tentativa são de 6 envios de formulário e 8 logins por IP a cada 15 minutos, ajustáveis por `FORM_RATE_LIMIT` e `LOGIN_RATE_LIMIT` quando a operação exigir.
- Todas as contas administrativas têm acesso completo ao painel. A criação, a desativação/reativação e a troca de senha são feitas no painel em **Usuários** (ou pelo utilitário de terminal); gestão granular de papéis e permissões continua fora do escopo desta entrega, então crie acessos somente para pessoas autorizadas. O sistema impede desativar a própria conta em uso e mantém sempre ao menos uma conta ativa.
- A área de candidato com conta, autenticação própria e recuperação de senha foi deixada opcional/desabilitada: a candidatura e o banco de talentos funcionam sem criar conta.

### Backup e recuperação

O painel tem um botão de **backup completo** no dashboard: ele baixa um ZIP com a base SQLite, os currículos e as imagens, mais um `LEIA-ME.txt` com a contagem de registros por tabela e o passo a passo de restauração. Todo download entra na auditoria com data, usuário e conteúdo. As listas também exportam CSV com o filtro aplicado na tela — útil para planilhas e para atender pedidos de portabilidade.

Para uma rotina automática, faça backup consistente do arquivo SQLite, de `private-resumes/` e de `content-images/` como um conjunto, com retenção e acesso restritos. Para uma cópia manual simples, pare o processo e copie ambos para armazenamento protegido. Na restauração, mantenha a relação entre os nomes aleatórios dos arquivos e as chaves da base; teste a restauração em ambiente separado antes de substituir produção. Documente responsável, frequência, criptografia, retenção e procedimento de recuperação para a operação real.

## Validações necessárias antes da publicação institucional

1. Aprovar bases legais por finalidade, prazos e critérios de descarte, operadores, canal oficial para titulares e o texto final do Aviso de Privacidade.
2. Validar os dados de contato informados para o site (telefone/WhatsApp, e-mail e endereço institucional completo), links sociais e canais oficiais.
3. Validar a metodologia de quatro etapas, textos de serviço e artigos editoriais.
4. Definir o SMTP, endereço que recebe leads e modelos de notificação.
5. Configurar prazos aprovados no ambiente de produção, HTTPS, domínio, backups, monitoramento e controles operacionais.
6. Cadastrar vagas reais e revisar requisitos, benefícios, autorização de publicação, data de encerramento e aviso de privacidade aplicável.

O conteúdo institucional foi produzido como base original de projeto; a aprovação da IM Personnel é necessária antes de tratá-lo como publicação final.
