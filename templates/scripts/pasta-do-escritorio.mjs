/**
 * A pasta do escritório que o advogado vê: os nomes e a cópia das peças prontas.
 *
 * Camada Desperta (Fase 0B, bloco 3, desenho §6.8.1). Cópia IDÊNTICA em
 * `templates/scripts/pasta-do-escritorio.mjs`: o empacotador roda dentro do
 * projeto do advogado, onde `src/` não existe. `tests/pasta-do-escritorio.test.js`
 * reprova as duas cópias diferentes (conserto: `cp scripts/pasta-do-escritorio.mjs
 * templates/scripts/`). Os nomes das pastas são definidos AQUI e só aqui: o
 * motor (`src/pasta-do-escritorio.js`) os reexporta para o `init`, o `update`,
 * o `diagnostico` e os comandos do Lex.
 *
 * Só usa `node:fs`, `node:path`, `./timbre-proprio.mjs` (que acha o JSZip para comparar
 * peças por dentro) e `./timbre.mjs` (para saber se a minuta já traz fecho com assinatura).
 */
import { closeSync, constants, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync } from 'node:fs';
import path, { basename, dirname, extname, join } from 'node:path';
import { carregarJSZip } from './timbre-proprio.mjs';
import { AVISO_DE_TREINO, temAssinatura } from './timbre.mjs';

export const PASTAS = Object.freeze({
  clientes: '1 - Clientes',
  modelos: '2 - Meus modelos',
  identidade: '3 - Identidade do escritório',
  prontas: '4 - Peças prontas',
});
export const COMECE_AQUI = 'COMECE AQUI';
export const LEIA_ME = 'LEIA-ME.txt';
export const CASO_DE_TREINO = 'Caso de treino';
// A primeira linha dos casos fictícios de `templates/casos-de-treino/` (a pasta que o `init` copia).
export const CABECALHO_DO_CASO_DE_TREINO = '# CASO FICTÍCIO · para treino';
const PASTA_DOS_CASOS_DE_TREINO = 'casos-de-treino';
// A peça de treino leva isto no nome do arquivo, logo depois da data: `AAAA-MM-DD TREINO - <título>.docx`.
export const PREFIXO_DE_TREINO = 'TREINO - ';
// A peça cujas citações não passaram pela conferência leva isto no nome, logo depois da data
// (e do «TREINO - »): `AAAA-MM-DD CONFERIR CITAÇÕES - <título>.docx`. Numa pasta chamada
// «prontas», a peça sem conferência não pode parecer pronta.
export const PREFIXO_SEM_CONFERENCIA = 'CONFERIR CITAÇÕES - ';
// O título da peça no nome do arquivo: até 60 caracteres, e menos só se o caminho ficar fundo demais no Windows.
const MAX_TITULO = 60;
const MIN_TITULO = 20;
const MAX_CAMINHO = 240; // o Windows recusa caminho de 260 caracteres ou mais; sobra folga para o « (n)»

// O Windows também recusa o nome reservado com extensão (`con.txt`, `nul.x`).
const RESERVADOS = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
/**
 * Um nome de pasta ou de arquivo que o Windows aceita: sem `< > : " / \ | ? *`,
 * sem caractere de controle, sem ponto nem espaço no fim, sem ponto ou
 * sublinhado no começo (a Banca trata `.x` e `_x` como pasta interna e a
 * esconderia), até `max` caracteres (80), e nunca um nome reservado (CON, NUL,
 * `nul.txt`…). Vazio vira `reserva`.
 */
export function nomeSeguro(texto, reserva = 'Sem nome', max = 80) {
  // eslint-disable-next-line no-control-regex -- tirar o caractere de controle é o serviço: o Windows o recusa em nome de arquivo
  let t = String(texto ?? '').normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/^[._ ]+/, '');
  if (t.length > max) t = t.slice(0, max).trim();
  t = t.replace(/[. ]+$/, '');
  return !t || RESERVADOS.test(t) ? reserva : t;
}

function lerJson(caminho) {
  // Salvo no Bloco de Notas, o arquivo pode vir com BOM.
  try { return JSON.parse(readFileSync(caminho, 'utf8').replace(/^\uFEFF/, '')); } catch { return null; }
}

