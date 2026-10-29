/* ============================================================
   Lua Menu - configuração geral
   ============================================================
   MODO DE DADOS
   - "local"    : tudo fica salvo no navegador. Serve para demonstração:
                  pedidos feitos em um aparelho NÃO aparecem em outro.
   - "supabase" : banco online. Cliente, lanchonete e agência veem os mesmos
                  dados em qualquer aparelho. Passo a passo no README.md.
   ============================================================ */
window.LM_CONFIG = {
  mode: "local",

  supabase: {
    url: "",       // ex.: https://xxxx.supabase.co
    anonKey: ""    // chave "anon public" do projeto
  },

  agency: {
    name: "Lua Menu",
    // WhatsApp comercial da agência (somente números, com DDI). Ex.: "5519999999999"
    whatsapp: "",
    // PIN do painel da agência (usado só no modo "local")
    localPin: "luamenu"
  },

  // Loja de demonstração destacada na página inicial
  demoSlug: "me-gusta"
};
