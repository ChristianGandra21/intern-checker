# Radar de Estágios

Plataforma pessoal que procura diariamente vagas de estágio em Dados, IA e Machine Learning, prioriza oportunidades em São Paulo ou remotas e entrega o resultado em um dashboard, banco de dados, CSV/XLSX e resumo por e-mail.

O MVP segue o caminho 100% nuvem e gratuito: classificação explicável por regras, GitHub Actions para a coleta diária, Next.js para dashboard/backend e Supabase/Postgres para persistência.

## Como funciona

```text
LinkedIn / X / Gupy / Indeed / Vagas.com ─┐
RSS / Google Alerts / páginas de carreira ├─> coletor Python
                                          │   normalização → scoring → dedup
                                          ├─> CSV + XLSX (artifact)
                                          ├─> e-mail / Telegram
                                          └─> API Next.js → Supabase → dashboard
```

LinkedIn, X e portais com proteção contra automação são consultados por busca indireta e páginas públicas indexadas. O MVP não automatiza login nem tenta contornar mecanismos de proteção.

## Recursos implementados

- Coleta assíncrona e isolada por fonte: uma falha não interrompe o ciclo.
- Ingestão ampla com auditoria: candidatos descartados pelo pré-filtro não são enriquecidos, mas são armazenados como ocultos.
- Planilha comunitária pública como fonte-base prioritária.
- Busca indireta em LinkedIn, X, Gupy, Vagas.com e Indeed.
- RSS, Google Alerts via IMAP, redes sociais públicas e páginas de carreira configuráveis.
- Ingestão social sem chave com filtro de contratação/estágio/empresa/Brasil; Reddit e Bluesky ficam desligados por padrão enquanto responderem `403`.
- Scraping renderizado opcional via Playwright para portais que dependem de JavaScript.
- Score de 0–100 com motivos visíveis e penalidades de senioridade/área.
- Deduplicação global por ID de ATS, URLs oficiais, empresa/programa/ciclo e similaridade protegida.
- API de ingestão em lote protegida por chave.
- Postgres com histórico de vagas, candidaturas pessoais e execuções.
- Dashboard responsivo e paginado, com 20 vagas por página.
- Login persistente por e-mail e senha com Supabase Auth.
- Área privada para salvar vagas, cadastrar oportunidades externas, registrar inscrição/resultado e acompanhar etapas e datas.
- Sidebar responsiva, vagas dispensadas por usuário e lixeira recuperável por 30 dias.
- Coleta local sob demanda, restrita a administradores e com histórico de execução.
- Atalhos sem OAuth para adicionar prazos de cada etapa ao Google Calendar.
- Perfil privado por usuário com objetivos, currículo, competências, preferências e impeditivos.
- Preferências para ocultar categorias e termos de área sem remover vagas do banco.
- Ranking de aderência pessoal por regras e, opcionalmente, análise estruturada pela Groq.
- Validação de qualidade que separa anúncios aplicáveis, leads e ruído antes da exibição.
- Quarentena de vagas antigas, encerradas, genéricas ou sem evidência de estágio.
- Deduplicação persistente entre ciclos e verificação diária dos links prioritários.
- Política `radar-v2`: tecnologia ampla e programas gerais, presencial/híbrido em São Paulo e remoto explicitamente brasileiro; a watchlist aceita detalhes/ciclo pendentes, mas exige localização compatível.
- Ciclo de ingestão por execução e lote, com totais de persistidos, fortes, análise, rejeitados, ocultos, resolvidos, falhas e duração por fonte.
- Download sob demanda em CSV e XLSX, além dos arquivos de cada ciclo.
- Resumo diário via Gmail SMTP e, opcionalmente, Telegram.
- GitHub Actions diário às 08:15 no horário de São Paulo.

## Rodar o dashboard

Requisitos: Node.js 20+ e npm.

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`. Sem variáveis de banco, a interface inicia em modo demonstração com dados fictícios.

## Configurar o Supabase

1. Crie um projeto gratuito no Supabase.
2. Execute, em ordem, as migrations `001` a [012_ingestion_quality.sql](supabase/migrations/012_ingestion_quality.sql) no SQL Editor.
3. Copie `.env.example` para `.env.local` e preencha:

```dotenv
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sua-publishable-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
INGEST_API_KEY=uma-chave-longa-e-aleatoria
SCRAPING_EXECUTION_MODE=disabled
SCRAPING_ADMIN_EMAILS=voce@email.com
```

A service role é usada somente no servidor Next.js e nunca é enviada ao navegador. As tabelas ficam com RLS habilitado e sem políticas públicas.

## Login, perfil e acompanhamento

Em **Supabase → Authentication → Providers**, mantenha o provedor **Email** habilitado. Em **URL Configuration**, configure:

- Site URL local: `http://localhost:3000`;
- Redirect URL local: `http://localhost:3000/auth/callback`;
- as URLs equivalentes do deploy de produção.