/**
 * O cliente ligado ao time (`squads/<time>/caso.json`: a chave `cliente`, ou a
 * pasta do caso em `1 - Clientes/<nome>`), ou null. O nome vem INTEIRO, sem o
 * corte de 80: a pasta em `4 - Peças prontas` tem de ser igual à de `1 - Clientes`
 * sempre, e quem protege o Windows é o limite do caminho (240), no título.
 */
function clienteDoTime(squadDir) {
  const caso = lerJson(join(squadDir, 'caso.json')) || {};
  if (typeof caso.cliente === 'string' && caso.cliente.trim()) return nomeSeguro(caso.cliente, 'Sem nome', Infinity);
  for (const chave of ['autos', 'pasta']) {
    const partes = typeof caso[chave] === 'string' ? caso[chave].split(/[\\/]+/).filter(Boolean) : [];
    const i = partes.indexOf(PASTAS.clientes);
    if (i >= 0 && partes[i + 1]) return nomeSeguro(partes[i + 1], 'Sem nome', Infinity);
  }
  return null;
}

/** Fora do Windows, a barra invertida de um caminho escrito à moda do Windows vale como separador. */
function comSeparadorDoSistema(texto, caminhos = path) {
  return caminhos.sep === '/' ? texto.replace(/\\/g, '/') : texto;
}

/**
 * O primeiro trecho, dentro do escritório, de um caminho do `caso.json` (relativo à
 * raiz ou absoluto; com `/` ou `\`), ou null quando o caminho sai do escritório ou é
 * a própria raiz. No Windows, a letra do disco e os nomes valem em qualquer caixa.
 * `caminhos` (`node:path`, `path.win32`, `path.posix`) existe para os testes.
 */
export function trechoDoCaso(raiz, texto, caminhos = path) {
  const bruto = String(texto ?? '').trim();
  if (!bruto) return null;
  const rel = caminhos.relative(raiz, caminhos.resolve(raiz, comSeparadorDoSistema(bruto, caminhos)));
  if (!rel || caminhos.isAbsolute(rel)) return null;
  const primeiro = rel.split(/[\\/]+/)[0];
  return primeiro === '..' ? null : primeiro;
}

/** Os `.md` de uma pasta (só os de primeiro nível), ou nenhum. */
function mdsDaPasta(pasta) {
  try {
    return readdirSync(pasta, { withFileTypes: true }).filter((e) => e.isFile() && /\.md$/i.test(e.name)).map((e) => e.name);
  } catch {
    return []; // não existe, ou não é pasta
  }
}

/**
 * O arquivo abre com o cabeçalho do caso fictício? Lê só os primeiros 512 bytes (autos
 * podem ser enormes) e compara a primeira linha não vazia, tolerando BOM e CRLF.
 */
function abreComoCasoDeTreino(arquivo) {
  if (!/\.md$/i.test(arquivo)) return false;
  let fd = null;
  try {
    fd = openSync(arquivo, 'r');
    const inicio = Buffer.alloc(512);
    const lidos = readSync(fd, inicio, 0, inicio.length, 0);
    const linha = inicio.subarray(0, lidos).toString('utf8').replace(/^\uFEFF/, '').split(/\r\n|\r|\n/).map((l) => l.trim()).find(Boolean);
    return (linha || '').normalize('NFC') === CABECALHO_DO_CASO_DE_TREINO;
  } catch {
    return false; // não existe, é pasta, ou não abriu
  } finally {
    if (fd !== null) try { closeSync(fd); } catch { /* já fechado */ }
  }
}

