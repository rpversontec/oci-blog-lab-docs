---
title: "Asistente RAG"
description: "Configura y despliega el asistente de chat con Oracle 23ai Vector Search, OpenAI embeddings y Groq."
---

Esta guía continúa el **Día 6** de la Guía de Desarrollo.

Aquí no se repite la implementación del asistente. Asume que el código del RAG ya está en el proyecto y se enfoca en lo operativo:

- configurar las API keys
- probar el asistente en local
- desplegarlo en OCI / OKE
- verificar el índice vectorial
- resolver errores comunes

Si todavía no implementaste el código del asistente, vuelve primero a:

> 📄 Guía de Desarrollo → Día 6 — Asistente de Chat con RAG e Inteligencia Artificial

**Resumen rápido del flujo**

```text
Pregunta del usuario
  → embedding con OpenAI text-embedding-3-small
  → búsqueda vectorial en Oracle 23ai
  → respuesta con Groq / Llama
  → fuentes mostradas en el ChatWidget
```

> ⚠️ **Requisito de base de datos: Oracle 23ai**
>
> El tipo `VECTOR` y la función `VECTOR_DISTANCE()` son exclusivos de **Oracle Database 23ai**.
> No existen en Oracle 19c ni 21c. El Terraform del proyecto ya tiene `db_version = "23ai"`.
>
> Si ya tienes un ATP creado con una versión anterior, OCI **no permite upgrade in-place**
> en el Free Tier. Debes destruir el ATP y crear uno nuevo:
> ```bash
> cd terraform
> terraform destroy -target oci_database_autonomous_database.blog_atp -auto-approve
> terraform apply  -target oci_database_autonomous_database.blog_atp -auto-approve
> # Luego re-descarga el Wallet y recrea el Secret de Kubernetes
> ```
> Los datos se pierden (posts, comentarios), pero el esquema lo recrea Spring Boot al arrancar.

---

## Parte 1 — Obtener las API keys

Necesitas dos claves. Ambas tienen tier gratuito suficiente para un lab.

### 1.1 Groq (LLM)

