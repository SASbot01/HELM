-- 045 — team.theme_preference: per-user dark/light preference.
-- Column adds non-destructively; default 'light' mirrors the new global default
-- (post feat/global-light-theme refactor). Existing rows default to 'light'.
-- Frontend (ThemeContext) reads this column on mount and writes via
-- POST /api/profile/update so we keep the same auth path used for name/email.

alter table public.team
  add column if not exists theme_preference text not null default 'light'
    check (theme_preference in ('light', 'dark'));

comment on column public.team.theme_preference is
  'Per-member UI theme preference. Drives the html.theme-{light|dark} class injected by ThemeContext at runtime.';
