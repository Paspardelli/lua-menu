-- ============================================================
-- Lua Menu - esquema do banco (Supabase / PostgreSQL), multi-lojas
-- Cole este arquivo inteiro em: Supabase > SQL Editor > Run
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Tabelas ----------
create table if not exists tenants (
  slug       text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  name       text not null,
  tagline    text default '',
  logo       text default '',
  cover      text default '',
  theme      jsonb default '{}',
  info       jsonb default '{}',
  settings   jsonb default '{}',
  categories jsonb default '[]',
  active     boolean default true,
  created_at timestamptz default now()
);

-- dados comerciais: visíveis só para a agência
create table if not exists tenant_billing (
  slug  text primary key references tenants(slug) on delete cascade,
  plan  text,
  price numeric(10,2) default 0,
  since text,
  notes text
);

create table if not exists agency_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists tenant_members (
  user_id uuid references auth.users(id) on delete cascade,
  slug    text references tenants(slug) on delete cascade,
  primary key (user_id, slug)
);

create table if not exists products (
  tenant      text references tenants(slug) on delete cascade,
  id          text,
  category    text not null,
  name        text not null,
  description text default '',
  price       numeric(10,2),             -- null = sem preço (não pode ser pedido)
  stock       integer,                   -- null = estoque não controlado
  low_at      integer default 5,         -- alerta de estoque baixo
  active      boolean default true,
  img         text default '',
  tag         text default '',
  options     jsonb default '[]',
  sort        integer default 0,
  primary key (tenant, id)
);

create table if not exists orders (
  id         uuid primary key default gen_random_uuid(),
  tenant     text not null references tenants(slug) on delete cascade,
  code       text not null,
  created_at timestamptz not null default now(),
  status     text not null default 'novo'
             check (status in ('novo','preparando','pronto','entregue','cancelado')),
  type       text not null check (type in ('retirada','entrega')),
  customer   jsonb not null,
  payment    text,
  note       text default '',
  items      jsonb not null,
  subtotal   numeric(10,2) not null,
  fee        numeric(10,2) not null default 0,
  total      numeric(10,2) not null,
  unique (tenant, code)
);
create index if not exists orders_tenant_created on orders (tenant, created_at desc);

-- ---------- Funções de acesso ----------
create or replace function is_agency() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from agency_admins where user_id = auth.uid());
$$;

create or replace function is_member(s text) returns boolean
language sql security definer set search_path = public stable as $$
  select is_agency() or exists (select 1 from tenant_members where user_id = auth.uid() and slug = s);
$$;

create or replace function my_role() returns jsonb
language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'agency', is_agency(),
    'slugs', coalesce((select jsonb_agg(slug) from tenant_members where user_id = auth.uid()), '[]'::jsonb)
  );
$$;

-- Só a agência pode suspender/reativar uma loja
create or replace function guard_tenant_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.active is distinct from old.active and not is_agency() then
    raise exception 'Somente a agência pode suspender ou reativar a loja.';
  end if;
  if new.slug <> old.slug then raise exception 'O endereço da loja não pode ser alterado.'; end if;
  return new;
end $$;
drop trigger if exists tenants_guard on tenants;
create trigger tenants_guard before update on tenants for each row execute function guard_tenant_update();

-- ---------- Segurança (RLS) ----------
alter table tenants        enable row level security;
alter table tenant_billing enable row level security;
alter table agency_admins  enable row level security;
alter table tenant_members enable row level security;
alter table products       enable row level security;
alter table orders         enable row level security;

drop policy if exists tenants_read    on tenants;
drop policy if exists tenants_insert  on tenants;
drop policy if exists tenants_update  on tenants;
drop policy if exists tenants_delete  on tenants;
drop policy if exists billing_agency  on tenant_billing;
drop policy if exists products_read   on products;
drop policy if exists products_write  on products;
drop policy if exists orders_read     on orders;
drop policy if exists orders_update   on orders;

