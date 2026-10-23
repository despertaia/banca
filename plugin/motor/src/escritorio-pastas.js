// O Lex e as quatro pastas do escritório: clientes, modelos novos e o papel que o advogado soltou na pasta 3.
//
// Camada Desperta (Fase 0B, bloco 3, desenho §6.8.1). O advogado não conhece
// `squads/` nem `acervo/`: ele põe arquivos nas pastas numeradas, e o Lex usa
// estes comandos para achá-los e levá-los para onde o motor espera.
//   - `banca escritorio cliente "<nome>"`: acha ou cria `1 - Clientes/<nome>` e,
//     com `--time`, liga o time ao cliente (`squads/<time>/caso.json`);
//   - `banca escritorio modelos`: diz o que há de novo em `2 - Meus modelos`;
//     com `--aprender`, leva os modelos para o acervo local
//     (`acervo/teses-modelos/meus-modelos/`), a rota que o motor já consulta;
//   - `banca escritorio papel` (sem arquivo): o que há em `3 - Identidade do
//     escritório` que pode ser papel timbrado ou logo, e se o Lex já o ofereceu
//     (`ja_oferecido`); com `--vistos "<arquivo>"`, marca a oferta daquele arquivo como feita (o advogado recusou);
//   - `banca escritorio pastas`: tudo isso de uma vez, para o começo da conversa.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

import { ehCasoDeTreino, nomeSeguro } from '../scripts/pasta-do-escritorio.mjs';
import { lerImagem } from '../scripts/timbre.mjs';
import { carregarJSZip, modoDaImagem, tipoDoArquivo } from '../scripts/timbre-proprio.mjs';
import { mesmoCaminho } from './escritorio-logo.js';
import { PASTA_DO_ESCRITORIO } from './escritorio.js';
import { LEIA_ME, PASTAS } from './pasta-do-escritorio.js';

export const COPIA_DA_FOLHA = 'Folha de teste do papel timbrado.docx';
export const ARQUIVO_DOS_MODELOS_VISTOS = join(PASTA_DO_ESCRITORIO, 'modelos-vistos.json');
/** O papel e o logo da pasta 3 que o Lex já ofereceu ao advogado (e ele recusou): por nome, tamanho e data. */
export const ARQUIVO_DA_IDENTIDADE_VISTA = join(PASTA_DO_ESCRITORIO, 'identidade-vista.json');
export const PASTA_DOS_MODELOS_NO_ACERVO = join('acervo', 'teses-modelos', 'meus-modelos');

// O nome da pasta do cliente ao criar (a busca compara o nome inteiro).
const MAX_CLIENTE = 80;
const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const chave = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const interno = (nome) => nome.startsWith('.') || nome.startsWith('_') || nome === LEIA_ME || nome.startsWith('~$');

/** Os arquivos de uma pasta (com subpastas), fora os internos (`_index.yaml`, `_texto/`, ocultos, LEIA-ME). */
function arquivosDe(pasta) {
  let entradas;
  try { entradas = readdirSync(pasta, { withFileTypes: true }); } catch { return []; }
  return entradas.filter((e) => !interno(e.name)).flatMap((e) => (e.isDirectory() ? arquivosDe(join(pasta, e.name)).map((a) => `${e.name}/${a}`) : [e.name])).sort();
}

// ---------------------------------------------------------------------------
// 1 - Clientes
// ---------------------------------------------------------------------------
/** Os clientes que já têm pasta. */
export function listarClientes(raiz) {
  try {
    return readdirSync(join(raiz, PASTAS.clientes), { withFileTypes: true }).filter((e) => e.isDirectory() && !interno(e.name)).map((e) => e.name).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  } catch {
    return [];
  }
}

/**
 * Acha a pasta do cliente (sem ligar para acento, maiúscula ou pontuação) ou a
 * cria. Quando o nome não bate com nenhuma pasta mas parece com alguma ("Maria"
 * e já existe "Maria Silva"), NÃO cria: devolve `parecidos`, e o Lex pergunta
 * ao advogado (`novo: true` cria assim mesmo). Com `time`, grava em
 * `squads/<time>/caso.json` a pasta do cliente como a dos documentos do caso
 * (`autos`) e o nome dele (`cliente`), que dá nome à subpasta em `4 - Peças prontas`;
 * o time do caso de treino é recusado (a peça fictícia não vira peça de cliente).
 * Devolve `{ success, cliente, pasta, criada, documentos, parecidos, caso }`.
 */
