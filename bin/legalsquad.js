#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { dashboard } from '../src/dashboard.js';
import { dirname, join, resolve } from 'node:path';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { init } from '../src/init.js';
import { perfilCli } from '../src/perfil.js';
import { raizDoProjeto } from '../src/fs-utils.js';
import { installGlobal } from '../src/install-global.js';
import { update } from '../src/update.js';
import { skillsCli } from '../src/skills-cli.js';
import { agentsCli } from '../src/agents-cli.js';
import { listRuns, printRuns } from '../src/runs.js';
import {
  auditSkillsProject,
  checkSkillsProject,
  contractSkillsProject,
  indexSkillsProject,
} from '../src/skill-catalog-cli.js';
import { skillRuntimeCli } from '../src/skill-runtime-cli.js';
import { skillSearchCli } from '../src/skill-search.js';
import { skillDetailCli } from '../src/skill-detail.js';
import { acervoSearchCli } from '../src/acervo-search.js';
import { acervoCli } from '../src/acervo-cli.js';
import { diagnosticoCli } from '../src/diagnostico.js';
import { ativarCli } from '../src/acervo-ativar.js';
import { capturaCli } from '../src/captura-cli.js';
import { checkSquad } from '../src/squad-check.js';
import { compilarSquadCli } from '../src/squad-compile.js';
import { squadModeloCli } from '../src/squad-modelo.js';
import { squadsCli } from '../src/squads-lista.js';
import { semearEvals, squadsSemEvals } from '../src/eval-init.js';
import { chefeCli } from '../src/chefe-briefing.js';
import { registrarExecucao, ritualCli } from '../src/chefe-ritual.js';
import { memoriaCli } from '../src/chefe-memoria.js';
import { contribuirCli } from '../src/contribuicao.js';
import { AJUDA } from '../src/ajuda.js';
import { escritorioCli } from '../src/escritorio.js';

