// A ajuda do comando `banca`, em português, para quem usa o escritório.
//
// Camada Desperta: o HELP de bin/legalsquad.js fica como o fornecedor o
// escreve (o merge semanal atualiza lá), e é ESTA ajuda que o comando imprime.
// O teste tests/ajuda.test.js reprova quando um subcomando do HELP não aparece
// aqui: subcomando novo do fornecedor entra nesta lista, traduzido.
export const AJUDA = `
  banca · times de agentes jurídicos do Lex Lab, da Desperta.IA

  Como usar: banca <comando>. Dentro de uma pasta já preparada, npx banca <comando>
  também funciona. Fora dela, nunca use npx banca: nesse nome, o registro público
  do npm tem um pacote de outra pessoa.

  Começar
    banca init · prepara esta pasta para o escritório
    banca init --skip-deps · prepara a pasta sem instalar as dependências extras
    banca init --perfil rapido|equilibrado|completo · prepara a pasta já com o perfil de conferência
    banca install-global · deixa a Banca pronta em todas as conversas do Claude
    banca update · atualiza esta pasta para a versão do motor (guarda times, acervo e memória)
    banca perfil [nome] · mostra ou troca o perfil de conferência desta pasta
    banca diagnostico · diz o que falta nesta máquina (Node, atalho, biblioteca); --json para o suporte
    banca diagnostico --consertar · recria as pastas do escritório que faltarem (COMECE AQUI, 1 a 4) e esconde as pastas técnicas
    banca --version · mostra a versão do motor

  Biblioteca jurídica (acervo)
    banca ativar <licença> · ativa a sua licença e baixa as áreas liberadas
    banca acervo status · mostra a biblioteca desta máquina e se esta pasta está em dia
    banca acervo sync · baixa ou atualiza as áreas do Direito e liga esta pasta
    banca acervo ligar · liga esta pasta à biblioteca da máquina, sem internet
    banca acervo areas [<área>…] · lista as áreas ou escolhe quais esta pasta usa (--todas: todas)
    banca search-acervo <busca> · procura julgados e súmulas no acervo desta pasta

  Times (squads) e modelos
    banca squads [--area <área>] · lista os times desta pasta
    banca squad-modelo · lista os modelos prontos de times
    banca squad-modelo --para "<peça>" [--criar] · escolhe o modelo certo para a peça; com --criar, já monta o time
    banca squad-modelo <id> --code <código> · cria um time a partir de um modelo
    banca squad-modelo --salvar <time> · guarda um time como modelo do escritório (sem dado do caso)
    banca squad-modelo --listar | --apagar <id> | --restaurar <id> · cuida dos modelos do escritório
    banca squad-modelo --exportar | --importar · leva os modelos do escritório para outra pasta ou máquina
    banca check-squad <código> · confere a estrutura de um time
    banca compilar-squad <código> · monta os arquivos de um time a partir do desenho
    banca eval-init [código] · prepara a avaliação dos times que ainda não a têm
    banca runs [time] · mostra o histórico de execuções

  Skills e agentes
    banca skills · lista as skills instaladas
    banca install <nome> · instala uma skill
    banca uninstall <nome> · remove uma skill
    banca update <nome> · atualiza uma skill
    banca search-skills <busca> · sugere as skills mais úteis para um pedido
    banca detail-skill <id> · mostra uma skill por dentro
    banca indexar-skills · refaz o índice de skills
    banca contract-skills · aplica o contrato de qualidade às skills e refaz o índice
    banca check-skills · confere o catálogo de skills
    banca audit-skills [--skill <id>] · audita a qualidade das skills
    banca resolve-skills <id…> · confere se as skills podem rodar
    banca agents · lista os agentes (agents install <nome>, agents remove <nome>, agents update)

  Escritório
    banca escritorio mostrar · mostra a ficha do escritório (nome, OAB, áreas, logo); --json para o Lex
    banca escritorio aplicar · aplica a ficha: perfil, intimações, papel timbrado e seu nome nas preferências
    banca escritorio logo <arquivo> · instala o logo (PNG ou JPEG, até 2 MB)
    banca escritorio papel <arquivo> · usa o papel timbrado do próprio escritório (Word, imagem ou PDF); --como faixa|pagina, --topo e --base (cm) ajustam a imagem
    banca escritorio papel --remover · volta ao papel timbrado lateral (o modelo da Banca)
    banca escritorio papel --vistos "<arquivo>" · marca como já oferecido o arquivo da pasta 3 que o advogado recusou (o Lex não o oferece de novo)
    banca escritorio folha-de-teste [--abrir] · gera uma página com o papel timbrado para conferir
    banca escritorio abrir "<arquivo>" · abre no programa padrão um documento da pasta do escritório (uma peça pronta, por exemplo)
    banca escritorio pastas · o que há nas pastas do escritório: clientes, modelos novos e o que está na pasta 3 (--json para o Lex)
    banca escritorio cliente "<nome>" [--time <time>] · acha ou cria a pasta do cliente em «1 - Clientes» e liga o time a ela
    banca escritorio modelos [--aprender] · mostra os modelos novos de «2 - Meus modelos»; --aprender os leva para o acervo do escritório
    banca escritorio primeira-peca [--criar] [--caso treino|meu] · a primeira peça da sua área, com o caso de treino fictício ou um seu
    banca chefe · o resumo da manhã: prazos de hoje, intimações recentes e carteira (--json)
    banca chefe --agendar · mostra como agendar o resumo da manhã; não grava nada
    banca chefe --agendar --aplicar · grava o agendamento no macOS, só com o seu sim
    banca chefe --status · diz se há resumo agendado e quando ele rodou
    banca memoria · o que o Lex lembra deste escritório
    banca memoria add --tipo <t> --titulo "…" --corpo "…" · anota um fato (dado que identifica cliente é recusado, LGPD)
    banca dashboard · abre o escritório virtual no navegador (--no-open, --port 5173)
    banca captura <arquivo|URL> · assiste a um vídeo e transcreve o áudio, no seu computador
    banca contribuir · envia à comunidade a estrutura dos times (nunca dado de caso); vem desligada

  Mais: https://github.com/despertaia/banca
`;
