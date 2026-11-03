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

## A ficha de personagem

- **Cabeçalho:** nome, PL, ToP (atual/base), LP, KP e Capacidade com barras, Karma, rodada do
  combate e "SEU TURNO" quando é a vez do personagem.
- **Alertas:** faixa logo abaixo do cabeçalho com testes obrigatórios e lembretes (ver "Alertas").
- **Principal:** atributos (Score, bônus racial, Modificador), aptidões (Initiative, Haste,
  Awareness, Defense Value, Soak, DR, Speed, Might, Surgency), Testes de Resistência e condições.
  Clique em um valor para rolar.
- **Condições com cadeado** (aba Combate) estão sendo mantidas por outra coisa, por exemplo um ferimento
  Internal do Injury System, que segura 1 stack de Fatigued, ou um ícone de condição no token. O
  tooltip diz o que é. Para tirar, ignore ou remova o ferimento na aba Opcionais.
- **Perícias:** ranks, bônus raciais e de talentos, limites de ranks por PL e orçamento.
- **Combate:** Acerto (Strike), Desvio (Dodge), Dano (Wound), dados de ToP, Greater Dice, crítico e
  botch, contadores do combate (Ações, Counter Actions, Power, Super Stacks, Energy Charges,
  Diminishing Defense, Holding Back, DOT), manobras rápidas (Power Up, Energy Charge, Surge,
  Combat Recovery) e o botão **Atacar**.
- **Técnicas:** Signature Techniques (com construtor de Vantagens/Desvantagens que calcula TP e
  KP), Unique Abilities e Manobras Especiais.
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
- **Escolhas obrigatórias:** traços com efeito *Option* (ex.: **S-Cells** do Super Saiyan 1: Super Surger, Super
  Speed, Super Sturdy ou Super Specialist) pedem a escolha na primeira vez que o personagem entra na transformação
  (pelo botão de transformar ou pelo interruptor): sem escolher, ele não entra. A escolha vale para todos os
  estágios que herdam o traço (SSJ2, SSJ3...) e liga só os efeitos da opção escolhida. Awakenings pedem a escolha
  assim que entram na ficha. A ficha da transformação mostra o que foi escolhido e permite trocar.

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

## Combate automatizado

Com **Automação de combate** ligada (configuração do mundo), o GM controla o Combat Tracker e o
sistema faz o resto. Cada ficha sabe em que rodada está e se é o seu turno.

- **Início do encontro:** gatilhos "Start of Combat Encounter".
- **Início de cada rodada:** Capacidade cheia, Ações (3 + Power Advantage − Reduced Momentum),
  Counter Actions, Diminishing Defense/Offense zerados, e gatilhos "Start of Combat Round"
  (regeneração Namekiana, Infinite Energy, Battle Born em rodadas pares...).
- **Início do seu turno:** DOT, Draining, Ki 0 (sai da transformação), Straining (botão de Stress
  Test), lembretes de Compelled e Power, efeitos temporários que acabam, e gatilhos "Start of Turn".
- **Fim do seu turno:** Poisoned, Suffocating, Gravidade, efeitos que duram "até o fim do seu
  turno" e gatilhos "End of Turn".
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
  Capacity (+1/4 nos 2 primeiros stacks) acompanha.

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