const HELP = `
  legalsquad: multi-agent orchestration for Claude Code

  Usage:
    npx banca init                    Initialize Banca (in this folder)
    npx banca init --skip-deps        Initialize without installing dependencies
    npx banca init --perfil rapido    Initialize with a project profile (rapido | equilibrado | completo):
                                           the ceiling of verification every run pays; the run's rhythm is asked at intake
    npx banca install-global          Install for ALL Claude conversations (~/.claude)
    npx banca update                  Update Banca core
    npx banca perfil [nome]           Show or set this project's profile (kept by update)
    npx banca install <name>          Install a skill
    npx banca uninstall <name>        Remove a skill
    npx banca update <name>           Update a specific skill
    npx banca skills                  List installed skills
    npx banca agents                  List installed agents
    npx banca agents install <name>   Install a predefined agent
    npx banca agents remove <name>    Remove an agent
    npx banca agents update           Update all agents
    npx banca indexar-skills          Regenerate skills/_index.yaml
    npx banca contract-skills         Apply the v5 operational contract + reindex
    npx banca check-skills            Validate skill catalogue and graph
    npx banca audit-skills            Audit skill contracts and evidence maturity
    npx banca audit-skills --skill <id>   Same audit, ONLY for the given skill(s) (repeatable):
                                           what the Architect runs for a skill a squad just created
    npx banca search-skills <query>   Return a compact, ranked skill + best-practice shortlist
    npx banca detail-skill <id>       Inspect ONE skill's structure, triggers and legal substance
                                           (--secao "<título>" reads one section; shows local usage stats)
    npx banca search-skills ... --delivery-type <t> --risk <r>   Filter the shortlist by metadata
    npx banca search-acervo <query>   Return a compact, ranked acervo shortlist
    npx banca captura <file|URL>      Watch video + transcribe audio (local by default)
    npx banca captura setup           Install on-use deps (ffmpeg/yt-dlp/faster-whisper)
    npx banca resolve-skills <id...>  Enforce runtime lifecycle/evidence gates
    npx banca check-squad <code>      Validate a squad's structure, rubric and eval harness
    npx banca compilar-squad <code>   Compila _build/design.yaml nos arquivos mecânicos do squad
                                           (squad.yaml, party, pipeline, frontmatters, esqueletos com marcadores;
                                           --prosa <arquivo> preenche os marcadores; --extrair-prosa <arquivo> faz o inverso)
    npx banca squads [--area <área>]  Lista os squads desta pasta com a área de origem de cada um
                                           (--area separa os da área do caso dos de outra área; --json para o chefe)
    npx banca squad-modelo            Lista os squads-modelo de squads/_modelos/ (prontos, curados)
    npx banca squad-modelo <id> --code <code>   Cria squads/<code>/ a partir do modelo, em segundos
    npx banca squad-modelo --para "<peça identificada>" [--area <área>] [--criar] [--reusar] [--identificacao '<json>'] [--caso <pasta>]   Escolhe o modelo pela peça que o chefe identificou (--identificacao grava peça, polo, fase e último ato no squad criado; --caso liga os autos por referência)
                                           (gatilhos do modelo.yaml; --criar já cria o squad; --json para o chefe)
    npx banca squad-modelo --derivar <modelo> --area <área> --id <novo-id> [--peca <peca>]
                                           Deriva o ESQUELETO de um modelo curado para outra área (curadoria):
                                           troca área/peça, marca as skills a conferir e deixa a prosa para o Build
    npx banca squad-modelo --salvar <squad> [--previa] [--rotulo "<nome>"] [--substituir '<json>'] [--levar todos|'[n,...]'] [--forcar] [--aceitar-achados]   Guarda o squad como modelo do ESCRITÓRIO: só a diferença sobre o modelo da área (ou o squad inteiro, se não nasceu de um), sem dado do caso; --previa mostra o que iria sem gravar; --dispensar anota o "não" à oferta
    npx banca squad-modelo --listar | --apagar <id> | --restaurar <id> | --renomear <id> --rotulo "<nome>" | --procurar   Modelos do escritório: listar, tirar (vai para a lixeira), trazer de volta, renomear, achar nas pastas ao lado
    npx banca squad-modelo --exportar todos|<id>,<id> [--arquivo <x>.lsmodelos.json] [--forcar]   Leva os modelos do escritório (esc-*) num arquivo, para outra pasta ou máquina
    npx banca squad-modelo --importar <arquivo|pasta de outro projeto> [--so <id>,<id>] [--previa] [--forcar|--como-novo]   Traz os modelos do escritório para esta pasta (confere e recria antes de gravar; tudo ou nada)
    npx banca squad-modelo --extrair <squad> --id <id>   Vira um squad construído em modelo (curadoria)
    npx banca squad-modelo --testar   Confere os pedidos_exemplo/pedidos_fora de cada modelo contra a escolha real (curadoria)
    npx banca eval-init [code]        Semeia o harness de eval (scores.md + caso-ouro) nos
                                           squads que ainda não o têm. Sem <code>, faz em todos.
                                           A rubrica vem do squad.yaml; o input fictício fica
                                           marcado [PREENCHER], porque é trabalho humano.
    npx banca ativar <licenca>        Activate your license and sync the licensed areas
    npx banca acervo status           Show the machine depósito (~/.legalsquad/acervo), its freshness, and this project's link
    npx banca acervo sync             Download/update the areas into the machine depósito, then link this project (hard links)
    npx banca acervo ligar            Link this project to the depósito without network (after a sync elsewhere)
    npx banca acervo areas [<área>…]  List the areas in the depósito, or choose which ones this project links (--todas: all)
    npx banca diagnostico             What this machine can do: node/npm, PATH, engine registry, shortcut, depósito,
                                           hard links and read-only enforcement on this volume (--json to paste in support)
    npx banca dashboard              Abre o escritório virtual no navegador (servidor Node local)
                                           --no-open: só servidor; --port 5173: porta preferida
    npx banca runs [squad-name]       View execution history
    npx banca contribuir [--json]     Envia a ESTRUTURA dos squads criados ou mudados aqui (nunca dado de caso, nunca o
                                           nome do aluno ou do escritório) à caixa de entrada privada da comunidade, depois
                                           da varredura de dado do caso; squad com possível dado de caso não sobe.
                                           --fundo: em segundo plano. Na Banca vem DESLIGADA: ligue com
                                           "contribuir": true em _legalsquad/config/acervo.json;
                                           LEGALSQUAD_CONTRIBUIR=0 desliga a máquina toda
    npx banca chefe [--briefing]      Morning briefing from the squad chief: today's
                                           deadlines + recent intimações + portfolio summary
    npx banca chefe --json            Same aggregate as raw JSON (for automation)
    npx banca chefe --agendar         Show what it takes to schedule the ritual: the exact
                                           command, the honest trade-off of each option, and a
                                           ready-to-paste snippet. Writes NOTHING.
                                           (--hora HH:MM changes the time; default 08:00)
    npx banca chefe --agendar --aplicar
                                           Your explicit yes: writes the macOS LaunchAgent and
                                           stops there. Running \`launchctl load\` stays yours.
                                           Idempotent: running it twice never duplicates.
    npx banca chefe --status          Is a ritual scheduled, and when did it last run?
    npx banca memoria                 What the chief remembers about THIS office
                                           (--tipo perfil|preferencia|decisao|licao, --json)
    npx banca memoria add --tipo <t> --titulo "…" --corpo "…"
                                           Record one fact. Client-identifying data is
                                           REFUSED (LGPD); record the fact, not the datum.

  Learn more: https://github.com/despertaia/banca
  `;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    'skip-deps': { type: 'boolean' },
    'no-open': { type: 'boolean' },
    port: { type: 'string' },
    force: { type: 'boolean' },
    forcar: { type: 'boolean' },
    prosa: { type: 'string' },
    'extrair-prosa': { type: 'string' },
    extrair: { type: 'string' },
    salvar: { type: 'string' },
    exportar: { type: 'string' },
    importar: { type: 'string' },
    arquivo: { type: 'string' },
    gatilhos: { type: 'string' },
    pedidos: { type: 'string' },
    'aceitar-achados': { type: 'boolean' },
    // Contribuição à comunidade: em segundo plano, e a passada sem saída que ele dispara.
    fundo: { type: 'boolean' },
    silencioso: { type: 'boolean' },
    // Modelo do escritório: prévia sem gravar (a oferta do runner), dispensa da oferta, gestão.
    previa: { type: 'boolean' },
    dispensar: { type: 'boolean' },
    listar: { type: 'boolean' },
    apagar: { type: 'string' },
    renomear: { type: 'string' },
    rotulo: { type: 'string' },
    substituir: { type: 'string' },
    'como-novo': { type: 'boolean' },
    levar: { type: 'string' },
    so: { type: 'string' },
    restaurar: { type: 'string' },
    procurar: { type: 'boolean' },
    derivar: { type: 'string' },
    para: { type: 'string' },
    criar: { type: 'boolean' },
    reusar: { type: 'boolean' },
    identificacao: { type: 'string' },
    caso: { type: 'string' },
    testar: { type: 'boolean' },
    code: { type: 'string' },
    id: { type: 'string' },
    nome: { type: 'string' },
    descricao: { type: 'string' },
    peca: { type: 'string' },
    polo: { type: 'string' },
    yes: { type: 'boolean' },
    lang: { type: 'string' },
    perfil: { type: 'string' },
    ide: { type: 'string' },
    supervised: { type: 'boolean' },
    selection: { type: 'boolean' },
    'explicit-selection': { type: 'boolean' },
    query: { type: 'string' },
    limit: { type: 'string' },
    'include-preview': { type: 'boolean' },
    area: { type: 'string' },
    secao: { type: 'string' },
    'delivery-type': { type: 'string' },
    risk: { type: 'string' },
    'quality-profile': { type: 'string' },
    'include-quarantined': { type: 'boolean' },
    json: { type: 'boolean' },
    version: { type: 'boolean', short: 'v' },
    // `banca escritorio papel` (camada Desperta): opções com valor têm de ser declaradas, ou o valor vira posicional.
    como: { type: 'string' }, topo: { type: 'string' }, base: { type: 'string' },
    // `banca escritorio cliente "<nome>" --time <time>` (camada Desperta).
    time: { type: 'string' },
    briefing: { type: 'boolean' },
    // Rituais agendados do chefe (MIKE-CHEFE §6). `agendar` PROPÕE e `aplicar`
    // é o "sim" que autoriza a única escrita — agendar rotina é decisão M3.
    agendar: { type: 'boolean' },
    aplicar: { type: 'boolean' },
    status: { type: 'boolean' },
    hora: { type: 'string' },
    tipo: { type: 'string' },
    titulo: { type: 'string' },
    corpo: { type: 'string' },
    origem: { type: 'string' },
    'pilot-opt-in': { type: 'string', multiple: true },
    'pilot-fallback': { type: 'string', multiple: true },
    'squads-dir': { type: 'string' },
    // `acervo areas --todas`: volta a ligar todas as áreas do depósito.
    todas: { type: 'boolean' },
    // audit-skills --skill <id> (repetível): audita só essas skills.
    skill: { type: 'string', multiple: true },
  },
});

