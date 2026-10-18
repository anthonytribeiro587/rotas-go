# Rotas GO

**Caminhe menos. Venda mais.** Planejador mobile-first de prospecção comercial a pé, com origem/destino fixos, otimização TSP por ruas reais e navegação por parada no Google Maps.

## O que já existe no MVP

- Busca de estabelecimentos e endereços por Photon/OSM, com debounce e sugestões.
- Partida por endereço ou geolocalização (com permissão do usuário); chegada fixa.
- Até 18 leads por dia; botão de otimização, mapa com pinos numerados e linha das ruas.
- Roteamento a pé com **openrouteservice**: matriz de distâncias de pedestres + geometria da rota.
- TSP de caminho aberto: **Held–Karp exato até 11 visitas**; vizinho mais próximo + 2-opt (heurística) entre 12 e 18.
- Drag-and-drop da ordem; refaz a linha mantendo a **ordem manual** (não reotimiza automaticamente).
- Navegação no Google Maps para **cada visita**, registro de "Visitei", progresso do dia.
- Salvar e recuperar rotas no dispositivo; Supabase opcional com login por link e RLS para sincronizar na nuvem.
- UI para telas pequenas, botões acessíveis ao polegar, alto contraste e mapa no topo / lista embaixo.
- Testes unitários para TSP e workflow de validação de projeto (quando o CI estiver habilitado).

## Rodando localmente

Requisitos: Node.js 20.9+.

1. Execute \`npm install\`.
2. Copie \`.env.example\` para \`.env.local\`.
3. Cadastre-se em [openrouteservice](https://openrouteservice.org/dev/#/signup) e defina \`ORS_API_KEY\` em \`.env.local\` (essa chave **não** pode usar o prefixo \`NEXT_PUBLIC_\`).
4. Execute \`npm run dev\` e abra \`http://localhost:3000\`.
5. Para testar a lógica: \`npm test\`; para verificar tipos: \`npm run lint\`; para gerar produção: \`npm run build\`.

Sem a chave ORS, a interface abre e a busca funciona, mas o servidor retorna uma mensagem de configuração ao tentar otimizar. **Não há fallback que simule falsamente um trajeto real.**

### Supabase — opcional no modo de desenvolvimento

1. Crie um projeto Supabase **exclusivo** para o Rotas GO.
2. No SQL Editor, execute a migração de \`supabase/migrations/20261018004000_init_rotas_go.sql\` após revisar o SQL.
3. Configure \`NEXT_PUBLIC_SUPABASE_URL\` e \`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\`.
4. No Supabase Auth, configure a URL local ou de produção em **URL Configuration** e permita a mesma URL na lista de redirect URLs, para funcionar o link por e-mail.
5. Entre pelo botão "Entrar". Rotas salvas nessa sessão irão ao seu projeto Supabase e ficarão separadas por usuário com RLS.

**Nunca inclua a chave \`service_role\` / secret do Supabase no frontend.** Se Supabase não estiver configurado ou você não estiver autenticado, salvar funciona no \`localStorage\` do aparelho e não sincroniza entre dispositivos.

## Estrutura

\`\`\`text
app/
  page.tsx                   Entrada do painel
  layout.tsx                 Metadata e base visual
  api/search/route.ts        Proxy/busca Photon
  api/optimize/route.ts      Matriz a pé, TSP e instruções geométricas
src/
  components/
    route-planner.tsx        Tela principal, drag-and-drop, GPS e histórico
    location-search.tsx      Busca com sugestões
    route-map.tsx            Leaflet + OSM
    ui/button.tsx            Botão no padrão shadcn/Radix
  lib/
    tsp.ts                   Motor TSP puro e testável
    supabase.ts              Client Supabase (publishable)
    types.ts                 Tipos compartilhados
    utils.ts                 Formatação e links GPS
supabase/migrations/         Esquema SQL e RLS
tests/tsp.test.ts            Testes matemáticos
\`\`\`

## Rotas e custos: decisões importantes

**Por que não usar simplesmente OSRM público?** O servidor demo OSRM normalmente não representa a malha de *pedestres*; usar roteamento automotivo geraria trajetos incorretos. O motor foi isolado no backend para permitir trocar o provedor de matriz e rota futuramente. O openrouteservice oferece perfil \`foot-walking\` para ambos.

**Por que Photon?** O serviço OSM Nominatim público proíbe autocomplete. O Photon oferece busca conforme digita. Usamos o servidor demo \`photon.komoot.io\` **somente para desenvolvimento e uso leve**; ele não oferece SLA e pode bloquear alto volume. Antes de vender a aplicação ou expandir, configure um serviço próprio/contratado em \`PHOTON_BASE_URL\`. Servidores de tiles OSM também exigem respeito à política de uso; em escala, troque pelo provedor apropriado.

**Limites e garantias:** A otimização exata considera distâncias reais calculadas pela rede viária. Para 12–18 visitas, o resultado é uma aproximação (não garante ótimo global). A API ORS gratuita tem quotas e disponibilidade próprias. O tempo exibido é o de **caminhada**, não inclui a conversa com os clientes. O GPS da navegação é operado pelo Google Maps externo.

**Antes de produção comercial:** gerar e versionar \`package-lock.json\` com \`npm install\`; testar com chave ORS e região reais; adicionar rate limiting centralizado e monitoramento de quota; configurar host próprio/contratado de geocoding e tiles, política de privacidade, error tracking, termos e adequação à LGPD. Os limitadores atuais em memória por instância são apenas proteção básica do MVP.

## Engenharia

\`POST /api/optimize\` recebe \`{ start, end, stops, mode }\`. \`mode: "optimize"\` (padrão) usa a matriz e reordena. \`mode: "manual"\` mantém a ordem recebida e solicita apenas a geometria caminhável. O retorno inclui \`order\`, \`geometry\` ([lat,lng]), \`distanceMeters\`, \`durationSeconds\` e \`exact\`.

O algoritmo mantém partida e destino final fixos e minimiza **distância caminhável**, não distância geográfica em linha reta.

Feito para evoluir: catálogo permanente de leads, tarefas agendadas, lead visitado/pulado, histórico avançado, múltiplos usuários, cotas comerciais e acompanhamento de conversão.

## Projeto Supabase provisionado

O banco de desenvolvimento/produção inicial foi criado em 17/10/2026 (horário de Brasília):

- Nome: `rotasgo`
- Ref: `wzddhduxemxvdiencjan`
- Região: `sa-east-1` (São Paulo)
- Dashboard: https://supabase.com/dashboard/project/wzddhduxemxvdiencjan
- URL pública: `https://wzddhduxemxvdiencjan.supabase.co`

As 3 migrações deste diretório já foram aplicadas no projeto. Para conectar o frontend, preencha as variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no ambiente de deploy, usando a chave publishable no painel **Project Settings → API Keys**. Não coloque service role em arquivos do frontend nem no GitHub. Configure também Auth → URL Configuration para o domínio da aplicação.
