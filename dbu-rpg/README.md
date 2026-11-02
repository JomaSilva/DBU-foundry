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
- **Power** em caixas de seleção: Power Up 2×/rodada, cada stack expira sozinho no fim do seu próximo turno.
- **Transformações**: bônus de atributo por tabela (T/bT/stacks), aspectos automáticos (Super Saiyan Form, Bulky, Armored, Enhanced Save, Perfect Ki Control, High Speed, Raging, Mindful, Draining, Straining...), Legend Realized.
- **Signature Techniques**: construtor com todas as Vantagens/Desvantagens, custo de TP e KP calculados, requisitos checados.
- **Checagem de regras**: pontos de atributo, perks, ranks, talentos (categorias e pré-requisitos), TP, limites de Signature, Ultimates, transformações empilhadas, limites de Awakening, vestuário, armas e mais.
- **Alertas**: testes situacionais pendentes (Stress Test após Steadfast falhado transformado, Steadfast, Ki 0, Prone, Pinned...).
- **Regras Adicionais** (Configurações › Regras Adicionais): Age, Gravity, Injury System, Stamina, Fighting Styles, Path to Power, Path to Godhood, Ballistics, Characteristics, Generations, Variant Rules e outras.

## Conteúdo

Compêndios: Raças (28), Traços Raciais e Fatores (262), Talentos (268), Transformações (472), Unique Abilities (66),
Técnicas de Exemplo (41), Manobras Especiais (67), Equipamentos (51) e o **Guia do Sistema** (como usar + resumo das regras e relações).

Os compêndios trazem os **dados mecânicos** (números, requisitos, aspectos, custos, modificadores e gatilhos) e o link de cada entrada.
O texto completo das regras pertence à equipe do DBU: use o botão **Carregar texto oficial** na aba Descrição de qualquer item
para baixar o texto direto do site para o seu mundo.

## Desenvolvimento

- `build/extract_content.py <site_text> build/packs-src` gera as fontes dos compêndios a partir do texto do site.
- `node build/build-packs.mjs` grava os compêndios LevelDB em `dbu-rpg/packs` (com o Foundry fechado).
- `docs/REGRAS.md` (regras e relações) e `docs/COMO-USAR.md` (uso) viram o compêndio do guia.