export function pastaDoCliente(raiz, nome, { novo = false, time = null } = {}) {
  // O nome inteiro, sem cortar, é o que se compara com as pastas que existem; o corte (80) só vale ao criar.
  const inteiro = nomeSeguro(nome, '', Infinity);
  if (!inteiro) return { success: false, erro: 'diga o nome do cliente: `npx banca escritorio cliente "<nome>"`' };
  // O time é conferido ANTES de criar a pasta: com time inválido, nada é criado.
  let squad = null;
  if (time) {
    const codigo = String(time);
    if (/[\\/]/.test(codigo) || codigo === '.' || codigo.includes('..') || codigo.trim() !== codigo) return { success: false, erro: `«${codigo}» não é o nome de um time (use só o nome, como aparece em squads/)` };
    squad = join(raiz, 'squads', codigo);
    let ehPasta = false;
    try { ehPasta = statSync(squad).isDirectory(); } catch { /* não existe */ }
    if (!ehPasta) return { success: false, erro: `o time squads/${codigo} não existe nesta pasta` };
    // O time do caso de treino gera peça marcada como treino; ligado a um cliente, a peça fictícia passaria por peça dele.
    if (ehCasoDeTreino(squad)) return { success: false, erro: `o time squads/${codigo} é o do caso de treino (fictício): para um cliente, crie outro time e ligue o cliente a ele` };
  }
  const clientes = listarClientes(raiz);
  let cliente = clientes.find((c) => chave(c) === chave(inteiro)) || null;
  let criada = false;
  if (!cliente) {
    const palavras = chave(inteiro).split(' ');
    const parecidos = novo ? [] : clientes.filter((c) => { const dele = chave(c).split(' '); return palavras.every((p) => dele.includes(p)) || dele.every((p) => palavras.includes(p)); });
    if (parecidos.length) return { success: true, cliente: null, pasta: null, criada: false, documentos: 0, parecidos };
    const pedido = nomeSeguro(inteiro, '', MAX_CLIENTE);
    // O corte não pode fazer o nome novo cair na pasta de OUTRO cliente.
    const mesmoCorte = clientes.filter((c) => chave(c) === chave(pedido));
    if (mesmoCorte.length) {
      if (novo) return { success: false, erro: `o nome é longo demais e, cortado, cai na pasta «${mesmoCorte[0]}»: use um nome que difira nos primeiros ${MAX_CLIENTE} caracteres` };
      return { success: true, cliente: null, pasta: null, criada: false, documentos: 0, parecidos: mesmoCorte };
    }
    mkdirSync(join(raiz, PASTAS.clientes, pedido), { recursive: true });
    cliente = pedido;
    criada = true;
  }
  const pasta = `${PASTAS.clientes}/${cliente}`;
  const saida = { success: true, cliente, pasta, criada, documentos: arquivosDe(join(raiz, PASTAS.clientes, cliente)).length, parecidos: [] };
  if (squad) {
    let atual = {};
    try { atual = JSON.parse(readFileSync(join(squad, 'caso.json'), 'utf8')) || {}; } catch { /* sem caso.json */ }
    // Os documentos ficam soltos na pasta do cliente (sem subpasta obrigatória): `autos` aponta para ela.
    const caso = { ...atual, autos: pasta, cliente };
    delete caso.pasta;
    writeFileSync(join(squad, 'caso.json'), `${JSON.stringify(caso, null, 2)}\n`, 'utf8');
    saida.caso = `squads/${time}/caso.json`;
  }
  return saida;
}

// ---------------------------------------------------------------------------
// 2 - Meus modelos
// ---------------------------------------------------------------------------
function lerVistos(raiz) {
  try { return JSON.parse(readFileSync(join(raiz, ARQUIVO_DOS_MODELOS_VISTOS), 'utf8')) || {}; } catch { return {}; }
}
const assinaturaDe = (arquivo) => { const s = statSync(arquivo); return { tamanho: s.size, modificado: Math.floor(s.mtimeMs) }; };

/** Os arquivos de `2 - Meus modelos` que o Lex ainda não viu (novos, ou mudados depois de vistos). */
export function modelosNovos(raiz) {
  const pasta = join(raiz, PASTAS.modelos);
  const vistos = lerVistos(raiz);
  const todos = arquivosDe(pasta);
  const novos = todos.filter((rel) => {
    const v = vistos[rel];
    const a = assinaturaDe(join(pasta, ...rel.split('/')));
    return !v || v.tamanho !== a.tamanho || v.modificado !== a.modificado;
  });
  return { pasta: PASTAS.modelos, total: todos.length, novos };
}

