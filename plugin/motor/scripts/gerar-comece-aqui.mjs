#!/usr/bin/env node
/**
 * Gera o `COMECE AQUI.pdf` que vai no pacote (`_legalsquad/core/pasta-do-escritorio/`).
 *
 * Camada Desperta, ferramenta de quem mantém a Banca (não roda na máquina do
 * advogado): o Windows dos advogados não tem conversor de PDF, então o PDF sai
 * pronto no pacote, e o `init` só o copia para a raiz da pasta do escritório.
 * O texto é o de `LINHAS_DO_COMECE_AQUI` (src/pasta-do-escritorio.js), o mesmo
 * do `.txt` de reserva. A marca do texto vai nas palavras-chave do PDF (o título, que aparece na barra do leitor, não a leva): o teste
 * (`tests/pasta-do-escritorio.test.js`) reprova o PDF que ficou para trás.
 *
 * Uso:
 *   node scripts/gerar-comece-aqui.mjs            gera (precisa do LibreOffice: `soffice` no PATH ou LEGALSQUAD_SOFFICE)
 *   node scripts/gerar-comece-aqui.mjs --check    só confere a marca do PDF que está no pacote
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { LINHAS_DO_COMECE_AQUI, MARCA_DO_COMECE_AQUI, PASTAS, PDF_DO_PACOTE, marcaDoPdf } from '../src/pasta-do-escritorio.js';
import { carregarEstilo, localizarSoffice, markdownParaDocx } from './empacotar.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/** As linhas em Markdown: título, seções em maiúsculas como `##`, e o nome de cada pasta em negrito. */
export function comeceAquiEmMarkdown(linhas = LINHAS_DO_COMECE_AQUI) {
  const nomes = Object.values(PASTAS);
  return linhas.map((l, i) => {
    if (i === 0) return `# ${l}`;
    if (l && l === l.toUpperCase() && /[A-ZÀ-Ú]{3}/.test(l)) return `## ${l}`;
    const pasta = nomes.find((n) => l.startsWith(`${n}: `));
    return pasta ? `**${pasta}:** ${l.slice(pasta.length + 2)}` : l;
  }).join('\n\n').replace(/\n{3,}/g, '\n\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const marca = existsSync(PDF_DO_PACOTE) ? marcaDoPdf(readFileSync(PDF_DO_PACOTE)) : null;
  if (process.argv.includes('--check')) {
    if (marca === MARCA_DO_COMECE_AQUI) {
      console.log(`COMECE AQUI.pdf em dia com o texto (marca ${marca}).`);
      process.exit(0);
    }
    console.error(`COMECE AQUI.pdf ${marca ? `é de outro texto (marca ${marca}; o texto atual é ${MARCA_DO_COMECE_AQUI})` : 'não está no pacote'}: rode \`node scripts/gerar-comece-aqui.mjs\` numa máquina com LibreOffice.`);
    process.exit(1);
  }
  const soffice = localizarSoffice(process.env);
  if (!soffice) {
    console.error('LibreOffice não encontrado (`soffice` no PATH, ou LEGALSQUAD_SOFFICE apontando o binário): sem ele o PDF não é gerado.');
    process.exit(1);
  }
  const { estilo } = carregarEstilo(RAIZ);
  const limpo = {
    ...estilo,
    fonte: { ...estilo.fonte, familia: 'Arial', tamanho_pt: 12 },
    margens_cm: { superior: 2, inferior: 2, esquerda: 2.5, direita: 2.5 },
    paragrafo: { ...estilo.paragrafo, alinhamento: 'esquerda', entrelinha: 1.15, recuo_primeira_linha_cm: 0, espaco_depois_pt: 6 },
    titulos: { h1: { tamanho_pt: 20, negrito: true, alinhamento: 'esquerda', espaco_antes_pt: 0, espaco_depois_pt: 10 }, h2: { tamanho_pt: 12, negrito: true, alinhamento: 'esquerda', espaco_antes_pt: 12, espaco_depois_pt: 4 }, h3: estilo.titulos.h3 },
    cabecalho: { escritorio: '', oab: '', endereco: '', linhas_extras: [] },
    rodape: { ...estilo.rodape, numeracao_de_pagina: false },
  };
  const pasta = mkdtempSync(join(tmpdir(), 'banca-comece-'));
  try {
    const docx = join(pasta, 'comece-aqui.docx');
    writeFileSync(docx, await markdownParaDocx(comeceAquiEmMarkdown(), limpo, { titulo: 'COMECE AQUI · Banca', palavrasChave: `marca-${MARCA_DO_COMECE_AQUI}`, quebraDePagina: false }));
    execFileSync(soffice, [`-env:UserInstallation=${pathToFileURL(join(pasta, 'perfil')).href}`, '--headless', '--norestore', '--convert-to', 'pdf', '--outdir', pasta, docx], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000 });
    const pdf = join(pasta, 'comece-aqui.pdf');
    if (!existsSync(pdf) || marcaDoPdf(readFileSync(pdf)) !== MARCA_DO_COMECE_AQUI) throw new Error('o LibreOffice não produziu o PDF com a marca do texto');
    mkdirSync(dirname(PDF_DO_PACOTE), { recursive: true });
    copyFileSync(pdf, PDF_DO_PACOTE);
    console.log(`COMECE AQUI.pdf gerado (marca ${MARCA_DO_COMECE_AQUI}): ${PDF_DO_PACOTE}`);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}
