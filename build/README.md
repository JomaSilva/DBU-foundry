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

4. Com o Foundry **fechado**, gravar os compêndios LevelDB em `dbu-rpg/packs` (usa o `classic-level` do próprio Foundry):

   ```powershell
   node build\build-packs.mjs
   ```

   O compêndio "Guia do Sistema" é gerado de `docs/COMO-USAR.md` e `docs/REGRAS.md`. Se algum compêndio estiver
   aberto no Foundry, o script para antes de apagar qualquer coisa. Ao abrir o mundo, o GM atualiza sozinho, nas
   transformações que já estão nas fichas, o que a maestria e os Grades fazem nos Aspects.

`build/tools/lang_add.py <pasta lang> <arquivo.json>` mescla chaves novas (com pontos) no `pt-BR.json` e espelha no `en.json`.

`build/tools/simular-luta.js` roda lutas automáticas entre dois atores (Macro de Script ou console do GM),
usado nas lutas de `docs/LUTAS-TESTE.md`. Só num mundo de teste: ele apaga os combates e os tokens da cena ativa.