const command = positionals[0];
const VERSAO = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')).version;
if (values.version === true || command === 'version') {
  console.log(VERSAO);
  process.exit(0);
}
// Todo comando age sobre a casa mais próxima (a pasta atual ou uma acima), como
// o git: aberto o Claude Code em `Escritório/Processos/<caso>/`, a casa é o
// escritório. `init` e `install-global` ficam na pasta atual por definição.
// `LEGALSQUAD_RAIZ` fixa a raiz sem subir (hooks e testes que operam numa
// pasta que não é uma casa completa).
function mesmaPasta(a, b) {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return a === b;
  }
}
const RAIZ_DA_PASTA_ATUAL = ['init', 'install-global'].includes(command)
  ? null
  : (process.env.LEGALSQUAD_RAIZ ? resolve(process.env.LEGALSQUAD_RAIZ) : raizDoProjeto(process.cwd()));
const cwd = RAIZ_DA_PASTA_ATUAL || process.cwd();
if (RAIZ_DA_PASTA_ATUAL && mesmaPasta(RAIZ_DA_PASTA_ATUAL, process.cwd()) === false) {
  // stderr: quem consome `--json` no stdout não pode ganhar uma linha a mais.
  console.error(`  ↑ raiz do projeto: ${RAIZ_DA_PASTA_ATUAL} (pasta acima da atual)`);
}