/**
 * O time é o do caso de treino? É quando o caso é o fictício, por qualquer caminho:
 * - nos autos DO TIME, o arquivo que `banca escritorio primeira-peca --criar --caso
 *   treino` copia (`squads/<time>/autos/caso-de-treino-<area>.md`), ou qualquer `.md`
 *   que abra com o cabeçalho do caso fictício (copiado à mão, com outro nome);
 * - `caso.json` que aponta a pasta dos casos de treino (o que `squad-modelo --caso`
 *   grava, relativo ou absoluto), ou um `.md` fictício (ou a pasta dele, ou os autos
 *   dela), pelo cabeçalho.
 * Com cliente ligado ao time, o nome `caso-de-treino-*.md` sozinho não basta: vale só
 * o cabeçalho.
 * O treino PREVALECE sobre um cliente escrito à mão no `caso.json` (a peça fictícia
 * nunca sai como peça de cliente; `avisosDoTreino` diz que o cliente foi ignorado).
 * O nome do time ou do cliente não conta ("Centro de Treinamento X" é peça real).
 * É o critério ÚNICO do treino: a pasta «Caso de treino», o «TREINO - » no nome
 * do arquivo, o aviso na peça e a falta de assinatura saem todos daqui.
 */
export function ehCasoDeTreino(squadDir) {
  const autos = join(squadDir, 'autos');
  // Com cliente ligado, o nome do arquivo sozinho não basta: o caso tem de abrir com o cabeçalho do fictício.
  const soPeloNome = clienteDoTime(squadDir) === null;
  if (mdsDaPasta(autos).some((n) => (soPeloNome && /^caso-de-treino-.+\.md$/.test(n)) || abreComoCasoDeTreino(join(autos, n)))) return true;
  const caso = lerJson(join(squadDir, 'caso.json'));
  if (!caso || typeof caso !== 'object') return false;
  const raiz = dirname(dirname(squadDir)); // caminhos do caso.json: relativos à pasta acima de squads/, ou absolutos
  for (const chave of ['autos', 'pasta']) {
    if (typeof caso[chave] !== 'string' || !caso[chave].trim()) continue;
    if (trechoDoCaso(raiz, caso[chave])?.toLowerCase() === PASTA_DOS_CASOS_DE_TREINO) return true;
    const alvo = path.resolve(raiz, comSeparadorDoSistema(caso[chave].trim()));
    for (const lugar of chave === 'pasta' ? [alvo, join(alvo, 'autos')] : [alvo]) {
      if (abreComoCasoDeTreino(lugar) || mdsDaPasta(lugar).some((n) => abreComoCasoDeTreino(join(lugar, n)))) return true;
    }
  }
  return false;
}

/**
 * Os avisos do empacotador sobre a peça de treino (uma linha cada; vazio quando
 * não há o que dizer): o cliente escrito à mão no `caso.json` que o treino ignorou,
 * e a minuta que já traz fecho com assinatura (o texto dela não é apagado; a peça
 * continua com o aviso de treino).
 */
export function avisosDoTreino(squadDir, textoDaPeca = '') {
  const avisos = [];
  const cliente = clienteDoTime(squadDir);
  if (cliente) avisos.push(`o time é do caso de treino: o cliente ligado a ele («${cliente}») foi ignorado, e a peça foi para «${CASO_DE_TREINO}»`);
  if (temAssinatura(textoDaPeca)) avisos.push('a minuta de treino tem um fecho com assinatura; a peça continua marcada como treino');
  return avisos;
}

/**
 * O `PROXIMOS-PASSOS.md` do pacote de treino: no lugar das tarefas de protocolo, o
 * que fazer com uma peça de caso inventado (ler e comparar) e como fazer a de um
 * caso real. Em português simples, sem caminho técnico.
 */
export function proximosPassosDoTreino() {
  return [
    '# Próximos passos · peça de treino',
    '',
    `**${AVISO_DE_TREINO}**`,
    '',
    'Esta peça foi feita com um caso inventado (nomes, fatos e valores fictícios), para você ver a Banca trabalhando. Ela não é para assinar, protocolar nem enviar a ninguém.',
    '',
    '## O que fazer com ela',
    '',
    '- [ ] Ler a peça com calma, como leria a de um colega.',
    '- [ ] Comparar com o que você faria: a estrutura, os fatos, os pedidos e a linguagem.',
    '- [ ] Ver o termo de conferência que vai ao lado: ele acompanha toda peça, com o que foi conferido nas citações e o que ficou pendente.',
    '- [ ] Anotar o que mudaria. Numa peça de caso seu, é só pedir a mudança ao Lex.',
    '',
    '## Para fazer a peça de um caso real',
    '',
    `1. Em «${PASTAS.clientes}», crie uma pasta com o nome do cliente e ponha nela os documentos do caso.`,
    '2. Diga ao Lex, por exemplo: «Lex, preciso de uma petição para a cliente Maria Silva».',
    `3. A peça sai no papel timbrado do escritório, com a assinatura, em «${PASTAS.prontas}», na pasta do cliente. A revisão e a assinatura são suas.`,
    '',
  ].join('\n');
}

