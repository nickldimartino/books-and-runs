-- Books & Runs — content filter: "you are a f u c k" evasion (live test
-- 2026-09-25). content_words() merges runs of 3+ single-letter words into
-- one ("f u c k" -> "fuck"), but a real one-letter word glued onto the front
-- of the run ("a f u c k" -> "afuck") hid it from the stem/word match. A run
-- that starts with "a" or "i" and has 4+ letters now ALSO contributes the run
-- without that first letter. Mirrors mergeSpelledOut() in
-- src/safety/contentFilter.ts (agreement is checked by
-- src/safety/contentFilter.sql.test.ts). Initials ("J. R. R.") and short runs
-- are unaffected. Only content_words() changes; nothing to backfill.

create or replace function public.content_words(folded text)
returns text[]
language plpgsql
immutable
as $$
declare
  out_ text[] := '{}';
  buf text := '';
  n int := 0;
  w text;
begin
  for w in select x from regexp_split_to_table(folded, '[^[:alnum:]]+') x where x <> '' loop
    if w ~ '^[a-z]$' then
      buf := buf || w;
      n := n + 1;
    else
      if n >= 3 then
        out_ := out_ || buf;
        if n >= 4 and left(buf, 1) in ('a', 'i') then out_ := out_ || substr(buf, 2); end if;
      elsif n > 0 then out_ := out_ || regexp_split_to_array(buf, '');
      end if;
      buf := '';
      n := 0;
      out_ := out_ || w;
    end if;
  end loop;
  if n >= 3 then
    out_ := out_ || buf;
    if n >= 4 and left(buf, 1) in ('a', 'i') then out_ := out_ || substr(buf, 2); end if;
  elsif n > 0 then out_ := out_ || regexp_split_to_array(buf, '');
  end if;
  return out_;
end;
$$;

revoke execute on function public.content_words(text) from anon, public, authenticated;

do $$ begin
  insert into public.schema_migrations (version) values ('0083_content_words_leading_article')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