1. Ve a [console.groq.com](https://console.groq.com) → crea una cuenta gratuita
2. En el menú lateral: **API Keys** → **Create API Key**
3. Copia la clave. Tiene el formato `<TU_GROQ_API_KEY>`

> **Límites del tier gratuito de Groq:** 30 requests/minuto, 6 000 tokens/minuto.
> Para un lab de 30 estudiantes es suficiente si no hacen preguntas simultáneas.

### 1.2 OpenAI (embeddings)

1. Ve a [platform.openai.com](https://platform.openai.com) → crea una cuenta
2. **API keys** → **Create new secret key**
3. Copia la clave. Tiene el formato `<TU_OPENAI_API_KEY>`
4. Carga al menos **$5** de crédito en **Billing** (el tier gratuito no sirve para embeddings)

> **Costo real del lab:** `text-embedding-3-small` cuesta $0.02/millón de tokens.
> Un post promedio de 500 palabras ≈ 700 tokens = $0.000014 por indexación.
> 50 posts × 30 estudiantes = $0.021 en total. Prácticamente gratis.

---

## Parte 2 — Despliegue local (Docker Compose)

### 2.1 Configurar las claves en el backend

Crea o edita el archivo de variables del backend:

> 📁 `backend/.env.local` *(no se commitea — está en .gitignore)*

```env
GROQ_API_KEY=<TU_GROQ_API_KEY>
OPENAI_API_KEY=<TU_OPENAI_API_KEY>
# Opcional: cambiar el modelo de Groq
# GROQ_MODEL=llama-3.3-70b-versatile
```

Verifica que el `application.yml` ya tiene la sección `ai:` (debería estar en el repo):

```bash
grep -A8 "^ai:" backend/src/main/resources/application.yml
```

Deberías ver:
```yaml
ai:
  groq:
    api-key: ${GROQ_API_KEY:}
    model: ${GROQ_MODEL:llama-3.1-8b-instant}
  embedding:
    openai:
      api-key: ${OPENAI_API_KEY:}
    dimensions: 1536
```

Si no aparece, agrégalo al final del `application.yml` raíz (fuera de cualquier perfil `---`).

---

### 2.2 Levantar la infraestructura

```bash
# Desde la raíz del proyecto
docker compose up -d

# Verifica que Oracle está listo (tarda ~2 minutos la primera vez)
docker compose logs oracle-db --follow | grep -m1 "DATABASE IS READY"
```

---

### 2.3 Arrancar el backend con las claves

```bash
cd backend

# Exporta las claves como variables de entorno para esta sesión
export GROQ_API_KEY=<TU_GROQ_API_KEY>
export OPENAI_API_KEY=<TU_OPENAI_API_KEY>
export SPRING_PROFILES_ACTIVE=local-dev

mvn spring-boot:run
```

Al arrancar verás en el log:

```
INFO  VectorStoreService : Tabla post_embeddings lista (Oracle 23ai VECTOR)
```

Si en cambio ves:

```
WARN  VectorStoreService : No se pudo crear la tabla post_embeddings
```

→ La versión de Oracle en Docker no es 23c. Verifica que usas `gvenzl/oracle-free:23.5-slim-faststart`.

---

### 2.4 Arrancar el frontend

```bash
cd frontend
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173). Deberías ver el **botón verde 💬** en la esquina inferior derecha.

---

### 2.5 Crear contenido para indexar

El asistente necesita posts publicados para responder preguntas. Crea algunos:

**Opción A — desde la UI:** inicia sesión como admin en Keycloak → "Nuevo post" → rellena y publica.
Cada post publicado se indexa automáticamente en segundo plano (verás en el log del backend):
```
INFO  RagService : Post indexado exitosamente: id=1, título='...'
```

**Opción B — con curl** (más rápido para probar):

```bash
# 1. Obtén un token de Keycloak
TOKEN=$(curl -s -X POST \
  'http://localhost:8180/realms/oci-blog/protocol/openid-connect/token' \
  -d 'grant_type=password&client_id=oci-blog-app&username=admin-user&password=<TU_PASSWORD_ADMIN>' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 2. Crea un post publicado
curl -s -X POST http://localhost:8080/api/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Introducción a Spring Boot",
    "summary": "Aprende a construir APIs REST con Spring Boot 3 y Java 17",
    "content": "Spring Boot es un framework de Java que facilita la creación de aplicaciones web...",
    "published": true
  }' | python3 -m json.tool
```

---

### 2.6 Verificar el índice vectorial

```bash
# Cuántos posts están indexados
curl -s http://localhost:8080/api/admin/rag/status \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool

# Esperado:
# { "indexedPosts": 1, "totalPublishedPosts": 1 }
```

Si `indexedPosts` es 0 pero `totalPublishedPosts` > 0, activa la reindexación:

```bash
curl -s -X POST http://localhost:8080/api/admin/rag/reindex \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool
# { "message": "Reindexación iniciada" }
```

---

### 2.7 Probar el asistente

**Desde la UI:** haz clic en el botón verde 💬 y escribe una pregunta.

**Desde curl (para depurar):**

```bash
curl -s -X POST http://localhost:8080/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "¿Qué artículos hay sobre Spring Boot?"}' \
  | python3 -m json.tool
```

Respuesta esperada:

```json
{
  "answer": "En el blog hay un artículo sobre Spring Boot titulado \"Introducción a Spring Boot\"...",
  "sources": [
    { "id": 1, "title": "Introducción a Spring Boot", "authorName": "Admin" }
  ]
}
```

**Prueba con historial multi-turno** (campo `history` opcional):

```bash
# Segunda pregunta que referencia la anterior
curl -s -X POST http://localhost:8080/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "question": "¿Y cuándo fue publicado ese artículo?",
    "history": [
      { "role": "user",      "content": "¿Qué artículos hay sobre Spring Boot?" },
      { "role": "assistant", "content": "En el blog hay un artículo sobre Spring Boot titulado..." }
    ]
  }' \
  | python3 -m json.tool
```

> El campo `history` es opcional. Sin él, cada pregunta es independiente. Con él, el LLM puede responder preguntas de seguimiento como "¿y el segundo?" o "explícame más". El frontend guarda el historial en `localStorage` y lo envía automáticamente.

**Si recibes HTTP 503:**

```json
{ "error": "El asistente no está configurado. Embeddings no configurados — añade OPENAI_API_KEY" }
```

→ El backend no tiene las variables de entorno. Revisa el paso 2.3.

---

### 2.8 Prueba con Docker Compose completo (perfil `full`)

Para probar con backend y frontend ambos en contenedor:

```bash
# Recompila con las claves como build-args del backend
GROQ_API_KEY=<TU_GROQ_API_KEY> \
OPENAI_API_KEY=<TU_OPENAI_API_KEY> \
docker compose --profile full up -d --build
```

O agrégalas al `docker-compose.yml` en la sección `backend.environment`:

```yaml
backend:
  profiles: ["full"]
  environment:
    SPRING_PROFILES_ACTIVE: compose
    CORS_ALLOWED_ORIGINS: "http://localhost:3000,http://localhost:5173"
    GROQ_API_KEY: "<TU_GROQ_API_KEY>"       # ← añadir
    OPENAI_API_KEY: "<TU_OPENAI_API_KEY>"      # ← añadir
```

> ⚠️ Si guardas las claves en `docker-compose.yml`, **no lo commitees**. Usa variables del entorno
> del host o un archivo `.env` en la raíz (que ya está en `.gitignore`).

---

## Parte 3 — Despliegue en OCI (Kubernetes / OKE)

### 3.1 Crear el Secret de Kubernetes con las claves

```bash
kubectl create secret generic ai-keys \
  --namespace oci-blog \
  --from-literal=GROQ_API_KEY=<TU_GROQ_API_KEY> \
  --from-literal=OPENAI_API_KEY=<TU_OPENAI_API_KEY>

# Verifica que se creó
kubectl get secret ai-keys -n oci-blog
```

---

### 3.2 Montar el Secret en el Deployment del backend

Edita `k8s/backend/deployment.yaml`. En la sección `env:` del contenedor,
añade estas dos entradas **junto a las otras variables sensibles**:

```yaml
          # ── Claves de la API del asistente RAG ──────────────────────
          - name: GROQ_API_KEY
            valueFrom:
              secretKeyRef:
                name: ai-keys
                key: GROQ_API_KEY
          - name: OPENAI_API_KEY
            valueFrom:
              secretKeyRef:
                name: ai-keys
                key: OPENAI_API_KEY
```

El archivo completo de la sección `env:` quedaría así (fragmento):

```yaml
          env:
            - name: ORACLE_ATP_USER
              valueFrom:
                secretKeyRef:
                  name: blog-backend-secret
                  key: ORACLE_ATP_USER
            - name: ORACLE_ATP_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: blog-backend-secret
                  key: ORACLE_ATP_PASSWORD
            - name: ORACLE_TNS_ALIAS
              valueFrom:
                secretKeyRef:
                  name: blog-backend-secret
                  key: ORACLE_TNS_ALIAS
            - name: ORACLE_WALLET_PATH
              value: /app/wallet
            - name: IDCS_ADMIN_CLIENT_ID
              valueFrom:
                secretKeyRef:
                  name: idcs-admin-secret
                  key: IDCS_ADMIN_CLIENT_ID
                  optional: true
            - name: IDCS_ADMIN_CLIENT_SECRET
              valueFrom:
                secretKeyRef:
                  name: idcs-admin-secret
                  key: IDCS_ADMIN_CLIENT_SECRET
                  optional: true
            # ── RAG: claves del asistente ──────────────────────────────
            - name: GROQ_API_KEY
              valueFrom:
                secretKeyRef:
                  name: ai-keys
                  key: GROQ_API_KEY
            - name: OPENAI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: ai-keys
                  key: OPENAI_API_KEY
```

---

### 3.3 Reconstruir y subir las imágenes Docker

El código del asistente ya está en el repositorio. Solo necesitas reconstruir las imágenes.

**Exporta las variables OCIR** (obtén los valores de los outputs de Terraform):

```bash
export REGION=mx-queretaro-1           # tu región OCI
export TENANCY_NAMESPACE=<TU_NAMESPACE_OCIR>  # tu namespace (terraform output tenancy_namespace)
export BACKEND_IMAGE="${REGION}.ocir.io/${TENANCY_NAMESPACE}/oci-blog/backend:latest"
export FRONTEND_IMAGE="${REGION}.ocir.io/${TENANCY_NAMESPACE}/oci-blog/frontend:latest"
export DOMAIN=$(kubectl get ingress -n oci-blog -o jsonpath='{.items[0].spec.rules[0].host}')
```

**Reconstruye el backend:**

```bash
cd backend
mvn clean package -DskipTests

docker buildx build \
  --platform linux/amd64 \
  -t $BACKEND_IMAGE \
  --push \
  .

cd ..
```

**Reconstruye el frontend** (el ChatWidget ya está en el código fuente):

```bash
cd frontend

docker buildx build \
  --platform linux/amd64 \
  --build-arg VITE_OCI_IAM_AUTHORITY="https://idcs-XXXXXXXX.identity.oraclecloud.com" \
  --build-arg VITE_OCI_IAM_CLIENT_ID="TU_CLIENT_ID" \
  --build-arg VITE_API_BASE_URL="https://${DOMAIN}/api" \
  --build-arg VITE_REDIRECT_URI="https://${DOMAIN}/callback" \
  --build-arg VITE_POST_LOGOUT_REDIRECT_URI="https://${DOMAIN}/" \
  --build-arg VITE_OAUTH_SCOPE="openid profile email groups" \
  -t $FRONTEND_IMAGE \
  --push \
  .

cd ..
```

> Usa los mismos valores de `VITE_*` que usaste en el despliegue original del blog.
> Si no los recuerdas, están en el `GUIA_DESPLIEGUE_ESTUDIANTES.md` → Paso 7.2.

---

### 3.4 Aplicar los cambios en Kubernetes

```bash
# 1. Aplica el deployment actualizado (con las nuevas variables de entorno y límite de memoria)
kubectl apply -f k8s/backend/deployment.yaml

# 2. Fuerza el rolling update para que los pods usen la imagen nueva
kubectl rollout restart deployment/blog-backend -n oci-blog
kubectl rollout restart deployment/blog-frontend -n oci-blog

# 3. Espera a que termine el rollout
kubectl rollout status deployment/blog-backend  -n oci-blog --timeout=180s
kubectl rollout status deployment/blog-frontend -n oci-blog --timeout=120s
```

> ⚠️ **Si ves `OOMKilled` en los pods del backend:**
> El RAG activa la generación de embeddings justo al arrancar, lo que crea un pico de
> memoria temporal. El `deployment.yaml` del repo ya tiene el límite en `1Gi`
> (suficiente para el pico de arranque). Si lo bajaste, restáuralo a `1Gi`.

---

### 3.5 Verificar que el backend arrancó correctamente

El backend realiza **dos operaciones automáticamente al arrancar**:

1. Crea la tabla `post_embeddings` con tipo `VECTOR(1536, FLOAT32)` si no existe
2. Indexa automáticamente los posts publicados que no tienen embedding todavía

Espera ~60 segundos y luego verifica los logs:

```bash
kubectl logs -n oci-blog -l app=blog-backend --tail=60 \
  | grep -E "VectorStore|Auto-reindex|Post indexado"
```

Deberías ver secuencialmente:

```
INFO VectorStoreService : Tabla post_embeddings lista (Oracle 23ai VECTOR)
INFO RagService         : Auto-reindex: N de N posts no están indexados — iniciando...
INFO RagService         : Post indexado exitosamente: id=1, título='...'
INFO RagService         : Post indexado exitosamente: id=2, título='...'
```

**No necesitas ejecutar el endpoint `/admin/rag/reindex` manualmente** — el auto-reindex
lo hace solo al arranque si detecta posts sin indexar.

---

### 3.6 Verificar el estado del índice

```bash
# Con token de admin del blog
curl -s https://${DOMAIN}/api/admin/rag/status \
  -H "Authorization: Bearer TU_ACCESS_TOKEN" \
  | python3 -m json.tool

# Deberías ver:
# { "indexedPosts": N, "totalPublishedPosts": N }
```

Si `indexedPosts < totalPublishedPosts` (por ejemplo, si algunos posts fallaron):

```bash
# Reindexar manualmente solo los que faltan
curl -s -X POST https://${DOMAIN}/api/admin/rag/reindex \
  -H "Authorization: Bearer TU_ACCESS_TOKEN" \
  | python3 -m json.tool

# Verificar estado (espera ~5 segundos por post)
sleep 10
curl -s https://${DOMAIN}/api/admin/rag/status \
  -H "Authorization: Bearer TU_ACCESS_TOKEN" \
  | python3 -m json.tool
```

Resultado esperado:

```json
{ "indexedPosts": 5, "totalPublishedPosts": 5 }
```

---

### 3.7 Probar el asistente en producción

Abre `https://<TU_DOMINIO>.nip.io` en el navegador. Deberías ver el botón verde 💬.

Prueba desde curl para verificar sin interfaz:

```bash
curl -s -X POST https://${DOMAIN}/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "¿Qué artículos hay en el blog?"}' \
  | python3 -m json.tool
```

---

## Parte 4 — Solución de problemas

### El widget 💬 no aparece en la UI

El ChatWidget está incluido en `App.tsx` — si el frontend se reconstruyó correctamente debería aparecer.

```bash
# Verifica que la imagen del frontend tiene el código nuevo
kubectl exec -n oci-blog deployment/blog-frontend -- \
  grep -r "Asistente del Blog" /usr/share/nginx/html/assets/ 2>/dev/null | head -1
# Si no devuelve nada → la imagen no se reconstruyó. Repite el paso 3.3 del frontend.
```

---

### HTTP 503 — "El asistente no está configurado"

El pod no tiene las variables de entorno. Verifica:

```bash
kubectl exec -n oci-blog deployment/blog-backend -- \
  env | grep -E "GROQ|OPENAI"
```

Si no aparecen → el Secret no se montó. Verifica:

```bash
kubectl get secret ai-keys -n oci-blog
kubectl describe deployment blog-backend -n oci-blog | grep -A5 "Environment"
```

Asegúrate de que el deployment tiene el `secretKeyRef` añadido (paso 3.2) y de que hiciste `kubectl apply`.

---

### HTTP 500 — "Error al procesar tu pregunta"

Mira los logs del backend para el error exacto:

```bash
kubectl logs -n oci-blog -l app=blog-backend --tail=50 | grep -i "error\|groq\|openai"
```

| Error en el log | Causa | Solución |
|---|---|---|
| `OpenAI Embeddings API error: HTTP 401` | OPENAI_API_KEY inválida o sin crédito | Verifica la clave y el saldo en platform.openai.com |
| `Groq Chat API error: HTTP 401` | GROQ_API_KEY inválida | Regenera la clave en console.groq.com |
| `Groq Chat API error: HTTP 429` | Límite de rate de Groq superado | Espera 1 minuto o reduce el número de solicitudes simultáneas |
| `OOMKilled` en pods del backend al arrancar | El pico de memoria durante el auto-reindex supera el límite del pod | El `deployment.yaml` del repo tiene el límite en `1Gi`. Si lo modificaste, restáuralo. Con RAG activo, `768Mi` no es suficiente para el pico de arranque. |
| `No se pudo crear la tabla post_embeddings` | La DB no es Oracle 23ai — el tipo `VECTOR` no existe en 19c/21c | Destruye el ATP y recréalo: `terraform destroy -target oci_database_autonomous_database.blog_atp` + `terraform apply`. El Terraform del repo ya incluye `db_version = "23ai"`. |

---

### La respuesta es genérica o dice "No encontré información"

Causa: los posts no están indexados aún.

```bash
# Verifica el estado del índice
curl -s https://${DOMAIN}/api/admin/rag/status \
  -H "Authorization: Bearer TU_TOKEN" | python3 -m json.tool
```

Si `indexedPosts` es 0 → ejecuta el reindex (paso 3.6).

Si `indexedPosts` > 0 pero el asistente no encuentra nada → la pregunta puede no tener
coincidencia semántica suficiente. Intenta preguntar con palabras clave que estén en los títulos
o resúmenes de los posts.

---

### El índice no crece después de publicar nuevos posts

El indexado automático es asíncrono. Verifica los logs:

```bash
kubectl logs -n oci-blog -l app=blog-backend --tail=20 | grep "indexado\|indexPost"
```

Si ves errores de OpenAI → revisa la clave y el saldo.

Si no ves nada → el post puede haberse guardado como borrador (`published: false`).
Solo los posts con `published: true` se indexan.

---

## Resumen de variables de entorno

| Variable | Dónde se usa | Valor ejemplo |
|---|---|---|
| `GROQ_API_KEY` | Backend — LLM para generar respuestas | `<TU_GROQ_API_KEY>...` |
| `OPENAI_API_KEY` | Backend — generar embeddings vectoriales | `<TU_OPENAI_API_KEY>...` |
| `GROQ_MODEL` | Backend — modelo de Groq (opcional) | `llama-3.1-8b-instant` |

## Resumen de endpoints RAG

| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/chat` | Público | Pregunta al asistente |
| `GET` | `/api/admin/rag/status` | Admin | Posts indexados vs total |
| `POST` | `/api/admin/rag/reindex` | Admin | Reindexar todos los posts publicados |
