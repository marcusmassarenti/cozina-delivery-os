-- Contador de tentativas do backfill do histórico.
--
-- POR QUE EXISTE: o carimbo `historico_backfill_at` é o que tira a loja da
-- fila, e escolher QUANDO gravá-lo era um dilema entre dois defeitos:
--
--   `some` (algum mês respondeu)  → carimbava com buraco. O Baião de Dois saiu
--                                    da fila sem maio e julho, e como já estava
--                                    carimbado, nunca mais seriam tentados.
--   `every` (todos responderam)   → nunca carimbava loja nova. A Koike Bistrô
--                                    abriu em junho, então janeiro a maio não
--                                    respondem — e ela foi reprocessada 4 vezes
--                                    seguidas (19:04, 19:10, 19:15, 19:20 de
--                                    14/08/26), 160s e chamadas de API por
--                                    rodada, travando a cabeça da fila.
--
-- O contador desfaz o dilema: exige que todos os meses respondam, MAS desiste
-- depois de N tentativas. Falha transitória ganha várias chances; mês que nunca
-- vai existir para de segurar a fila.
alter table public.unit_platforms
  add column if not exists historico_tentativas integer not null default 0;

comment on column public.unit_platforms.historico_tentativas is
  'Quantas vezes o backfill do histórico já tentou esta loja. Existe para a fila não travar em loja cujos meses antigos nunca respondem (ela não existia ainda): depois de N tentativas o carimbo é dado mesmo incompleto.';
