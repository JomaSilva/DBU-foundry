# Pipeline dos compêndios

Atualiza os compêndios quando sair uma versão nova das regras em dbu-rpg.com.

1. Baixar as páginas do site (PowerShell), numa pasta vazia fora do projeto, por exemplo `C:\dbu-site\raw`:

   ```powershell
   $raw = "C:\dbu-site\raw"; New-Item -ItemType Directory -Force $raw | Out-Null
   for ($p = 1; $p -le 10; $p++) {
     $u = "https://public-api.wordpress.com/wp/v2/sites/dbu-rpg.com/pages?per_page=100&page=$p&_fields=id,slug,title,parent,modified,content,link,menu_order"
     try { Invoke-WebRequest $u -OutFile "$raw\pages_$p.json" } catch { break }
   }
   Invoke-WebRequest "https://dbu-rpg.com/" -OutFile "$raw\home.html"
   ```

2. Converter para texto e extrair o menu (o menu marca o que é Homebrew, que fica de fora):

   ```powershell
   py -I build\tools\html2text.py C:\dbu-site\raw C:\dbu-site\text
   py -I build\tools\menu.py C:\dbu-site\raw\home.html C:\dbu-site\text\_menu.json
   ```

3. Gerar as fontes dos compêndios (só dados mecânicos + link; o texto das regras não é copiado):

   ```powershell
   py -I build\extract_content.py C:\dbu-site\text build\packs-src
   py -I build\tools\inspect_packs.py build\packs-src "Namekian Biology|Kaioken"
   ```

   `build/packs-src/_remind.txt` lista os efeitos de turno/rodada que ficaram só como lembrete.

   - **Automação escrita à mão:** `build/automation/*.json` (`awakenings.json`, `forms.json` para Forms,
     Enhancements e Evolved Forms, `racial.json` para os traços raciais, fatores, Custom Species e Villainous Traits) guarda, por efeito (`"slug|Traço|n"`), modificadores, gatilhos e opções de ataque só
     com dados mecânicos. O extrator aplica por cima do que os padrões de texto reconhecem (`"replace": true` troca o
     que foi compilado) e avisa as entradas que não acharam o efeito (um efeito renumerado no site).
     `DBU_DUMP_EFFECTS=<arquivo>` exporta todos os efeitos de transformação e de traço racial com o que foi compilado, para revisar. Uma entrada
     `code` de categoria `grant` (`grant maneuver: Analysis; talent: Snack Fiend`) vira `flags.dbu-rpg.grants` no traço,
     e o sistema traz o item junto; o extrator lista os grants que não acharam item nos compêndios.
   - **Ferramentas e agentes da automação** (`build/automation/tools/`, Node; o vocabulário vem do próprio sistema):
     1. `DBU_DUMP_EFFECTS=effects.json py -I build/extract_content.py <texto> <saída>` — exporta os efeitos.
     2. `node build/automation/tools/batches.mjs --dump effects.json --outdir <pasta> --new --n 4` — acha o que ainda
        não tem automação (`--new`: efeitos novos ou renumerados numa atualização do site; `--code`: os que ainda
        precisam de código, para revisitar depois que o sistema aprendeu algo novo; `--type form,enhancement`; `--type racial` para os traços raciais) e
        separa em lotes, uma transformação (ou uma raça) inteira por lote.
     3. Um agente `dbu-automation-mapper` (`.claude/agents/`) por lote escreve as entradas seguindo
        `tools/VOCAB.md` e confere com `tools/validate.mjs` (rejeita alvo, evento, efeito ou variável que o sistema
        não tem; `--type racial` também proíbe as variáveis e eventos só de transformação).
     4. `node build/automation/tools/validate.mjs --dump effects.json --out merged.json <pasta das entradas>` e
        `node build/automation/tools/merge.mjs merged.json build/automation/forms.json --dump effects.json` — junta o
        que passou (e põe um lembrete no chat, no momento certo, nos efeitos que ficam com o mestre).
     5. `node build/automation/tools/report.mjs --dump effects.json --out gaps.md` lista o que ainda precisa de código,
        por categoria; o agente `dbu-automation-gaps` lê isso e propõe o que ensinar ao motor para automatizar mais.
   - **Páginas fora do menu:** o site publica páginas novas antes de pô-las no menu. As de transformação que devem
     entrar mesmo assim ficam em `EXTRA_TRANSFORMATION_PAGES` no extrator; as outras aparecem como "note: ... skipped".

4. Com o Foundry **fechado**, gravar os compêndios LevelDB em `dbu-rpg/packs` (usa o `classic-level` do próprio Foundry):

   ```powershell
   node build\build-packs.mjs
   ```

   O compêndio "Guia do Sistema" é gerado de `docs/COMO-USAR.md` e `docs/REGRAS.md`. Se algum compêndio estiver
   aberto no Foundry, o script para antes de apagar qualquer coisa. Ao abrir o mundo, o GM atualiza sozinho, nas
   transformações que já estão nas fichas, o que a maestria e os Grades fazem nos Aspects.

`build/tools/lang_add.py <pasta lang> <arquivo.json>` mescla chaves novas (com pontos) no `pt-BR.json` e espelha no `en.json`.
`node build/merge-lang.mjs [--check]` junta os fragmentos `build/lang/a.json` a `f.json` (textos dos pacotes de
vocabulário 5A–5C e 6D–6F) nos arquivos de idioma; `--check` só diz se estão desatualizados.

O vocabulário da automação mora em `dbu-rpg/module/vocab/` (eventos, efeitos, alvos e manobras de cada pacote) e o
validador lê as variáveis e as checagens extras de `build/automation/tools/vocab/a.mjs` a `f.mjs`. O pacote 6D (referências
entre efeitos: cada peça leva `fx` e cada item a flag `fx` com os efeitos dele, gravados pelo importador) também confere
as referências contra o dump de efeitos passado em `--dump`.

`build/tools/simular-luta.js` roda lutas automáticas entre dois atores (Macro de Script ou console do GM),
usado nas lutas de `docs/LUTAS-TESTE.md`. Só num mundo de teste: ele apaga os combates e os tokens da cena ativa.
