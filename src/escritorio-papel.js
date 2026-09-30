// O papel timbrado do PRÓPRIO escritório: receber o arquivo, provar que serve e guardar.
//
// Camada Desperta (Fase 0B, bloco 3, desenho §6.8.2). `banca escritorio papel
// <arquivo>` aceita, pelos bytes (nunca pela extensão):
//   - Word (.docx/.dotx): o caminho completo, o transplante de `scripts/timbre-proprio.mjs`;
//   - imagem (PNG/JPEG): faixa de cabeçalho ou página inteira, que vira um papel .docx;
//   - PDF: a primeira página vira imagem, se houver conversor na máquina.
// Antes de gravar qualquer coisa, o papel é PROVADO numa peça de verdade. Só
// então vai para `_legalsquad/escritorio/papel-timbrado.docx` e para a ficha
// (`timbre: { modelo: "proprio", arquivo }`). Falha segura: se o arquivo não
// serve, nada muda, o erro sai em português e, quando dá, o logo de dentro do
// arquivo é guardado para o modelo lateral. Na troca, o papel que estava lá
// fica guardado como `papel-timbrado.anterior.docx` (um nível de histórico), e
// volta ao lugar se a ficha não puder ser gravada.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { carregarEstilo, localizarSoffice, markdownParaDocx } from '../scripts/empacotar.mjs';
import { ARQUIVO_DO_PAPEL, lerImagem } from '../scripts/timbre.mjs';
import { ErroDoPapel, carregarJSZip, logoDoPapel, modoDaImagem, papelDeImagem, tipoDoArquivo, transplantar } from '../scripts/timbre-proprio.mjs';
import { ARQUIVO_DA_FICHA, PASTA_DO_ESCRITORIO, aplicarFicha, lerFicha, validarFicha } from './escritorio.js';
import { gravarAtomico, motivoDoSistema, renomearAtomico } from './escritorio-json.js';

export const LIMITE_DO_PAPEL = 15 * 1024 * 1024;
/** O papel que estava valendo antes da última troca (um nível de histórico). */
export const ARQUIVO_DO_PAPEL_ANTERIOR = 'papel-timbrado.anterior.docx';
// A cópia do papel que vale, feita ANTES da troca; vira o `.anterior` só quando a troca deu certo.
export const ARQUIVO_DO_PAPEL_EM_TROCA = 'papel-timbrado.antes-da-troca.docx';
const EM_WORD_OU_IMAGEM = 'Abra o papel timbrado no Word e use «Salvar como» → «Documento do Word (.docx)», ou mande uma imagem (PNG ou JPG) da página inteira: uma captura de tela serve';
const SEM_CONVERSOR = `este computador não tem um programa que transforme PDF em imagem. ${EM_WORD_OU_IMAGEM}`;
const PDF_NAO_CONVERTIDO = `não consegui transformar este PDF em imagem (o arquivo pode estar com defeito ou protegido, ou o programa que faz a conversão estava ocupado). ${EM_WORD_OU_IMAGEM}`;

/** `status`: o código de saída, ou null quando o comando não rodou até o fim; `existe`: o programa está na máquina (null com ele = estourou o tempo). */
function rodarComando(comando, args) {
  const r = spawnSync(comando, args, { stdio: 'ignore', timeout: 120_000, windowsHide: true });
  return { status: r.error ? null : r.status, existe: !(r.error && r.error.code === 'ENOENT') };
}

/**
 * O empacotador DA PASTA do escritório conhece o papel do próprio escritório?
 * Pasta sem `scripts/empacotar.mjs` usa o do motor (conhece). Com ele, o
 * `scripts/timbre.mjs` ao lado tem de conhecer `modelo: 'proprio'` e ter o
 * `timbre-proprio.mjs`: um `timbre.mjs` mais antigo devolve "sem timbre" para o
 * modelo que não conhece, e a peça sairia com cabeçalho só de texto, sem aviso.
 */
export function pastaConhecePapelProprio(raiz) {
  const scripts = join(raiz, 'scripts');
  if (!existsSync(join(scripts, 'empacotar.mjs'))) return true;
  try {
    return existsSync(join(scripts, 'timbre-proprio.mjs')) && readFileSync(join(scripts, 'timbre.mjs'), 'utf8').includes("'proprio'");
  } catch {
    return false; // sem timbre.mjs: empacotador anterior ao papel timbrado
  }
}

