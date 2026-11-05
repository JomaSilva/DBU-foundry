# Como usar o sistema DBU no Foundry VTT

Sistema para o **Dragon Ball Universe RPG** (regras 0.9.3 de [dbu-rpg.com](https://dbu-rpg.com/)), feito para o
Foundry VTT v14. A ficha calcula tudo sozinha (atributos, aptidões, dados extras, Acerto, Desvio,
Dano, Soak, custos de Ki, limiares de vida...) e avisa quando algo na ficha vai contra as regras.
Homebrew não foi incluído.

## Primeiros passos

1. No Foundry, crie um mundo com o sistema **Dragon Ball Universe RPG (DBU)**.
2. Como GM, abra **Configurações › Configurar Sistema › Regras Adicionais** e marque as regras
   opcionais que valem na sua campanha (ver a página "Regras Adicionais").
3. Crie um Ator do tipo **Personagem** (jogadores) ou **NPC** (adversários; não é validado contra
   as regras de criação). Na aba Biografia do NPC, o tipo **Chefe (Boss)** deixa ele entrar em
   transformações acima do ToP dele (ver "Transformações").
4. Arraste dos compêndios **DBU — Raças**, **Traços Raciais e Fatores**, **Talentos**,
   **Transformações**, **Unique Abilities**, **Manobras Especiais** e **Equipamentos** para a ficha.
5. Defina o **PL** no cabeçalho, distribua os pontos de atributo e as perícias. Os totais, limites e
   orçamentos aparecem na própria ficha; o que estiver errado aparece em vermelho/amarelo.

Os compêndios trazem os **dados mecânicos** (números, requisitos, aspectos, custos, estrutura dos
efeitos) e um link para a página oficial. O texto completo das regras vem do site, sozinho (precisa
de internet):
- **Lendo direto do compêndio:** abrir um item mostra a aba Descrição com o texto de dbu-rpg.com
  e, embaixo, a lista dos efeitos que o sistema automatiza. Nada é gravado no compêndio.
- **Item arrastado para uma ficha ou para o mundo:** já vem com o texto salvo.
- O botão **Carregar texto oficial** da aba Descrição busca o texto de novo quando quiser.
- Para desligar, use **Configurações › Configurar Sistema › Carregar o texto oficial
  automaticamente** (vale só para o seu computador).

## Celular e tablet

O Foundry é feito para telas de 1024 × 768 ou mais. Numa tela menor (celular em pé ou deitado, tablet em pé), o
sistema liga o **modo celular** sozinho:
- **Interface:** a barra lateral (chat, atores, combate) abre na largura da tela pelas abas da borda direita; a
  hotbar, a lista de cenas, as câmeras e os pop-ups de chat ao lado dela ficam escondidos para sobrar mapa. O aviso
  grande de resolução do Foundry vira uma nota curta.
- **Janelas:** fichas, a lista do compêndio e as Regras Opcionais ocupam a tela inteira; diálogos (ataque,
  escolhas, Scan...) cabem na largura. Os botões ficam maiores para o dedo, e os campos usam letra de 16px para o
  celular não dar zoom ao tocar.
- **Ficha:** a ficha rola inteira (o cabeçalho sobe) e as abas ficam presas no topo, numa linha que desliza para o
  lado. No celular em pé, o conteúdo fica numa coluna só; no tablet, continuam duas. As tabelas largas (Perícias)
  deslizam para o lado com o nome preso à esquerda, e os botões das linhas (transformar, maestria, stacks) quebram
  em mais linhas em vez de sair da tela.
- **Sem arrastar:** no celular não dá para arrastar itens para a ficha. Os botões de compêndio da ficha (📖) abrem
  uma **lista com busca**: tocar num item põe ele na ficha do mesmo jeito que arrastar (raça nova troca a antiga, um
  Awakening repetido ganha um stack). A lista fica aberta para adicionar vários; **Abrir o compêndio** mostra a
  janela normal.
- **Sem a tecla T:** o botão **Alvos** (aba Principal, ao lado de Ataque Básico) abre a lista dos tokens da cena para
  marcar os alvos. Atacar sem alvo abre essa lista primeiro, e o **Re-mirar** do cartão também usa a lista. Os alvos
  valem para tudo (ataque, Scan, Grapple...).
- **Configurações › Configurar Sistema › Modo celular:** Automático (pelo tamanho da tela), Sempre ligado ou
  Desligado. Vale só para o aparelho em que foi escolhido. Ao girar um tablet para uma tela grande, as janelas
  voltam ao tamanho normal.
- O mapa, as ferramentas de cena e a tela de entrada são do próprio Foundry e continuam pensados para computador:
  no celular, o mais prático é usar a ficha e o chat, e deixar o mapa com o mestre.

## A ficha de personagem

- **Cabeçalho:** nome, PL, ToP (atual/base), LP, KP e Capacidade com barras, Karma, rodada do
  combate e "SEU TURNO" quando é a vez do personagem.
- **Poder de Luta** (logo abaixo das barras de LP e KP): o número que um scouter leria. Não é regra do DBU, é uma
  leitura da ficha calibrada no anime:
  `0,56 × 1,7^(PL−1) × 1,55^(ToP atual−1) × (FO + AG/2 + TE/4)³ × KP restante`.
  - Conta os **Modificadores** atuais: FO pesa mais, depois AG (metade) e TE (um quarto). Numa ficha de PL 5, +1 FO
    sobe o número ~24%, +1 AG ~12% e +1 TE ~6%. A transformação sobe o número (o SSJ1 multiplica por ~3 e o Blue por
    ~48 no Goku de PL 25). Insight, Magic, Scholarship e Personality não entram.
  - **KP restante** = KP atual ÷ KP máximo natural (sem Ki Multiplier nem multiplicador de forma). Gastando KP o
    número cai (no mínimo 10%); numa forma com o KP acima do natural, ele sobe.
  - O **Holding Back** baixa o ToP atual e, com ele, o número.
  - Com fichas típicas: PL 1 (FO 6, AG 4, TE 4) ≈ 408; PL 4 (FO 9, AG 7, TE 7) ≈ 7.960; PL 5 (FO 9, AG 6, TE 6) ≈
    17.800; PL 10 (FO 10, AG 8, TE 4) ≈ 538.000.
  - O mestre pode trocar a fórmula em **Configurações › Configurar Sistema › Fórmula do Poder de Luta** (a dica lista
    as variáveis; em branco volta ao padrão). O tooltip do número mostra a conta.
  - Um **Scan** com Scouter ou Scout Scope lê esse número no inimigo (ver "Scan" em "Rolagens e ataques").
- **Alertas:** faixa logo abaixo do cabeçalho com testes obrigatórios e lembretes (ver "Alertas").
- **Principal:** atributos (Score, bônus racial, Modificador), aptidões (Initiative, Haste,
  Awareness, Defense Value, Soak, DR, Speed, Might, Surgency), Testes de Resistência e condições.
  Clique em um valor para rolar.
- **Condições com cadeado** (aba Combate) estão sendo mantidas por outra coisa, por exemplo um ferimento
  Internal do Injury System, que segura 1 stack de Fatigued, ou um ícone de condição no token. O
  tooltip diz o que é. Para tirar, ignore ou remova o ferimento na aba Opcionais. Num Grapple, o Guard Down (e o
  Pinned do Pin) fica com cadeado até o Grapple acabar.
- **Perícias:** ranks, bônus raciais e de talentos, limites de ranks por PL e orçamento.
- **Combate:** no alto, os **Traços em uso** (ver "Transformações"). Depois, Acerto (Strike), Desvio (Dodge),
  Dano (Wound), dados de ToP, Greater Dice, crítico e botch, contadores do combate (Ações, Counter Actions,
  Power, Super Stacks, Energy Charges, Diminishing Defense, Holding Back, DOT), manobras rápidas (Power Up,
  Energy Charge, Surge, Combat Recovery, e o Scan para quem tem Scouter) e o botão **Atacar**. A seção **Altura, Grapple e arremesso** tem a
  altura do token, o Soar, o Grapple e os arremessos (ver "Altura, voo, Grapple e arremessos").
- **Técnicas:** Signature Techniques (com construtor de Vantagens/Desvantagens que calcula TP e
  KP), Unique Abilities e Manobras Especiais.
- **Aventura:** os **Adventuring Maneuvers** que o personagem tem, e só eles:
  - **Universais** (todos): Take a Breather e Rest.
  - **Das perícias** com 2+ ranks: Stretch (Acrobatics), Pickpocket (Thievery), Obscure (Stealth), Create e Full
    Repair (Craft; Tune Up com Craft Vehicles), Recall e Research (Knowledge), Care e Create (Medicine), Gauge
    (Clairvoyance), Tame (Creature Handling), Power Regulation (Concealment), Profiling (Intuition), Scavenge
    (Survival), Scam e Fraud (Bluff), Cook e Create (Cooking), Frighten (Intimidation), Befriend, Mingle e Recruit
    (Persuasion).
  - **De itens, habilidades e traços**: Scan (Scouter equipado, Scout Scope ou Scouter integrado do Onboard
    Computer e do 3D Scan Mode), Item Search (Dragon Radar), Rice
    Cooker, Teleport (Instant Transmission), Instant Understanding (Mind Reading), Long Distance Portal (Portal
    Creation), Foresight (Precognition), Magical Sight (Second Sight), Morph (Shapeshift), Destroy (Hakai), Star
    Consume, Replicate Self e Robot Factory (Big Gete Star Integration), Recruit (Awakening Commander, na metade do
    tempo), Create (Magical Materialization, com Use Magic) e a remoção de absorvido do Roomy Biology.
  - **Usar** só funciona **fora de combate**: com o personagem num combate começado, os botões ficam travados e a
    aba avisa. Cada uso conta no **Session Limit**; o botão **Nova sessão de aventura** zera os usos do personagem
    (o mestre tem **Nova sessão para todos**). Clique no nome para o texto oficial no chat.
  - O que o botão faz:
    - **Rest, Take a Breather e Care** recuperam LP/KP. Care escolhe o alvo e pode contar como Rest para ele.
    - **Research, Scavenge, Fraud, Create e Cook** rolam a perícia contra a dificuldade escolhida.
    - **Pickpocket, Obscure, Gauge, Profiling, Frighten e Befriend** rolam o Clash contra o alvo, que usa a melhor
      das perícias dele; empate fica com o alvo.
      - O Pickpocket aplica −3 a cada nova tentativa no mesmo alvo.
      - Gauge, Profiling, Frighten e Befriend valem uma vez por alvo na sessão.
      - Vencendo o Gauge, o PL e o Alignment do alvo chegam só para quem usou (e o mestre).
      - O Profiling rola às cegas e só o mestre vê o resultado.
    - **Scan** abre o mesmo cartão do Scan de combate, sem custo de Ações (ver "Scan" em "Rolagens e ataques").
    - **Power Regulation** ajusta o Holding Back.
    - **Stretch** fica pendente e, se um combate começar em até 1 hora do tempo do mundo, dá +1(T) nas Combat Rolls
      até o fim da 3ª rodada.
    - Os outros mostram o efeito no chat para aplicar à mão.
- **Transformações:** Forms, Enhancements e Awakenings. Botão de transformar (rola o Stress Test
  com todas as regras de empilhamento), Grade (G), Stage (S), stacks (Z) e Mastery (M).
- **Raça e Talentos:** raça, traços raciais, fatores e talentos com checagem de pré-requisitos.
- **Inventário:** vestuário (camadas, penalidade, Apparel Bonus), armas (tamanho, categoria,
  Craftsmanship, qualidades) e itens.
- **Progressão e Regras:** TP ganhos/gastos, Talent Additions, Attribute Additions, todos os erros
  e avisos de regra encontrados na ficha, modificadores personalizados e **gatilhos personalizados**.
- **Regras Adicionais:** campos das regras opcionais ativadas (idade, gravidade, ferimentos,
  estilos de luta, Path to Power, Path to Godhood...).
- **Biografia:** dados de aparência, Z-Soul e notas.

## Rolagens e ataques

- Toda rolagem já soma o que se aplica: atributo, bônus fixos, penalidades de limiar, Power,
  Super Stacks, Weapon Penalty, Dados Extras de ToP, Greater Dice e modificadores de itens.
- **Crítico e Botch** são marcados no cartão de chat (Critical Target e Botch Range da ficha).
- **Atacar:** escolha a técnica ou o Perfil (Profile), a Fundação, o Ki Wager, Energy Charges e
  opções (Called Shot, Rapid...). O sistema confere as regras (custo mínimo, Capacidade, Wager
  máximo, ações), desconta KP/Capacidade/Ações e rola o Acerto.
- No cartão do ataque, o alvo clica em **Desviar** (ou Defend/Parry/Guard); o atacante rola o
  **Dano**; depois **Aplicar dano** calcula Soak, DR, categoria de dano, Guard, Broken, limiares,
  Steadfast, Massive Damage, Overkill, Bonus Momentum e Diminishing Defense.
- O GM aplica o dano em atores que o jogador não controla (via socket); o jogador não precisa de
  permissão no alvo.
- **Knockback:** ataques com a Vantagem Knockback, com o Perfil Launching (que a ganha de graça) ou feitos no
  Espaço Local ou no Espaço Profundo mostram "Knockback" no cartão. Depois do **Aplicar dano**, cada alvo que levou
  dano ganha o botão **Knockback**, só para o atacante:
  - rola o Might Clash (o alvo ganha o empate) e, vencendo, abre o arremesso: até o seu Might em quadrados, em
    linha reta para longe de você (em qualquer direção se o ataque tem AoE), com altura e colisões;
  - **Forceful Launch:** +1(T) quadrados e +1(T) no Clash por rank. **Perfect Positioning:** +1(T) no Clash;
  - **Precise Strike:** com crítico no Acerto, metade a mais de quadrados;
  - **Super Launch:** vence o Clash sem rolar, e o alvo perde LP igual aos quadrados escolhidos, mesmo que bata
    antes;
  - **Launching:** dano de colisão em dobro. **Espaço Local / Espaço Profundo:** a técnica que já tem Knockback soma
    1(bT) / 2(bT) ao Might do Clash e dos quadrados;
  - o cartão mostra o resultado ("Knockback 10 quadrados" ou "resistido"), e o botão some.
- **Scan:** com um Scouter equipado, um Scout Scope ou um Scouter integrado (Onboard Computer: Master; 3D Scan
  Mode: Grandmaster), a aba Combate ganha o botão **Scan**. Fora de combate ele é o Adventuring Maneuver da aba
  Aventura.
  - Escolha o aparelho e o alvo (o marcado primeiro). Em combate custa **1 Ação** (Scouter) ou **3** (Scout Scope).
  - O cartão do Scan dá ao dono do alvo os botões **Concealment** e **Deixar ler**. O Concealment rola contra o
    Craft DC do Scouter (Qualified no Scout Scope, que só vale para quem está em Holding Back ou percebeu o Scan). Se
    o Craft DC do item for variável, o diálogo pergunta uma vez e salva o escolhido no campo Craft DC do item.
  - **Escondendo:** nada acontece, e até o fim do encontro ele passa direto no Concealment contra aquele tipo de
    aparelho. Contra o Scout Scope, só enquanto não baixar o Holding Back.
  - **Falhando ou deixando ler:** quem escaneou (e o mestre) recebe, sussurrada, a leitura: **ToP atual**, **Power
    Level** (só se o ToP atual for o base, sem forma, Holding Back ou Breakthrough) e o **Poder de Luta** do alvo,
    pela fórmula do mundo, com o KP e o Holding Back daquele momento.
- **Scouter explodindo:** quando alguém de ToP atual 2+ usa o botão **Power Up**, os Scouters equipados de Craft DC
  Qualified (ou menor) por perto são destruídos; com ToP 3+, os de Expert também. Master, Grandmaster, Scout Scope e
  os Scouters integrados aguentam.
  - "Por perto" é até **15 quadrados** (contando a altura) num encontro de combate; fora de combate, a cena toda
    (a regra fala em centenas de milhas). O próprio Scouter de quem deu o Power Up também conta.
  - O Scouter destruído perde 1 de quantidade e, se era o último, sai do equipamento. Sai um cartão
    **Scouter destruído!** com quem perdeu o quê; o botão **Desfazer (mestre)** devolve tudo.
  - Scouter sem Craft DC definido (o do compêndio é variável): sai um cartão para o dono escolher o Craft DC
    (Qualified, Expert, Master ou Grandmaster). Ele fica salvo no item e, se for fraco demais para aquele Power Up,
    o Scouter explode na hora. Outro Power Up antes da resposta não repete a pergunta, só a atualiza se for mais forte.
  - Token escondido dos jogadores: os cartões dele vão só para o mestre.

## Transformações

- O botão de transformar rola o **Stress Test**: `1d10 + 1 + Stress Bonus` contra o requisito
  (somando 1/2 dos requisitos das transformações empilhadas, Step-by-Step, Prelude, Scaling e
  Grades).
- Ao entrar, os bônus de atributo, aspectos (Super Saiyan Form, Ki Multiplier, Draining,
  Straining...) e traços entram em vigor. Falhar → Stress Exhaustion, que em combate some sozinha no
  fim do próximo turno do personagem.
- **New Level of Power (automático):** vale quando o personagem **ganha acesso** a uma transformação pela
  primeira vez durante um combate, isto é, desbloqueia a forma no meio da luta. Enquanto ele estiver nela
  até o fim do encontro, o sistema aplica:
  - +1 ToP e +1(bT) de Stress Bonus;
  - o ToP base conta +1 para a Power Advantage;
  - os Stress Tests dessa transformação passam sozinhos, inclusive os forçados por Steadfast e Straining
    (menos quando ela está em conjunto com outra transformação);
  - o Legend Realized dessa entrada vem dobrado;
  - se for um Awakening, recupera 1/2 de LP e de KP.

  Só uma transformação por vez carrega o bônus. Como usar:
  - Toda Form ou Enhancement nova na ficha já vem com o **New Level of Power pendente** (etiqueta ⏳ NLoP
    na aba Transformações). Na primeira vez que o personagem entrar nela participando de um combate, ele
    ganha o bônus, mesmo antes de "Começar combate".
  - Nas formas que o personagem já usava antes, desmarque **New Level of Power pendente** na aba Detalhes
    da transformação, ou clique na etiqueta ⏳ NLoP.
  - Fora de um combate, a transformação funciona normalmente e o bônus continua pendente (o chat avisa).
  - Um Awakening ganho no meio do combate dá o bônus na hora.
  - Clicar na etiqueta NLoP cancela o bônus, pendente ou ativo.
- **Legend Realized:** ao entrar numa Form (menos Stage 0) em combate, recupera LP e KP = 2d10(T) + PL,
  uma vez por Form por encontro. Não repete com outra Form do mesmo tipo e mesmo requisito de ToP já
  usada no encontro.
- **Chefes:** NPCs do tipo **Chefe (Boss)** podem entrar em transformações acima do ToP deles: o
  requisito de ToP não trava o botão nem gera aviso. Os outros requisitos e o Stress Test continuam valendo.
- Transformações **Graded** (Kaioken, Super Kaioken, Evil Aura, Lightspeed Mode, Powerhouse,
  Wrathful, Beyond Divine Saiyan...) já têm os bônus por Grade automatizados: use + e − ao lado do
  "G".
  - Os **Aspects da tabela de Grades** entram sozinhos, junto com os dos Grades abaixo. Por exemplo, o Wrathful no
    Grade 2 ganha Armored, Bulky e Growth (LV1), e o Powerhouse ganha Growth (LV1) no Grade 2 e Armored no 3. A
    ficha da transformação lista isso em **Aspectos por Grade**.
  - Um Aspect com nível **LVG** acompanha o Grade: o Rampaging (LVG) do Wrathful tem 1 nível no Grade 1 e 2 no
    Grade 2. Com 2 níveis, o Compelled vale contra o personagem mais próximo, aliado ou oponente.
- O interruptor ao lado liga/desliga sem teste (decisão do ARC).
- Ki em 0, Derrota ou Revert encerram as transformações automaticamente.
- **Maestria:** o botão 🎓 ao lado de cada transformação (com − e +) marca o nível de maestria (até 1, ou mais com
  o Aspect Difficult). Ao alcançar um nível, as **Mastery Traits** entram sozinhas: os Aspects que a maestria
  remove, reduz ou adiciona (ex.: Super Saiyan 1 dominado perde Draining e Power High e ganha Natural e Heartbeat)
  e os bônus passivos ligados a ela. Um cartão no chat resume o que mudou; baixar o nível desfaz.
  - Quando a maestria tira só uma parte de um Aspect, o resto fica. O Wrathful dominado perde só o Innate State
    (Feral): continua no Raging, e o Rampaging cai 1 nível (some no Grade 1, fica com 1 nível no Grade 2).
  - **"M níveis"** (M = número de maestrias da transformação) crescem a cada maestria, até o máximo indicado. O
    Full Power Super Saiyan, por exemplo, na 1ª maestria fica com Draining (LV1) e Scaling (LV1); na 2ª perde o
    Draining e fica com Scaling (LV2). Já "ganha 1 nível" soma aos níveis que o Aspect já tem: o Scaling (LV1)
    do Perfected Super Saiyan vai para LV2.
- **Stages e variantes** (herança de traços, já embutida no compêndio):
  - Cada Stage tem os traços automatizados de todos os Stages de baixo da mesma linha, mesmo quando estão em outra
    página. O Super Saiyan 2 e o 3 têm o S-Cells do 1, e o Rosé tem o que vem do SSG.
  - A Mastery Trait de um Stage de baixo só vale no de cima quando ele também estiver dominado.
  - Uma variante (Aspect Variant) herda tudo da transformação listada, menos os traços que ela substitui (o nome
    entre parênteses, como "Mixed S-Cells (S-Cells)" no Bio Super Saiyan). O Rosé, variante do Blue, recebe a escolha do
    Blue Saiyan.
  - Legendary Traits valem o tempo todo, mesmo fora da forma, e contam uma vez só.
  - A aba Detalhes da transformação lista os **traços herdados** e de onde vem cada um.
  - Os bônus de atributo (AMB) não somam entre Stages: cada Stage usa a própria tabela.
- **Metamorphosis:** o Suppression of Power da Full Suppression ignora o requisito de ToP para entrar e
  permanecer, e todos os Stages herdam esse traço. Um Arcosian entra em qualquer Stage que tenha, sem checar o ToP
  (o Stress Test continua). O site não tem mais uma regra de acesso antecipado enfraquecido; a que existe para
  qualquer forma é o Aspect **Prelude** (−1 no requisito de ToP e −3 no Stress, com −1(T) nos bônus e sem o último
  traço).
- **Traços em uso (aba Combate):** um quadro por transformação ativa, com os traços dela, os herdados (com "de
  Super Saiyan 1" embaixo), a opção escolhida (S-Cells: Super Surger) e as Mastery Traits já alcançadas. Ao
  reverter, o quadro some. Seguem os **Legendary Traits** (sempre, mesmo fora da forma), os traços raciais ativos e
  os talentos.
  - Passe o mouse num traço para ver os efeitos dele e quais são automáticos; clique para mandar o texto oficial
    do traço ao chat (vem do site, ou do texto já carregado na ficha).
  - Em cima de cada quadro ficam o Grade, a maestria e os Aspects que valem agora.
- **Burst Limit:** ao entrar numa Enhancement pela Transformation Maneuver (ou mudar o Grade dela), o cartão do
  chat traz o botão **Burst Limit: nome**; no quadro da Enhancement há o botão **Ativar**. O sistema conta 1 por
  encontro (qualquer Enhancement) e libera de novo com o New Level of Power nela. Numa Enhancement Transcended, o
  Burst Recovery devolve 1/2 do KP máximo. Fora desse momento, ele pergunta antes de ativar. O efeito de cada
  Burst Limit aparece no cartão com o texto oficial e é aplicado à mão.
- **Transcendent Trait:** nas Enhancements com o Aspect Transcendent, o + da maestria vai uma vez além de
  Fully Mastered (aparece como "1/1+"). Com essa maestria extra, o Transcendent Trait vale enquanto ela estiver
  Transcended (marque Transcended nos Detalhes); os efeitos [Permanent] dele valem sempre.
- **Grand Awakening:** o traço Grand Awakening de um Super Awakening fica desligado até o botão **Full Awakening**
  do quadro do Awakening (1 por encontro, 1 ação). O sistema mostra o Grand Trigger, pergunta se ele foi cumprido,
  liga o traço até o fim do encontro e devolve 1/4 de LP e KP (arredondado para cima).
- **Stacks de Awakening:** na aba Transformações, o − e o + ao lado de "2/7" tiram e dão stacks.
  - Cada stack soma o bônus de atributo de novo, libera os traços "Nome (n)" e aumenta o Z dos efeitos (Surgency
    Z(bT), LP por Power Level...). O cartão no chat mostra o bônus total do Awakening, o que passou a valer ou deixou
    de valer, os efeitos que crescem com o Z e os Perks e pontos ganhos.
  - Arrastar para a ficha um Awakening que ela já tem dá um stack a mais, em vez de criar um item repetido.
  - O + para no máximo de stacks. O **Awakening Limit conta cada stack** (menos os temporários e os livres), e a
    ficha avisa quando passa. O Strongest Form pede ToP 3+ no 2º stack.
  - **Escolha a cada stack:** a janela abre ao ganhar o stack; fechou sem escolher, o alerta da ficha lembra (botão
    com a lista, também ao lado do nome do Awakening). Perder o stack desfaz as escolhas dele.
    - Ki Technician (Technical Trait), Warlock (Wizarding Trait) e Perfection (Perfect Trait): só os traços
      escolhidos valem, com os bônus deles (Focused Blaster +2(T) no Wound de Energy Attacks...).
    - Results of Training: Agility ou Tenacity (+1 no bônus de atributo) e um Combat Roll com +1(T), sem repetir o
      do stack anterior.
    - Vocation Gain: a Vocation do stack, com o bônus de atributo dela (Gadabout fica à mão).
    - Absorption: o Absorbed Character (nome, com a lista dos personagens do mundo) e os 3 atributos do bônus, já
      marcados com os 3 maiores do personagem absorvido. Unified: o Merged Character.
    - Bio-Diversity e Cybernetic Upgrade: o Factor Trait escolhido entra na ficha e sai junto com o stack.
    - Elemental Force (Favored Element), Bestial Transfiguration (Bestial Trait), Diverse Leader (Leadership Trait) e
      Spirit Control (Spiritual Unique Ability): a escolha fica registrada na ficha; o efeito é aplicado à mão.
  - **Perks e pontos:** Results of Training dá +1 Character Perk por stack, Results of Intense Training +2, e Vocation
    Gain +1 Attribute Point e +5 TP. Tudo já entra na Progressão.
  - **Stack temporário (Temporary Awakening):** Shift+clique no + pergunta o nível. A etiqueta ⏳ mostra quantos há.
    Eles não contam para o limite nem dão New Level of Power, e são os primeiros a sair no −. No fim do combate, os
    de nível 2 saem sozinhos; para os de nível 1, o mestre recebe um cartão com **Manter** (viram permanentes) e
    **Tirar**. Um Awakening marcado como Temporary Awakening inteiro também gera esse cartão.
  - **Stacks livres** (aba Detalhes do Awakening): não contam para o limite nem dão bônus de atributo, como o Spirit
    Control que um Yardrat ganha na criação.
  - **Automático:** um Saiyan com **Born for Battle** que cai abaixo do Critical Threshold em combate (1 vez por
    encontro) ganha um stack temporário nível 1 de **Zenkai**; se não tiver o Zenkai, ele entra na ficha. Com o
    **On the Brink** (3 stacks), em vez disso entra no Surging State até o fim do próximo turno. No **Absorption**,
    quem está derrotado no início do turno perde todos os stacks, e o chat diz quem foi libertado.
  - Efeitos de outras transformações que contam stacks ("for every stack of Absorption you possess", no Absorbed
    Power e no Namekian Potential) usam os stacks da ficha.
- **Imagem do token por forma:** na aba Transformações, o ícone 🖼 de cada Form ou Enhancement escolhe a imagem do
  token nela (também em Detalhes › Imagem do token). Ao entrar na forma, os tokens do personagem trocam para essa
  imagem; ao sair, voltam à imagem de sempre. Uma Form vale mais que uma Enhancement quando as duas têm imagem.
  Quem não tem permissão de navegar nos arquivos cola o caminho ou a URL da imagem. Se alguém trocar a imagem do
  token à mão no meio da forma, ela fica.
- **Fichas antigas:** quando uma correção do compêndio muda os traços das transformações (como a herança acima), o
  GM recebe no chat o cartão **Atualizar as transformações das fichas**, com a lista do que muda. Ficam como estão
  as escolhas feitas, a maestria, o Grade, o estado e os modificadores adicionados à mão. **Agora não** esconde o
  cartão até a próxima mudança do compêndio.
- **Escolhas obrigatórias:** traços com efeito *Option* (ex.: **S-Cells** do Super Saiyan 1: Super Surger, Super
  Speed, Super Sturdy ou Super Specialist) pedem a escolha na primeira vez que o personagem entra na transformação
  (pelo botão de transformar ou pelo interruptor): sem escolher, ele não entra. A escolha vale para todos os
  estágios que herdam o traço (SSJ2, SSJ3...) e liga só os efeitos da opção escolhida. Awakenings pedem a escolha
  assim que entram na ficha. A ficha da transformação mostra o que foi escolhido e permite trocar.

## Divine Ki Points (God Ki)

Quem tem uma transformação com o Aspect **God Ki** (Super Saiyan God, Blue, Rosé, Autonomous Ultra Instinct,
Power of Destruction, Dark King...) ganha a barra **DKP** no topo da ficha, entre o KP e a Capacity.

- **Tamanho:** metade do KP máximo, sem contar o Ki Multiplier. A barra enche sozinha no início de cada combate,
  e também quando o acesso chega no meio do combate.
- **Quando usar:** só no estado God Ki, ou seja, numa forma com God Ki ou com o estado God Ki marcado na aba
  Combate (Divine Candidate). Fora dele a barra fica apagada e os pontos ficam guardados.
- **Pagando com DKP:**
  - **Ataque:** no diálogo há **Pagar o custo em DKP** e **Ki Wager em DKP**. São dois pagamentos separados, cada
    um de um pool só, e o DKP gasta metade da Capacity.
  - **Guard e Energy Charge:** seguem o botão **KP/DKP** da barra, que escolhe o pool padrão no estado God Ki.
- **Draining:** no estado God Ki, também tira em DKP metade do KP perdido.
- **No Energy:** uma forma com God Ki cai quando os **DKP** zeram, e não os KP. Se houver uma transformação sem
  God Ki junto (Kaioken, por exemplo), o KP em 0 continua derrubando tudo.
- **Empower:** botão na aba Combate. Marque o aliado (target), escolha as Ações e a quantidade. Com os dois em God
  Ki, dá para mandar DKP. Não gasta Capacity.

**God Maneuvers** (compêndio Manobras › God Maneuvers): arraste as que o personagem ganhou por traço para a aba
Técnicas (Manobras especiais) e use pelo botão ☀. Elas exigem o estado God Ki, descontam o DKP (com metade da
Capacity), as Ações ou Counter Actions, e controlam o limite 1/Round e 1/Encounter.

| God Maneuver | O que o sistema faz |
|---|---|
| Divine Attack | Abre o ataque com o custo do Profile pago em DKP e +1 Damage Category |
| God Strike | Escolhe o Profile uma vez; o ataque custa 1/4 do KP do Profile, em DKP |
| Divine Breathing | Rola 5d10(bT) + Surgency e cura |
| Divine Flame | +2 Power (até o fim do próximo turno) e devolve em KP o DKP gasto |
| Divine Counter | Gasta a Counter Action e abre o Basic Attack fora de sequência |
| Divine Flex | Botão ☀ na sua linha do cartão de ataque: −1 Damage Category e o Soak do Direct Hit |
| Holy Transformation | Entra numa forma com God Ki sem Stress Test (por exemplo, do SSG para o Blue) |
| Divine Pulse | 1 ou 2 Ações: Stress Bonus −1 por Ação e +1(T) em FO e MA por Ação até sair da forma |
| Divine Movement, Divine Roar, God Bind | Descontam o DKP e mostram o efeito para o mestre resolver |
| God Finisher | Lembrete: use a Signature dele com "Pagar o custo em DKP" |

## Fusão

Crie um Ator do tipo **Fusão** (Gogeta, Vegito...). A ficha é igual à de personagem, com uma aba
**Fusão** a mais:

1. **Personagens fundidos:** arraste as fichas dos personagens para a aba, ou escolha na lista. O
   número de personagens depende do método. Uma fusão não pode fazer parte de outra.
2. **Método:** Metamorese (dança), Potara, Maxi, Merge, EX ou Parasitic. A aba mostra o tipo
   (Temporária/Duradoura), o limite de rodadas e o Method Trait de cada um.
   - Na Metamorese, o botão **Fazer a dança** rola a Performance dos dois contra Master
     (Grandmaster se os tamanhos forem diferentes). Se um dos dois errar, rola o 1d4 e a fusão sai
     **Plump** ou **Frail**: Modificadores pela metade, sem transformações, técnicas, Unique
     Abilities ou Fusion Modifiers. Também dá para escolher o resultado à mão.
3. **Fusion Modifiers:** a aba mostra quais têm o requisito cumprido. Valem até 2 numa fusão
   Temporária e 1 numa Duradoura. Os efeitos entram sozinhos: Balanced, Dominant, Enhanced, Fused
   Transformation (bônus nas Forms em comum e estágios seguintes da linha), Power of Friendship, Shared
   Heritage, Synergistic (+3 PL) e The Mightiest Fusion.
   - No **Balanced Fusion**, clique nos 2 atributos que recebem o +2(bT). Só os que têm Score igual ou
     com 1 de diferença entre os personagens podem ser escolhidos; clicar num terceiro troca o mais antigo.
4. **Traços raciais e Awakenings:** marque quais entram. O limite é de até 7 traços, com 2 a 4
   primários, e Awakenings dentro do limite da fusão pelo ToP base.
5. **Fused Technique:** escolha uma técnica de cada personagem. A base perde as Desvantagens, recebe
   as Vantagens da outra (até o rank máximo), ganha o Super Profile e custa 4(T) KP a menos. Quem
   preferir ganha +5(bT) TP no lugar.

O sistema calcula sozinho, sempre que um dos personagens muda (desligue em **Sincronizar sozinha**):
- **PL:** o mais alto + 1(bT), se todos estiverem a até 5 PL do mais alto e não houver Minion. Pode
  passar de 30; o ToP base para em 7.
- **Atributos e perícias:** o maior Score e o maior número de ranks de cada um.
- **Itens:** todas as raças, talentos, transformações (com maestria), técnicas, Unique Abilities e
  itens dos dois.
- **Pools e Karma:** LP, KP e Capacidade pelo PL da fusão, e o Karma de todos.
- **Tamanho e alinhamento:** escolhidos dentro da faixa entre os personagens.
- **Bônus personalizados** (aba Progressão de cada personagem): vão para o traço "Bônus personalizados
  dos personagens", cada um uma vez.
- **Idade** (regra opcional Age, decisão da mesa): a idade física da fusão é sempre Peak, e a idade mental
  é a do personagem mentalmente mais velho. A sincronização acerta as duas, mesmo que você mude na aba
  Opcionais da fusão.
- **Técnicas:** as copiadas não gastam TP. A fusão tem 10(bT) TP para técnicas novas, o dobro com
  Dominant Personality.

**Em jogo** (botão **Fundir** na ficha da fusão; quem executa é o GM, que precisa estar com a cena da luta aberta):
- Os tokens dos personagens andam um até o outro e somem. O token da fusão aparece onde eles se
  encontraram, no meio do caminho.
- **Permissões:** os jogadores dos personagens viram donos da fusão só enquanto ela está ativa. Ao
  desfazer, cada um volta ao acesso que tinha antes (por exemplo, Observador, se o GM deu esse acesso
  para eles acompanharem a ficha).
- No combate, a fusão rola Iniciativa mas joga logo em seguida. Ela começa com LP e KP cheios, ou 1
  acima do limiar Bruised se todos estavam abaixo de Injured.
- **Round Limiter:** o contador de rodadas desce a cada rodada. A primeira Transformação de requisito
  ToP 4+ corta metade do requisito. Quando zera, a fusão se desfaz.
- **Defusão forçada:** acontece ao falhar o Steadfast do limiar Injured ou Critical, ou ao ser Derrotada.
- **Ao desfazer:** o token da fusão some e os tokens dos personagens reaparecem onde ela estava. Cada
  um dá um passo para uma casa vizinha, do lado de onde veio. No combate, eles rolam Iniciativa, pulam
  o turno, ficam em Stress Exhaustion por 2 rodadas e não podem se fundir por 5 rodadas. Fusões
  Duradouras têm a **Defusão livre**, sem essas penalidades.
- O Karma gasto pela fusão sai dos personagens (o Karma do método é gasto primeiro).

## Auras de transformação nos tokens

Enquanto uma transformação está ativa, o token mostra uma aura animada em volta da arte:

| Transformação | Aura |
|---|---|
| Super Saiyan 1 | contorno dourado |
| Super Saiyan 2 | contorno dourado com raios azuis |
| Super Saiyan 3 | contorno dourado com mais raios azuis |
| Super Saiyan God (e True SSG) | contorno vermelho |
| Super Saiyan Blue (Evolved, Descended) | contorno azul |
| Super Saiyan Rosé | contorno rosa |
| Ultra Instinct ("Sign", "Complete", Autonomous, True) | nebulosa prateada |
| Ultra Ego | nebulosa roxa |

- As outras transformações não têm aura até alguém escolher: na ficha da transformação (aba Detalhes), em
  **Aura no token**, escolha a aparência (contorno brilhante, contorno com raios ou nebulosa) e as cores. Dá para
  trocar também as cores das auras automáticas, ou desligá-las com "Nenhuma".
- Com uma Form e uma Enhancement ativas ao mesmo tempo, as duas auras aparecem em camadas.
- Todos os jogadores veem as auras. Quem achar pesado pode desligar só para si em **Configurações › Configurar
  Sistema › Auras de transformação nos tokens**.

## Altura, voo, Grapple e arremessos

A altura fica na **elevação do token** e aparece num **marcador** acima dele (no lugar do número de elevação do
Foundry). Há dois jeitos de contar, conforme a regra opcional **Flight** (Configurações › Regras Adicionais):

- **Sem a regra Flight (padrão do Battleground):** os níveis de High Environment: Chão, **Céu Baixo**, **Céu
  Alto**, **Espaço Local** e **Espaço Profundo**. Cada nível vale 8 quadrados de distância. Entrar ou sair do
  Espaço Profundo só com o mestre.
- **Com a regra Flight:** a **Verticality**, 1 por quadrado de altura. O marcador mostra o número, com "Céu" acima
  de 8 e "Espaço" a partir de 16.

**Mudar a altura:** as setas ▲▲/▼▼ no HUD do token (clique direito no token, logo abaixo da elevação) ou na aba
Combate. Com a regra Flight, Shift muda 5 de uma vez. O botão **Soar** faz o Soar Maneuver:

- sem Flight: +1(bT) de Defense Value até o início do seu próximo turno e sobe ou desce 1 nível;
- com Flight: ganha até 8 Verticality (16 com o talento Frequent Flyer, que também deixa usar como Instant) e
  +1(T) no Desvio (2(T) com Frequent Flyer) até o início do seu próximo turno;
- gasta 1 Ação, avisa se já foi usado na rodada e é bloqueado com Gravity Intensity 2+.

**Quem voa:** 2+ ranks em Flight, o Soar Maneuver na ficha, uma Unique Ability chamada Flight (ou Dragon Flight)
ou um Jetpack dão o Soar. A Unique Ability Flight e o Jetpack também guardam a Verticality no início do turno.

**No combate (Automação de combate ligada):**

- **Com Flight, início do turno:** quem não tem a Unique Ability Flight perde toda a Verticality. Prone no ar
  cai até o chão mesmo com Flight e perde 1(bT) LP a cada 2 de Verticality (até 4(bT), mais com gravidade).
- **Sem Flight, início da rodada (Falling):** quem não tem rank em Flight nem o Soar desce 1 nível. Saindo do Céu
  Baixo, rola Acrobatics (Qualified); se falhar, bate no chão.
- **Gravity Intensity 2+:** no fim do turno, quem está no alto volta ao chão.
- **Distância:** o diálogo de ataque mostra a distância de cada alvo contando a altura (a diferença de
  Verticality, ou 8 quadrados por nível) e já marca **Long Range** quando todos estão a 9+ quadrados.
- **AoE:** o cartão do ataque avisa quem está fora do alcance vertical da AoE (com Flight, até o número da
  Magnitude em Verticality; sem Flight, Minor e Standard só no mesmo nível, Large e Huge 1 nível, Destructive 2).

**Grapple (aba Combate, com o alvo marcado):**

- **Grapple:** Clash Strike × Strike/Dodge (o defensor usa o melhor dos dois e ganha o empate). Vencendo, os dois
  ficam no Grapple com Guard Down. Perdendo, o cartão lembra do Exploit do alvo. Se o alvo tem cauda, dá para
  agarrar a cauda (−2(T), sem Tail Attack). Agarrar quem já está num Grapple pede um Might Clash contra o Grappler.
- **Launch:** Grapple Check; vencendo, solta e arremessa o agarrado até o seu Might em quadrados, em qualquer
  direção. Perdendo, ele escapa.
- **Pin** (2 Ações): Grapple Check −1(bT) e Might Clash; vencendo os dois, o agarrado fica Pinned enquanto durar.
- **Escapar** (quem está agarrado): Grapple Check com +1(T) por Ação depois da primeira; o empate é de quem foge.
- **Soltar:** o Grappler encerra o Grapple. O Grapple também acaba com o fim do combate.
- **Thrust:** Clash Strike × Strike/Dodge; vencendo, **Push Back** (½ Might quadrados em linha reta, para longe,
  com dano de colisão em dobro) ou **Knock Prone** (Clash Impulsive/Corporeal: Prone, ou Guard Down no alvo até o
  fim do seu turno).
- **Mover alvo:** para outros efeitos que empurram ou arremessam (Express Ticket, Terrain Slam, traços...; o
  Knockback das técnicas tem botão próprio no cartão de ataque):
  quadrados, exatos ou "até", em linha reta para longe ou não, e dano em dobro.
- Quem está fora de um Grapple e move alguém que está nele faz antes um Might Clash contra o Grappler.

**O arremesso** (Launch, Push Back, Mover alvo) abre um diálogo com os quadrados, a direção (uma rosa dos ventos,
ou "para longe de quem move") e a altura:

- **Com Flight:** cada Verticality que o alvo sobe ou desce gasta 1 quadrado da movimentação.
- **Sem Flight:** com 8+ quadrados, o **Vertical Launch** corta a movimentação pela metade e muda o alvo 1 nível.
- **Sudden Stop:** se o alvo usar a Counter Action, marque: até ½ Might dele de quadrados a menos e metade do dano
  de colisão.

O token vai em linha reta, quadrado por quadrado, e o sistema resolve o que houver no caminho:

- **Parede (Feature):** o token para antes dela e o sistema pergunta a dureza.
- **Outro personagem na mesma altura (Character Collision):** pergunta se ele reage com uma Counter Action (Might
  Clash contra quem moveu, ou sair do caminho). Sem reação, os dois levam o dano de Hardness Rank 2 e ficam Prone.
- **Chão:** com Flight, chegar a Verticality 0 é o **Hitting the Floor** (+1(bT) a cada 2 de Verticality perdida,
  até 4(bT)). Sem Flight, descer do Céu Baixo por Vertical Launch é **Ground Collision**. Nos dois casos o sistema
  pergunta a dureza do chão.

**A pergunta da dureza:** o Hardness Rank (0 areia/água, 1 madeira/cascalho, 2 pedra/cimento, 3 metal, 4 metal
reforçado, 5 Katchin), já com o dano para aquele personagem (1(bT) no Rank 0, senão 2 × Rank (bT)), e as
qualidades:

- Glass (+1 Rank), Metallic (Rank 3+), Dangerous (×2), Bouncy/Rubbery/Fragile (metade; a Fragile é destruída e o
  movimento continua);
- Soft (Prone), Burning (Broken por 1 rodada), Shocking (Impediment por 1 rodada), Sharp (+2 DOT);
- **Usar como padrão da cena** guarda a dureza do chão para as próximas vezes;
- **Não há Feature (passa)** deixa o token seguir.

O dano sai dos LP direto (sem Soak), com os limiares e o Steadfast de sempre. O cartão diz quanto a Feature sofreu
(½ do ToP de quem causou; os LP dela são o Hardness Rank). Quando o jogador não é dono do alvo, o mestre aplica os
efeitos. A rolagem do defensor é feita no computador de quem usou a manobra.

## Combate automatizado

Com **Automação de combate** ligada (configuração do mundo), o GM controla o Combat Tracker e o
sistema faz o resto. Cada ficha sabe em que rodada está e se é o seu turno.

- **Início do encontro:** gatilhos "Start of Combat Encounter".
- **Início de cada rodada:** Capacidade cheia, Ações (3 + Power Advantage − Reduced Momentum),
  Counter Actions, Diminishing Defense/Offense zerados, Falling (sem a regra Flight) e gatilhos "Start of
  Combat Round" (regeneração Namekiana, Infinite Energy, Battle Born em rodadas pares...).
- **Início do seu turno:** DOT, Draining, Ki 0 (sai da transformação), Straining (botão de Stress
  Test), lembretes de Compelled e Power, efeitos temporários que acabam, perda da Verticality (regra Flight) e
  gatilhos "Start of Turn".
- **Fim do seu turno:** Poisoned, Suffocating, Gravidade (com GI 2+ volta ao chão), efeitos que duram "até o fim
  do seu turno" (também os que você causou nos outros, como o Guard Down do Thrust) e gatilhos "End of Turn".
- **Fim do encontro:** Instant Recovery (+1/10 de LP e KP), recursos e contadores zerados.

## Gatilhos de turno e rodada

Todo traço, talento, transformação, Unique Ability ou item pode ter **gatilhos** (aba
Modificadores do item). O compêndio já vem com os efeitos de turno/rodada ligados:

- **Automático:** aplicado sozinho (ex.: *Namekian Biology* +3(bT) LP no início de cada rodada;
  *Born for Battle* +1 Battle Born nas rodadas pares; *Divine Physique* LP/KP por limiar acima).
- **Botão no chat:** quando o efeito é opcional ("you may"), aparece um botão no cartão do turno.
- **Só lembrete:** quando o efeito depende de escolha ou de algo fora da ficha, o cartão do turno
  lembra o nome do efeito no momento certo.
- **Estados e Condições temporários:** "entre no Surging State até o fim do seu turno" coloca o
  estado e o remove sozinho na hora certa (fim do turno, início do próximo turno, fim do próximo
  turno, fim da rodada ou fim do encontro).
- Efeitos de **Opções** (ex.: *Tailed/Tailless* de Saiyan Heritage, *Infinite Energy* de Energy
  Core) vêm desligados: ligue a opção escolhida na aba Modificadores do item.

Campos de um gatilho: Quando (início/fim da rodada, início/fim do seu turno, início do encontro),
Efeito (LP, KP, Capacidade, Counter Actions, Ações, stacks de recurso, State, Combat Condition,
lembrete), Valor (fórmula), Recurso (nome do recurso, State ou Condition), Condição (fórmula),
Modo e Duração.

## Battle Born, Progress e Power

- **Stacks por rolagem:** Battle Born, Progress, Bottomless Battle Born e Divine Battle Born ficam em
  **Combate › Recursos** como recursos "Por rolagem": cada stack fica no Acerto, no Desvio ou no Dano e
  dá +1(T) nessa rolagem (máx. 2 stacks por rolagem no Battle Born e no Progress).
- **Escolha automática:** quando um efeito dá um stack (Born for Battle nas rodadas pares, Warrior's
  Pride no início do encontro, ou o **+** do recurso), abre uma caixa para o **jogador dono** do personagem
  escolher a rolagem. Se o GM está rodando o combate, a caixa aparece na tela do jogador; se ele não
  estiver online, aparece para o GM.
- Rolagem no limite fica bloqueada; marque "Ignorar o limite" quando um efeito permitir (Oozaru,
  "regardless of the limit"). Efeitos que aumentam o limite (Controlled Wrathful, Condensed Legend...)
  já somam sozinhos, e a Divine Battle Born vai direto para o Dano.
- Fechou a caixa sem escolher? O stack fica esperando, com um alerta e o botão **Distribuir** na ficha.
- **Power:** as caixas de seleção ao lado de "Power" são os stacks. Marcar uma caixa dá o stack sem
  gastar Ação; o botão **Power Up** gasta 1 Ação e respeita o limite de 2 por rodada (com 2 stacks, ele
  renova a duração de um deles). Em combate, cada stack sai sozinho no fim do seu próximo turno, e a Max
  Capacity (+1/4 nos 2 primeiros stacks) acompanha. Só o botão conta como a manobra Power Up, que pode explodir
  os Scouters fracos por perto (ver "Scouter explodindo"); as caixas não.

## Técnicas de exemplo

- O compêndio **DBU — Técnicas de Exemplo** traz as 41 Signature Techniques da página de exemplos do site
  (Kamehameha, Final Flash, Spirit Bomb...), organizadas em Super, Ultimate e Dramatic Finisher. Arraste para a
  ficha ou use o ícone de livro ao lado de "Signature Techniques" na aba Técnicas.
- Cada exemplo já vem com Fundação, Perfil, Vantagens e Desvantagens (com ranks e escolhas) no construtor, e a
  ficha calcula TP e KP.
- A página de exemplos foi escrita com uma versão anterior das regras: os custos listados lá aparecem na
  descrição do item, mas a ficha recalcula pelas regras atuais. Perfis antigos (Sphere, Rapid Fire, Explosion,
  Kiai, Spell, Basic, Blitzing) foram trocados pelo Perfil atual mais próximo, e opções que não existem mais ficaram
  de fora. Tudo isso está anotado na aba Descrição de cada técnica. Requisitos que não batem com as regras atuais
  aparecem como erro no construtor.

## Injury System (ferimentos)

Com a regra **Injury System** ligada em Regras Adicionais:

- Quando um ataque aplica dano acima de **1/3 do LP máximo** do alvo (**1/4** se o dano for Lethal; metade disso
  contra um **Regenerator**, como Namekian Biology ou Nanomachine Repair), o sistema checa o limiar de vida do alvo
  depois do golpe: abaixo de Bruised permite **Minor**; abaixo de Critical, ou Derrotado, permite **Major**.
- Abre uma caixa para o **atacante** escolher o grau (nenhuma, Minor ou até Major) e o local (Olhos, Ouvidos,
  Mão/Braço, Pé/Perna, Interno, Cauda). A caixa aparece na tela do jogador dono do atacante ou, se ele não
  estiver online, na do GM.
- **Called Shot:** marque o tipo de Injury pretendido no diálogo de ataque. O dano conta +1/4 para a checagem e
  só aquele tipo pode ser infligido; sem tipo declarado não há Injury.
- A Injury entra na ficha do alvo: LP e KP máximos −1/10 (Minor) ou −1/5 (Major), mais as penalidades do local.
  Uma Minor repetida no mesmo local vira Major. Com Pé/Perna Major, falhar um Steadfast derruba (Prone).
- **Regenerator:** um Healing Surge pode encerrar uma Injury, e todas acabam no fim do encontro.

## Alertas e testes situacionais

A faixa de alertas mostra o que precisa ser feito agora, com botões quando dá para resolver na
hora:

- **Stress Test obrigatório:** transformado e derrubado por um Health Threshold (falhou o
  Steadfast ou sofreu Massive Damage). Botão rola o teste; falhar aplica Stress Exhaustion.
- **Steadfast pendente** ao cair abaixo de um limiar durante o combate.
- **Ki em 0** transformado, **Derrotado** (Desperation Effects e Karma), **Undying** com LP negativo.
- Condições com ação: Prone (levantar), Pinned (Might Clash), Compelled, Sleeping, Slowed 3,
  Poisoned, Suffocating, Staggered, Blinded, Fatigued, Stress Exhaustion.
- Lembretes: Energy Charge acumulada, Power, DOT, Draining, Rampaging, Limited, Surging,
  Determined, Gravidade, Holding Back, Surge disponível, cargas extras de Ultimate e Diminishing
  Defense.

## Regras Adicionais

Cada regra opcional é uma caixa de seleção em **Configurações › Regras Adicionais**. As marcadas
como *automatizada* são calculadas e checadas na ficha; *parcial* automatiza o que é numérico;
*referência* só aparece como lembrete.

- **Minor Optional Rules:** Profile Buyout, Style Change, Off-Guard, Ping Pong, Stamina Rules,
  Desperation Rules, United Transformation, Overkill, Limit-Breaking Training, Greater
  Enhancement, Factor Restoration, Earned Scaling, Full Power Mastery.
- **Variant Rules:** Awakening Points, Without Limit, Alternate Life Point Generation.
- **Additional Rules:** Age, Ballistics, Characteristics, Dragon Balls, Fighting Styles, Flight,
  Gag Rules, Generations, Gravity (com a intensidade do mundo), Horde Battles, Injury System,
  Path to Godhood, Path to Power, Roles.

## Checagem de regras

A ficha confere a criação e a evolução do personagem: raça e tamanhos, perks, pontos e limites
de atributo, perícias, talentos (quantidade, categorias, pré-requisitos, duplicados), TP gastos
(Signatures, Unique Abilities), limites das Signatures, transformações (raça, ToP, estágios,
empilhamento, limite de Awakenings), equipamento (camadas, armadura, armas) e recursos.

- **Erros** (vermelho) quebram uma regra; **avisos** (amarelo) pedem atenção ou decisão do ARC.
- Com **Checagem rígida** ligada, o sistema bloqueia adições claramente ilegais (dois itens de raça,
  talento repetido...). Desligada, apenas avisa.
- **Avisos instantâneos** mostram uma notificação quando uma edição cria um novo erro.

## Fórmulas dos modificadores

Modificadores e gatilhos usam a notação do DBU:

- `2(T)` = 2 × ToP atual; `1(bT)` = 1 × ToP base; `G(T)`, `Z(bT)`, `@L(T)` usam Grade, stacks e
  nível de estado.
- Variáveis: `@power`, `@below` (limiares abaixo), `@transformed`, `@inForm`, `@holdingBack`,
  `@states.raging`, `@res.battleborn` (recursos pelo nome sem espaços), `@round`, `@lifeMax`,
  `@kiMax`, `@aptitudes.surgency`, `@attributes.fo.mod`...
- Funções: `floor()`, `ceil()`, `min()`, `max()`; comparação e escolha: `@G>=3?2:1`.
- Condições: `@round % 2 == 0` (rodadas pares), `@below == 0` (Healthy), `@power >= 2`.