/**
 * De quem é a peça, para o nome da subpasta em `4 - Peças prontas`: "Caso de
 * treino" quando o time é o do caso fictício (`ehCasoDeTreino`, que prevalece),
 * o cliente ligado ao time, e, sem nada disso, o nome do time (o caso).
 */
export function clienteOuCaso(squadDir) {
  return ehCasoDeTreino(squadDir) ? CASO_DE_TREINO : clienteDoTime(squadDir) ?? nomeSeguro(basename(squadDir), 'Sem nome');
}

/** O título da peça para o nome do arquivo: o `name:` do `squad.yaml`; sem ele, o nome do artefato. */
export function tituloDaPeca(squadDir, artefato, max = MAX_TITULO) {
  let nome = null;
  try {
    nome = /^name:[ \t]*(.+?)[ \t]*$/m.exec(readFileSync(join(squadDir, 'squad.yaml'), 'utf8'))?.[1]?.replace(/^["']|["']$/g, '') || null;
  } catch { /* sem squad.yaml */ }
  const doArtefato = basename(String(artefato || 'peca'), extname(String(artefato || ''))).replace(/[-_]+/g, ' ').trim();
  const t = nomeSeguro(nome || doArtefato, 'Peça', max);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** AAAA-MM-DD na hora local de quem recebe a peça. */
function dia(quando) {
  const d = quando ? new Date(quando) : new Date();
  const data = Number.isNaN(d.getTime()) ? new Date() : d;
  const p2 = (n) => String(n).padStart(2, '0');
  return `${data.getFullYear()}-${p2(data.getMonth() + 1)}-${p2(data.getDate())}`;
}

/** O que aconteceu, em português e sem caminho de arquivo (o advogado lê isto). */
function motivoEmPortugues(e) {
  return ['EBUSY', 'EPERM', 'EACCES'].includes(e?.code) ? 'o arquivo está aberto em outro programa' : `o sistema não deixou gravar (${e?.code || 'erro'})`;
}
const comNumero = (nome, n) => (n === 1 ? nome : `${basename(nome, extname(nome))} (${n})${extname(nome)}`);

/**
 * Duas peças são a mesma quando TODAS as partes do .docx são iguais (o corpo, o
 * cabeçalho e o rodapé do papel timbrado, as imagens, os estilos…), menos as de
 * `docProps/`: as propriedades levam a hora do empacotamento e mudam a cada vez.
 * Assim, a mesma peça com OUTRO papel timbrado é entrega nova. Sem o JSZip, ou
 * com arquivo que não abre como zip, compara os bytes. Arquivo ilegível (aberto
 * no Word) conta como diferente.
 */
async function mesmaPeca(a, b, raiz) {
  let bytesA;
  let bytesB;
  try { bytesA = readFileSync(a); bytesB = readFileSync(b); } catch { return false; }
  if (bytesA.equals(bytesB)) return true;
  try {
    const JSZip = await carregarJSZip(raiz);
    const partes = async (bytes) => {
      const zip = await JSZip.loadAsync(bytes);
      const nomes = Object.keys(zip.files).filter((n) => !zip.files[n].dir && !n.startsWith('docProps/')).sort();
      return { nomes, ler: (n) => zip.file(n).async('nodebuffer') };
    };
    const [pa, pb] = await Promise.all([partes(bytesA), partes(bytesB)]);
    if (!pa.nomes.length || pa.nomes.length !== pb.nomes.length || pa.nomes.some((n, i) => n !== pb.nomes[i])) return false;
    for (const n of pa.nomes) {
      const [x, y] = await Promise.all([pa.ler(n), pb.ler(n)]);
      if (!x.equals(y)) return false;
    }
    return true;
  } catch {
    return false; // sem JSZip ou sem zip: os bytes já diferiram
  }
}

/**
 * Por que a peça não entra em `4 - Peças prontas` como conferida, pelo estado do
 * registro da conferência de citações (o manifesto do Citation Gate) que o
 * empacotador já calculou: `manifesto` null (não há registro), `{ ilegivel }`,
 * `{ hashConfere: false }` (a peça mudou depois da conferência) ou `problemas`
 * (citações que a conferência não confirmou); registro sem `gate_status: "aprovado"`
 * ou sem a lista de citações conta como conferência não concluída. Devolve a linha de aviso, em
 * português e sem nome de arquivo (o Lex a diz ao advogado), ou null quando a
 * conferência está em dia.
 */
export function avisoDasCitacoes(manifesto, problemas = 0) {
  const nome = `a cópia em «${PASTAS.prontas}» tem «CONFERIR CITAÇÕES» no nome: confira as leis, súmulas e decisões citadas antes de usar a peça`;
  if (!manifesto) return `as citações desta peça não passaram pela conferência (não há o registro dela); ${nome}`;
  if (manifesto.ilegivel || !manifesto.dados) return `o registro da conferência das citações desta peça não pôde ser lido; ${nome}`;
  if (!manifesto.hashConfere) return `a peça mudou depois da conferência das citações; ${nome}`;
  // O hook de citações só aceita `gate_status: "aprovado"` com a lista de citações; o empacotador rodado à mão pode chegar aqui sem isso.
  if (manifesto.dados.gate_status !== 'aprovado' || !Array.isArray(manifesto.dados.citations)) return `a conferência das citações desta peça não foi concluída; ${nome}`;
  const n = Number(problemas) || 0;
  if (n > 0) return `${n === 1 ? '1 citação desta peça não foi confirmada' : `${n} citações desta peça não foram confirmadas`} na conferência; ${nome}`;
  return null;
}

/**
 * Copia a peça final do pacote para `4 - Peças prontas/<cliente ou caso>/`, com
 * o nome `AAAA-MM-DD <título>.docx` (o `.pdf`, se houver, e o termo de
 * conferência, como `AAAA-MM-DD <título> - termo de conferência.docx`). Na peça
 * de treino (`ehCasoDeTreino`), o nome dos três leva «TREINO - » logo depois da
 * data, e o prefixo nunca é cortado. Com `manifesto` (o estado do registro da
 * conferência de citações que o empacotador calculou; null: não há registro) e
 * `citacoesProblema`, a peça que não passou pela conferência (`avisoDasCitacoes`)
 * leva «CONFERIR CITAÇÕES - » no nome dos três, depois da data (e do «TREINO - »),
 * e a resposta traz `aviso` (a linha `ATENÇÃO:` do empacotador); a cópia não é
 * bloqueada. Sem `manifesto` (quem chama não sabe da conferência), nada muda. O
 * original continua em `squads/<time>/output/`. A pasta do cliente tem o MESMO
 * nome da pasta em `1 - Clientes` (nunca encurtado, nem no limite de 80 dos
 * outros nomes); só o título encurta, e
 * só se o caminho absoluto passaria de 240 caracteres (mínimo de 20; sem jeito,
 * não copia e diz por quê).
 *
 * Nunca sobrescreve uma entrega anterior: o advogado pode ter aberto, editado e
 * salvado o arquivo. O número da versão sai da PEÇA: se `AAAA-MM-DD <título>.docx`
 * já existe e é a mesma peça (`mesmaPeca`: o .docx inteiro, menos as
 * propriedades), é a mesma entrega, e o PDF e o termo que já estão lá ficam como
 * estão (o termo tem carimbo de hora e nunca seria igual); os que faltarem são
 * acrescentados. Se a peça é diferente (outro texto, ou outro papel timbrado), o
 * conjunto inteiro (peça, PDF e termo, juntos) sai como `… (2)`, `(3)`… Arquivo aberto no
 * Word (ilegível) conta como diferente. Nunca lança: falha vira `erro`, em
 * português e sem caminho técnico, e o pacote em `output/` continua valendo;
 * numa cópia parcial, `arquivos` traz o que foi e `erro` diz o que ficou de fora.
 * Devolve `{ pasta, arquivos, erro, aviso }` (caminhos relativos à raiz, com `/`;
 * `aviso` null quando a conferência está em dia ou não foi informada).
 */
export async function copiarParaPecasProntas({ manifesto, citacoesProblema = 0, ...opcoes }) {
  const aviso = manifesto === undefined ? null : avisoDasCitacoes(manifesto, citacoesProblema);
  return { ...(await copiarConjunto(opcoes, aviso ? PREFIXO_SEM_CONFERENCIA : '')), aviso };
}

async function copiarConjunto({ raiz, squadDir, pacoteDir, docx, pdf = null, termo = 'TERMO-DE-CONFERENCIA.docx', quando = null }, semConferencia) {
  const cliente = clienteOuCaso(squadDir);
  const treino = ehCasoDeTreino(squadDir);
  const relativa = `${PASTAS.prontas}/${cliente}`;
  const arquivos = [];
  try {
    const destino = join(raiz, ...relativa.split('/'));
    // O nome mais longo do conjunto é o do termo; sobram 5 caracteres para « (99)».
    const sufixoDoTermo = ' - termo de conferência.docx';
    const data = dia(quando);
    const prefixo = `${treino ? PREFIXO_DE_TREINO : ''}${semConferencia}`;
    const sobra = MAX_CAMINHO - (destino.length + 1 + data.length + 1 + prefixo.length + sufixoDoTermo.length + 5);
    const maxTitulo = Math.min(MAX_TITULO, sobra);
    if (maxTitulo < MIN_TITULO) {
      return { pasta: relativa, arquivos, erro: `a pasta do escritório está num caminho muito fundo do computador, e o Windows não aceita nomes tão longos: mova a pasta do escritório para mais perto do começo do disco (por exemplo, para «Documentos»). A peça continua guardada pela Banca` };
    }
    try {
      mkdirSync(destino, { recursive: true });
    } catch (e) {
      return { pasta: relativa, arquivos, erro: `não consegui criar a pasta do cliente em «${PASTAS.prontas}» (${motivoEmPortugues(e)})` };
    }
    const base = `${data} ${prefixo}${tituloDaPeca(squadDir, docx, maxTitulo)}`;
    const copias = [
      ['a peça em Word', docx, `${base}.docx`],
      ...(pdf ? [['o PDF', pdf, `${base}.pdf`]] : []),
      ...(termo && existsSync(join(pacoteDir, termo)) ? [['o termo de conferência', termo, `${base}${sufixoDoTermo}`]] : []),
    ];
    // A primeira versão livre, ou a primeira que já tem esta mesma peça.
    let n = 1;
    while (n <= 99) {
      const alvo = join(destino, comNumero(copias[0][2], n));
      if (!existsSync(alvo) || await mesmaPeca(join(pacoteDir, docx), alvo, raiz)) break;
      n++;
    }
    if (n > 99) return { pasta: relativa, arquivos, erro: `já há 99 versões desta peça em «${relativa}»: guarde ou apague as antigas` };
    const faltaram = [];
    for (const [rotulo, origem, nome] of copias) {
      // Sem a peça em Word, o PDF e o termo sozinhos não servem: para na primeira falha dela.
      if (!arquivos.length && faltaram.length) { faltaram.push(`${rotulo} (não copiado)`); continue; }
      const alvo = comNumero(nome, n);
      try {
        if (!existsSync(join(destino, alvo))) copyFileSync(join(pacoteDir, origem), join(destino, alvo), constants.COPYFILE_EXCL);
        arquivos.push(`${relativa}/${alvo}`);
      } catch (e) {
        faltaram.push(`${rotulo} (${motivoEmPortugues(e)})`);
      }
    }
    return { pasta: relativa, arquivos, erro: faltaram.length ? `ficou de fora: ${faltaram.join('; ')}` : null };
  } catch (e) {
    return { pasta: relativa, arquivos, erro: motivoEmPortugues(e) };
  }
}