/**
 * Marca como vistos os modelos dados (ou todos os novos). `destinos` (opcional) diz,
 * para cada modelo, o nome do arquivo que ele ocupa no acervo: assim a próxima
 * versão do mesmo modelo regrava o mesmo destino, e nenhum outro modelo o toma.
 */
export function marcarModelosVistos(raiz, arquivos = modelosNovos(raiz).novos, destinos = {}) {
  const vistos = lerVistos(raiz);
  for (const rel of arquivos) {
    try { vistos[rel] = { ...assinaturaDe(join(raiz, PASTAS.modelos, ...rel.split('/'))), ...(destinos[rel] ? { destino: destinos[rel] } : vistos[rel]?.destino ? { destino: vistos[rel].destino } : {}) }; } catch { /* sumiu */ }
  }
  mkdirSync(join(raiz, PASTA_DO_ESCRITORIO), { recursive: true });
  writeFileSync(join(raiz, ARQUIVO_DOS_MODELOS_VISTOS), `${JSON.stringify(vistos, null, 2)}\n`, 'utf8');
  return arquivos.length;
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
/** O texto de um .docx, um parágrafo por linha (tabulação e quebra de linha preservadas). */
export async function textoDoDocx(JSZip, bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const documento = await zip.file('word/document.xml')?.async('string');
  if (!documento) throw new Error('não é um documento do Word (.docx)');
  return documento.split(/<\/w:p>/).map((p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(tab|br|cr)\b[^>]*\/>/g)]
    .map((m) => (m[2] ? (m[2] === 'tab' ? '\t' : '\n') : m[1].replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENTIDADES[e]).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))))
    .join('').trim()).filter(Boolean).join('\n\n');
}

/**
 * Leva os modelos novos para o acervo local (`acervo/teses-modelos/meus-modelos/`),
 * que os agentes de pesquisa consultam antes da web: o .docx vira Markdown (o
 * texto, com um aviso no alto); .pdf, .md e .txt são copiados. `.doc` antigo e
 * outros formatos ficam em `pendentes`, com o que o advogado precisa fazer.
 * Depois, o Lex roda `npm run indexar-acervo`.
 * Devolve `{ aprendidos: [{ arquivo, destino }], pendentes: [{ arquivo, motivo }] }`.
 */
