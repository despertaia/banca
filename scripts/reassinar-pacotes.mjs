// Reassina pacotes já publicados com a chave da Desperta, sem tocar no
// conteúdo: a assinatura Ed25519 cobre só o content_hash, então trocar de
// chave é trocar `signature` e `signing_kid`. Recusa (fail-closed) qualquer
// original que não verifique contra o anel — nunca reassina lixo.
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { desempacotarDeTransporte, empacotarParaTransporte } from '../src/pack-archive.js';
import { verificarComAnel } from '../src/acervo-cli.js';
import { CHAVES_PUBLICAS_PRODUCAO } from '../src/acervo-config.js';

/**
 * Lê um anel `{kid: pem}` de um arquivo JSON e devolve `Map<kid, KeyObject>`.
 * Serve para `--anel-original`: conferir originais assinados com chaves que o
 * motor não conhece mais (ex.: o arquivo de pacotes de um fornecedor).
 */
export function lerAnel(caminho) {
  const bruto = JSON.parse(readFileSync(caminho, 'utf8'));
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto) || Object.keys(bruto).length === 0) {
    throw new Error(`anel inválido em ${caminho}: esperado um objeto {kid: pem} com pelo menos uma chave`);
  }
  return new Map(Object.entries(bruto).map(([kid, pem]) => [kid, createPublicKey(pem)]));
}

export function reassinar(buffer, chavePrivada, kid, anel) {
  const { manifesto, entidades } = desempacotarDeTransporte(buffer);
  const verificacao = verificarComAnel(manifesto, entidades, anel);
  if (!verificacao.ok) {
    throw new Error(`pacote original inválido: ${verificacao.problemas.join('; ')}`);
  }
  const assinatura = sign(null, Buffer.from(manifesto.content_hash, 'utf8'), chavePrivada);
  const novo = { ...manifesto, signature: `ed25519:${assinatura.toString('base64')}`, signing_kid: kid };
  return { manifesto: novo, buffer: empacotarParaTransporte(novo, entidades) };
}

/**
 * Reassina todos os pacotes `.bin` de `entrada` com `chavePrivada`/`kid` e
 * grava a publicação (`pacotes/`, `indice.json`, `chaves-publicas.json`) em
 * `saida`. É o que a CLI e os testes de contrato chamam — a CLI só cuida de
 * ler argumentos e montar os anéis/`chavePrivada` antes de delegar aqui.
 *
 * Dois anéis, com papéis distintos:
 * - `anelOriginal` confere a assinatura dos pacotes de ENTRADA (em quem
 *   traz originais de um fornecedor, o anel do fornecedor; na reassinatura
 *   do nosso próprio arquivo, o anel do motor);
 * - `anelSaida` confere a SAÍDA já reassinada e é o único que vai para
 *   `chaves-publicas.json` — só a(s) chave(s) de assinatura da Desperta.
 * Compatibilidade: quem passa só `anel` usa o mesmo anel nos dois papéis.
 *
 * Fail-closed em três frentes, todas ANTES de escrever `indice.json`:
 * - pasta de entrada sem nenhum `.bin` — não existe publicação vazia;
 * - dois pacotes de entrada com o mesmo `pack_id` — um pisaria no arquivo do
 *   outro em silêncio (mesmo nome `<pack_id>@<version>.bin`);
 * - o pacote RESSASSINADO não verifica contra `anelSaida` — pega, por exemplo,
 *   uma chave privada errada pareada com um `kid` que está no anel (a
 *   assinatura sai, mas não bate com a pública publicada para esse kid).
 * `reassinar()` já recusa o pacote ORIGINAL adulterado; esta função recusa a
 * SAÍDA adulterada — as duas pontas do mesmo problema.
 */
