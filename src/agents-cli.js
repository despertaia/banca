import {
  listInstalled,
  installAgent,
  removeAgent,
  getAgentMeta,
  getLocalizedDescription,
} from './agents.js';
import { createResourceCli } from './resource-cli.js';

export const agentsCli = createResourceCli({
  resource: {
    listInstalled,
    install: installAgent,
    remove: removeAgent,
    getMeta: getAgentMeta,
    getLocalizedDescription,
  },
  i18nPrefix: 'agents',
  header: 'Banca Agents',
  browseLine: 'Os agentes chegam pela biblioteca da Banca: rode "banca acervo sync".',
  formatListItem: (meta, desc) => {
    const parts = [meta.name];
    if (meta.icon) parts.unshift(meta.icon);
    if (meta.category) parts.push(`(${meta.category})`);
    parts.push(`- ${desc.split('.')[0]}`);
    return parts.join(' ');
  },
  logResource: 'agent',
  usage: {
    install: '\n  Usage: banca agents install <id>\n',
    remove: '\n  Usage: banca agents remove <id>\n',
    updateOne: '\n  Usage: banca update <name>\n',
  },
});
