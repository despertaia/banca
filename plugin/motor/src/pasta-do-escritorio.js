// A pasta do escritório que o advogado vê (desenho §6.8.1).
//
// Camada Desperta (Fase 0B, bloco 3). Público: advogados que mal usam o chat.
// Ao abrir a pasta, o advogado vê `COMECE AQUI` e quatro pastas numeradas, cada
// uma com um `LEIA-ME.txt` de até cinco linhas; as pastas da máquina ficam
// escondidas. Nada muda de lugar: o motor, os hooks e o merge semanal não são
// afetados. `init` e `update` chamam `prepararPasta`; `banca diagnostico` diz
// como a pasta está (`estadoDaPasta`), e `--consertar` reaplica.
//
// Esconder é por plataforma, só na PASTA (os arquivos de dentro continuam
// graváveis: arquivo oculto no Windows falha ao ser reaberto para escrita):
//   - Windows: `attrib +h <pasta>`, sem `/s`;
//   - macOS: `chflags hidden <pasta>`;
//   - Linux: nada (não há equivalente; as pastas com ponto já são ocultas).
// O comando que esconde nunca derruba o `init`: falha vira item em `falhas`.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMECE_AQUI, LEIA_ME, PASTAS } from '../scripts/pasta-do-escritorio.mjs';

export { COMECE_AQUI, LEIA_ME, PASTAS };

const RAIZ_DO_PACOTE = join(dirname(fileURLToPath(import.meta.url)), '..');
/** O `COMECE AQUI.pdf` que vai no pacote (gerado por `scripts/gerar-comece-aqui.mjs`). */
export const PDF_DO_PACOTE = join(RAIZ_DO_PACOTE, '_legalsquad', 'core', 'pasta-do-escritorio', `${COMECE_AQUI}.pdf`);

/**
 * As pastas da máquina, que o advogado não precisa ver. As de IDE entram todas:
 * só as que existem são escondidas. `casos-de-treino` é lido pelo Lex, não pelo
 * advogado.
 */
export const PASTAS_TECNICAS = Object.freeze([
  '_legalsquad', 'acervo', 'casos-de-treino', 'dashboard', 'node_modules', 'scripts', 'skills', 'squads',
  '.claude', '.agent', '.agents', '.codex', '.cursor', '.gemini', '.github', '.opencode', '.qwen', '.trae', '.vscode',
]);

/** O texto de cada `LEIA-ME.txt`: até cinco linhas, em português simples. */
export const TEXTOS_LEIA_ME = Object.freeze({
  clientes: [
    'CLIENTES',
    'Crie aqui uma pasta para cada cliente, com o nome dele (por exemplo: Maria Silva).',
    'Dentro dela, coloque os documentos do caso: contratos, fotos, PDFs do processo.',
    'Depois, peça ao Lex: «Lex, preciso de uma petição para a Maria Silva».',
    'Se a pasta do cliente ainda não existir, o Lex cria para você.',
  ],
  modelos: [
    'MEUS MODELOS',
    'Coloque aqui peças que você já escreveu e de que gosta (Word ou PDF).',
    'O Lex aprende com elas o seu jeito de escrever e de organizar a peça.',
    'Quando puser um arquivo novo, diga: «Lex, coloquei modelos novos».',
    'Antes de colocar uma peça aqui, tire nomes e dados de clientes: o conteúdo é enviado ao Claude para o Lex ler.',
  ],
  identidade: [
    'IDENTIDADE DO ESCRITÓRIO',
    'Coloque aqui o logo e o papel timbrado do escritório (Word, imagem ou PDF).',
    'Depois, diga: «Lex, coloquei meu papel timbrado na pasta 3».',
    'As peças passam a sair no seu papel, e o Lex mostra uma folha de teste antes.',
    'Sem papel timbrado? O Lex monta um com o seu logo e os dados do escritório.',
  ],
  prontas: [
    'PEÇAS PRONTAS',
    'Tudo o que a Banca entrega aparece aqui, numa pasta para cada cliente.',
    'O nome do arquivo começa pela data, para a mais nova ficar fácil de achar.',
    'Toda peça é um rascunho: leia, corrija e assine antes de usar.',
    'Pode copiar, mover ou apagar estes arquivos: o original fica guardado pela Banca.',
  ],
});

