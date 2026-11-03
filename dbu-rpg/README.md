# Dragon Ball Universe RPG — sistema para Foundry VTT v14

Sistema de fã (sem fins lucrativos) para o **Dragon Ball Universe RPG** de [dbu-rpg.com](https://dbu-rpg.com/) (regras 0.9.3).

## O que é automatizado

- **Atributos**: Score (1 + raça + pontos + bônus) e Modificador (Score + transformações/efeitos), limite de Score por ToP.
- **Aptidões**: Haste, Awareness, Defense Value, Soak (mín. 1(bT), tamanho), Redução de Dano, Might, Surgency, Speeds, Iniciativa.
- **Pools**: LP (60 + 12/PL + (RLM + 2×TE)×PL), KP (50 + 12/PL), Max Capacity (20 + 4/PL), Ki Multiplier, Power, Fatigued.
- **Tier of Power**: base pelo PL, Breakthrough (+2 máx.), **Dados Extras de ToP**, Greater Dice, dados de crítico, categorias de dado.
- **Rolagens**: Acerto, Desvio e Wound com crítico/botch, resultado natural, Twin-Linked/Dead-Link; perícias (+1d4/−2); Resistências; Might/atributo; Steadfast; Stress Test (combinado, Step-by-Step, Prelude, Scaling).
- **Ataques**: diálogo com perfil/Signature, Ki Wager (limite de 1/2 Max Capacity), Energy Charges (d6/d8 por carga), Called Shot, Long Range, Hidden, arma; custo de KP com mínimo; cartão com Desvio/Parry/Guard/Direct Hit dos alvos e aplicação de dano (Soak por categoria, RD, Broken, Superior...).
- **Limiares de vida**: Steadfast automático ao cair num limiar, Massive Damage, penalidades, Bonus/Reduced Momentum, Stress Test forçado.
- **Combate**: a ficha sabe a rodada e o turno em que está; reinício de Capacidade/Ações/Counter/Diminishing a cada rodada, Power Advantage, DOT, Draining, Poisoned, Suffocating, Gravidade, Instant Recovery ao fim do encontro.
- **Gatilhos de turno/rodada**: efeitos *Start/End of Turn*, *Start of Combat Round* e *Start of Combat Encounter* de traços, talentos, transformações e Unique Abilities ligados ao combate — automáticos (LP/KP, stacks, pontos, Ações, Counter Actions, States e Conditions com duração), botão no chat (efeitos opcionais) ou lembrete no momento certo. Gatilhos personalizados na ficha.
- **Condições e Estados** com efeitos numéricos e ícones no token.
- **Stacks por rolagem** (Battle Born, Progress...): ao ganhar um stack, abre uma caixa na tela do jogador dono para escolher Acerto, Desvio ou Dano, respeitando os limites (e os efeitos que mudam o limite).
- **Injury System**: dano grande abre a escolha de Injury (grau e local) para o atacante, com Called Shot, Regenerator e Minor repetida virando Major.
- **Maestria e escolhas**: botão de maestria na aba Transformações aplica as Mastery Traits (Aspects removidos/adicionados e bônus); efeitos *Option* (ex.: S-Cells) são escolhidos obrigatoriamente na primeira transformação e valem para os estágios seguintes.
- **Auras nos tokens**: transformações ativas desenham contorno, raios ou nebulosa em volta do token (SSJ dourado, SSJ2/3 com raios azuis, God vermelho, Blue azul, Rosé rosa, Ultra Instinct e Ultra Ego em nebulosa); as outras formas usam a aparência escolhida na ficha.
- **Power** em caixas de seleção: Power Up 2×/rodada, cada stack expira sozinho no fim do seu próximo turno.
- **Transformações**: bônus de atributo por tabela (T/bT/stacks), aspectos automáticos (Super Saiyan Form, Bulky, Armored, Enhanced Save, Perfect Ki Control, High Speed, Raging, Mindful, Draining, Straining...), Legend Realized (sem repetir com Form do mesmo tipo e requisito) e **New Level of Power** quando o personagem ganha acesso à transformação no meio de um combate, ou quando ela está marcada como pendente (+1 ToP, Power Advantage, Stress Tests automáticos, Legend Realized dobrado; Awakening recupera metade de LP e KP). NPCs do tipo **Chefe** podem usar formas acima do próprio ToP.
- **Traços em uso**: a aba Combate mostra o que o personagem pode usar agora: os traços das transformações ativas (com os herdados dos Stages de baixo e as Mastery Traits alcançadas), os Legendary Traits (sempre), os traços raciais e os talentos; ao reverter, os da forma saem. Um clique manda o texto oficial do traço ao chat.
- **Burst Limit, Transcendent e Grand Awakening**: Burst Limit com botão ao entrar na Enhancement ou mudar o Grade, contado 1 por encontro (de novo com New Level of Power) e com Burst Recovery nas Transcended; Transcendent Trait com a maestria além de Fully Mastered; Full Awakening Maneuver que liga o Grand Awakening até o fim do encontro.
- **Adventuring Maneuvers**: aba Aventura com os que o personagem tem (universais, das perícias com 2+ ranks e de itens, habilidades e traços), usáveis só fora de combate, com Session Limit e botão de nova sessão; cura, testes de perícia, Clashes contra o alvo, Holding Back e o Stretch para o próximo combate são automáticos.
- **Poder de Luta**: leitura de scouter abaixo das barras de LP e KP, pela fórmula do mundo (PL, ToP atual, FO, AG, TE e KP restante).
- **Imagem do token por forma**: cada Form ou Enhancement pode ter sua imagem; os tokens trocam ao transformar e voltam ao reverter.
- **Divine Ki Points (God Ki)**: barra de DKP para quem tem forma com God Ki, cheia a cada combate e usável só no estado God Ki. Paga custo e Ki Wager (metade da Capacity), Guard e Energy Charge; o Draining tira DKP, o No Energy das formas God Ki depende dele e o Empower envia DKP. As 12 God Maneuvers estão no compêndio de manobras, com custo, frequência e efeitos automatizados.
- **Fusão**: Ator do tipo Fusão que monta a fusão a partir das fichas dos personagens (PL, atributos, perícias, raças, traços, talentos, transformações, técnicas, equipamento), com os seis métodos, os Fusion Modifiers, a Fused Technique, a dança (Plump/Frail) e, em jogo, os tokens se encontrando (a fusão aparece onde eles se juntam e eles se separam ao desfazer), os jogadores donos da fusão só enquanto ela dura, Round Limiter, defusão forçada e as penalidades da defusão.
- **Signature Techniques**: construtor com todas as Vantagens/Desvantagens, custo de TP e KP calculados, requisitos checados.
- **Checagem de regras**: pontos de atributo, perks, ranks, talentos (categorias e pré-requisitos), TP, limites de Signature, Ultimates, transformações empilhadas, limites de Awakening, vestuário, armas e mais.
- **Alertas**: testes situacionais pendentes (Stress Test após Steadfast falhado transformado, Steadfast, Ki 0, Prone, Pinned...).
- **Regras Adicionais** (Configurações › Regras Adicionais): Age, Gravity, Injury System, Stamina, Fighting Styles, Path to Power, Path to Godhood, Ballistics, Characteristics, Generations, Variant Rules e outras.

## Conteúdo

Compêndios: Raças (28), Traços Raciais e Fatores (262), Talentos (268), Transformações (472), Unique Abilities (66),
Técnicas de Exemplo (41), Manobras Especiais (67), Equipamentos (51) e o **Guia do Sistema** (como usar + resumo das regras e relações).

Os compêndios trazem os **dados mecânicos** (números, requisitos, aspectos, custos, modificadores e gatilhos) e o link de cada entrada. O texto oficial vem de dbu-rpg.com na hora: abrir um item do compêndio mostra o texto, e um item arrastado para uma ficha já vem com ele salvo.
O texto completo das regras pertence à equipe do DBU: use o botão **Carregar texto oficial** na aba Descrição de qualquer item
para baixar o texto direto do site para o seu mundo.

## Desenvolvimento

- `build/extract_content.py <site_text> build/packs-src` gera as fontes dos compêndios a partir do texto do site.
- `node build/build-packs.mjs` grava os compêndios LevelDB em `dbu-rpg/packs` (com o Foundry fechado).
- `docs/REGRAS.md` (regras e relações) e `docs/COMO-USAR.md` (uso) viram o compêndio do guia.
