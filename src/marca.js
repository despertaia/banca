// Marca da Banca: a fonte única das constantes de marca que o código usa.
//
// Camada Desperta (o fornecedor não tem este arquivo). Os textos longos que o
// advogado lê passam pela tabela de `marca/` (fora do que é publicado); aqui
// ficam só as constantes que o código compara, grava ou migra.
//
// Os valores LEGADOS servem só para reconhecer e migrar o que as instalações
// anteriores gravaram: o bloco do `CLAUDE.md` global e a pasta antiga da skill.
// As linhas que citam o nome antigo levam o comentário `marca:legado`, que o
// aplicador da tabela e o teste da marca pulam.
import { cp, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const NOME_PRODUTO = 'Banca';
/** Nome da pasta da skill no destino: é ele que vira o atalho `/banca`. */
export const NOME_SKILL = 'banca';
/** Nome do plugin do Claude Code: o atalho do plugin é `/banca:banca`. */
export const NOME_PLUGIN = 'banca';
/** Nome antigo da skill e do plugin; também é a pasta da skill nos modelos. */
export const NOME_SKILL_LEGADO = 'legalsquad';

/**
 * O comando que instala (e atualiza) o motor. É o tarball do GitHub, não o
 * atalho `github:` do npm: no Windows os advogados não têm Git, e o npm resolve
 * `github:` com `git`, então o comando falha com `spawn git ENOENT`. O tarball é
 * só um arquivo baixado por HTTPS e instala igual, sem precisar de Git.
 */
export const COMANDO_INSTALAR = 'npm install -g https://github.com/despertaia/banca/archive/refs/heads/main.tar.gz';

/** O condutor padrão de todo squad: quem fala com o advogado durante o run. */
export const CHEFE_PADRAO_BANCA = { nome: 'Lex', icon: '⚖️' };

// Marcadores do bloco que o `install-global` grava no `~/.claude/CLAUDE.md`, e
// os do contexto que o plugin injeta no início da conversa.
export const CLAUDE_MD_BEGIN = '<!-- BEGIN Banca (install-global) -->';
export const CLAUDE_MD_END = '<!-- END Banca (install-global) -->';
export const PLUGIN_BEGIN = '<!-- BEGIN Banca (plugin do Claude Code) -->';
export const PLUGIN_END = '<!-- END Banca (plugin do Claude Code) -->';
export const CLAUDE_MD_BEGIN_LEGADO = '<!-- BEGIN LegalSquad (install-global) -->'; // marca:legado
export const CLAUDE_MD_END_LEGADO = '<!-- END LegalSquad (install-global) -->'; // marca:legado

// Um bloco inteiro (BEGIN…END do mesmo nome), novo ou legado. Sem âncora de
// linha (^/$ quebram com CRLF). Global: colapsa todos os blocos de uma vez.
export const BLOCK_RE = /<!-- BEGIN (Banca|LegalSquad) \(install-global\) -->[\s\S]*?<!-- END \1 \(install-global\) -->/g; // marca:legado

/** Os avisos (statusMessage) que o advogado vê enquanto um hook roda. */
export const AVISOS = Object.freeze({
  citacoes: 'Banca · conferindo as citações',
  redacao: 'Banca · conferindo a redação',
  lgpd: 'Banca · protegendo dados do cliente (LGPD)',
  citacoesReserva: 'Banca · conferindo as citações (reserva)',
  peca: 'Banca · conferindo a peça',
  preparando: 'Banca · preparando este computador',
});

// Os comandos e as skills com o nome do produto: nos modelos, o caminho fica o
// do fornecedor (o merge semanal não vê renomeação); no projeto e na máquina,
// o destino leva o nome novo, e é ele que vira o atalho `/banca` em cada IDE.
// Pasta (termina em `/`): tudo o que está dentro vai junto. Arquivo: só ele.
// Regras (`.cursor/rules/`, `.trae/rules/`, `.agent/rules/`) e hooks mantêm o
// nome: não são comandos, e renomeá-los não muda nada para o advogado.
const L = NOME_SKILL_LEGADO;
export const DESTINOS_DA_MARCA = Object.freeze([
  { modelo: `.claude/skills/${L}/`, destino: `.claude/skills/${NOME_SKILL}/` },
  { modelo: `.gemini/skills/${L}/`, destino: `.gemini/skills/${NOME_SKILL}/` },
  { modelo: `.qwen/skills/${L}/`, destino: `.qwen/skills/${NOME_SKILL}/` },
  { modelo: `.agents/skills/${L}/`, destino: `.agents/skills/${NOME_SKILL}/` },
  { modelo: `.cursor/commands/${L}.md`, destino: `.cursor/commands/${NOME_SKILL}.md` },
  { modelo: `.opencode/commands/${L}.md`, destino: `.opencode/commands/${NOME_SKILL}.md` },
  { modelo: `.github/prompts/${L}.prompt.md`, destino: `.github/prompts/${NOME_SKILL}.prompt.md` },
  { modelo: `.agent/workflows/${L}.md`, destino: `.agent/workflows/${NOME_SKILL}.md` },
].map(Object.freeze));

/**
 * Caminho de destino de um arquivo de um modelo de IDE (relativo à pasta do
 * modelo): o comando ou a skill com o nome antigo vai para o nome novo; o resto
 * fica como está. Aceita `\` (Windows) e devolve com barras normais quando troca.
 */
export function destinoDaSkill(rel) {
  const normal = String(rel).split('\\').join('/');
  for (const { modelo, destino } of DESTINOS_DA_MARCA) {
    if (modelo.endsWith('/') ? normal.startsWith(modelo) : normal === modelo) {
      return modelo.endsWith('/') ? destino + normal.slice(modelo.length) : destino;
    }
  }
  return rel;
}

/** Um SKILL.md é nosso? `name:` antigo ou novo, e a descrição abrindo com o nome do produto. */
export function ehSkillNossa(texto) {
  const topo = String(texto ?? '').slice(0, 4096);
  if (!/^---\r?\n/.test(topo)) return false;
  const campo = (nome) => (new RegExp(`^${nome}:[ \\t]*(.*)$`, 'm').exec(topo)?.[1] || '').trim().replace(/^["']|["']$/g, '');
  return [NOME_SKILL_LEGADO, NOME_SKILL].includes(campo('name')) && /^(LegalSquad|Banca):/.test(campo('description')); // marca:legado
}

// A descrição que os nossos comandos e skills carregaram em todas as versões
// (conferido no histórico dos modelos): o nome antigo ou o novo seguido de
// ":" ou "—", ou "Executa" com o artigo e o nome. Sempre com "orquestração
// multi-agente": um atalho do usuário que só cite o nome não passa.
const DESCRICAO_NOSSA = /^(?:(?:LegalSquad|Banca)\s*[:—–]|Executa (?:o LegalSquad|a Banca)\b)/; // marca:legado

/**
 * Um comando ou skill (de qualquer IDE) é nosso? Frontmatter no topo; `name:`,
 * se houver, é o antigo ou o novo (obrigatório com `exigeNome`, para as pastas
 * de skill); e a descrição é uma das nossas (DESCRICAO_NOSSA) e fala de
 * "orquestração multi-agente". Na dúvida, não é nosso: o arquivo fica.
 */
export function ehArquivoNosso(texto, { exigeNome = false } = {}) {
  const topo = String(texto ?? '').slice(0, 4096);
  const fm = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(topo);
  if (!fm) return false;
  const campo = (nome) => (new RegExp(`^${nome}:[ \\t]*(.*?)\\r?$`, 'm').exec(fm[1])?.[1] || '').trim().replace(/^["']|["']$/g, '');
  const nome = campo('name');
  if (nome ? ![NOME_SKILL_LEGADO, NOME_SKILL].includes(nome) : exigeNome) return false;
  const descricao = campo('description');
  return DESCRICAO_NOSSA.test(descricao) && /orquestração multi-agente/i.test(descricao);
}

async function ehArquivo(caminho) {
  try {
    return (await stat(caminho)).isFile();
  } catch {
    return false;
  }
}

async function existe(caminho) {
  try {
    await stat(caminho);
    return true;
  } catch {
    return false;
  }
}

/** AAAAMMDD-HHMMSS, hora local: nome de pasta de backup que um humano lê. */
export function carimboAgora(d = new Date()) {
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
}

/**
 * Move `origem` (arquivo ou pasta) para `destino`, criando as pastas no caminho.
 * Entre discos diferentes (EXDEV) copia e apaga. Os outros erros (no Windows,
 * EPERM/EBUSY de uma pasta aberta em outro programa) sobem para quem chama.
 */
export async function moverPara(origem, destino) {
  await mkdir(dirname(destino), { recursive: true });
  try {
    await rename(origem, destino);
  } catch (erro) {
    if (erro?.code !== 'EXDEV') throw erro;
    await cp(origem, destino, { recursive: true, errorOnExist: true, force: false });
    await rm(origem, { recursive: true, force: true });
  }
}

/**
 * No projeto, tira os comandos e skills com o nome antigo (DESTINOS_DA_MARCA)
 * quando: (1) o destino novo já existe (o usuário nunca fica sem o comando) e
 * (2) o antigo é nosso (`ehSkillNossa` ou `ehArquivoNosso`; nas pastas de skill,
 * com `name:`). O antigo nunca é apagado: vai inteiro (a pasta da skill, com o
 * que o usuário tenha posto nela, ou o arquivo do comando) para
 * `_legalsquad/backups/<AAAAMMDD-HHMMSS>/<caminho original>`, que nenhuma IDE
 * carrega. Um comando nosso pode ter linhas que o usuário acrescentou.
 * Devolve [{ antigo, backup }] (caminhos relativos à raiz, com barras normais);
 * quando a mudança falha (arquivo aberto no Windows), { antigo, erro } e o
 * antigo fica onde está.
 */
export async function removerDestinosLegados(raiz, { carimbo = carimboAgora() } = {}) {
  const removidos = [];
  let pastaBackup = null;
  for (const { modelo, destino } of DESTINOS_DA_MARCA) {
    const ehPasta = modelo.endsWith('/');
    const partes = modelo.split('/').filter(Boolean);
    const antigo = join(raiz, ...partes);
    const novo = join(raiz, ...destino.split('/').filter(Boolean));
    const arquivoAntigo = ehPasta ? join(antigo, 'SKILL.md') : antigo;
    if (!(await ehArquivo(ehPasta ? join(novo, 'SKILL.md') : novo))) continue;
    if (!(await ehArquivo(arquivoAntigo))) continue;
    const texto = await readFile(arquivoAntigo, 'utf8');
    const nosso = ehPasta ? ehSkillNossa(texto) || ehArquivoNosso(texto, { exigeNome: true }) : ehArquivoNosso(texto);
    if (!nosso) continue;
    const rel = modelo.replace(/\/$/, '');
    if (!pastaBackup) {
      // Uma pasta por update; se já existir (dois updates no mesmo segundo), a próxima livre.
      pastaBackup = `_legalsquad/backups/${carimbo}`;
      for (let n = 2; await existe(join(raiz, ...pastaBackup.split('/'))); n++) pastaBackup = `_legalsquad/backups/${carimbo}-${n}`;
    }
    const backup = `${pastaBackup}/${rel}`;
    try {
      await moverPara(antigo, join(raiz, ...backup.split('/')));
    } catch (erro) {
      removidos.push({ antigo: modelo, erro });
      continue;
    }
    removidos.push({ antigo: modelo, backup: ehPasta ? `${backup}/` : backup });
  }
  return removidos;
}

/**
 * Tira a skill antiga (a pasta do nome antigo dentro de `pastaSkills`) quando
 * ela é nossa pela régua estrita (`ehArquivoNosso` com `name:` e "orquestração
 * multi-agente" na descrição), a mesma de `installGlobalSkill`. Nada é apagado:
 * a pasta vai INTEIRA (com um `.bak` ou o que o usuário tenha posto nela) para
 * `<pastaBackup>/skills/<nome antigo>/`, fora de `~/.claude/skills/`, onde o
 * Claude Code a carregaria como uma segunda skill. `pastaBackup` é o caminho da
 * pasta do backup (`~/.legalsquad/backups/<AAAAMMDD-HHMMSS>`) ou uma função
 * (pode ser assíncrona) que o devolve, chamada só quando há o que mover.
 * Devolve `{ estado, backup?, erro? }`: 'movida' (com `backup`, o destino),
 * 'alheia' (existe e não é nossa: fica como está), 'ausente', ou 'presa' (é
 * nossa, mas não pôde sair: no Windows, EPERM/EBUSY de pasta aberta em outro
 * programa; fica onde está, e `erro` diz por quê).
 */
export async function removerSkillLegada(pastaSkills, pastaBackup) {
  const antiga = join(pastaSkills, NOME_SKILL_LEGADO);
  try {
    if (!(await stat(antiga)).isDirectory()) return { estado: 'alheia' };
  } catch {
    return { estado: 'ausente' };
  }
  let texto;
  try {
    texto = await readFile(join(antiga, 'SKILL.md'), 'utf8');
  } catch {
    return { estado: 'alheia' };
  }
  if (!ehArquivoNosso(texto, { exigeNome: true })) return { estado: 'alheia' };
  try {
    const base = typeof pastaBackup === 'function' ? await pastaBackup() : pastaBackup;
    if (!base) throw new Error('sem pasta de backup');
    const backup = join(base, 'skills', NOME_SKILL_LEGADO);
    await moverPara(antiga, backup);
    return { estado: 'movida', backup };
  } catch (erro) {
    return { estado: 'presa', erro };
  }
}

/**
 * Hooks já registrados por uma instalação anterior: a entrada com exatamente
 * este `command` ganha o aviso novo. Entrada de outro comando (do usuário) não
 * é tocada. Devolve true se mudou alguma.
 */
export function renovarAviso(entradas, comando, aviso) {
  let mudou = false;
  for (const entrada of Array.isArray(entradas) ? entradas : []) {
    for (const hook of Array.isArray(entrada?.hooks) ? entrada.hooks : []) {
      if (hook?.command === comando && hook.statusMessage !== aviso) {
        hook.statusMessage = aviso;
        mudou = true;
      }
    }
  }
  return mudou;
}