-- Cardápio é público; só donos da loja e agência alteram.
create policy tenants_read   on tenants for select using (active or is_member(slug));
create policy tenants_insert on tenants for insert to authenticated with check (is_agency());
create policy tenants_update on tenants for update to authenticated using (is_member(slug)) with check (is_member(slug));
create policy tenants_delete on tenants for delete to authenticated using (is_agency());
create policy billing_agency on tenant_billing for all to authenticated using (is_agency()) with check (is_agency());
create policy products_read  on products for select using (true);
create policy products_write on products for all to authenticated using (is_member(tenant)) with check (is_member(tenant));
-- Pedidos: o cliente NÃO lê a tabela; cria e consulta por funções. Só a loja lê tudo.
create policy orders_read    on orders for select to authenticated using (is_member(tenant));
create policy orders_update  on orders for update to authenticated using (is_member(tenant)) with check (is_member(tenant));
-- (agency_admins e tenant_members não têm policy: ninguém lê direto pela API)

-- ---------- Criar pedido: valida preço, opções e estoque NO SERVIDOR ----------
create or replace function create_order(p_slug text, payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t tenants%rowtype;
  it jsonb; grp jsonb; ch jsonb; sel jsonb;
  prod products%rowtype;
  qty int; n_sel int;
  v_unit numeric; v_sub numeric := 0; v_fee numeric := 0;
  v_items jsonb := '[]'::jsonb; v_labels jsonb;
  v_code text; v_id uuid;
  v_type text := payload->>'type';
  abc text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_min numeric;
begin
  select * into t from tenants where slug = p_slug and active;
  if not found then raise exception 'ERRO: Esta loja está indisponível.'; end if;
  if coalesce((t.settings->>'open')::boolean, true) = false then raise exception 'ERRO: A loja está fechada no momento.'; end if;
  if v_type not in ('retirada','entrega') then raise exception 'ERRO: Tipo de pedido inválido.'; end if;
  if v_type = 'retirada' and not coalesce((t.settings->>'pickupEnabled')::boolean, true) then raise exception 'ERRO: Retirada indisponível.'; end if;
  if v_type = 'entrega'  and not coalesce((t.settings->>'deliveryEnabled')::boolean, true) then raise exception 'ERRO: Entrega indisponível.'; end if;
  if length(coalesce(payload->'customer'->>'name','')) < 2 or length(coalesce(payload->'customer'->>'phone','')) < 10 then
    raise exception 'ERRO: Informe nome e telefone.';
  end if;
  if jsonb_array_length(coalesce(payload->'items','[]'::jsonb)) = 0 then raise exception 'ERRO: Pedido vazio.'; end if;

  for it in select * from jsonb_array_elements(payload->'items') loop
    qty := floor((it->>'qty')::numeric);
    if qty < 1 or qty > 200 then raise exception 'ERRO: Quantidade inválida.'; end if;
    select * into prod from products where tenant = p_slug and id = it->>'id' for update;
    if not found or not prod.active or prod.price is null then raise exception 'ERRO: Item indisponível.'; end if;

    v_unit := prod.price; v_labels := '[]'::jsonb;
    for grp in select * from jsonb_array_elements(coalesce(prod.options,'[]'::jsonb)) loop
      select count(*) into n_sel from jsonb_array_elements(coalesce(it->'opts','[]'::jsonb)) o where o->>'g' = grp->>'title';
      if coalesce((grp->>'required')::boolean,false) and n_sel = 0 then
        raise exception 'ERRO: Escolha uma opção em "%" (%).', grp->>'title', prod.name;
      end if;
      if n_sel > 1 then raise exception 'ERRO: Escolha apenas uma opção em "%".', grp->>'title'; end if;
      if n_sel = 1 then
        select o into sel from jsonb_array_elements(it->'opts') o where o->>'g' = grp->>'title' limit 1;
        select c into ch from jsonb_array_elements(grp->'choices') c where c->>'name' = sel->>'c' limit 1;
        if ch is null then raise exception 'ERRO: Opção inválida em %.', prod.name; end if;
        v_unit := v_unit + coalesce((ch->>'extra')::numeric, 0);
        v_labels := v_labels || to_jsonb((grp->>'title') || ': ' || (ch->>'name'));
      end if;
    end loop;

    if prod.stock is not null then
      if prod.stock < qty then
        raise exception 'ERRO: Estoque insuficiente de "%" (restam %).', prod.name, prod.stock;
      end if;
      update products set stock = stock - qty where tenant = p_slug and id = prod.id;
    end if;
    v_sub := v_sub + v_unit * qty;
    v_items := v_items || jsonb_build_object('id', prod.id, 'name', prod.name, 'price', v_unit, 'qty', qty,
                                             'opts', v_labels, 'obs', left(coalesce(it->>'obs',''), 200));
  end loop;

  v_min := coalesce((t.settings->>'minOrder')::numeric, 0);
  if v_sub < v_min then raise exception 'ERRO: Pedido mínimo de R$ %.', v_min; end if;
  if v_type = 'entrega' then v_fee := coalesce((t.settings->>'deliveryFee')::numeric, 0); end if;

  loop
    v_code := 'LM-' || (select string_agg(substr(abc, 1 + floor(random() * 32)::int, 1), '') from generate_series(1,5));
    exit when not exists (select 1 from orders where tenant = p_slug and code = v_code);
  end loop;

  insert into orders (tenant, code, type, customer, payment, note, items, subtotal, fee, total)
  values (p_slug, v_code, v_type, payload->'customer', payload->>'payment', left(coalesce(payload->>'note',''), 300),
          v_items, v_sub, v_fee, v_sub + v_fee)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'code', v_code);