Abra `http://localhost:3000/login` para criar uma conta ou entrar com e-mail e senha. O radar e os downloads continuam públicos; perfil, vagas salvas e processos exigem sessão. A sessão é renovada e permanece após reiniciar o navegador até logout ou revogação. O fluxo também inclui confirmação de e-mail e recuperação de senha.

Em **Minhas vagas**, você pode salvar um item do radar ou cadastrar uma oportunidade manual com site, descrição, prazo e notas. Cada processo começa com etapas editáveis de preparação, inscrição, testes, entrevistas e proposta. A situação é registrada separadamente como não inscrito, inscrito, reprovado ou aprovado. Cada etapa aceita data prevista, data concluída, notas e um link preenchido para o Google Calendar. Essa integração não usa OAuth nem sincroniza alterações automaticamente.

Você também pode editar todos os campos do snapshot salvo sem alterar a vaga global. **Dispensar** oculta uma oportunidade somente no seu radar; ela pode ser restaurada pela área **Dispensadas**. A exclusão de um acompanhamento o move para a **Lixeira**, onde permanece recuperável por 30 dias.

O perfil de aderência agora pertence à conta autenticada:

```dotenv
GROQ_API=sua-chave-da-groq
GROQ_MODEL=openai/gpt-oss-20b
```

Preencha objetivos, funções desejadas, competências, localização, modelo de trabalho, impeditivos, áreas que deseja ocultar e o currículo em texto. Programas gerais continuam visíveis. As exclusões valem igualmente para dashboard, ranking, CSV/XLSX e alertas. O ranking por regras funciona sem IA. A Groq só é chamada quando a opção é ativada no perfil e você clica em **Analisar 30 vagas**. Nesse momento, o conteúdo do perfil e das vagas analisadas é enviado à Groq; a chave e as chamadas permanecem no servidor.

O resultado personalizado não substitui o score geral da vaga. Ele é salvo separadamente em `job_profile_matches`, com pontos fortes, lacunas, alertas e o modelo utilizado.

## Saneamento das vagas existentes

Após executar as migrations `003` a `007`, simule primeiro a reclassificação e o agrupamento global:

```bash
curl --fail-with-body -X POST "http://localhost:3000/api/jobs/revalidate" \
  -H "content-type: application/json" \
  -H "x-ingest-key: SUA_INGEST_API_KEY" \
  -d '{"dry_run":true,"check_urls":false}'
```

Se o relatório estiver coerente, aplique e verifique os links prioritários:

```bash
curl --fail-with-body -X POST "http://localhost:3000/api/jobs/revalidate" \
  -H "content-type: application/json" \
  -H "x-ingest-key: SUA_INGEST_API_KEY" \
  -d '{"check_urls":true,"url_limit":30}'
```

A rotina não apaga registros. Ela classifica `strong`, `watchlist` e `hidden`, separa `job`, `lead` e `noise`, testa links prioritários, escolhe um principal por grupo e aponta todas as duplicatas. Ano/detalhes ausentes podem entrar na watchlist, mas localização fora de São Paulo/Brasil ou remota sem Brasil explícito fica oculta. O dry-run inclui transições, amostras visíveis e os ATS descobertos que serão desativados por não terem vaga elegível. `403`, `429`, timeout ou bloqueio de robô não eliminam uma vaga.

Confira o schema em `http://localhost:3000/api/health/schema`. Com migrations ausentes, a home usa uma leitura legada em vez de retornar erro 500; ingestão v2 e revalidação respondem 409 com a migration necessária.

## Rodar o coletor

Requisitos: Python 3.11+.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e './collector[dev]'
intern-checker --config config/sources.yml --output exports --verbose
```

O comando explícito equivalente é:

```bash
intern-checker run --config config/sources.yml --output exports
```

### Botão de coleta sob demanda

O botão administrativo executa coleta, ingestão e revalidação sem enviar e-mail ou Telegram. Há apenas uma execução simultânea, intervalo mínimo de 30 minutos e recuperação automática de execuções abandonadas.

Para executar na mesma máquina do dashboard, instale o coletor na `.venv` e configure:

```dotenv
SCRAPING_EXECUTION_MODE=local
SCRAPING_ADMIN_EMAILS=seu-email-de-login@example.com
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Reinicie `npm run dev`. A opção **Coleta** aparecerá na sidebar somente para os e-mails listados. O processo continua em segundo plano e os logs privados ficam em `var/runs/`.

Para executar a partir de Vercel ou outro ambiente serverless, use o GitHub Actions:

```dotenv
SCRAPING_EXECUTION_MODE=github
SCRAPING_ADMIN_EMAILS=seu-email-de-login@example.com
GITHUB_ACTIONS_TOKEN=github_pat_...
GITHUB_REPOSITORY=owner/repository
GITHUB_WORKFLOW_FILE=daily-search.yml
GITHUB_WORKFLOW_REF=main
```

