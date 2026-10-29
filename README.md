# Lua Menu

Plataforma de cardápio digital e pedidos online para lanchonetes, operada pela agência **Lua Menu**. Cada lanchonete contratante recebe uma loja própria (link, cardápio, painel de pedidos e estoque). A **Me Gusta** é a primeira loja.

Projeto estático (HTML, CSS e JavaScript puro). Sem build, sem dependências para rodar.

## Telas

| Arquivo | Quem usa | O que faz |
| --- | --- | --- |
| `index.html` | Público | Abre direto o cardápio da Me Gusta (loja de demonstração) |
| `site/index.html` | Lanchonetes interessadas | Página institucional da Lua Menu, separada do cardápio, para divulgar a agência |
| `loja.html?l=<loja>` | Cliente da lanchonete | Cardápio, sacola, pedido e acompanhamento (`&pedido=<código>`) |
| `painel.html?l=<loja>` | Dono da lanchonete | Pedidos, estoque, cardápio, ajustes e link/QR Code |
| `agencia.html` | Agência | Cadastro de lojas, contratos, suspensão e acesso aos painéis |

## Rodar localmente

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

No modo `local` (padrão) os dados ficam no navegador, só para demonstração. Pedidos feitos em um aparelho não aparecem em outro.

Acessos de demonstração:

- Painel da Me Gusta: loja `me-gusta`, PIN `1234`
- Painel da agência: PIN `luamenu` (altere em `js/config.js`)

## Colocar no ar com banco de dados (Supabase)

Para a lanchonete receber pedidos de verdade, em qualquer aparelho:

1. Crie um projeto gratuito em [supabase.com](https://supabase.com).
2. Em **SQL Editor**, cole e execute `supabase/schema.sql`.
3. Em **Authentication > Users**, crie o usuário da agência e um usuário para cada dono de loja.
4. Rode as duas linhas de SQL do final do `schema.sql` para dar permissão (agência e dono da loja).
5. Em `js/config.js`, troque `mode` para `"supabase"` e preencha `url` e `anonKey` (Project Settings > API).
6. Publique a pasta em qualquer hospedagem estática (GitHub Pages, Vercel, Netlify).

Com o banco ligado, o preço, as opções e o estoque são validados no servidor a cada pedido. O cliente nunca lê a tabela de pedidos: ele cria o pedido e consulta pelo código.

## Fluxo para uma nova lanchonete

1. Agência: `agencia.html` > **Nova loja** (nome, endereço, cores, plano e mensalidade). Dá para começar copiando o cardápio de outra loja.
2. Agência: cria o acesso do dono (PIN no modo local, e-mail e senha no Supabase).
3. Dono ou agência: no painel, em **Cardápio**, cadastra categorias, produtos, fotos e preços. Em **Estoque**, informa as quantidades.
4. Em **Ajustes**: logo, capa, horário, taxa de entrega, formas de pagamento e WhatsApp.
5. Em **Divulgação**: copia o link e imprime o QR Code.

## Cardápio da Me Gusta

Transcrito dos prints enviados pelo dono (`js/seed.js`). Sucos, cafés, pães preparados na hora e o "Hambúrguer" simples não tinham preço nas imagens: aparecem como "Preço sob consulta" e não podem ser pedidos até o dono cadastrar o valor. O salgado assado (R$ 9,50) está como um item único; os sabores devem ser cadastrados pelo dono. Os estoques iniciais são apenas de demonstração.

## Estrutura

```
index.html  loja.html  painel.html  agencia.html
site/       página institucional da agência (index.html)
css/        base, loja, painel, landing
js/         config, seed, util, store (local + Supabase), loja, painel, agencia
assets/     marca Lua Menu e imagens de cada loja (assets/lojas/<loja>/)
supabase/   schema.sql
```

## Limites desta versão

- Não processa pagamento online: a forma de pagamento é escolhida no pedido e cobrada na retirada ou na entrega.
- Fotos enviadas pelo painel são reduzidas e guardadas dentro do cadastro (modo simples). Para muitas fotos, o próximo passo é usar o Supabase Storage.
- No Supabase, a sessão do painel expira após cerca de 1 hora e o dono precisa entrar de novo.
- Os avisos de novo pedido tocam enquanto o painel estiver aberto no navegador.