end $$;

-- ---------- Acompanhamento pelo cliente (só com o código; mostra apenas o primeiro nome) ----------
create or replace function get_order(p_slug text, p_code text)
returns jsonb
language sql security definer set search_path = public as $$
  select to_jsonb(o) - 'customer' - 'tenant'
         || jsonb_build_object('customer', jsonb_build_object('name', split_part(o.customer->>'name', ' ', 1)))
  from orders o where o.tenant = p_slug and o.code = upper(p_code);
$$;

-- ---------- Mudar situação do pedido (devolve estoque se cancelar) ----------
create or replace function set_order_status(p_slug text, p_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; it jsonb;
begin
  if not is_member(p_slug) then raise exception 'Não autorizado'; end if;
  if p_status not in ('novo','preparando','pronto','entregue','cancelado') then raise exception 'Situação inválida'; end if;
  select * into o from orders where id = p_id and tenant = p_slug for update;
  if not found then return; end if;
  if p_status = 'cancelado' and o.status <> 'cancelado' then
    for it in select * from jsonb_array_elements(o.items) loop
      update products set stock = stock + (it->>'qty')::int where tenant = p_slug and id = it->>'id' and stock is not null;
    end loop;
  end if;
  update orders set status = p_status where id = p_id;
end $$;

revoke all on function create_order(text, jsonb) from public;
revoke all on function get_order(text, text) from public;
revoke all on function set_order_status(text, uuid, text) from public;
grant execute on function create_order(text, jsonb) to anon, authenticated;
grant execute on function get_order(text, text) to anon, authenticated;
grant execute on function set_order_status(text, uuid, text) to authenticated;
grant execute on function my_role() to authenticated;

-- ============================================================
-- DEPOIS DE RODAR, faça uma vez (troque os e-mails pelos usuários criados
-- em Authentication > Users):
--
--   -- conta da agência
--   insert into agency_admins (user_id) select id from auth.users where email = 'agencia@seudominio.com';
--
--   -- dono de uma lanchonete (depois de criar a loja pelo painel da agência)
--   insert into tenant_members (user_id, slug) select id, 'me-gusta' from auth.users where email = 'dono@lanchonete.com';
-- ============================================================