export function gerarPublicacao({ entrada, saida, chavePrivada, kid, anel, anelOriginal = anel, anelSaida = anel }) {
  if (!(anelOriginal instanceof Map) || !(anelSaida instanceof Map)) {
    throw new Error('gerarPublicacao precisa de anelOriginal e anelSaida (Map kid → chave pública), ou de `anel` para os dois');
  }
  const pastaPacotes = join(saida, 'pacotes');
  mkdirSync(pastaPacotes, { recursive: true });

  const nomes = readdirSync(entrada).filter((n) => n.endsWith('.bin')).sort();
  if (nomes.length === 0) {
    throw new Error(`nenhum pacote .bin em ${entrada} — publicação vazia recusada`);
  }

  const packs = [];
  const packIdsVistos = new Set();
  for (const nome of nomes) {
    const { manifesto, buffer } = reassinar(readFileSync(join(entrada, nome)), chavePrivada, kid, anelOriginal);

    if (packIdsVistos.has(manifesto.pack_id)) {
      throw new Error(`pack_id duplicado entre os pacotes de entrada: ${manifesto.pack_id} (em ${nome})`);
    }
    packIdsVistos.add(manifesto.pack_id);

    // Re-verifica o pacote já RESSASSINADO antes de escrever qualquer coisa.
    const { entidades } = desempacotarDeTransporte(buffer);
    const verificacao = verificarComAnel(manifesto, entidades, anelSaida);
    if (!verificacao.ok) {
      throw new Error(`saída inválida: ${verificacao.problemas.join('; ')} (pacote ${nome})`);
    }

    const arquivo = `${manifesto.pack_id}@${manifesto.version}.bin`;
    writeFileSync(join(pastaPacotes, arquivo), buffer);
    packs.push({
      pack_id: manifesto.pack_id,
      payload_kind: manifesto.payload_kind,
      latest: manifesto.version,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      bytes: buffer.length,
      arquivo,
    });
    console.log(`reassinado ${arquivo}`);
  }

  // Escreve em .tmp e renomeia por cima do final: leitor concorrente
  // (o servidor relê a cada requisição) nunca vê indice.json pela metade.
  const indiceFinal = join(saida, 'indice.json');
  const indiceTmp = `${indiceFinal}.tmp`;
  writeFileSync(indiceTmp, JSON.stringify({ gerado_em: new Date().toISOString(), packs }, null, 2));
  renameSync(indiceTmp, indiceFinal);

  const keys = [...anelSaida.entries()].map(([kidDoAnel, chave]) => ({
    kid: kidDoAnel,
    alg: 'ed25519',
    pub: chave.export({ type: 'spki', format: 'pem' }).trim(),
  }));
  writeFileSync(join(saida, 'chaves-publicas.json'), JSON.stringify({ keys }, null, 2));

  return { packs };
}

function principal() {
  const { values } = parseArgs({
    options: {
      entrada: { type: 'string' },
      saida: { type: 'string' },
      chave: { type: 'string' },
      kid: { type: 'string' },
      'anel-original': { type: 'string' },
    },
  });
  if (!values.entrada || !values.saida || !values.chave || !values.kid) {
    console.error('uso: node scripts/reassinar-pacotes.mjs --entrada <pasta> --saida <pasta> --chave <privada.pem> --kid <kid> [--anel-original <anel.json>]');
    process.exit(2);
  }
  const chavePrivada = createPrivateKey(readFileSync(values.chave, 'utf8'));
  // Os originais são conferidos contra o anel do motor (o NOSSO arquivo de
  // pacotes já publicados) ou, com --anel-original, contra o anel desse
  // arquivo JSON {kid: pem} (originais assinados com chaves que o motor não
  // conhece mais). A saída e `chaves-publicas.json` levam só a chave do
  // `--kid`, que TEM de estar no anel do motor.
  const anelDoMotor = new Map(Object.entries(CHAVES_PUBLICAS_PRODUCAO).map(([k, pem]) => [k, createPublicKey(pem)]));
  if (!anelDoMotor.has(values.kid)) {
    console.error(`o kid ${values.kid} não está no anel do motor — publique a chave pública antes de assinar com ela`);
    process.exit(1);
  }
  let anelOriginal = anelDoMotor;
  if (values['anel-original']) {
    try {
      anelOriginal = lerAnel(values['anel-original']);
    } catch (erro) {
      console.error(erro.message);
      process.exit(1);
    }
  }
  const anelSaida = new Map([[values.kid, anelDoMotor.get(values.kid)]]);
  try {
    const { packs } = gerarPublicacao({ entrada: values.entrada, saida: values.saida, chavePrivada, kid: values.kid, anelOriginal, anelSaida });
    console.log(`${packs.length} pacote(s) reassinado(s) com ${values.kid} em ${values.saida}`);
  } catch (erro) {
    let mensagem = erro.message;
    // Kid do original desconhecido do anel do motor e ninguém passou
    // --anel-original: é o caso mais comum de confusão (originais do
    // fornecedor, assinados com chave que o motor não guarda mais) — aponta
    // a saída antes de a pessoa ter de adivinhar.
    if (!values['anel-original'] && /que esta versão do motor não conhece/.test(mensagem)) {
      mensagem += '\noriginais assinados com chave fora do anel do motor? use --anel-original <anel.json>';
    }
    console.error(mensagem);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