Crie um token fine-grained restrito a esse repositório, com permissão de leitura dos metadados e escrita em **Actions**, e salve-o apenas no ambiente do backend. Nos secrets do GitHub Actions, mantenha `JOBS_API_URL` terminando em `/api/jobs` e `INGEST_API_KEY` igual à chave do backend; eles também autenticam os callbacks de status. A tela exibe o executor e oferece um link direto para os logs remotos.

`LOCAL_SCRAPING_ENABLED=true` continua habilitando o modo local temporariamente quando `SCRAPING_EXECUTION_MODE` não estiver definido, mas deve ser substituído pela configuração nova.

O coletor carrega automaticamente `.env.local` e `.env` quando esses arquivos existem. Sem
`JOBS_API_URL` e `INGEST_API_KEY`, ele funciona em modo local e gera apenas CSV/XLSX. Para enviar
ao backend:

```dotenv
JOBS_API_URL=http://localhost:3000/api/jobs
INGEST_API_KEY=a-mesma-chave-do-dashboard
```

As consultas, limites, timeouts, feeds, planilha comunitária, redes sociais e seletores de páginas ficam em [config/sources.yml](config/sources.yml). O pré-filtro evita enriquecer navegação e posts fracos, mas preserva esses registros para auditoria no backend. Use `--min-score` apenas quando quiser forçar um filtro manual na ingestão.

A pipeline abre um `ingestion_run`, envia todos os lotes com o mesmo `run_id` e só então finaliza os totais agregados. A API devolve a decisão `radar-v2` por URL; essa decisão do backend também controla os CSV/XLSX e alertas, evitando divergência com o dashboard. O resumo final mostra rendimento, duração por fonte e motivos predominantes de descarte.

Para habilitar scraping renderizado em portais que dependem de JavaScript:

```bash
pip install -e './collector[dynamic]'
playwright install chromium
```

## LinkedIn e X

O coletor não faz login nem armazena cookies dessas plataformas. Links encontrados em fontes públicas são preservados como evidência, mas LinkedIn e X não são acessados diretamente. Quando possível, uma busca pública por empresa e título localiza a página oficial ou o ATS correspondente.

## E-mail diário

Use uma senha de app do Gmail, não a senha principal da conta:

```dotenv
SMTP_USER=voce@gmail.com
SMTP_PASSWORD=senha-de-app
EMAIL_TO=destino@example.com
```

O e-mail inclui somente vagas novas de alta confiança e anexa CSV/XLSX desse mesmo recorte. Os arquivos principais gerados no diretório `exports/` representam o radar amplo. Telegram também recebe apenas novas vagas fortes. Se essas variáveis não existirem, a etapa é ignorada sem quebrar o ciclo.

## Automação no GitHub

O workflow [daily-search.yml](.github/workflows/daily-search.yml) aceita execução manual e roda diariamente. Cadastre em **Settings → Secrets and variables → Actions**:

- `JOBS_API_URL`: URL pública do backend, terminando em `/api/jobs`.
- `INGEST_API_KEY`: a mesma chave configurada no backend.
- `SMTP_USER`, `SMTP_PASSWORD` e `EMAIL_TO`: entrega por e-mail.
- `ALERTS_IMAP_USER` e `ALERTS_IMAP_PASSWORD`: opcionais, para Google Alerts.
- `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`: opcionais.

Os arquivos ficam disponíveis como artifact por 30 dias. Agendamentos do GitHub Actions podem começar alguns minutos depois do horário programado.

## Deploy gratuito sugerido

- Dashboard/API: Vercel, conectado a este repositório.
- Banco: Supabase free tier.
- Coletor: GitHub Actions.

Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `INGEST_API_KEY` e, opcionalmente, `GROQ_API`/`GROQ_MODEL` no ambiente do deploy. Depois salve a URL da API nos secrets do GitHub.

## Qualidade e segurança

```bash
npm run lint
npm run typecheck
npm run build
pytest collector/tests
```

- A chave de ingestão é comparada em tempo constante.
- Exportações CSV neutralizam células que poderiam ser interpretadas como fórmulas.
- Currículo, preferências, candidaturas e etapas ficam isolados por usuário com RLS.
- A autenticação por e-mail usa cookies de sessão renováveis do Supabase SSR; senhas são processadas pelo Supabase Auth e não pelo aplicativo.
- A integração Groq é opcional e exige consentimento explícito no formulário.
- O status global legado em `jobs` não é mais editado; o acompanhamento fica em `tracked_applications`.

## Próximos passos

- Definir a lista real de empresas e seletores das páginas de carreira.
- Ajustar pesos e termos do score com os falsos positivos das primeiras semanas.
- Incluir métricas históricas após acumular dados suficientes.
- Avaliar embeddings locais ou gratuitos somente se a deduplicação textual se mostrar insuficiente.