/** O `COMECE AQUI`, em linhas. É a fonte do `.txt` e do `.pdf` (o PDF é gerado destas linhas). */
export const LINHAS_DO_COMECE_AQUI = Object.freeze([
  'COMECE AQUI',
  '',
  'Esta é a pasta do seu escritório na Banca. Você só precisa das quatro pastas numeradas.',
  '',
  'AS QUATRO PASTAS',
  '',
  `${PASTAS.clientes}: uma pasta para cada cliente, com os documentos do caso dentro.`,
  `${PASTAS.modelos}: peças suas, em Word ou PDF, para o Lex aprender o seu jeito de escrever. Tire antes nomes e dados de clientes: o conteúdo é enviado ao Claude para o Lex ler.`,
  `${PASTAS.identidade}: o logo e o papel timbrado do escritório. As peças saem com ele.`,
  `${PASTAS.prontas}: tudo o que a Banca entrega fica aqui, separado por cliente.`,
  '',
  'COMO PEDIR',
  '',
  'Escreva na conversa com o Lex, do seu jeito. Três exemplos:',
  '',
  '«Lex, preciso de uma petição inicial para a cliente Maria Silva. Os documentos estão na pasta dela.»',
  '«Lex, coloquei meu papel timbrado na pasta 3. Pode usar nas peças.»',
  '«Lex, onde está a peça que você fez ontem?»',
  '',
  'TRÊS COISAS PARA LEMBRAR',
  '',
  '1. Toda peça é um rascunho: leia, corrija e assine. A responsabilidade pela peça é sua.',
  '2. O Lex confere as citações; confira de novo antes de protocolar.',
  '3. Os arquivos soltos nesta pasta (fora das quatro pastas) são do programa: não apague, não mude de lugar e não mexa neles.',
  '',
  'Precisa de ajuda? Escreva: «Lex, me ajuda».',
]);
/** A marca que liga o PDF do pacote ao texto acima: muda o texto, muda a marca, e o teste pede o PDF novo. */
export const MARCA_DO_COMECE_AQUI = createHash('sha256').update(LINHAS_DO_COMECE_AQUI.join('\n')).digest('hex').slice(0, 12);

/**
 * A marca gravada num `COMECE AQUI.pdf`, ou null. Ela vai nas palavras-chave do
 * documento (`marca-<hash>`), e não no título, que o leitor de PDF mostra na
 * barra. O LibreOffice escreve as palavras-chave sem compressão em dois
 * lugares: nos metadados XMP (`<pdf:Keywords>`) e no dicionário de informações
 * (`/Keywords`, texto simples ou UTF-16 em hexadecimal).
 */
export function marcaDoPdf(bytes) {
  const texto = bytes.toString('latin1');
  const candidatos = [/<pdf:Keywords>([^<]*)<\/pdf:Keywords>/.exec(texto)?.[1] || ''];
  for (const [, simples] of texto.matchAll(/\/Keywords\s*\(([^)]*)\)/g)) candidatos.push(simples);
  for (const [, hex] of texto.matchAll(/\/Keywords\s*<FEFF([0-9A-Fa-f]+)>/g)) {
    let t = '';
    for (let i = 0; i + 4 <= hex.length; i += 4) t += String.fromCharCode(Number.parseInt(hex.slice(i, i + 4), 16));
    candidatos.push(t);
  }
  for (const t of candidatos) {
    const marca = /marca-([0-9a-f]{12})\s*$/.exec(t.trim())?.[1];
    if (marca) return marca;
  }
  return null;
}

// Texto para o Bloco de Notas do Windows: BOM (acentos certos em versões antigas) e CRLF.
const paraTxt = (linhas) => `\uFEFF${linhas.join('\r\n')}\r\n`;

// ---------------------------------------------------------------------------
// Esconder as pastas técnicas
// ---------------------------------------------------------------------------
function rodarComando(comando, args) {
  const r = spawnSync(comando, args, { encoding: 'utf8', timeout: 15_000, windowsHide: true });
  return { status: r.error ? null : r.status, stdout: r.stdout || '' };
}

/** A pasta está escondida? `true`, `false` ou `null` (a plataforma não tem o que esconder, ou não deu para saber). */
export function estaEscondida(pasta, { plataforma = process.platform, rodar = rodarComando } = {}) {
  if (plataforma === 'win32') {
    const r = rodar('attrib', [pasta]);
    if (r.status !== 0) return null;
    // `     H       C:\Escritorio\_legalsquad`: as letras dos atributos vêm antes do caminho.
    const atributos = /^(.*?)(?:[A-Za-z]:\\|\\\\)/.exec(r.stdout.trim());
    return atributos ? atributos[1].includes('H') : null;
  }
  if (plataforma === 'darwin') {
    const r = rodar('stat', ['-f', '%f', pasta]);
    const bits = Number.parseInt(r.stdout.trim(), 10);
    return r.status === 0 && Number.isFinite(bits) ? (bits & 0x8000) !== 0 : null; // UF_HIDDEN
  }
  return null;
}

