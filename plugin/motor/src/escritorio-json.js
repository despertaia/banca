// Leitura e gravação dos arquivos do escritório, compartilhadas por src/escritorio.js,
// src/escritorio-logo.js e src/escritorio-papel.js (arquivo à parte para eles não se
// importarem em círculo).
import { accessSync, constants, existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

/**
 * Por que o sistema não deixou ler ou gravar um arquivo, em português (nunca o
 * texto em inglês do sistema: «EISDIR: illegal operation on a directory»).
 */
export function motivoDoSistema(e) {
  switch (e?.code) {
    case 'EISDIR': return 'no lugar do arquivo há uma pasta';
    case 'ENOENT': return 'o arquivo não existe';
    case 'ENOTDIR': return 'a pasta onde ele deveria estar não é uma pasta';
    case 'EACCES':
    case 'EPERM': return 'o sistema não deu permissão (o arquivo pode estar aberto em outro programa, ou protegido contra alteração)';
    case 'EBUSY': return 'o arquivo está aberto em outro programa';
    case 'ENOSPC': return 'o disco está cheio';
    default: return `o sistema não deixou (${e?.code || 'erro desconhecido'})`;
  }
}

/**
 * O mesmo, olhando o caminho: pasta no lugar do arquivo é dita como tal em
 * qualquer sistema (o Windows responde «acesso negado», não «é uma pasta»).
 */
export function motivoDoArquivo(e, caminho) {
  let pasta = false;
  try { pasta = statSync(caminho).isDirectory(); } catch { /* não existe, ou não dá para olhar */ }
  return pasta ? 'no lugar do arquivo há uma pasta' : motivoDoSistema(e);
}

// «a ficha (ficha.json)», «djen.json»: o nome do arquivo sempre aparece, uma vez só.
const comNome = (rotulo, caminho) => (String(rotulo).includes(basename(caminho)) ? rotulo : `${rotulo} (${basename(caminho)})`);

/** Lê um arquivo de texto. Falha de leitura vira erro em português, com o nome do arquivo. */
export function lerTexto(caminho, rotulo) {
  try {
    return readFileSync(caminho, 'utf8');
  } catch (e) {
    throw new Error(`não foi possível ler ${comNome(rotulo, caminho)}: ${motivoDoArquivo(e, caminho)}`);
  }
}

/**
 * Lê um JSON do disco. Tira o BOM (o Bloco de Notas e o PowerShell 5 o gravam) e,
 * se o texto não for JSON, lança um erro em português, com a linha quando dá para
 * apontar (nunca o texto em inglês do motor).
 */
export function lerJson(caminho, rotulo) {
  const bruto = lerTexto(caminho, rotulo).replace(/^\uFEFF/, '');
  try {
    return JSON.parse(bruto);
  } catch (e) {
    const pos = /position (\d+)/.exec(e.message)?.[1];
    const linha = pos !== undefined ? bruto.slice(0, Number(pos)).split('\n').length : null;
    throw new Error(`${rotulo} não é um JSON válido: confira vírgula sobrando, aspas e chaves${linha ? ` (perto da linha ${linha})` : ''}`);
  }
}

// O antivírus e o indexador do Windows seguram por um instante o arquivo recém-gravado.
const OCUPADO = ['EPERM', 'EBUSY', 'EACCES'];
const esperar = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Dá a `de` o nome `para` (mesmo disco), trocando o que houver lá. Arquivo só de
 * leitura em `para` não é trocado; o antivírus que segura o arquivo por um instante
 * ganha umas tentativas. Lança o erro do sistema (com `code`); `de` fica onde estava.
 */
export function renomearAtomico(de, para) {
  if (existsSync(para)) accessSync(para, constants.W_OK); // só de leitura: não é trocado (como no Windows)
  for (let tentativa = 1; ; tentativa++) {
    try {
      renameSync(de, para);
      return;
    } catch (e) {
      if (tentativa >= 5 || !OCUPADO.includes(e.code)) throw e;
      esperar(40 * tentativa);
    }
  }
}

/**
 * Grava de forma atômica: o conteúdo vai para um arquivo temporário AO LADO do
 * destino (mesmo disco) e só então toma o nome dele. Quem lê nunca encontra meio
 * arquivo, e uma falha no meio (disco cheio, energia) deixa o arquivo anterior
 * inteiro. Arquivo marcado como só de leitura não é trocado (o Windows já
 * recusa; aqui vale igual nos outros sistemas). Lança o erro do sistema (com
 * `code`) e não deixa o temporário para trás. `conteudo`: texto (UTF-8) ou Buffer.
 */
export function gravarAtomico(caminho, conteudo) {
  const temporario = `${caminho}.${process.pid}.${Date.now().toString(36)}.tmp`;
  try {
    if (existsSync(caminho)) accessSync(caminho, constants.W_OK);
    writeFileSync(temporario, conteudo, typeof conteudo === 'string' ? 'utf8' : undefined);
    for (let tentativa = 1; ; tentativa++) {
      try {
        renameSync(temporario, caminho);
        return;
      } catch (e) {
        if (tentativa >= 5 || !OCUPADO.includes(e.code)) throw e;
        esperar(40 * tentativa);
      }
    }
  } catch (e) {
    rmSync(temporario, { force: true });
    throw e;
  }
}