// Command table: each entry returns a result; `checkSuccess` entries set a
// non-zero exit code when the handler reports { success: false }.
const commands = {
  dashboard: {
    run: () => dashboard(cwd, { port: values.port, open: !values['no-open'] }),
    checkSuccess: true,
  },
  init: {
    run: () => {
      // Casa acima: a regra do roteador diz que ela é a raiz. Não bloqueia (há
      // quem queira um projeto à parte), mas não pode acontecer em silêncio.
      const casaAcima = raizDoProjeto(dirname(cwd));
      if (casaAcima) console.log(`  ⚠️  a pasta acima já é um projeto da Banca (${casaAcima}); pelo desenho ela é a raiz (uma pasta por escritório, com os casos dentro). Preparar esta pasta cria um projeto separado dentro dela.`);
      return init(cwd, {
        skipDeps: values['skip-deps'] === true,
        perfil: typeof values.perfil === 'string' ? values.perfil : undefined,
        // Non-interactive (`--yes`) lets the /banca skill auto-initialize the
        // current project folder without prompting — keeping every project's data local.
        ...(values.yes
          ? {
            _skipPrompts: true,
            _language: values.lang || 'Português (Brasil)',
            _ides: values.ide
              ? String(values.ide).split(',').map((s) => s.trim()).filter(Boolean)
              : ['claude-code'],
          }
          : {}),
      });
    },
  },
  'install-global': { run: () => installGlobal() },
  perfil: { run: () => perfilCli(positionals[1], cwd, { json: values.json === true }), checkSuccess: true },
  install: { run: () => skillsCli('install', positionals.slice(1), cwd), checkSuccess: true },
  uninstall: { run: () => skillsCli('remove', positionals.slice(1), cwd), checkSuccess: true },
  update: {
    run: () => {
      const target = positionals[1];
      // `update <name>` updates a single skill; bare `update` updates the core.
      return target ? skillsCli('update-one', [target], cwd) : update(cwd);
    },
    checkSuccess: true,
  },
  skills: { run: () => skillsCli(positionals[1], positionals.slice(2), cwd), checkSuccess: true },
  agents: { run: () => agentsCli(positionals[1], positionals.slice(2), cwd), checkSuccess: true },
  'indexar-skills': { run: () => indexSkillsProject(cwd), checkSuccess: true },
  'contract-skills': {
    run: () => contractSkillsProject(cwd, { force: values.force === true }),
    checkSuccess: true,
  },
  'check-skills': { run: () => checkSkillsProject(cwd), checkSuccess: true },
  // Gate mecânico de squad: o que o build.prompt.md descreve como
  // "Filesystem Validation" verificado por código, com exit code utilizável.
  'eval-init': {
    run: () => {
      const squadsDir = values['squads-dir'] || join(cwd, 'squads');
      const alvos = positionals[1] ? [positionals[1]] : squadsSemEvals(squadsDir);
      if (!alvos.length) {
        console.log('\n  Todos os squads já têm o harness de eval (scores.md + ao menos um caso).\n');
        return { success: true };
      }
      let pendentes = 0;
      for (const nome of alvos) {
        try {
          const r = semearEvals(join(squadsDir, nome));
          pendentes += r.pendentes;
          const feito = r.criados.length ? r.criados.map((c) => `+ ${c}`).join(', ') : 'nada a criar';
          console.log(`  ${r.code}: ${feito}${r.jaExistiam.length ? ` (já existia: ${r.jaExistiam.join(', ')})` : ''}`);
        } catch (e) {
          console.error(`  ${nome}: ${e.message}`);
          return { success: false };
        }
      }
      if (pendentes) {
        console.log(`\n  ⚠️  ${pendentes} marcador(es) [PREENCHER] nos casos-ouro. O \`check-squad\` passa a`);
        console.log('     aceitar o squad, mas a avaliação só vale quando o input fictício for escrito:');
        console.log('     é trabalho humano, e caso-ouro com fato inventado por máquina não mede nada.\n');
      }
      return { success: true };
    },
  },
  'check-squad': {
    run: () => {
      const alvo = positionals[1];
      if (!alvo) {
        console.error('Uso: npx banca check-squad <code> [--squads-dir <dir>]');
        return { success: false };
      }
      const squadsDir = values['squads-dir'] || join(cwd, 'squads');
      const r = checkSquad(alvo, { squadsDir });

      const erros = r.issues.filter((i) => i.severity === 'error');
      const avisos = r.issues.filter((i) => i.severity === 'warn');

      console.log(`Squad: ${r.squad}`);
      for (const i of erros) console.log(`  ✖ [${i.code}] ${i.detail}`);
      for (const i of avisos) console.log(`  ⚠ [${i.code}] ${i.detail}`);
      console.log(
        r.ok
          ? `  ✓ estrutura íntegra${avisos.length ? ` (${avisos.length} aviso(s))` : ''}`
          : `  ${erros.length} erro(s); corrija antes de rodar o squad`
      );

      return { success: r.ok };
    },
    checkSuccess: true,
  },
  'compilar-squad': {
    run: () => compilarSquadCli(positionals[1], cwd, values),
    checkSuccess: true,
  },
  'squad-modelo': {
    run: () => squadModeloCli(positionals[1], cwd, values),
    checkSuccess: true,
  },
  // Envio da estrutura dos squads à caixa de entrada da comunidade (src/contribuicao.js). Nunca
  // falha para quem chama: o runner o roda no fim do run aprovado.
  contribuir: {
    run: () => contribuirCli(cwd, values),
  },
  squads: {
    run: () => squadsCli(cwd, values),
    checkSuccess: true,
  },
  'audit-skills': { run: () => auditSkillsProject(cwd, { skills: values.skill || [] }), checkSuccess: true },
  'search-skills': {
    run: () => skillSearchCli(values.query || positionals.slice(1).join(' '), cwd, values),
    checkSuccess: true,
  },
  'detail-skill': {
    run: () => skillDetailCli(positionals[1] || '', cwd, values),
    checkSuccess: true,
  },
  'search-acervo': {
    run: () => acervoSearchCli(values.query || positionals.slice(1).join(' '), cwd, values),
    checkSuccess: true,
  },
  // Forward the raw argv tail (not parseArgs output) so engine flags like
  // --sigiloso / --start / --transcribe survive intact.
  captura: {
    run: () => capturaCli(process.argv.slice(3)),
    checkSuccess: true,
  },
  'resolve-skills': {
    run: () => skillRuntimeCli(positionals.slice(1), cwd, values),
    checkSuccess: true,
  },
  diagnostico: {
    run: () => diagnosticoCli(cwd, { json: values.json === true, consertar: values.consertar === true }),
  },
  acervo: {
    run: () => acervoCli(positionals[1] || 'status', cwd, { ...values, positionais: positionals.slice(2) }),
    checkSuccess: true,
  },
  ativar: {
    run: () => ativarCli(positionals[1] || '', cwd, values),
    checkSuccess: true,
  },
  runs: {
    run: async () => {
      const runs = await listRuns(positionals[1] || null, cwd);
      printRuns(runs);
    },
  },
  // Ritual matinal do chefe (persona default do runner: Lex, ⚖️): encadeia os
  // scripts orchestra DO PROJETO e reapresenta o agregado na voz do chefe.
  // `--briefing` é o único modo hoje, logo é o default quando nada é passado;
  // `--json` emite o agregado cru para a rotina agendada do usuário consumir
  // (o agendamento em si é decisão do usuário, nunca registrado por nós).
  chefe: {
    // `--briefing` segue aceito no parse e no usage (compat de CLI), mas não é
    // encaminhado: é o único modo e o chefeCli não o lê — hoje é redundante.
    run: async () => {
      // Rituais agendados (MIKE-CHEFE §6). `--agendar` e `--status` saem antes
      // do briefing: são o metanível (quando o ritual roda), não o ritual.
      if (values.agendar === true || values.aplicar === true || values.status === true) {
        return ritualCli(cwd, {
          agendar: values.agendar === true,
          aplicar: values.aplicar === true,
          status: values.status === true,
          hora: values.hora || undefined,
        });
      }
      const resultado = await chefeCli(cwd, { json: values.json === true });
      // O marcador é gravado AQUI, e não dentro do chefeCli, para o
      // `chefe-briefing.js` seguir puro em relação ao ritual: ele produz o
      // briefing, e quem contabiliza a execução é o comando. Só timestamp e
      // status entram (nunca conteúdo — ver `registrarExecucao`), e a falha ao
      // gravar nunca derruba um briefing que deu certo.
      registrarExecucao(cwd, {
        sucesso: resultado?.success === true,
        modo: values.json === true ? 'json' : 'briefing',
      });
      return resultado;
    },
    checkSuccess: true,
  },
  // Identidade do escritório (camada Desperta, src/escritorio.js): ficha, timbre, primeira peça.
  escritorio: { run: () => escritorioCli(positionals[1], cwd, values, positionals.slice(2)), checkSuccess: true },
  // Memória do chefe (MIKE-CHEFE §6). Porta ESTRUTURADA para o que o chefe
  // aprendeu sobre o escritório — sem ela, ele grava Markdown à mão e o índice
  // apodrece. `add` passa por `escrever()`, que RECUSA dado identificável de
  // cliente (LGPD); a mesma régua do hook `.claude/hooks/guarda-memoria.mjs`,
  // agora também no caminho de código.
  memoria: {
    run: () => memoriaCli(cwd, positionals[1], {
      tipo: values.tipo,
      titulo: values.titulo,
      corpo: values.corpo,
      origem: values.origem,
      json: values.json === true,
    }),
    checkSuccess: true,
  },
};

const entry = commands[command];

if (entry) {
  const result = await entry.run();
  if (entry.checkSuccess && result && !result.success) process.exitCode = 1;
} else {
  // Marca Banca: a ajuda que o advogado vê é AJUDA (src/ajuda.js, em português).
  // O HELP acima fica como o fornecedor o escreve; tests/ajuda.test.js confere
  // que todo subcomando dele está na AJUDA.
  console.log(AJUDA);
  if (command) process.exitCode = 1;
}