export async function aprenderModelos(raiz) {
  const { novos } = modelosNovos(raiz);
  const aprendidos = [];
  const pendentes = [];
  if (!novos.length) return { aprendidos, pendentes };
  const destino = join(raiz, PASTA_DOS_MODELOS_NO_ACERVO);
  mkdirSync(destino, { recursive: true });
  const JSZip = await carregarJSZip(raiz);
  // Um nome de arquivo único por modelo: a subpasta entra no nome (`Trabalhista - Inicial`) e, se ainda
  // assim já houver arquivo com esse nome (de outro modelo, ou o corte de comprimento juntou dois),
  // vem ` (2)`, ` (3)`. O modelo que já tem destino registrado o mantém (é o mesmo modelo, revisto).
  const vistos = lerVistos(raiz);
  // Todo destino já registrado é de alguém (mesmo com o arquivo apagado do acervo): outro modelo nunca o toma.
  const emUso = new Set(Object.values(vistos).filter((v) => v?.destino).map((v) => v.destino.toLowerCase()));
  const destinos = {};
  const nomeDoDestino = (rel, extDestino) => {
    if (vistos[rel]?.destino && extname(vistos[rel].destino).toLowerCase() === extDestino) { emUso.add(vistos[rel].destino.toLowerCase()); return vistos[rel].destino; }
    const base = nomeSeguro(rel.slice(0, rel.length - extname(rel).length).split('/').join(' - '), 'modelo');
    for (let n = 1; ; n++) {
      const candidato = `${n === 1 ? base : `${base} (${n})`}${extDestino}`;
      if (!emUso.has(candidato.toLowerCase()) && !existsSync(join(destino, candidato))) { emUso.add(candidato.toLowerCase()); return candidato; }
    }
  };
  for (const rel of novos) {
    const origem = join(raiz, PASTAS.modelos, ...rel.split('/'));
    const ext = extname(rel).toLowerCase();
    const nome = nomeSeguro(basename(rel, extname(rel)), 'modelo');
    try {
      const bytes = readFileSync(origem);
      const tipo = tipoDoArquivo(bytes);
      if (tipo === 'zip' && ['.docx', '.dotx', '.docm'].includes(ext)) {
        const texto = await textoDoDocx(JSZip, bytes);
        if (!texto) throw new Error('o documento não tem texto (só imagem?)');
        const aviso = `> Modelo do escritório: peça do próprio advogado, trazida de «${PASTAS.modelos}/${rel}». Serve de referência de estilo e de estrutura. Os dados de cliente que ela traz NÃO podem ser reaproveitados em peça de outro cliente.`;
        const arq = nomeDoDestino(rel, '.md');
        writeFileSync(join(destino, arq), `# ${nome}\n\n${aviso}\n\n${texto}\n`, 'utf8');
        destinos[rel] = arq;
        aprendidos.push({ arquivo: rel, destino: `${PASTA_DOS_MODELOS_NO_ACERVO.replace(/\\/g, '/')}/${arq}` });
      } else if (tipo === 'pdf' || ['.md', '.txt'].includes(ext)) {
        const arq = nomeDoDestino(rel, ext);
        copyFileSync(origem, join(destino, arq));
        destinos[rel] = arq;
        aprendidos.push({ arquivo: rel, destino: `${PASTA_DOS_MODELOS_NO_ACERVO.replace(/\\/g, '/')}/${arq}` });
      } else if (tipo === 'ole') {
        pendentes.push({ arquivo: rel, motivo: 'formato antigo do Word (.doc) ou arquivo com senha: abra no Word e salve como «Documento do Word (.docx)»' });
      } else {
        pendentes.push({ arquivo: rel, motivo: 'formato que o Lex não lê como modelo: use Word (.docx) ou PDF' });
      }
    } catch (e) {
      pendentes.push({ arquivo: rel, motivo: e.message });
    }
  }
  marcarModelosVistos(raiz, aprendidos.map((a) => a.arquivo), destinos);
  return { aprendidos, pendentes };
}

// ---------------------------------------------------------------------------
// 3 - Identidade do escritório
// ---------------------------------------------------------------------------
/**
 * O que o advogado soltou em `3 - Identidade do escritório`, pelo que cada
 * arquivo é (pelos bytes): `papel` ('word', 'pdf', 'imagem-faixa',
 * 'imagem-pagina'), `logo` (imagem que não é faixa nem página) ou `outro`
 * (com o motivo). A cópia da folha de teste não conta. Cada item traz
 * `ja_oferecido`: o Lex já ofereceu ESTE arquivo (mesmo nome, tamanho e data) e
 * o advogado recusou (`marcarIdentidadeVista`); arquivo trocado volta a `false`.
 */
export function arquivosDaIdentidade(raiz) {
  const pasta = join(raiz, PASTAS.identidade);
  const vistos = lerIdentidadeVista(raiz);
  return arquivosDe(pasta).filter((rel) => rel !== COPIA_DA_FOLHA).map((rel) => ({ ...oQueE(pasta, rel), ja_oferecido: mesmaAssinatura(vistos[rel], join(pasta, ...rel.split('/'))) }));
}

function lerIdentidadeVista(raiz) {
  try {
    const v = JSON.parse(readFileSync(join(raiz, ARQUIVO_DA_IDENTIDADE_VISTA), 'utf8').replace(/^\uFEFF/, ''));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {}; // sem registro (ou ilegível): nada foi oferecido ainda
  }
}
function mesmaAssinatura(vista, arquivo) {
  if (!vista) return false;
  try { const a = assinaturaDe(arquivo); return vista.tamanho === a.tamanho && vista.modificado === a.modificado; } catch { return false; }
}

/**
 * Marca como já oferecido UM arquivo da pasta 3 (o que o advogado recusou), para o
 * Lex não repetir a oferta a cada conversa; os outros continuam podendo ser
 * oferecidos. `arquivo`: como a lista o traz (`3 - Identidade do escritório/<nome>`),
 * só o nome, ou o caminho absoluto; a barra do Windows vale. Só papel ou logo têm
 * oferta. Devolve `{ success: true, marcados: 1 | 0, arquivo }` (0: já estava
 * marcado) ou `{ success: false, erro }`, sem marcar nada.
 */
