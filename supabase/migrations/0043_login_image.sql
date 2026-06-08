--------------------------------------------------------------------
-- Personalização da TELA DE LOGIN (imagem do hero)
--
-- O login é a porta da plataforma (pré-autenticação), então é controlado
-- pelo dono (super-admin). Guardamos a imagem na holding dele; a tela de
-- login usa a primeira holding que tiver imagem definida. Sem imagem =
-- hero genérico.
--
-- Como rodar: Supabase Dashboard → SQL Editor → cole tudo → Run.
--------------------------------------------------------------------

alter table public.holdings
  add column if not exists login_image_url text;