/**
 * Esconde (ou, com `mostrar`, volta a mostrar) as pastas técnicas que existem.
 * Devolve `{ feitas: [nomes], falhas: [{ pasta, motivo }], suportado }`.
 * Falha nunca lança: o advogado só vê umas pastas a mais, e o diagnóstico avisa.
 */
export function esconderPastas(raiz, { mostrar = false, plataforma = process.platform, rodar = rodarComando } = {}) {
  const suportado = plataforma === 'win32' || plataforma === 'darwin';
  const feitas = [];
  const falhas = [];
  if (!suportado) return { feitas, falhas, suportado };
  for (const nome of PASTAS_TECNICAS) {
    const pasta = join(raiz, nome);
    try {
      if (!statSync(pasta).isDirectory()) continue;
    } catch {
      continue;
    }
    if (plataforma === 'darwin' && nome.startsWith('.') && !mostrar) continue; // o Finder já não mostra
    let r;
    try {
      r = plataforma === 'win32' ? rodar('attrib', [mostrar ? '-h' : '+h', pasta]) : rodar('chflags', [mostrar ? 'nohidden' : 'hidden', pasta]);
    } catch (e) {
      r = { status: null, stdout: e.message };
    }
    if (r.status === 0) feitas.push(nome);
    else falhas.push({ pasta: nome, motivo: r.status === null ? 'o comando do sistema não pôde ser executado' : `o comando do sistema saiu com ${r.status}` });
  }
  return { feitas, falhas, suportado };
}

// ---------------------------------------------------------------------------
// Criar o que falta
// ---------------------------------------------------------------------------
/**
 * Deixa a raiz como o advogado precisa ver: as quatro pastas (só as que faltam),
 * um `LEIA-ME.txt` em cada (só se não existir: o advogado pode ter reescrito),
 * o `COMECE AQUI` (o PDF do pacote; sem ele, um `.txt` com o mesmo texto) e as
 * pastas técnicas escondidas. Idempotente. Devolve
 * `{ criadas: [caminhos], comeceAqui: 'pdf'|'txt', escondidas: [nomes], falhas: [...], suportado }`.
 */
export function prepararPasta(raiz, { plataforma = process.platform, rodar = rodarComando, pdf = PDF_DO_PACOTE, copiar = copyFileSync } = {}) {
  const criadas = [];
  const falhasDaCopia = [];
  for (const [chave, nome] of Object.entries(PASTAS)) {
    const pasta = join(raiz, nome);
    if (!existsSync(pasta)) {
      mkdirSync(pasta, { recursive: true });
      criadas.push(`${nome}/`);
    }
    const leiaMe = join(pasta, LEIA_ME);
    if (!existsSync(leiaMe)) {
      writeFileSync(leiaMe, paraTxt(TEXTOS_LEIA_ME[chave]), 'utf8');
      criadas.push(`${nome}/${LEIA_ME}`);
    }
  }
  // O PDF é nosso (o advogado não edita PDF): o do pacote substitui o que estiver lá quando muda.
  const destinoPdf = join(raiz, `${COMECE_AQUI}.pdf`);
  const destinoTxt = join(raiz, `${COMECE_AQUI}.txt`);
  let comeceAqui = 'txt';
  if (existsSync(pdf)) {
    // Em try/catch próprio: no Windows o PDF aberto num leitor não se regrava (EBUSY/EPERM),
    // e isso não pode impedir de esconder as pastas técnicas nem de criar o resto.
    try {
      if (!existsSync(destinoPdf) || !readFileSync(destinoPdf).equals(readFileSync(pdf))) {
        copiar(pdf, destinoPdf);
        criadas.push(`${COMECE_AQUI}.pdf`);
      }
      comeceAqui = 'pdf';
    } catch (e) {
      const ocupado = ['EBUSY', 'EPERM', 'EACCES'].includes(e.code);
      falhasDaCopia.push({
        pasta: `${COMECE_AQUI}.pdf`,
        motivo: ocupado
          ? 'o arquivo está aberto em outro programa; feche-o e rode `npx banca diagnostico --consertar`'
          : `não foi possível gravar o arquivo (${e.message}); \`npx banca diagnostico --consertar\` tenta de novo`,
      });
      if (existsSync(destinoPdf)) comeceAqui = 'pdf'; // o PDF que já estava lá continua valendo
    }
    if (comeceAqui === 'pdf') rmSync(destinoTxt, { force: true }); // um COMECE AQUI só
  }
  if (comeceAqui === 'txt') {
    const texto = paraTxt(LINHAS_DO_COMECE_AQUI);
    if (!existsSync(destinoTxt) || readFileSync(destinoTxt, 'utf8') !== texto) {
      writeFileSync(destinoTxt, texto, 'utf8');
      criadas.push(`${COMECE_AQUI}.txt`);
    }
  }
  const { feitas, falhas, suportado } = esconderPastas(raiz, { plataforma, rodar });
  return { criadas, comeceAqui, escondidas: feitas, falhas: [...falhasDaCopia, ...falhas], suportado };
}