/**
 * A primeira página de um PDF como PNG, com o conversor que a máquina tiver:
 * `pdftoppm` (Poppler), o LibreOffice (`soffice`) ou, no macOS, o `sips` do
 * sistema. No Windows não há conversor de fábrica: o comum é devolver
 * `{ ok: false }`, e o Lex pede o Word ou uma imagem. Quando algum conversor
 * EXISTE mas não entregou a imagem (PDF com defeito ou protegido, LibreOffice
 * ocupado, tempo estourado), devolve `{ ok: false, falhou: '<conversor>' }`: o
 * problema é este PDF, não a máquina. `rodar(comando, args)` devolve
 * `{ status, existe? }` (status null sem `existe`: o programa não está na
 * máquina) e existe para os testes.
 */
export function pdfParaImagem(arquivoPdf, { plataforma = process.platform, env = process.env, rodar = rodarComando, soffice = localizarSoffice(env) } = {}) {
  const pasta = mkdtempSync(join(tmpdir(), 'banca-papel-'));
  try {
    const pdf = join(pasta, 'pagina.pdf');
    const png = join(pasta, 'pagina.png');
    copyFileSync(arquivoPdf, pdf);
    const conversores = [
      { nome: 'pdftoppm', comando: 'pdftoppm', args: ['-png', '-r', '150', '-f', '1', '-l', '1', '-singlefile', pdf, join(pasta, 'pagina')] },
      ...(soffice ? [{ nome: 'LibreOffice', comando: soffice, args: ['--headless', '--norestore', '--convert-to', 'png', '--outdir', pasta, pdf] }] : []),
      ...(plataforma === 'darwin' ? [{ nome: 'sips', comando: 'sips', args: ['-s', 'format', 'png', pdf, '--out', png] }] : []),
    ];
    let falhou = null;
    for (const c of conversores) {
      rmSync(png, { force: true });
      const r = rodar(c.comando, c.args);
      if (r.status === 0 && existsSync(png)) return { ok: true, conversor: c.nome, imagem: readFileSync(png) };
      if (!falhou && (r.status !== null || r.existe === true)) falhou = c.nome;
    }
    return falhou ? { ok: false, falhou } : { ok: false };
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

/** Uma peça pequena, gerada pelo empacotador do motor, só para provar o transplante. */
async function pecaDeProva(raiz) {
  const { estilo } = carregarEstilo(raiz);
  return markdownParaDocx('# PROVA DO PAPEL TIMBRADO\n\nTexto de prova.\n', estilo, { titulo: 'Prova do papel timbrado', quebraDePagina: false });
}

function gravarFicha(raiz, ficha) {
  gravarAtomico(join(raiz, ARQUIVO_DA_FICHA), `${JSON.stringify(ficha, null, 2)}\n`);
}

/**
 * Recebe o papel timbrado do escritório. `origem`: caminho do arquivo (absoluto
 * ou relativo à raiz). Opções: `como` ('faixa' | 'pagina', só para imagem),
 * `topoCm` e `baseCm` (onde o texto começa e termina, na imagem de página
 * inteira). Devolve `{ success: true, arquivo, origem: 'word'|'imagem'|'pdf',
 * modo, conversor, resumo, aplicada, anterior }` (`anterior`: o nome do arquivo
 * em que o papel que estava lá ficou guardado, ou null) ou `{ success: false,
 * codigo, erro, logoExtraido? }`; na falha, nada do que estava valendo muda.
 * `carregarZip` existe para os testes.
 */
export async function registrarPapel(raiz, origem, { como = null, topoCm = null, baseCm = null, plataforma, env, rodar, soffice, carregarZip = carregarJSZip } = {}) {
  const falha = (codigo, erro, extra = {}) => ({ success: false, codigo, erro, ...extra });
  if (!origem || typeof origem !== 'string') return falha('sem-arquivo', 'diga o arquivo do papel timbrado: `npx banca escritorio papel "<arquivo>"`');
  if (como !== null && !['faixa', 'pagina'].includes(como)) return falha('opcao', `--como: use "faixa" (imagem só do cabeçalho) ou "pagina" (imagem da página inteira); recebido: ${como}`);
  const caminho = resolve(raiz, origem);
  let bytes;
  try {
    if (!statSync(caminho).isFile()) throw new Error('não é arquivo');
    bytes = readFileSync(caminho);
  } catch {
    return falha('nao-encontrado', `arquivo não encontrado: ${origem}`);
  }
  if (bytes.length > LIMITE_DO_PAPEL) return falha('grande-demais', `o arquivo tem ${(bytes.length / 1024 / 1024).toFixed(1)} MB; o limite é ${LIMITE_DO_PAPEL / 1024 / 1024} MB (ele entra em toda peça). Salve o papel com as imagens em resolução menor`);
  const lida = lerFicha(raiz);
  if (lida.erro || !lida.ficha || validarFicha(lida.ficha).length) return falha('sem-ficha', 'a ficha do escritório ainda não está pronta: termine a entrevista (ou rode `npx banca escritorio mostrar`) e mande o papel de novo');
  // Com os programas da pasta mais antigos que o motor, o papel seria gravado e a peça sairia sem ele, calada.
  if (!pastaConhecePapelProprio(raiz)) return falha('pasta-desatualizada', 'os programas desta pasta do escritório são de uma versão anterior ao papel timbrado próprio, e a peça sairia sem ele: atualize a pasta (`npx banca update`, dentro dela) e mande o papel de novo');

  let JSZip = null;
  let tipo = tipoDoArquivo(bytes);
  let veioDe = 'word';
  let conversor = null;
  let modo = null;
  let papel = bytes;
  try {
    try {
      JSZip = await carregarZip(raiz, env);
    } catch (e) {
      return falha('sem-biblioteca', e.message);
    }
    if (tipo === 'pdf') {
      const convertido = pdfParaImagem(caminho, { plataforma, env, rodar, soffice });
      if (!convertido.ok) return convertido.falhou ? falha('pdf-nao-convertido', PDF_NAO_CONVERTIDO) : falha('pdf-sem-conversor', SEM_CONVERSOR);
      veioDe = 'pdf';
      conversor = convertido.conversor;
      bytes = convertido.imagem;
      tipo = tipoDoArquivo(bytes);
      como = como || 'pagina'; // a página de um PDF é a página inteira
    }
    if (tipo === 'png' || tipo === 'jpg') {
      if (veioDe !== 'pdf') veioDe = 'imagem';
      const imagem = lerImagem(bytes);
      modo = como || modoDaImagem(imagem);
      const margens = carregarEstilo(raiz).estilo.margens_cm || {};
      papel = await papelDeImagem(JSZip, bytes, imagem, {
        modo: como,
        ...(topoCm != null ? { topoCm } : {}),
        ...(baseCm != null ? { baseCm } : {}),
        ...(Number.isFinite(margens.esquerda) ? { esquerdaCm: margens.esquerda } : {}),
        ...(Number.isFinite(margens.direita) ? { direitaCm: margens.direita } : {}),
      });
    } else if (tipo !== 'zip' && tipo !== 'ole') {
      return falha('formato', 'formato não aceito: mande o papel timbrado em Word (.docx ou .dotx), em imagem (PNG ou JPG) ou em PDF');
    }
    // A prova: o transplante numa peça de verdade, antes de gravar qualquer coisa.
    const { resumo } = await transplantar(JSZip, await pecaDeProva(raiz), papel);
    const pasta = join(raiz, PASTA_DO_ESCRITORIO);
    mkdirSync(pasta, { recursive: true });
    const destino = join(pasta, ARQUIVO_DO_PAPEL);
    const guardado = join(pasta, ARQUIVO_DO_PAPEL_ANTERIOR);
    // O papel que estava lá (se era outro) é copiado ANTES da troca e só vira o `.anterior`
    // depois que o novo e a ficha foram gravados: numa falha, a cópia é apagada, o `.anterior`
    // de antes continua lá e «nada mudou» é exato; o papel que valia nunca se perde.
    const emTroca = join(pasta, ARQUIVO_DO_PAPEL_EM_TROCA);
    const ondeFicou = `${PASTA_DO_ESCRITORIO.replace(/\\/g, '/')}/${ARQUIVO_DO_PAPEL_EM_TROCA}`;
    let antes = null;
    try { antes = readFileSync(destino); } catch { /* não havia papel */ }
    const trocou = antes !== null && !antes.equals(papel);
    const apagarCopia = () => { try { rmSync(emTroca, { force: true }); } catch { /* fica; o próximo papel a regrava */ } };
    if (trocou) {
      try {
        gravarAtomico(emTroca, antes);
      } catch (e) {
        return falha('gravacao', `não consegui guardar uma cópia do papel timbrado que vale agora (${motivoDoSistema(e)}): nada mudou. Feche o papel timbrado se ele estiver aberto em outro programa e mande de novo`);
      }
    }
    try {
      gravarAtomico(destino, papel);
    } catch (e) {
      if (trocou) apagarCopia();
      return falha('gravacao', `não consegui gravar o papel timbrado na pasta do escritório (${motivoDoSistema(e)}): nada mudou. Feche o papel timbrado se ele estiver aberto em outro programa e mande de novo`);
    }
    const jaEra = lida.ficha.timbre && lida.ficha.timbre.modelo === 'proprio' && lida.ficha.timbre.arquivo === ARQUIVO_DO_PAPEL;
    try {
      if (!jaEra) gravarFicha(raiz, { ...lida.ficha, timbre: { modelo: 'proprio', arquivo: ARQUIVO_DO_PAPEL } });
    } catch (e) {
      // A ficha não registrou a troca: o que estava antes volta ao lugar, e a mensagem diz o que de fato ficou.
      const motivo = `não consegui gravar a ficha do escritório (${motivoDoSistema(e)})`;
      const depois = 'Feche a ficha se ela estiver aberta em outro programa e mande o papel de novo';
      try {
        if (antes === null) rmSync(destino, { force: true });
        else if (trocou) gravarAtomico(destino, antes);
      } catch {
        if (antes === null) return falha('ficha', `${motivo}: as peças continuam saindo como antes (o arquivo novo ficou na pasta, sem uso). ${depois}`);
        // Não deu para pôr de volta: a cópia feita antes da troca fica, e a mensagem diz onde.
        return falha('ficha', `${motivo}, e também não consegui pôr de volta o papel timbrado anterior: ele está guardado em «${ondeFicou}», e o arquivo novo ficou no lugar dele. ${depois}`);
      }
      if (trocou) apagarCopia();
      return falha('ficha', antes === null ? `${motivo}: nada mudou. ${depois}` : `${motivo}: o papel timbrado anterior voltou ao lugar, e nada mudou. ${depois}`);
    }
    // A troca deu certo: agora, e só agora, o histórico gira (um nível).
    let anterior = null;
    let aviso = null;
    if (trocou) {
      try {
        renomearAtomico(emTroca, guardado);
        anterior = ARQUIVO_DO_PAPEL_ANTERIOR;
      } catch (e) {
        aviso = `o papel novo já está valendo, mas não consegui guardar o que valia antes como «${ARQUIVO_DO_PAPEL_ANTERIOR}» (${motivoDoSistema(e)}): ele ficou em «${ondeFicou}»`;
      }
    }
    const aplicada = aplicarFicha(raiz).success;
    return { success: true, arquivo: ARQUIVO_DO_PAPEL, origem: veioDe, modo, conversor, resumo, aplicada, anterior, ...(aviso ? { aviso } : {}) };
  } catch (e) {
    // Falha segura: nada mudou. Se der, o logo de dentro do arquivo fica à mão para o modelo lateral.
    let logoExtraido = null;
    if (tipo === 'zip' && JSZip) {
      const logo = await logoDoPapel(JSZip, papel);
      if (logo) {
        const pasta = join(raiz, PASTA_DO_ESCRITORIO);
        mkdirSync(pasta, { recursive: true });
        writeFileSync(join(pasta, `logo-do-papel.${logo.tipo}`), logo.bytes);
        logoExtraido = `${PASTA_DO_ESCRITORIO.replace(/\\/g, '/')}/logo-do-papel.${logo.tipo}`;
      }
    }
    return falha(e instanceof ErroDoPapel ? e.codigo : 'ilegivel', e.message, logoExtraido ? { logoExtraido } : {});
  }
}

/** Volta ao modelo lateral. O arquivo do papel fica guardado (o advogado pode querer voltar). */
export function removerPapel(raiz) {
  const lida = lerFicha(raiz);
  if (lida.erro || !lida.ficha) return { success: false, erro: lida.erro || 'ainda não há ficha do escritório' };
  try {
    gravarFicha(raiz, { ...lida.ficha, timbre: { modelo: 'lateral' } });
  } catch (e) {
    return { success: false, erro: `não consegui gravar a ficha do escritório (${motivoDoSistema(e)}): o papel timbrado continua como estava. Feche a ficha se ela estiver aberta em outro programa e peça de novo` };
  }
  const r = aplicarFicha(raiz);
  return r.success ? { success: true } : { success: false, erro: r.erros.join('; ') };
}
