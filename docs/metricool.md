# Metricool — métricas de anuncios (solo lectura)

HELM lee de Metricool el gasto, las impresiones, los clics, el CTR, el CPM, el
CPC y los leads o conversiones de **Meta, TikTok y Google Ads**, por día y por
anuncio (o por campaña, si Metricool no da el anuncio). Lo cruza con los leads
y lo cobrado del CRM, igual que el media buyer.

Metricool no gestiona campañas. Pausar un anuncio o cambiar un presupuesto
sigue haciéndose por la conexión directa con Meta (`api/_lib/meta-ads.js`),
cuando el dueño lo aprueba.

## Qué hay que poner

El token no se commitea. Hace falta las tres cosas:

1. **Token** (`X-Mc-Auth`). Metricool → ajustes de la cuenta → API. En el
   servidor, `METRICOOL_USER_TOKEN`. Si cada agencia tiene la suya, en la base:

   ```sql
   update agencias
   set metricool = '{"user_id":"1234567","user_token":"EL_TOKEN"}'::jsonb
   where slug = 'la-agencia';
   ```

2. **User id**. El número `userId` de la URL al abrir una marca en Metricool
   (`?blogId=…&userId=…`). `METRICOOL_USER_ID`, o `user_id` dentro de
   `agencias.metricool`, o `user_id` en la ficha del perfil.

3. **Qué marca es cada perfil** (`blogId` de esa URL). Una fila por perfil:

   ```sql
   insert into user_integrations (client_id, service, enabled, config)
   values ('<uuid del perfil>', 'metricool', true, '{"blog_id":"1234567"}'::jsonb);
   ```

   O, sin tocar la base, en el entorno (slug o id del perfil → blog id):

   ```
   METRICOOL_BRANDS={"detras-de-camra":"1234567","enformaconhugo":"7654321"}
   ```

   `enabled = false` en esa fila apaga Metricool para el perfil aunque el
   entorno tenga token. Para listar las marcas de la cuenta:
   `GET https://app.metricool.com/api/admin/simpleProfiles?userId=…` con la
   cabecera `X-Mc-Auth`.

La API está en los planes Advanced y Custom de Metricool. La base es
`https://app.metricool.com/api`.

## Qué hace HELM con eso

- Cada mañana el media buyer, si el perfil tiene marca, sincroniza y juzga el
  gasto con esas cifras. Si Metricool no está o no devuelve anuncios, sigue
  leyendo Meta como hasta ahora.
- El agente de anuncios usa ese gasto en el test de 5 días cuando el `utm` del
  anuncio coincide con el id del anuncio o de la campaña. Si no coincide, usa
  el gasto apuntado en el panel.
- El conector (`/api/mcp/<token>`) tiene la herramienta `anuncios`, solo
  lectura y acotada al perfil o a la agencia del enlace. Va por páginas
  (`cursor` / `hay_mas`); `actualizar=true` vuelve a pedir el rango a Metricool.

Los datos quedan en `helm_metricool_ads` (migración `119_metricool_ads.sql`).
Volver a sincronizar el mismo día no duplica filas.

El id que se guarda es el de la plataforma que devuelve Metricool (`adId`,
`providerCampaignId`). En Meta tiene que ser el mismo que `utm_content={{ad.id}}`
del anuncio, si no el cruce con el CRM no casa.