/**
 * Como a pasta está, para o `banca diagnostico`: o que falta (pastas, LEIA-ME,
 * COMECE AQUI) e que pastas técnicas estão à vista. Não altera nada.
 * Devolve `{ faltam: [caminhos], aVista: [nomes], suportado }`.
 */
export function estadoDaPasta(raiz, { plataforma = process.platform, rodar = rodarComando } = {}) {
  const faltam = [];
  for (const nome of Object.values(PASTAS)) {
    if (!existsSync(join(raiz, nome))) faltam.push(`${nome}/`);
    else if (!existsSync(join(raiz, nome, LEIA_ME))) faltam.push(`${nome}/${LEIA_ME}`);
  }
  if (!existsSync(join(raiz, `${COMECE_AQUI}.pdf`)) && !existsSync(join(raiz, `${COMECE_AQUI}.txt`))) faltam.push(COMECE_AQUI);
  const suportado = plataforma === 'win32' || plataforma === 'darwin';
  const aVista = [];
  if (suportado) {
    let nomes = [];
    try { nomes = readdirSync(raiz, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { /* raiz ilegível */ }
    for (const nome of PASTAS_TECNICAS) {
      if (!nomes.includes(nome) || (plataforma === 'darwin' && nome.startsWith('.'))) continue;
      if (estaEscondida(join(raiz, nome), { plataforma, rodar }) === false) aVista.push(nome);
    }
  }
  return { faltam, aVista, suportado };
}

/** `n` e a palavra no singular ou no plural: `contar(1, 'pasta criada', 'pastas criadas')` → «1 pasta criada». */
const contar = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;

/** Uma linha para o `init` e o `update` dizerem o que fizeram com a pasta. */
export function resumoDaPreparacao(r) {
  const partes = [];
  const pastas = r.criadas.filter((c) => c.endsWith('/')).length;
  const arquivos = r.criadas.length - pastas;
  if (pastas) partes.push(contar(pastas, 'pasta criada', 'pastas criadas'));
  if (arquivos) partes.push(contar(arquivos, 'arquivo de orientação gravado', 'arquivos de orientação gravados'));
  if (r.escondidas.length) partes.push(contar(r.escondidas.length, 'pasta técnica escondida', 'pastas técnicas escondidas'));
  const daCopia = r.falhas.filter((f) => f.pasta === `${COMECE_AQUI}.pdf`);
  const dasPastas = r.falhas.filter((f) => f.pasta !== `${COMECE_AQUI}.pdf`);
  if (daCopia.length) partes.push(`${COMECE_AQUI}.pdf não pôde ser copiado (${daCopia[0].motivo})`);
  if (dasPastas.length) partes.push(`${contar(dasPastas.length, 'pasta técnica não pôde ser escondida', 'pastas técnicas não puderam ser escondidas')}: ${dasPastas.map((f) => f.pasta).join(', ')} (\`npx banca diagnostico --consertar\` tenta de novo)`);
  return partes.length ? `Pasta do escritório: ${partes.join('; ')}` : 'Pasta do escritório: em ordem';
}

/** A linha `CONSERTO:` de `banca diagnostico --consertar`. */
export function resumoDoConserto(r) {
  const escondidas = r.escondidas.length ? contar(r.escondidas.length, 'pasta técnica escondida', 'pastas técnicas escondidas') : 'nenhuma pasta técnica escondida';
  const falhas = r.falhas.length ? `, ${contar(r.falhas.length, 'item não pôde ser feito', 'itens não puderam ser feitos')}: ${r.falhas.map((f) => `${f.pasta} (${f.motivo})`).join(', ')}` : '';
  return `CONSERTO: ${r.criadas.length ? contar(r.criadas.length, 'item recriado', 'itens recriados') : 'nenhum item recriado'}, ${escondidas}${falhas}`;
}
