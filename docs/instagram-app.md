# Conectar Instagram a HELM

La sección **Contenido** trae de Instagram cada publicación con sus visitas, su
alcance y sus guardados, y estudia qué tienen en común las que funcionan.

Dos requisitos que no se pueden saltar:

- La cuenta tiene que ser **profesional** (empresa o creador). Una cuenta
  personal no da métricas: ni por la API ni en la propia app.
- Las métricas son de la cuenta conectada. No hay forma legítima de leer las de
  un perfil ajeno, y lo que prometa cualquier herramienta que diga lo contrario
  es una estimación inventada.

Hay **dos formas** de conectarla. La primera es la buena; la segunda existe
para poder trabajar mientras Meta revisa la aplicación, que tarda semanas.

---

## Opción A — la app de Meta (botón "Conectar con Instagram")

Se hace **una sola vez** para todo HELM, no una por cliente.

### 1. Crear la app

1. Entra en [developers.facebook.com](https://developers.facebook.com) → *Mis
   aplicaciones* → **Crear aplicación**.
2. Caso de uso: **Otro** → tipo **Empresa**.
3. En el panel de la app, añade el producto **Instagram** → *Configurar*.

### 2. Configurar el inicio de sesión

En **Instagram → Configuración de la API con inicio de sesión de Instagram**:

1. Copia el **ID de la aplicación de Instagram** y la **clave secreta**. Son los
   valores de `IG_APP_ID` e `IG_APP_SECRET`.
2. En *URI de redireccionamiento de OAuth válidos*, añade exactamente:

   ```
   https://TU-DOMINIO/api/instagram/callback
   ```

   En HELM el dominio es `https://helm.s4sf.net`, así que la línea entera es
   `https://helm.s4sf.net/api/instagram/callback`.

   Sin `?` ni parámetros: el campo de Meta los rechaza (Google sí los admite, y
   por eso su callback tiene otra forma). Tiene que coincidir carácter a
   carácter con `HELM_PUBLIC_URL` + esa ruta: una barra de más y Meta responde
   `redirect_uri mismatch`.

### 3. Permisos

HELM pide dos, y ninguno más:

| Permiso | Para qué |
|---|---|
| `instagram_business_basic` | leer el perfil y la lista de publicaciones |
| `instagram_business_manage_insights` | leer las métricas de cada publicación |

No se pide publicar, ni leer mensajes: esta sección solo mira.

Mientras la app esté en **modo desarrollo**, solo pueden conectarse las cuentas
que hayas añadido como *probadores* (Instagram → *Probadores de Instagram*).
Para abrirla a clientes hay que pasar la **revisión de la app**, con un vídeo
enseñando el flujo. Es lo que tarda semanas.

### 4. Variables de entorno

```
IG_APP_ID=...
IG_APP_SECRET=...
HELM_PUBLIC_URL=https://TU-DOMINIO
```

Con eso, en HELM → **Contenido** aparece el botón *Conectar con Instagram*.

---

## Opción B — pegar un token de larga duración

Sirve para probar la sección hoy, sin esperar a la revisión.

1. En el panel de Meta, **Instagram → Generador de tokens de acceso**, genera un
   token para la cuenta (o cámbialo a token de larga duración con
   `ig_exchange_token`).
2. En HELM → **Contenido**, pégalo en *…o pega un token de larga duración*.

HELM valida el token contra Instagram antes de guardarlo, lo guarda en
`user_integrations` (que el navegador no puede leer) y lo renueva solo cada 60
días mientras alguien entre en la sección de vez en cuando.

---

## Antes de usarla

Aplica la migración en Supabase:

```
migrations/helm_instagram.sql
```

Es donde se guardan las métricas. Sin ella, *Actualizar* avisa de que falta.

## Qué hace "Actualizar"

Trae las últimas 60 publicaciones y, de cada una, sus métricas. Son unas 60
llamadas a Meta, así que tarda unos segundos y no se hace sola al abrir la
pantalla: la cuota de la API es por hora, y con dos personas mirando el panel se
agotaría antes de comer. La fecha de la última sincronización se ve siempre
arriba, junto al nombre de la cuenta.