export function marcarIdentidadeVista(raiz, arquivo, { plataforma = process.platform } = {}) {
  const pedido = String(arquivo ?? '').trim().replace(/^["']|["']$/g, '').replace(/\\/g, '/');
  if (!pedido) return { success: false, erro: 'diga o arquivo que o advogado recusou: `npx banca escritorio papel --vistos "<arquivo>"` (o nome como a lista da pasta 3 traz)' };
  const pasta = `${PASTAS.identidade}/`;
  const absoluta = `${join(raiz, PASTAS.identidade).replace(/\\/g, '/')}/`;
  // No Windows, `c:\esc\3 - identidade…\LOGO.PNG` é o mesmo arquivo: a caixa não conta (`mesmoCaminho`).
  const comeca = (prefixo, relativo) => pedido.length > prefixo.length
    && mesmoCaminho(relativo ? join(raiz, pedido.slice(0, prefixo.length)) : pedido.slice(0, prefixo.length), relativo ? join(raiz, prefixo) : prefixo, plataforma);
  const semPrefixo = comeca(absoluta, false) ? pedido.slice(absoluta.length) : comeca(pasta, true) ? pedido.slice(pasta.length) : pedido;
  const item = arquivosDaIdentidade(raiz).find((i) => mesmoCaminho(join(raiz, i.arquivo), join(raiz, `${pasta}${semPrefixo}`), plataforma));
  if (!item) return { success: false, erro: `não encontrei «${pedido}» na pasta «${PASTAS.identidade}»` };
  const rel = item.arquivo.slice(pasta.length); // o nome real, como a lista o traz
  if (item.serve !== 'papel' && item.serve !== 'logo') return { success: false, erro: `«${rel}» não é papel timbrado nem logo: não há oferta a marcar` };
  if (item.ja_oferecido) return { success: true, marcados: 0, arquivo: item.arquivo };
  const vistos = lerIdentidadeVista(raiz);
  try {
    vistos[rel] = assinaturaDe(join(raiz, PASTAS.identidade, ...rel.split('/')));
  } catch {
    return { success: false, erro: `não encontrei «${pedido}» na pasta «${PASTAS.identidade}»` }; // sumiu agora
  }
  mkdirSync(join(raiz, PASTA_DO_ESCRITORIO), { recursive: true });
  writeFileSync(join(raiz, ARQUIVO_DA_IDENTIDADE_VISTA), `${JSON.stringify(vistos, null, 2)}\n`, 'utf8');
  return { success: true, marcados: 1, arquivo: item.arquivo };
}

/** O que um arquivo da pasta 3 é, pelos bytes: `{ arquivo, serve, tipo | motivo }`. */
function oQueE(pasta, rel) {
  const arquivo = `${PASTAS.identidade}/${rel}`;
  try {
    const bytes = readFileSync(join(pasta, ...rel.split('/')));
    const tipo = tipoDoArquivo(bytes);
    if (tipo === 'zip') return /\.(?:docx|dotx|docm|dotm)$/i.test(rel) ? { arquivo, serve: 'papel', tipo: 'word' } : { arquivo, serve: 'outro', motivo: 'não é Word, imagem nem PDF' };
    if (tipo === 'pdf') return { arquivo, serve: 'papel', tipo: 'pdf' };
    if (tipo === 'ole') return { arquivo, serve: 'outro', motivo: 'formato antigo do Word (.doc) ou arquivo com senha: salve como .docx' };
    if (tipo === 'png' || tipo === 'jpg') {
      const modo = modoDaImagem(lerImagem(bytes));
      return modo ? { arquivo, serve: 'papel', tipo: `imagem-${modo}` } : { arquivo, serve: 'logo', tipo: 'imagem' };
    }
    return { arquivo, serve: 'outro', motivo: 'não é Word, imagem nem PDF' };
  } catch (e) {
    return { arquivo, serve: 'outro', motivo: e.message };
  }
}

/** A folha de teste também na pasta que o advogado vê. Devolve o caminho da cópia, ou null (sem a pasta 3, ou cópia que falhou). */
export function copiarFolhaParaIdentidade(raiz, folha) {
  const pasta = join(raiz, PASTAS.identidade);
  if (!existsSync(pasta)) return null;
  try {
    copyFileSync(folha, join(pasta, COPIA_DA_FOLHA));
    return join(pasta, COPIA_DA_FOLHA);
  } catch {
    return null; // aberta no Word (Windows): a de _legalsquad/escritorio/ continua valendo
  }
}
