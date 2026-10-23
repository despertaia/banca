// Gera um par Ed25519 para assinar pacotes da Banca. A privada NUNCA vai para
// o repositório nem para a VPS: guarde a pasta de saída fora de ambos e faça
// uma cópia off-line. Recusa sobrescrever chave existente.
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [kid, pasta] = process.argv.slice(2);
if (!kid || !pasta) {
  console.error('uso: node scripts/gerar-chave.mjs <kid> <pasta-fora-do-repositorio>');
  process.exit(2);
}
const caminhoPrivada = join(pasta, `${kid}.pem`);
if (existsSync(caminhoPrivada)) {
  console.error(`já existe ${caminhoPrivada} — chave não é sobrescrita`);
  process.exit(1);
}
mkdirSync(pasta, { recursive: true, mode: 0o700 });
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
writeFileSync(caminhoPrivada, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
const publica = publicKey.export({ type: 'spki', format: 'pem' });
writeFileSync(join(pasta, `${kid}.pub.pem`), publica);
process.stdout.write(publica);
