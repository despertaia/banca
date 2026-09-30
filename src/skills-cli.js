import {
  listInstalled,
  installSkill,
  removeSkill,
  getSkillMeta,
  getLocalizedDescription,
} from './skills.js';
import { createResourceCli } from './resource-cli.js';

export const skillsCli = createResourceCli({
  resource: {
    listInstalled,
    install: installSkill,
    remove: removeSkill,
    getMeta: getSkillMeta,
    getLocalizedDescription,
  },
  i18nPrefix: 'skills',
  header: 'Banca Skills',
  browseLine: 'As skills chegam pela biblioteca da Banca: rode "banca acervo sync" e busque com "banca search-skills --query <tema>".',
  formatListItem: (meta, desc) => {
    const parts = [meta.name];
    if (meta.type) parts.push(`(${meta.type})`);
    parts.push(`- ${desc.split('.')[0]}`);
    return parts.join(' ');
  },
  logResource: 'skill',
  usage: {
    install: '\n  Usage: banca install <id>   (or: banca skills install <id>)\n',
    remove: '\n  Usage: banca uninstall <id>   (or: banca skills remove <id>)\n',
    updateOne: '\n  Usage: banca update <name>\n',
  },
});
