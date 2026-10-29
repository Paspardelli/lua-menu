/* ============================================================
   Dados iniciais (modo local): primeira loja do Lua Menu = Me Gusta
   Fonte: prints do cardápio enviados pelo dono.
   - price: null -> o preço não aparecia nos prints; o dono define no painel.
     Itens sem preço ficam visíveis como "Preço sob consulta" e não podem ser pedidos.
   - stock: null -> estoque não controlado.
   - Os valores de estoque são apenas de DEMONSTRAÇÃO.
   ============================================================ */
(function () {
  const IMG = "assets/lojas/me-gusta/";

  const categories = [
    { id: "pasteis", name: "Pastéis" },
    { id: "pasteis-doces", name: "Pastéis doces" },
    { id: "fritos", name: "Salgados fritos" },
    { id: "assados", name: "Salgados assados" },
    { id: "paodequeijo", name: "Pão de queijo" },
    { id: "mistos", name: "Mistos e queijo quente" },
    { id: "hamburgueres", name: "Hambúrgueres" },
    { id: "xis", name: "Lanches X" },
    { id: "dogs", name: "Cachorro-quente" },
    { id: "paes", name: "Pães na hora" },
    { id: "festa", name: "Mini salgadinhos e churros" },
    { id: "sucos", name: "Sucos" },
    { id: "cafes", name: "Cafés e bebidas" }
  ];

  const P = [];
  let n = 0;
  const add = (category, name, desc, price, stock, extra = {}) =>
    P.push({ id: "p" + String(++n).padStart(3, "0"), category, name, desc: desc || "", price, stock, lowAt: 5, active: true, img: "", options: [], ...extra });

  /* Pastéis */
  add("pasteis", "Pastel de carne", "", 11, 40, { img: IMG + "pastel.jpg" });
  add("pasteis", "Pastel de carne com queijo", "", 12, 40, { img: IMG + "pastel.jpg" });
  add("pasteis", "Pastel de carne com catupiry", "", 12, 30, { img: IMG + "pastel.jpg" });
  add("pasteis", "Pastel de pizza", "", 11, 30);
  add("pasteis", "Pastel de pizza com catupiry", "", 12, 25);
  add("pasteis", "Pastel de queijo", "", 11, 35);
  add("pasteis", "Pastel de queijo com catupiry", "", 12, 25);
  add("pasteis-doces", "Pastel de chocolate preto", "", 13, 20);
  add("pasteis-doces", "Pastel de chocolate branco", "", 13, 20);
  add("pasteis-doces", "Pastel de chocolate misto", "Chocolate preto e branco", 14, 18);

  /* Salgados fritos (R$ 8,50) */
  add("fritos", "Coxinha de frango com catupiry", "", 8.5, 60, { img: IMG + "frito.jpg" });
  add("fritos", "Coxinha de massa de batata com carne seca", "Novidade", 8.5, 24, { img: IMG + "coxinha.jpg", tag: "Novidade" });
  add("fritos", "Coxinha de massa de batata com costela", "Novidade", 8.5, 24, { img: IMG + "coxinha.jpg", tag: "Novidade" });
  add("fritos", "Risoles de presunto e queijo", "", 8.5, 40);
  add("fritos", "Risoles de queijo", "", 8.5, 40);
  add("fritos", "Kibe com queijo", "", 8.5, 36);
  add("fritos", "Bolinho de carne", "", 8.5, 36);
  add("fritos", "Bolinho de carne com ovo", "", 8.5, 30);
  add("fritos", "Costela", "", 8.5, 30);
  add("fritos", "Salsicha com queijo", "", 8.5, 30);

  /* Salgado assado (R$ 9,50). Os sabores não constavam nos prints: o dono cadastra. */
  add("assados", "Salgado assado", "Informe o sabor desejado nas observações", 9.5, 40, { img: IMG + "assado.jpg" });

  /* Pão de queijo */
  add("paodequeijo", "Pão de queijo", "", 3.5, 80, { img: IMG + "paodequeijo.jpg" });
  add("paodequeijo", "Pão de queijo com requeijão", "", 6.5, 40, { img: IMG + "paodequeijo.jpg" });
  add("paodequeijo", "Pão de queijo com Nutella", "", 6.5, 30, { img: IMG + "paodequeijo.jpg" });
  add("paodequeijo", "Pão de queijo com presunto e queijo", "", 6.5, 30, { img: IMG + "paodequeijo.jpg" });

  /* Mistos e queijo quente */
  add("mistos", "Misto Quente 1", "3 presuntos, 3 queijos muçarela e tomate", 17, null);
  add("mistos", "Misto Quente 2", "3 presuntos, 3 queijos muçarela, tomate, cebola e catupiry", 19, null);
  add("mistos", "Misto Quente 3", "3 presuntos, 3 queijos muçarela, tomate, cebola, catupiry e milho", 21, null);
  add("mistos", "Mega Misto", "3 presuntos, 3 queijos muçarela, tomate, cebola, catupiry, milho, hambúrguer e batata palha", 26, null);
  add("mistos", "Queijo Quente", "4 fatias de queijo muçarela e tomate", 17, null);
  add("mistos", "Queijo Quente Maluco 1", "4 fatias de queijo muçarela, tomate e catupiry", 20, null);
  add("mistos", "Queijo Quente Maluco 2", "4 fatias de queijo muçarela, tomate e queijo cheddar", 21, null);

  /* Hambúrgueres */
  add("hamburgueres", "Hambúrguer", "2 presuntos, 2 queijos muçarela, tomate e hambúrguer", null, null);
  add("hamburgueres", "Hambúrguer Egg", "2 presuntos, 2 queijos muçarela, tomate, hambúrguer e ovo", 19, null);
  add("hamburgueres", "Hambúrguer Duplo", "2 presuntos, 2 queijos muçarela, tomate e 2 hambúrgueres", 19, null);
  add("hamburgueres", "Hambúrguer Cheddar", "2 presuntos, 2 queijos muçarela, tomate, hambúrguer e cheddar", 20, null);
  add("hamburgueres", "Hambúrguer Catupiry", "2 presuntos, 2 queijos muçarela, tomate, hambúrguer e catupiry", 20, null);
  add("hamburgueres", "Hambúrguer Egg e Cheddar", "2 presuntos, 2 queijos muçarela, tomate, ovo, hambúrguer e cheddar", 20, null);
  add("hamburgueres", "Hambúrguer Egg e Catupiry", "2 presuntos, 2 queijos muçarela, tomate, ovo, hambúrguer e catupiry", 21, null);
  add("hamburgueres", "Hambúrguer Triplo", "3 presuntos, 3 queijos muçarela, tomate e 3 hambúrgueres", 26, null);
  add("hamburgueres", "Mega Burguer", "3 presuntos, 3 queijos muçarela, tomate, 3 hambúrgueres, milho, ovo e catupiry", 29, null);
  add("hamburgueres", "Bauru Especial", "180 gramas de carne, queijo, catupiry, bacon, tomate, cebola e alface", 32, null);

  /* Lanches X (feitos com hambúrguer) */
  add("xis", "Americano", "Ovo, queijo e tomate", 16, null);
  add("xis", "X-Salada", "Presunto, queijo, hambúrguer, tomate, alface e batata palha", 17, null);
  add("xis", "X-Egg", "Presunto, queijo, hambúrguer, ovo, batata palha, tomate e alface", 18, null);
  add("xis", "X-Bacon", "Presunto, queijo muçarela, bacon, hambúrguer, batata palha, tomate e alface", 21, null);
  add("xis", "X-Fominha", "2 hambúrgueres, 2 ovos, presunto, queijo, tomate, alface e batata palha", 24, null);
  add("xis", "Especial Triplo", "3 hambúrgueres, bacon, presunto, queijo, batata palha, tomate e alface", 28, null);

  /* Cachorro-quente (feitos com salsicha) */
  add("dogs", "Dog Simples", "2 salsichas, batata palha, ketchup, maionese, tomate e milho", 17, null);
  add("dogs", "Dogcheddar", "2 salsichas, batata palha, ketchup, maionese, tomate e cheddar", 20, null);
  add("dogs", "Dogpiry", "2 salsichas, batata palha, ketchup, maionese, tomate, milho e catupiry", 20, null);
  add("dogs", "Super Dog", "4 salsichas, batata palha, milho, maionese, ketchup, tomate, catupiry e 2 queijos muçarela", 26, null);

  /* Pães preparados na hora (preços não apareciam nos prints) */
  add("paes", "Pão na chapa", "", null, null);
  add("paes", "Pão na chapa baguete", "", null, null);
  add("paes", "Pão com manteiga frio", "", null, null);
  add("paes", "Pão com manteiga frio baguete", "", null, null);
  add("paes", "Pão com requeijão", "", null, null);
  add("paes", "Pão com requeijão baguete", "", null, null);

  /* Festa */
  add("festa", "Cento de salgadinhos (misto)", "Coxinha de frango, bolinha de queijo, presunto e queijo, carne, requeijão, salsicha e calabresa com queijo. Cada mini salgadinho pesa 20 g.", 60, null, { img: IMG + "salgadinhos.jpg" });
  add("festa", "Meio cento de salgadinhos (misto)", "Mesmos sabores do cento", 31, null, { img: IMG + "salgadinhos.jpg" });
  add("festa", "35 salgadinhos", "", 24, null);
  add("festa", "25 salgadinhos", "", 18, null);
  add("festa", "50 salgadinhos", "", 31, null);
  add("festa", "20 mini churros", "Mistos ou iguais", 19, null);
  add("festa", "30 mini churros", "Mistos ou iguais", 24, null);

  /* Sucos (preços não apareciam nos prints). Escolha: com água ou com leite. */
  const juiceOpt = [{ title: "Preparo", required: true, choices: [{ name: "Com água", extra: 0 }, { name: "Com leite", extra: 0 }] }];
  ["Laranja", "Abacaxi", "Abacaxi e hortelã", "Maracujá", "Uva", "Acerola", "Manga", "Limão suíço"].forEach((s) =>
    add("sucos", "Suco de " + s.toLowerCase(), "", null, null, { img: IMG + "sucos.jpg", options: JSON.parse(JSON.stringify(juiceOpt)) }));

  add("cafes", "Achocolatado 300 ml", "", null, null);
  add("cafes", "Cappuccino", "", null, null);
  add("cafes", "Cappuccino 300 ml", "", null, null);

  window.LM_SEED = {
    tenants: [{
      slug: "me-gusta",
      name: "Me Gusta",
      tagline: "Feito com amor",
      logo: IMG + "avatar.jpg",
      cover: IMG + "cover.jpg",
      theme: { primary: "#00614a", accent: "#f7a21b" },
      info: {
        address: "",
        whatsapp: "",
        hours: "",
        payments: ["Pix", "Dinheiro", "Cartão de débito", "Cartão de crédito"]
      },
      settings: { open: true, pickupEnabled: true, deliveryEnabled: true, deliveryFee: 0, minOrder: 0, avgPrepMinutes: 25 },
      categories,
      active: true,
      pin: "1234",
      billing: { plan: "Demonstração", price: 0, since: new Date().toISOString().slice(0, 10), notes: "Primeira loja do Lua Menu" }
    }],
    products: { "me-gusta": P }
  };

  /* Modelo para lojas novas criadas pela agência */
  window.LM_DEFAULT_CATEGORIES = [
    { id: "lanches", name: "Lanches" },
    { id: "porcoes", name: "Porções" },
    { id: "bebidas", name: "Bebidas" },
    { id: "sobremesas", name: "Sobremesas" }
  ];
})();
