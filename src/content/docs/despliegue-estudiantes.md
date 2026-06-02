---
title: "Despliegue en OCI"
description: "Publica la aplicación en Oracle Cloud Infrastructure usando ATP, IAM, OKE y OCIR."
---

### OCI Blog App · Spring Boot + React + Oracle · Oracle Cloud Infrastructure

> Esta guía explica **qué hace cada paso y por qué**, no solo los comandos.
> Sigue el orden exacto. No saltes pasos.

---

## ¿Qué vamos a construir?

Un blog completo con autenticación OAuth2, dos roles de usuario, y despliegue en Kubernetes.
La guía tiene **dos partes**:

- **Parte 1** — Ves la app funcionando en tu máquina en minutos (Docker Compose).
- **Parte 2** — Despliegas esa misma app en Oracle Cloud Infrastructure (OCI).

El código es **idéntico** en ambos casos. Solo cambian las URLs de configuración.

```
ENTORNO LOCAL (Parte 1)          ENTORNO OCI (Parte 2)
─────────────────────────        ─────────────────────────────────
Keycloak :8180                   OCI IAM Identity Domain
  └─ mismo protocolo OIDC          └─ mismo protocolo OIDC

Oracle 23c Free :1521            Oracle ATP (Free Tier)
  └─ conexión TCP directa          └─ conexión con Wallet (TLS)

Backend :8080                    Backend → OKE (Kubernetes)
Frontend :5173                   Frontend → OKE + OCI Load Balancer
                                           └─ IP pública del Internet
```

---

## Prerrequisitos

Primero identifica tu sistema operativo y sigue la sección correspondiente.

```
¿Qué sistema tienes?
  Mac       → sección "Mac (Homebrew)"
  Linux     → sección "Linux (Ubuntu/Debian)"
  Windows   → sección "Windows" — lee COMPLETA antes de empezar
```

### Verifica qué ya tienes instalado

**Mac / Linux:**
```bash
docker --version        # necesitas 24+
java --version          # necesitas Java 17+
mvn --version           # necesitas Maven 3.8+
node --version          # necesitas Node 20+
npm --version           # viene con Node
```

**Windows (PowerShell):**
```powershell
docker --version
java --version
mvn --version
node --version
npm --version
```

---

### Mac (Homebrew)

```bash
# Instala Docker Desktop desde docker.com (requiere cuenta gratuita)
# O con brew:
brew install --cask docker

# Java 17 y Maven
brew install openjdk@17 maven

# Node.js 20
brew install node@20

# Enlaza Java 17 al PATH
echo 'export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Verifica
docker --version && java --version && mvn --version && node --version
```

---

### Linux (Ubuntu / Debian)

```bash
# Docker
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER   # permite usar docker sin sudo (cerrar sesión y volver a entrar)

# Java 17 + Maven
sudo apt-get install -y openjdk-17-jdk maven

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verifica
docker --version && java --version && mvn --version && node --version
```

---

### Windows

> **Advertencia importante**: Los scripts del proyecto (`.sh`) están escritos en Bash,
> que no existe nativamente en Windows. Tienes dos caminos:
>
> - **Camino A (recomendado)**: Instalar WSL2 y trabajar desde Linux dentro de Windows
> - **Camino B**: Instalar todas las herramientas en Windows y ejecutar los comandos equivalentes

---

#### Camino A — WSL2 (recomendado)

**Paso A1 — Instala WSL2**

Abre **PowerShell como Administrador**:
```powershell
wsl --install
```
Esto instala Ubuntu automáticamente. **Reinicia la PC cuando termine.**

Verifica:
```powershell
wsl --list --verbose
# Debe mostrar Ubuntu con STATE: Running
```

**Paso A2 — Herramientas dentro de Ubuntu (WSL)**

Abre la terminal de Ubuntu y ejecuta:
```bash
sudo apt-get update && sudo apt-get upgrade -y

# Java 17 + Maven
sudo apt-get install -y openjdk-17-jdk maven

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verifica
java --version && mvn --version && node --version
```

**Paso A3 — Docker Desktop con integración WSL2**

Descarga **Docker Desktop para Windows** desde docker.com.
Durante la instalación activa:
- "Use WSL 2 based engine" ✅
- Docker Desktop → Settings → Resources → WSL Integration → activa Ubuntu ✅

Desde Ubuntu verifica:
```bash
docker --version   # debe funcionar dentro de WSL
```

**Paso A4 — Clona el proyecto dentro de WSL**

> Importante: clona DENTRO del sistema de archivos de Ubuntu, no en `/mnt/c/...`.
> Los scripts son mucho más lentos si los archivos están en Windows.

```bash
cd ~
git clone https://github.com/TU_USUARIO/OCI_Blog
cd OCI_Blog
```

A partir de aquí, **todos los comandos los ejecutas en la terminal de Ubuntu (WSL)**.

---

#### Camino B — Instalación nativa en Windows

Abre **PowerShell como Administrador**:

```powershell
# Java 17 (Eclipse Temurin — distribución gratuita)
winget install EclipseAdoptium.Temurin.17.JDK

# Maven
winget install Apache.Maven

# Node.js 20
winget install OpenJS.NodeJS.LTS

# Docker Desktop
winget install Docker.DockerDesktop
```

Cierra y vuelve a abrir PowerShell. Verifica:
```powershell
java --version && mvn --version && node --version && docker --version
```

**Diferencia clave para el Camino B:**
Cuando la guía diga `./scripts/start-local.sh`, debes ejecutar los comandos
de Docker Compose directamente en PowerShell:

```powershell
# En lugar de ./scripts/start-local.sh:
docker compose up -d keycloak oracle-db
```

Y cuando la guía use `export VAR=valor`, usa `$env:VAR = "valor"` en PowerShell.

---

## Resumen: ¿qué camino elegir en Windows?

| Criterio | Camino A (WSL2) | Camino B (Nativo) |
|----------|----------------|-------------------|
| Compatibilidad con scripts `.sh` | ✅ Total | ⚠️ Manual |
| Facilidad de setup | Medio | Más pasos |
| Requiere reiniciar | Sí (una vez) | No |
| Recomendado para | La mayoría | Restricciones de TI |

**Si tienes dudas, elige el Camino A (WSL2).**

---

# PARTE 1 — Entorno Local con Docker Compose

> **¿Por qué primero en local?**
> OCI requiere configurar muchos servicios. Probar en local primero
> te permite entender qué hace la app antes de lidiar con la infraestructura cloud.
> El código es idéntico — solo cambian las URLs.

---

## Paso 0 — Clona el proyecto

```bash
git clone https://github.com/TU_USUARIO/OCI_Blog
cd OCI_Blog
```

---

## Paso 1 — Levanta la infraestructura local

Un solo comando levanta Keycloak (equivalente de OCI IAM) y Oracle 23c Free
(equivalente de Oracle ATP):

```bash
chmod +x scripts/start-local.sh
./scripts/start-local.sh
```

El script:
1. Verifica que Docker esté corriendo
2. Levanta Keycloak en el puerto 8180
3. Levanta Oracle DB en el puerto 1521
4. Espera a que Oracle esté listo (puede tardar ~90s la primera vez)
5. Espera a que Keycloak cargue el realm
6. Crea `frontend/.env.local` desde la plantilla
7. Muestra las instrucciones para los siguientes pasos

**Resultado esperado al terminar:**
```
✅ Oracle DB listo
✅ Keycloak listo
✅ frontend/.env.local creado

Infraestructura lista. Ahora arranca la aplicación:

TERMINAL 1 — Backend Spring Boot:
  cd backend
  SPRING_PROFILES_ACTIVE=local-dev mvn spring-boot:run

TERMINAL 2 — Frontend React/Vite:
  cd frontend
  npm run dev
```

> Si el script falla en el paso de Oracle, espera 2 minutos y vuelve a ejecutarlo.
> La primera vez que Oracle inicia puede tardar más de lo esperado.

---

## Paso 2 — Inicia el backend

En una nueva terminal:

```bash
cd backend
SPRING_PROFILES_ACTIVE=local-dev mvn spring-boot:run
```

> **¿Qué significa `local-dev`?**
> Es un perfil de Spring Boot. Con él:
> - Se conecta a Oracle en `localhost:1521` (el contenedor Docker, sin Wallet)
> - Valida JWT tokens contra Keycloak en `localhost:8180`
> - Hibernate actualiza el schema si hace falta pero **conserva los datos** (`ddl-auto: update`)
> - Se muestran las queries SQL en el log (`show-sql: true`)
>
> En producción (OCI), el perfil `k8s` usa Oracle ATP con Wallet y OCI IAM.
> El código es idéntico — solo cambia la configuración.
>
> ⚠️ **Si ves que se borran tus datos al reiniciar el backend**, verifica que el perfil activo
> sea `local-dev` y no otro. Con `ddl-auto: create` (perfil `local`) las tablas se recrean
> en cada arranque — todos los datos se pierden.

**Resultado esperado (busca estas líneas en el log):**
```
Started OciBlogApplication in 8.3 seconds
Tomcat started on port 8080
```

Verifica que el backend responde:
```bash
curl http://localhost:8080/actuator/health
# Resultado esperado: {"status":"UP","components":{"db":{"status":"UP"}}}
```

Si ves `"db":{"status":"UP"}`, el backend está conectado a Oracle. ✅

---

## Paso 3 — Inicia el frontend

En otra terminal nueva:

```bash
cd frontend
npm install    # solo la primera vez — instala las dependencias
npm run dev
```

**Resultado esperado:**
```
  VITE v5.x.x  ready in 234 ms

  ➜  Local:   http://localhost:5173/
```

Abre [http://localhost:5173](http://localhost:5173) en tu navegador.

---

## Paso 4 — Prueba el flujo completo

### 4.1 — Login como administrador

1. Haz click en **"Iniciar sesión"**
2. Serás redirigido a Keycloak (la pantalla de login)
3. Ingresa: usuario `admin.blog` / contraseña `Admin1234!`
4. Serás redirigido de vuelta a la app

**Resultado esperado:** Ves el botón **"Nuevo Post"** en la barra de navegación.

### 4.2 — Crea un post

1. Click en **"Nuevo Post"**
2. Escribe un título y contenido
3. Click en **"Publicar"**

**Resultado esperado:** El post aparece en la lista de la página principal.

### 4.3 — Cierra sesión y entra como lector

1. Click en tu nombre → **"Cerrar sesión"**
2. Haz click en **"Iniciar sesión"** de nuevo
3. Ingresa: usuario `reader.blog` / contraseña `Reader1234!`

**Resultado esperado:** No ves el botón "Nuevo Post" (el rol Lector no puede crear posts).

### 4.4 — Deja un comentario

1. Haz click en el post que creaste antes
2. Escribe un comentario en el campo de texto
3. Click en **"Comentar"**

**Resultado esperado:** El comentario aparece debajo del post.

---

## Paso 5 — Alternativa: todo en contenedores (Docker Compose completo)

Los pasos 1-4 corren backend y frontend directamente en tu máquina.
Esta alternativa los mete también en contenedores — es el paso más cercano
a cómo correrán en OCI antes de usar Kubernetes.

```bash
# Para todo lo que esté corriendo
docker compose down

# Levanta los 4 servicios en contenedores (primera vez tarda ~5 min por Maven)
docker compose --profile full up -d --build

# Monitorea el progreso
docker compose --profile full logs -f
```

| Servicio | URL | Nota |
|---------|-----|------|
| Frontend | http://localhost:**3000** | React/Nginx en contenedor |
| Backend | http://localhost:**8080** | Spring Boot en contenedor |
| Keycloak | http://localhost:**8180** | Sin cambios |
| Oracle | localhost:**1521** | Sin cambios |

> **¿Por qué el frontend está en el puerto 3000 y no en el 5173?**
> El 5173 es el puerto de `npm run dev` (desarrollo con hot-reload).
> En contenedor, Nginx sirve el build de producción en el 8080 interno,
> mapeado al 3000 externo para no chocar con el backend en el 8080.

> **Para ver cambios de código** necesitas reconstruir la imagen:
> ```bash
> docker compose --profile full up -d --build backend   # solo backend
> docker compose --profile full up -d --build frontend  # solo frontend
> ```

---

## Tabla de equivalencias Local ↔ OCI

| Componente | Local (Docker Compose) | OCI (Producción) |
|-----------|----------------------|-----------------|
| Identidad/Auth | Keycloak 25 en puerto 8180 | OCI IAM Identity Domain |
| Protocolo | OIDC/OAuth2 (mismo) | OIDC/OAuth2 (mismo) |
| Base de datos | Oracle 23c Free en puerto 1521 | Oracle ATP (Free Tier) |
| Conexión DB | TCP directa (sin cifrado) | Wallet (TLS mutuo) |
| Perfil Spring | `local-dev` (manual) · `compose` (contenedor) | `k8s` |
| Backend | `mvn spring-boot:run` · o contenedor Docker | Docker → OKE |
| Frontend | `npm run dev :5173` · o contenedor Docker :3000 | Docker/Nginx → OKE |
| Balanceador | No hay | OCI Load Balancer (IP pública) |
| **Código fuente** | **Idéntico** | **Idéntico** |

---

## Usuarios de prueba (Keycloak local)

| Usuario | Contraseña | Grupo | Rol en la app |
|---------|-----------|-------|--------------|
| `admin.blog` | `Admin1234!` | Blog_Admins | Crear/editar/borrar posts |
| `reader.blog` | `Reader1234!` | Blog_Readers | Leer posts y comentar |

---

## Gestión de usuarios en Keycloak

### Panel de administración

```
URL:        http://localhost:8180/admin
Usuario:    admin
Contraseña: admin
```

> Estas son las credenciales del **servidor de identidad** (Keycloak), no del blog.
> Una vez dentro, cambia al realm **`oci-blog`** (menú arriba a la izquierda).

### Auto-registro habilitado

El realm está configurado con auto-registro activado. Los nuevos usuarios pueden
registrarse desde la pantalla de login de Keycloak haciendo click en **"Register"**.

**Grupo por defecto:** todo usuario que se registra recibe automáticamente el grupo
`Blog_Readers` → puede leer posts y comentar, pero no crear posts.

Para promover un usuario a administrador del blog:
1. `http://localhost:8180/admin` → realm `oci-blog` → **Users**
2. Click en el usuario → pestaña **Groups**
3. **Leave** el grupo `Blog_Readers` → **Join** el grupo `Blog_Admins`

### Crear o modificar usuarios por API (sin reiniciar Keycloak)

Si necesitas aplicar cambios a un Keycloak que ya está corriendo sin reiniciarlo:

```bash
# Obtén el token de admin de Keycloak
TOKEN=$(curl -s -X POST http://localhost:8180/realms/master/protocol/openid-connect/token \
  -d "grant_type=password&client_id=admin-cli&username=admin&password=<TU_PASSWORD_KEYCLOAK>" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Habilitar/deshabilitar registro de usuarios
curl -X PUT http://localhost:8180/admin/realms/oci-blog \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"registrationAllowed": true}'

# Ver grupos por defecto configurados
curl http://localhost:8180/admin/realms/oci-blog/default-groups \
  -H "Authorization: Bearer $TOKEN"

# Ver todos los usuarios del realm
curl http://localhost:8180/admin/realms/oci-blog/users \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

> **¿Por qué usar la API y no editar solo el JSON?**
> El `realm-export.json` solo se importa cuando el realm no existe (primer arranque).
> Si Keycloak ya tiene el realm en memoria, cambiar el JSON no tiene efecto hasta que
> hagas `docker compose down -v` (borra el realm) y vuelvas a levantar los contenedores.
> La API aplica cambios en caliente, al instante.

---

## Comandos para el entorno local

```bash
# ── Modo manual (backend y frontend en tu máquina) ─────────────────────────
./scripts/start-local.sh                       # Levanta Keycloak + Oracle

cd backend && SPRING_PROFILES_ACTIVE=local-dev mvn spring-boot:run
cd frontend && npm run dev                     # http://localhost:5173

# ── Modo contenedores completo (los 4 servicios en Docker) ─────────────────
docker compose --profile full up -d --build    # Primera vez (~5 min)
docker compose --profile full up -d            # Siguientes veces (sin rebuild)
docker compose --profile full logs -f          # Ver logs de todos
# Frontend: http://localhost:3000

# ── Gestión de datos ────────────────────────────────────────────────────────
docker compose down                            # Detiene (conserva datos Oracle)
docker compose down -v                         # Detiene + borra datos Oracle
docker compose ps                              # Estado de los contenedores
docker compose logs -f keycloak
docker compose logs -f oracle-db
```

---

# PARTE 2 — Despliegue en Oracle Cloud Infrastructure (OCI)

> **¿Qué vamos a hacer?**
> Desplegar la misma app en la nube de Oracle usando:
> - **Oracle ATP** para la base de datos
> - **OCI IAM** para la autenticación
> - **OKE** (Oracle Kubernetes Engine) para correr la app
> - **OCIR** para guardar las imágenes Docker
> - **OCI Load Balancer** para la IP pública
>
> La infraestructura (red, base de datos, clúster Kubernetes) se crea con **Terraform**
> en un solo comando. Solo la configuración de OCI IAM es manual.

---

## Prerrequisitos adicionales para OCI

Instala estas herramientas adicionales:

**Mac:**
```bash
brew install oci-cli kubectl terraform
```

**Linux (Ubuntu):**
```bash
# OCI CLI
bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"
# Acepta todos los defaults con Enter

# kubectl
sudo apt-get install -y kubectl

# Terraform
sudo apt-get install -y gnupg software-properties-common
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt-get update && sudo apt-get install -y terraform
```

**Windows (Camino A/WSL2):**
```bash
# OCI CLI (dentro de Ubuntu WSL)
bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"

# kubectl y Terraform (igual que Linux Ubuntu arriba)
```

**Windows (Camino B — PowerShell):**
```powershell
winget install Oracle.OCICLi
winget install Kubernetes.kubectl
winget install Hashicorp.Terraform
```

Verifica:
```bash
oci --version
kubectl version --client
terraform --version   # necesitas 1.5+
```

---

## Paso 1 — Configura OCI CLI

OCI CLI es la herramienta que te permite hablar con Oracle Cloud desde tu terminal.
Terraform también la usa para autenticarse.

### 1.1 — Reúne tus datos de OCI

Antes de ejecutar cualquier comando, necesitas estos datos de la consola de OCI
([cloud.oracle.com](https://cloud.oracle.com)):

| Dato | Dónde encontrarlo |
|------|------------------|
| **User OCID** | Click en tu avatar (arriba derecha) → User Settings → copia el OCID |
| **Tenancy OCID** | Menú hamburguesa → Governance → Tenancy Details → copia el OCID |
| **Región** | Aparece arriba a la derecha (ej: `us-ashburn-1`, `mx-queretaro-1`) |

Los OCIDs se ven así: `ocid1.user.oc1..<TU_USER_OCID>`

### 1.2 — Ejecuta el asistente de configuración

```bash
oci setup config
```

Te pregunta paso a paso:
- `Enter a location for your config`: presiona Enter (default `~/.oci/config`)
- `Enter a user OCID`: pega tu User OCID
- `Enter a tenancy OCID`: pega tu Tenancy OCID
- `Enter a region`: escribe tu región (ej: `us-ashburn-1`)
- `Do you want to generate a new API signing RSA key pair?`: escribe `Y`
- El resto: presiona Enter para los defaults

### 1.3 — Registra tu API Key en OCI

El comando anterior generó una llave pública en `~/.oci/oci_api_key_public.pem`.

```bash
# Muestra tu llave pública (copia TODO el contenido)
cat ~/.oci/oci_api_key_public.pem
```

En la consola de OCI:
1. Click en tu avatar → **User Settings**
2. Menú izquierdo: **API Keys** → **Add API Key**
3. Selecciona **Paste a public key**
4. Pega el contenido copiado
5. Click **Add**

OCI te mostrará un `fingerprint` — verifica que coincide con el que está en `~/.oci/config`.

### 1.4 — Verifica que funciona

```bash
oci iam user get --user-id <TU_USER_OCID>
```

Si devuelve un JSON con tu información, ¡funciona! ✅

---

## Paso 2 — Crea un Compartment (opcional pero recomendado)

Un **compartment** es una carpeta lógica en OCI para organizar tus recursos.
Es buena práctica crear uno para el lab en lugar de usar el compartment raíz.

En la consola de OCI:
Menú → Identity & Security → Compartments → **Create Compartment**

Nombre sugerido: `oci-blog-lab`

```bash
# Guarda el OCID de tu compartment — lo usarás en terraform.tfvars
export COMPARTMENT_OCID="ocid1.compartment.oc1..<TU_COMPARTMENT_OCID>"
```

---

## Paso 3 — Crea la infraestructura con Terraform

> **¿Qué es Terraform?**
> Es una herramienta de Infrastructure as Code (IaC): describes los recursos que
> quieres en archivos `.tf` y Terraform los crea, modifica o elimina automáticamente.
> Ventaja: el estado de tu infraestructura queda documentado en código, es reproducible
> y puedes destruirla con un solo comando.

Terraform va a crear en paralelo:
- ✅ **VCN + subnets + gateway** — la red virtual donde vive todo
- ✅ **Oracle ATP** (Always Free) — la base de datos
- ✅ **OKE cluster + node pool VM.Standard.E4.Flex** — Kubernetes gestionado (x86_64, 2 OCPU, 8 GB RAM)
- ✅ **OCIR repositories** — donde guardarás las imágenes Docker

> **Nota sobre el nodo OKE:** Esta guía usa `VM.Standard.E4.Flex` (x86_64) con créditos de profesor,
> en lugar del A1.Flex ARM del Always Free. El nodo consume ~$0.03/hora con los créditos.
> La clave para que el nodo registre correctamente en Kubernetes es usar la imagen
> **OKE-optimizada** (`data.oci_containerengine_node_pool_option`) — que tiene kubelet,
> containerd y oracle-cloud-agent **pre-instalados** → el nodo queda Ready en ~3 minutos.
> Con una imagen genérica de Oracle Linux el bootstrap tarda >21 min y OKE cancela el nodo.

Lo que NO crea Terraform y harás manualmente:
- ⚙️ **OCI IAM Identity Domain** (Paso 4) — el provider de Terraform tiene soporte limitado para la configuración OIDC

### 3.1 — Configura las variables de Terraform

```bash
cd terraform

# Copia la plantilla de variables
cp terraform.tfvars.example terraform.tfvars
```

Abre `terraform/terraform.tfvars` y rellena con tus datos:

```hcl
tenancy_ocid     = "ocid1.tenancy.oc1..<TU_TENANCY_OCID>"   # de la consola OCI
user_ocid        = "ocid1.user.oc1..<TU_USER_OCID>"  # de User Settings
fingerprint      = "aa:bb:cc:dd:ee:ff:..."                   # de ~/.oci/config
private_key_path = "~/.oci/oci_api_key.pem"
region           = "us-ashburn-1"                            # tu región

compartment_ocid  = "ocid1.compartment.oc1..<TU_COMPARTMENT_OCID>"        # del paso anterior
db_admin_password = "<TU_PASSWORD_SEGURO>"                         # mínimo 12 chars
```

> ⚠️ **`terraform.tfvars` está en `.gitignore`** — contiene tus OCIDs y contraseñas.
> Nunca lo commitees.

### 3.2 — Inicializa Terraform

```bash
# Descarga el provider de OCI (solo necesario la primera vez)
terraform init
```

Resultado esperado:
```
Initializing provider plugins...
- Installing oracle/oci v6.x.x...
Terraform has been successfully initialized!
```

### 3.3 — Previsualiza qué va a crear

```bash
# Muestra los recursos que se crearán SIN crear nada todavía
terraform plan
```

Verás una lista de ~15 recursos con el prefijo `+` (a crear). Revísala para
entender qué hace Terraform antes de aplicarlo.

### 3.4 — Crea la infraestructura

```bash
terraform apply
```

Terraform te pide confirmación — escribe `yes`.

> ⏳ **Tiempo estimado: 10-15 minutos**
> - VCN y subnets: ~1 minuto
> - Oracle ATP: ~5 minutos
> - OKE cluster: ~3 minutos
> - Node pool (E4.Flex, imagen OKE-optimizada): **~3-5 minutos** ✅
> - OCIR repositories: ~1 minuto

Al terminar, Terraform muestra los **outputs** — cópialos, los necesitarás:

```
Outputs:

atp_ocid         = "ocid1.autonomousdatabase.oc1..<TU_ATP_OCID>"
oke_cluster_id   = "ocid1.cluster.oc1..<TU_CLUSTER_OCID>"
tenancy_namespace = "<TU_NAMESPACE_OCIR>"
backend_image_url = "us-ashburn-1.ocir.io/mitenancynamespace/oci-blog/backend:latest"
frontend_image_url = "us-ashburn-1.ocir.io/mitenancynamespace/oci-blog/frontend:latest"
ocir_host        = "us-ashburn-1.ocir.io"
cmd_kubeconfig   = "oci ce cluster create-kubeconfig --cluster-id ..."
cmd_download_wallet = "oci db autonomous-database generate-wallet ..."
```

```bash
# Vuelve al directorio raíz del proyecto
cd ..

# Guarda los valores en variables de entorno (ajusta con tus outputs reales)
export ATP_OCID=$(terraform -chdir=terraform output -raw atp_ocid)
export OKE_CLUSTER_ID=$(terraform -chdir=terraform output -raw oke_cluster_id)
export TENANCY_NAMESPACE=$(terraform -chdir=terraform output -raw tenancy_namespace)
export OCI_REGION="us-ashburn-1"   # tu región
export OCIR_HOST="${OCI_REGION}.ocir.io"
export BACKEND_IMAGE=$(terraform -chdir=terraform output -raw backend_image_url)
export FRONTEND_IMAGE=$(terraform -chdir=terraform output -raw frontend_image_url)
```

### 3.5 — Conecta kubectl al clúster OKE

```bash
oci ce cluster create-kubeconfig \
  --cluster-id $OKE_CLUSTER_ID \
  --file ~/.kube/config \
  --region $OCI_REGION \
  --token-version 2.0.0

# Verifica (puede tardar 2-3 minutos en Ready tras el apply)
kubectl get nodes
```

Resultado esperado:
```
NAME          STATUS   ROLES   AGE   VERSION
10.0.1.x      Ready    <none>  5m    v1.36.x
```

> Si el nodo tarda más de 10 minutos en aparecer o se queda en estado `NotReady`,
> consulta la sección de troubleshooting al final de esta guía (error `RegisterTimeOut`).

### 3.6 — Descarga el Wallet del ATP y crea el usuario de la app

```bash
# Crea la carpeta del wallet (está en .gitignore — nunca se commitea)
mkdir -p backend/wallet

# Descarga el wallet
oci db autonomous-database generate-wallet \
  --autonomous-database-id $ATP_OCID \
  --password "<TU_PASSWORD_WALLET>" \
  --file backend/wallet/wallet.zip

# Descomprime
unzip backend/wallet/wallet.zip -d backend/wallet/
ls backend/wallet/
```

Debes ver: `cwallet.sso`, `ewallet.p12`, `keystore.jks`, `ojdbc.properties`, `sqlnet.ora`, `tnsnames.ora`, `truststore.jks`

```bash
# El alias TNS para la app (usa _medium para balance entre rendimiento y concurrencia)
cat backend/wallet/tnsnames.ora   # verifica el nombre exacto
export ORACLE_TNS_ALIAS="OCIBLOGDB_medium"
```

Ahora crea el usuario de la aplicación con SQLcl:

```bash
# Mac
brew install sqlcl

# Conéctate como ADMIN
sql ADMIN/"<TU_PASSWORD_ATP>"@OCIBLOGDB_tp
```

```sql
CREATE USER blog_user IDENTIFIED BY "BlogUser#2024!";
GRANT CONNECT, RESOURCE, UNLIMITED TABLESPACE TO blog_user;
SELECT USERNAME FROM DBA_USERS WHERE USERNAME = 'BLOG_USER';
EXIT;
```

> Hibernate creará las tablas automáticamente en el primer arranque del backend.
> El ConfigMap incluye `SPRING_JPA_HIBERNATE_DDL_AUTO: "update"` que le indica
> a Hibernate que cree las tablas si no existen y las actualice si cambia el schema,
> sin borrar datos existentes. Este valor es seguro para mantener de forma permanente.

---

## Paso 4 — Configura OCI IAM Identity Domain

> **¿Qué es OCI IAM Identity Domain?**
> Es el sistema de identidad de Oracle Cloud. Hace el mismo trabajo que Keycloak
> en el entorno local: gestiona usuarios, grupos, y emite tokens JWT.
> El protocolo es OIDC/OAuth2 — el mismo que usa Keycloak. Por eso el código
> de la app no cambia: solo cambia la URL del servidor de identidad.

### 4.1 — Crea el Identity Domain (si no tienes uno)

En OCI Console: Menú → Identity & Security → **Domains** → **Create Domain**

- Name: `OCI-Blog-Domain`
- Domain type: **Free** (más que suficiente para el lab)
- Admin email: tu email
- Click **Create Domain**

Espera a que el estado cambie a `Active` (~2 minutos).

Copia el **Domain URL** — se ve así:
```
https://idcs-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.identity.oraclecloud.com
```

```bash
export OCI_IAM_DOMAIN="https://idcs-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.identity.oraclecloud.com"
```

### 4.2 — Verifica el issuer real del Identity Domain

El token JWT incluye un campo `iss` (issuer). Spring Security valida que coincida exactamente.
**No asumas el valor — léelo del discovery document:**

```bash
curl -s "${OCI_IAM_DOMAIN}/.well-known/openid-configuration" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('issuer :', d['issuer']); print('jwks_uri:', d['jwks_uri'])"
```

Resultado típico para IDCS clásico (tenancies antiguos):
```
issuer : https://identity.oraclecloud.com/
jwks_uri: https://idcs-XXXX.identity.oraclecloud.com/admin/v1/SigningCert/jwk
```

Resultado típico para Identity Domain moderno:
```
issuer : https://idcs-XXXX.identity.oraclecloud.com/
jwks_uri: https://idcs-XXXX.identity.oraclecloud.com/oauth2/v1/keys
```

```bash
# Guarda el issuer EXACTO que ves en la salida (copia-pega, no lo escribas a mano)
export OCI_IAM_ISSUER_URI="https://identity.oraclecloud.com/"   # ← ajusta con tu valor real
```

> ⚠️ **Error frecuente:** Exportar `OCI_IAM_ISSUER_URI="${OCI_IAM_DOMAIN}/oauth2/v1"` parece
> lógico pero es incorrecto para la mayoría de tenancies. El claim `iss` del token y el issuer
> del ConfigMap deben coincidir carácter a carácter, incluida la barra final.

### 4.3 — Crea la aplicación OIDC

Dentro de tu Domain: **Integrated Applications** → **Add Application** → **Mobile Application**

> En la UI de OCI IAM de 2025-2026 el tipo de aplicación se llama **Mobile Application**
> (en versiones anteriores se llamaba "Public Client" o "Confidential Application sin secret").
> Este tipo implementa el flujo PKCE (Authorization Code + PKCE) sin client_secret,
> que es el correcto para SPAs como React.

Configuración:
- **Name**: `oci-blog-app`
- **Description**: `OCI Blog Frontend`
- En **OAuth configuration**:
  - Grant type: `Authorization Code` ✅
  - PKCE: ✅ habilitado (viene por defecto en Mobile App)
  - **Redirect URL**: añade `https://PLACEHOLDER.nip.io/callback`
    (lo actualizarás con la IP real en el Paso 8)
  - **Post-logout redirect URL**: añade `https://PLACEHOLDER.nip.io/`
    (lo actualizarás con la IP real en el Paso 8)
- Click **Finish**

> ⚠️ **"Redirect URL" y "Post-logout redirect URL" son dos campos separados en la UI.**
> El primero controla a dónde OCI IAM redirige *después del login*.
> El segundo controla a dónde redirige *después del logout*.
> Si solo rellenas el primero, el logout fallará con "La URL de desconexión no es válida".
>
> ⚠️ **OCI IAM hace match exacto de caracteres**, incluyendo el `/` final.
> `https://PLACEHOLDER.nip.io` y `https://PLACEHOLDER.nip.io/` son URLs distintas.
> El frontend envía siempre la versión **con** `/` al final — regístrala exactamente así.

> ℹ️ Si en la interfaz solo ves los tipos "Trusted Application" y "Confidential Application",
> busca también "Mobile and Browser Application" — es el mismo tipo con nombre diferente
> según la versión de la UI.

Copia el **Client ID** que OCI IAM te muestra (NO hay client secret — correcto para PKCE):
```bash
export OCI_IAM_CLIENT_ID="XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
```

### 4.4 — Crea los grupos y usuarios

En tu Domain → **Groups** → **Create Group**:
- Nombre: `Blog_Admins` → Add group
- Nombre: `Blog_Readers` → Add group

En tu Domain → **Users** → **Create User**:
- Email: `admin.blog@example.edu` / First name: `Admin` / Last name: `Blog`
  → En la pestaña **Groups**: asigna `Blog_Admins`
- Email: `reader.blog@example.edu` / First name: `Reader` / Last name: `Blog`
  → En la pestaña **Groups**: asigna `Blog_Readers`

OCI IAM enviará un email de activación a cada usuario. Actívalos antes de probar el login.

### 4.5 — Configura el claim `groups` en el token JWT

> **¿Por qué este paso?**
> Por defecto, OCI IAM no incluye los grupos del usuario en el token JWT.
> El backend de Spring Boot necesita ese claim para asignar `ROLE_ADMIN` o `ROLE_READER`.
> Sin este paso, todos los usuarios autenticados verán error 403 al intentar crear posts.

En tu aplicación OIDC → pestaña **OAuth configuration** →
sección **Token issuance policies** → **Add claim**:

| Campo | Valor |
|-------|-------|
| Claim name | `groups` |
| Value type | `Group membership` |
| Group filter | `All groups` |
| Token type | `Access Token` ✅ + `ID Token` ✅ |

Click **Add** → **Save changes**.

Verifica que el claim está configurado antes de continuar.

---

## Paso 5 — Genera un Auth Token y haz login en OCIR

> **¿Qué es OCIR?**
> Oracle Container Image Registry: donde guardas tus imágenes Docker.
> Terraform ya creó los repositorios — ahora necesitas las credenciales para subir imágenes.

### 5.1 — Genera un Auth Token para Docker

En OCI Console: click en tu avatar → **User Settings** → **Auth Tokens** → **Generate Token**
- Description: `docker-push-oci-blog`
- **Copia el token inmediatamente** — OCI no lo muestra de nuevo

### 5.2 — Login al registro de Docker

```bash
# Format del usuario: <namespace>/<email-de-tu-cuenta-OCI>
docker login $OCIR_HOST \
  -u "${TENANCY_NAMESPACE}/<TU_EMAIL_OCI>"
# Te pedirá la contraseña: pega tu Auth Token
```

---

## Paso 6 — Instala el Nginx Ingress Controller

> **¿Qué es un Ingress Controller?**
> Es el "portero" del clúster. Recibe las peticiones que llegan al Load Balancer
> y las dirige al servicio correcto: las que empiezan con `/api` van al backend,
> el resto van al frontend.

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.11.1/deploy/static/provider/cloud/deploy.yaml

# Espera a que esté listo (1-2 minutos)
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s
```

Obtén la IP pública del Load Balancer que OCI creó automáticamente:
```bash
kubectl get svc -n ingress-nginx ingress-nginx-controller
```

Verás algo así:
```
NAME                       TYPE           CLUSTER-IP    EXTERNAL-IP     PORT(S)
ingress-nginx-controller   LoadBalancer   10.96.x.x     152.xxx.xxx.x   80:xxx/TCP,443:xxx/TCP
```

Guarda esa `EXTERNAL-IP`:
```bash
export LB_IP="152.xxx.xxx.x"
```

> La IP puede tardar 3-5 minutos en aparecer. Ejecuta el comando de nuevo
> hasta que deje de decir `<pending>`.

---

## Paso 6.5 — Configura HTTPS con nip.io y cert-manager

> **¿Por qué HTTPS es obligatorio, no opcional?**
> El frontend usa PKCE (la extensión de seguridad de OAuth2 para SPAs).
> PKCE necesita `window.crypto.subtle` para generar el code_verifier.
> Esta API del navegador **solo funciona en contextos seguros** (HTTPS o localhost).
> Con HTTP puro el login falla con: `TypeError: Crypto.subtle is available only in secure contexts`.
>
> Solución: usamos `nip.io` — un servicio que convierte cualquier IP en nombre de dominio —
> y `cert-manager` con Let's Encrypt para obtener un certificado TLS gratuito y automático.

### 6.5.1 — Define tu dominio nip.io

```bash
# nip.io convierte "152.xxx.xxx.x.nip.io" en un dominio que resuelve a esa IP
export DOMAIN="${LB_IP}.nip.io"
echo "Tu dominio será: https://${DOMAIN}"
```

Verifica que resuelve:
```bash
ping -c 1 $DOMAIN
# Debe responder desde tu $LB_IP
```

### 6.5.2 — Instala cert-manager

cert-manager gestiona certificados TLS dentro de Kubernetes:
```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.15.0/cert-manager.yaml

# Espera a que todos los pods estén listos (~2 minutos)
kubectl wait --namespace cert-manager \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/instance=cert-manager \
  --timeout=120s
```

### 6.5.3 — Crea el ClusterIssuer de Let's Encrypt

Reemplaza `TU_EMAIL@dominio.com` con tu email real (Let's Encrypt lo usa solo para notificaciones de expiración):

```bash
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: TU_EMAIL@dominio.com
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
      - http01:
          ingress:
            class: nginx
EOF
```

Verifica que el ClusterIssuer está listo:
```bash
kubectl get clusterissuer letsencrypt-prod
# Debe mostrar READY: True
```

> ℹ️ Let's Encrypt emite el certificado en ~60 segundos usando el método HTTP-01.
> El Ingress Controller responde al challenge automáticamente.

### 6.5.4 — Actualiza las variables para HTTPS

A partir de aquí **usa HTTPS y el dominio nip.io** en lugar de la IP con HTTP:

```bash
# Todas las URLs de la app usan HTTPS desde ahora
export VITE_API_BASE_URL="https://${DOMAIN}/api"
export VITE_REDIRECT_URI="https://${DOMAIN}/callback"
export VITE_POST_LOGOUT_REDIRECT_URI="https://${DOMAIN}/"
```

---

## Paso 7 — Construye y sube las imágenes Docker

> **¿Por qué dos imágenes?**
> Esta app tiene un backend (Spring Boot) y un frontend (React) separados.
> Cada uno se empaqueta en su propia imagen Docker y se despliega en Kubernetes
> de forma independiente. Esto permite actualizarlos por separado.

> **Terraform ya creó los repositorios OCIR** en el paso anterior — las URLs de las
> imágenes están en los outputs de Terraform. Úsalas directamente:

```bash
# Las URLs ya las tienes en las variables de entorno del Paso 3:
echo $BACKEND_IMAGE    # us-ashburn-1.ocir.io/mitenancynamespace/oci-blog/backend:latest
echo $FRONTEND_IMAGE   # us-ashburn-1.ocir.io/mitenancynamespace/oci-blog/frontend:latest
```

### 7.1 — Construye y sube el backend

```bash
cd backend

# Compila el JAR (genera target/oci-blog-backend-*.jar)
mvn clean package -DskipTests

# Construye la imagen Docker para x86_64 (el nodo OKE es VM.Standard.E4.Flex)
docker buildx build \
  --platform linux/amd64 \
  -t $BACKEND_IMAGE \
  --push \
  .

cd ..
```

> **¿Qué hace `--push`?**
> Construye la imagen y la sube directamente al OCIR en un solo paso.
> Equivale a `docker build ... && docker push ...`

> **Mac Intel o Linux x86:** `--platform linux/amd64` compila nativamente.
>
> **Mac M1/M2/M3 (Apple Silicon):** Necesitas habilitar QEMU emulation para cross-compilar a x86:
> ```bash
> docker run --privileged --rm tonistiigi/binfmt --install all
> ```

### 7.2 — Construye y sube el frontend

El frontend necesita saber en tiempo de build a qué URLs apuntar (OCI IAM y la API):

```bash
cd frontend

# Instala dependencias (si no lo hiciste ya)
npm install

# Construye la imagen con los ARGs de OCI IAM
docker buildx build \
  --platform linux/amd64 \
  --build-arg VITE_OCI_IAM_AUTHORITY="${OCI_IAM_DOMAIN}" \
  --build-arg VITE_OCI_IAM_CLIENT_ID="${OCI_IAM_CLIENT_ID}" \
  --build-arg VITE_API_BASE_URL="${VITE_API_BASE_URL}" \
  --build-arg VITE_REDIRECT_URI="${VITE_REDIRECT_URI}" \
  --build-arg VITE_POST_LOGOUT_REDIRECT_URI="${VITE_POST_LOGOUT_REDIRECT_URI}" \
  --build-arg VITE_OAUTH_SCOPE="openid profile email groups" \
  -t $FRONTEND_IMAGE \
  --push \
  .

cd ..
```

> **¿Por qué `VITE_OCI_IAM_AUTHORITY` usa `OCI_IAM_DOMAIN` y no `OCI_IAM_ISSUER_URI`?**
> Son dos cosas distintas:
> - `OCI_IAM_DOMAIN` = la URL base del Identity Domain → `oidc-client-ts` añade
>   `/.well-known/openid-configuration` para hacer el discovery OIDC.
> - `OCI_IAM_ISSUER_URI` = el valor del claim `iss` del JWT → lo usa el BACKEND
>   para validar que el token viene del proveedor correcto.
>
> Si pasas `OCI_IAM_ISSUER_URI` (con `/oauth2/v1`) como authority, `oidc-client-ts`
> intentará obtener `https://idcs-XXX.../oauth2/v1/.well-known/openid-configuration`
> que devuelve 401 — el login falla.

> **¿Por qué las URLs van al build y no a variables de entorno en K8s?**
> Vite genera código JavaScript estático para el navegador. No hay servidor Node.js
> en producción — Nginx sirve archivos estáticos. Las variables `VITE_*` se "hornean"
> en el bundle durante el `npm run build`. Por eso deben pasarse al `docker build`.

---

## Paso 8 — Actualiza la aplicación OCI IAM con el dominio HTTPS real

Ahora que tienes la IP del Load Balancer y el dominio nip.io, actualiza las URIs
de redirección en la aplicación OIDC de OCI IAM:

OCI Console → Identity → Domains → tu dominio → Integrated Applications → `oci-blog-app`
→ Edit → OAuth configuration:

| Campo en la UI | Valor |
|----------------|-------|
| **Redirect URL** | `https://${DOMAIN}/callback` |
| **Post-logout redirect URL** | `https://${DOMAIN}/` |

> ⚠️ **Son dos campos completamente distintos en la UI** — no el mismo campo dos veces.
> "Redirect URL" es para después del login; "Post-logout redirect URL" es para después del logout.
> Si solo actualizas el primero, el logout fallará con "La URL de desconexión no es válida".
>
> ⚠️ **OCI IAM hace match exacto de caracteres.** `https://${DOMAIN}` (sin `/`) y
> `https://${DOMAIN}/` (con `/`) son valores distintos. El frontend envía siempre
> la versión **con** `/` al final — regístrala exactamente así, incluyendo el slash final.
>
> ⚠️ **Las URIs deben usar HTTPS** exactamente como las tienes en las variables de entorno.
> Un mismatch de protocolo (http vs https) produce `client_authentication_failed`.

---

## Paso 9 — Crea el namespace y los Secrets en Kubernetes

> **¿Qué son los Secrets de Kubernetes?**
> Kubernetes tiene un mecanismo para guardar información sensible (contraseñas,
> certificados) separado del código. Los Secrets se inyectan en los pods como
> variables de entorno o archivos, sin que las credenciales queden en el código
> ni en las imágenes Docker.

### 9.1 — Crea el namespace

```bash
kubectl apply -f k8s/namespace.yaml

# Verifica
kubectl get namespaces | grep oci-blog
```

### 9.2 — Secret: Wallet de Oracle

```bash
# El script verifica que todos los archivos de la Wallet existen y crea el Secret
WALLET_DIR=./backend/wallet ./k8s/secrets/wallet-secret-generator.sh
```

### 9.3 — Secret: Credenciales de la base de datos

```bash
kubectl create secret generic blog-backend-secret \
  --namespace oci-blog \
  --from-literal=ORACLE_ATP_USER=blog_user \
  --from-literal=ORACLE_ATP_PASSWORD='BlogUser#2024!' \
  --from-literal=ORACLE_TNS_ALIAS=$ORACLE_TNS_ALIAS
```

### 9.4 — Secret: Credenciales para OCIR (ImagePullSecret)

Kubernetes necesita estas credenciales para descargar las imágenes de tu OCIR privado:

```bash
kubectl create secret docker-registry ocir-secret \
  --namespace oci-blog \
  --docker-server=$OCIR_HOST \
  --docker-username="${TENANCY_NAMESPACE}/<TU_EMAIL_OCI>" \
  --docker-password="<TU_AUTH_TOKEN>"
```

### 9.5 — Verifica los Secrets

```bash
kubectl get secrets -n oci-blog
```

Resultado esperado:
```
NAME                   TYPE                             DATA   AGE
blog-backend-secret    Opaque                           3      10s
ocir-secret            kubernetes.io/dockerconfigjson   1      5s
oracle-wallet-secret   Opaque                           7      15s
```

---

## Paso 9.6 — Descarga el JWKS de OCI IAM y créalo como ConfigMap

> **¿Por qué este paso extra?**
> Spring Security necesita las claves públicas de OCI IAM para verificar la firma
> de los tokens JWT. Normalmente las descarga automáticamente desde el `jwks_uri`.
>
> **El problema:** en la mayoría de tenancies de OCI, el endpoint JWKS requiere
> autenticación OCI API Key (`401 Unauthorized`). Spring no puede descargarlo solo.
> Sin este paso, el backend arranca pero rechaza todos los tokens con:
> `Couldn't retrieve remote JWK set: 401 Unauthorized`
>
> **La solución:** descargar el JWKS una vez con tu API Key autenticada,
> guardarlo en un ConfigMap de Kubernetes, y montarlo en el pod.
> Spring lee las claves desde el archivo — sin red, sin autenticación.

### 9.6.1 — Descarga el JWKS

Primero verifica si tu JWKS es público (intenta sin autenticación):
```bash
curl -s "${OCI_IAM_DOMAIN}/oauth2/v1/keys" | python3 -m json.tool 2>/dev/null | head -5
```

**Si devuelve JSON con `"keys"` → es público.** Descárgalo directamente:
```bash
curl -s "${OCI_IAM_DOMAIN}/oauth2/v1/keys" > backend/idcs-jwks.json
```

**Si devuelve `401` o HTML → requiere autenticación.** Usa `oci raw-request`:
```bash
# Descarga usando tu OCI API Key (la misma que configuraste en el paso 1)
oci raw-request \
  --http-method GET \
  --target-uri "${OCI_IAM_DOMAIN}/admin/v1/SigningCert/jwk" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['data'], indent=2))" \
  > backend/idcs-jwks.json
```

Verifica que el archivo tiene claves:
```bash
python3 -c "import json; d=json.load(open('backend/idcs-jwks.json')); print(f'Keys: {len(d[\"keys\"])} clave(s). kid={d[\"keys\"][0][\"kid\"]}')"
# Esperado: Keys: 1 clave(s). kid=SIGNING_KEY  (o similar)
```

### 9.6.2 — Crea el ConfigMap con el JWKS

El archivo `k8s/configmaps/idcs-jwks-config.yaml` ya existe en el proyecto.
**Actualízalo con TU JWKS** (el que acabas de descargar):

```bash
# Copia el contenido del JWKS al ConfigMap
JWKS_CONTENT=$(cat backend/idcs-jwks.json)

# Genera el ConfigMap con tu JWKS real
cat > k8s/configmaps/idcs-jwks-config.yaml <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: idcs-jwks-config
  namespace: oci-blog
  labels:
    app.kubernetes.io/name: oci-blog
    app.kubernetes.io/component: backend
data:
  jwks.json: |
$(echo "$JWKS_CONTENT" | sed 's/^/    /')
EOF

# Aplica el ConfigMap
kubectl apply -f k8s/configmaps/idcs-jwks-config.yaml
```

Verifica que se creó:
```bash
kubectl get configmap idcs-jwks-config -n oci-blog
```

> **¿Qué pasa si las claves de OCI IAM rotan?**
> IDCS clásico rara vez rota las claves (años de vida útil). Si algún día ves
> `JWT signature does not match` en los logs, repite este paso y haz:
> `kubectl rollout restart deployment/blog-backend -n oci-blog`

---

## Paso 10 — Aplica el ConfigMap y actualiza las imágenes

### 10.1 — Actualiza el ConfigMap con tus valores reales

Abre `k8s/configmaps/backend-config.yaml` y actualiza estos valores:

```yaml
data:
  # El claim "iss" del JWT — obtenido del discovery document en el Paso 4.2.
  # Para IDCS clásico suele ser "https://identity.oraclecloud.com/" (con barra final).
  # Para Identity Domains modernos suele ser el domain URL completo.
  # Copia EXACTAMENTE lo que viste en la salida del curl del Paso 4.2.
  OCI_IAM_ISSUER_URI: "https://identity.oraclecloud.com/"   # ← ajusta con tu valor real

  # UserInfo endpoint de OCI IAM — el backend lo usa para obtener los grupos del usuario.
  # IDCS clásico NO incluye el claim "groups" en el JWT, pero SÍ lo devuelve en el UserInfo.
  # Formato: https://{tu-dominio-idcs}.identity.oraclecloud.com/oauth2/v1/userinfo
  OCI_IAM_USERINFO_URI: "https://idcs-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.identity.oraclecloud.com/oauth2/v1/userinfo"   # ← reemplaza con tu dominio

  # Usa HTTPS y el dominio nip.io (no la IP con HTTP)
  CORS_ALLOWED_ORIGINS: "https://TU_LB_IP.nip.io"

  SPRING_PROFILES_ACTIVE: "k8s"
  SPRING_JPA_HIBERNATE_DDL_AUTO: "update"
```

> ℹ️ `SPRING_JPA_HIBERNATE_DDL_AUTO: "update"` es necesario en el primer despliegue.
> Hibernate crea las tablas si no existen. Con `validate` (el valor por defecto del perfil k8s)
> el backend falla con `Schema-validation: missing table [posts]` si las tablas no existen aún.

Aplica el ConfigMap:
```bash
kubectl apply -f k8s/configmaps/backend-config.yaml
```

### 10.2 — Actualiza la imagen en el Deployment del backend

Abre [k8s/backend/deployment.yaml](k8s/backend/deployment.yaml) y cambia la línea de la imagen:
```yaml
# Antes:
image: <REGION>.ocir.io/<TENANCY_NAMESPACE>/oci-blog/backend:latest

# Después (con tus valores reales):
image: iad.ocir.io/mitenancynamespace/oci-blog/backend:latest
```

### 10.3 — Actualiza la imagen en el Deployment del frontend

Abre [k8s/frontend/deployment.yaml](k8s/frontend/deployment.yaml) y cambia la imagen:
```yaml
image: iad.ocir.io/mitenancynamespace/oci-blog/frontend:latest
```

---

## Paso 11 — Despliega en Kubernetes

Antes de desplegar, verifica que todos los ConfigMaps y Secrets existen:
```bash
kubectl get configmap -n oci-blog
# Deben aparecer: blog-backend-config  e  idcs-jwks-config
kubectl get secrets -n oci-blog
# Deben aparecer: blog-backend-secret, oracle-wallet-secret, ocir-secret
```

Despliega en orden:
```bash
# Backend
kubectl apply -f k8s/backend/deployment.yaml
kubectl apply -f k8s/backend/service.yaml

# Frontend
kubectl apply -f k8s/frontend/deployment.yaml
kubectl apply -f k8s/frontend/service.yaml
```

El Ingress ya tiene TLS configurado. Antes de aplicarlo, actualiza el dominio:

Abre `k8s/ingress/ingress.yaml` y reemplaza `160.34.218.12.nip.io` con tu dominio
(`${LB_IP}.nip.io`). Luego aplica:

```bash
kubectl apply -f k8s/ingress/ingress.yaml
```

cert-manager detectará la anotación `cert-manager.io/cluster-issuer: letsencrypt-prod`
y emitirá el certificado TLS automáticamente (~60 segundos).

---

## Paso 12 — Verifica el despliegue

```bash
# Estado de los pods (puede tardar 1-3 minutos en Running)
kubectl get pods -n oci-blog
```

Resultado esperado:
```
NAME                             READY   STATUS    RESTARTS
blog-backend-xxxx-yyy            1/1     Running   0
blog-backend-xxxx-zzz            1/1     Running   0
blog-frontend-xxxx-aaa           1/1     Running   0
blog-frontend-xxxx-bbb           1/1     Running   0
```

Si algún pod no llega a `Running`, revisa los logs:
```bash
kubectl logs <NOMBRE-DEL-POD> -n oci-blog
kubectl describe pod <NOMBRE-DEL-POD> -n oci-blog
```

Verifica la salud del backend:
```bash
curl http://$LB_IP/actuator/health
# Resultado esperado: {"status":"UP","components":{"db":{"status":"UP"}}}
```

---

## Paso 13 — ¡Abre tu blog en el navegador!

```bash
echo "Tu blog está en: https://$DOMAIN"
```

Abre `https://<LB_IP>.nip.io` en tu navegador. El certificado Let's Encrypt
es válido — no verás advertencia de seguridad.

Haz login con los usuarios que creaste en OCI IAM:
- `admin.blog@example.edu` → puede crear y editar posts
- `reader.blog@example.edu` → puede leer y comentar

> Recuerda activar los usuarios — OCI IAM envía un email de activación al crearlos.
> Sin activar la cuenta, el login falla con credenciales inválidas.

---

## Conceptos clave para entender la app

### ¿Qué es OAuth2/OIDC?

En apps tradicionales, el login guarda la sesión en el servidor.
OAuth2 funciona diferente: el servidor de identidad (Keycloak o OCI IAM) emite
un **token JWT** — un string firmado que prueba quién eres.

```
Navegador          Keycloak/OCI IAM         Backend Spring Boot
   │                     │                         │
   ├──── Login ─────────►│                         │
   │◄─── Token JWT ──────┤                         │
   │                     │                         │
   ├──── GET /api/posts ─────────────────────────►│
   │     Authorization: Bearer <token>             │
   │                     ├── Spring verifica firma►│
   │                     │   ¿Es válido? ¿No expiró? │
   │◄────────────────────────────────── Respuesta ─┤
```

El backend verifica la firma del token (sin contactar al servidor de identidad
en cada request — usa la llave pública del JWKS endpoint).

### ¿Qué son los roles ROLE_ADMIN y ROLE_READER?

El token JWT incluye un claim `groups: ["Blog_Admins"]` o `groups: ["Blog_Readers"]`.
Spring Security lee ese claim y lo convierte en roles de Spring:
- `Blog_Admins` → `ROLE_ADMIN`
- `Blog_Readers` → `ROLE_READER`

El backend usa esos roles para decidir qué puede hacer cada usuario.

### ¿Qué es el Oracle Wallet?

Oracle ATP rechaza conexiones no cifradas. El Wallet contiene certificados
que permiten una conexión TLS mutua:
- El cliente (tu app) autentica al servidor (ATP)
- El servidor (ATP) autentica al cliente (tu app)

El Wallet **nunca va en la imagen Docker** — se inyecta como Secret de Kubernetes
y se monta como directorio en el pod. Así si alguien descarga tu imagen, no obtiene
las credenciales de la base de datos.

### ¿Qué es el Rolling Update?

Cuando actualizas la app, Kubernetes no mata todos los pods a la vez.
Con `maxUnavailable: 0` y `maxSurge: 1`:
1. Crea 1 pod nuevo (ahora hay 3: 2 viejos + 1 nuevo)
2. Espera a que el nuevo pod pase el Readiness Probe
3. Elimina 1 pod viejo (ahora hay 2: 1 viejo + 1 nuevo)
4. Repite hasta que todos sean nuevos

Tu app **nunca deja de responder** durante un deploy.

---

## Cómo actualizar la app después de cambios

Cada vez que modifiques el código y quieras verlo en OCI:

```bash
# 1. Recompila el backend
cd backend && mvn clean package -DskipTests && cd ..

# 2. Sube la nueva imagen del backend
docker buildx build --platform linux/amd64 -t $BACKEND_IMAGE --push backend/

# 3. Dile a Kubernetes que use la nueva imagen
kubectl rollout restart deployment/blog-backend -n oci-blog

# 4. Observa el update en tiempo real
kubectl rollout status deployment/blog-backend -n oci-blog
```

Para el frontend (si cambias código React o URLs):
```bash
# Reconstruye con los mismos ARGs del build original (siempre HTTPS + nip.io)
docker buildx build --platform linux/amd64 \
  --build-arg VITE_OCI_IAM_AUTHORITY="${OCI_IAM_DOMAIN}" \
  --build-arg VITE_OCI_IAM_CLIENT_ID="${OCI_IAM_CLIENT_ID}" \
  --build-arg VITE_API_BASE_URL="${VITE_API_BASE_URL}" \
  --build-arg VITE_REDIRECT_URI="${VITE_REDIRECT_URI}" \
  --build-arg VITE_POST_LOGOUT_REDIRECT_URI="${VITE_POST_LOGOUT_REDIRECT_URI}" \
  --build-arg VITE_OAUTH_SCOPE="openid profile email groups" \
  -t $FRONTEND_IMAGE --push frontend/

kubectl rollout restart deployment/blog-frontend -n oci-blog
```

---

## ¿Qué tocar para cada tipo de cambio?

| Quiero... | Toco... |
|-----------|---------|
| Nuevo endpoint en la API | 1 método en el Controller correspondiente |
| Nueva tabla | 3 archivos: entidad `@Entity`, Repository, Controller |
| Nueva columna en tabla existente | 1 campo con `@Column` en la entidad |
| Nueva página en React | 1 componente + 1 ruta en `App.tsx` |
| Cambiar autenticación/roles | `JwtAuthConverter.java` y `SecurityConfig.java` |
| Más réplicas | `replicas: N` en `k8s/backend/deployment.yaml` |

---

## Variables importantes — guárdalas en un lugar seguro

```bash
# === MIS DATOS OCI ===
export COMPARTMENT_OCID="ocid1.compartment.oc1..<TU_COMPARTMENT_OCID>"
export OCI_REGION="us-ashburn-1"
export TENANCY_NAMESPACE="mitenancynamespace"

# === OCI IAM ===
export OCI_IAM_DOMAIN="https://idcs-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.identity.oraclecloud.com"
# OCI_IAM_ISSUER_URI = valor del campo "issuer" del discovery document (Paso 4.2)
# Para IDCS clásico: "https://identity.oraclecloud.com/"
# Para Identity Domain moderno: suele ser igual a OCI_IAM_DOMAIN + "/"
export OCI_IAM_ISSUER_URI="https://identity.oraclecloud.com/"  # ← ajusta con tu valor real
export OCI_IAM_CLIENT_ID="XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
# ⚠️  El client_id en OCI IAM = campo "name" de la App en la Admin API.
#     Si recreas la app, el client_id CAMBIA. Verifica con:
#     oci raw-request --http-method GET \
#       --target-uri "${OCI_IAM_DOMAIN}/admin/v1/Apps?count=100&attributes=id,name,active,clientType" \
#       --request-body "" | python3 -m json.tool | grep -E '"name"|"clientType"'
export OCI_IAM_USERINFO_URI="${OCI_IAM_DOMAIN}/oauth2/v1/userinfo"

# === ORACLE ATP ===
export ATP_OCID="ocid1.autonomousdatabase.oc1..<TU_ATP_OCID>"
export ORACLE_TNS_ALIAS="OCIBLOGDB_medium"

# === OKE + OCIR ===
export OKE_CLUSTER_ID="ocid1.cluster.oc1..<TU_CLUSTER_OCID>"
export OCIR_HOST="iad.ocir.io"
export BACKEND_IMAGE="${OCIR_HOST}/${TENANCY_NAMESPACE}/oci-blog/backend:latest"
export FRONTEND_IMAGE="${OCIR_HOST}/${TENANCY_NAMESPACE}/oci-blog/frontend:latest"
export LB_IP="152.xxx.xxx.x"

# === HTTPS (Paso 6.5 en adelante) ===
export DOMAIN="${LB_IP}.nip.io"
export VITE_API_BASE_URL="https://${DOMAIN}/api"
export VITE_REDIRECT_URI="https://${DOMAIN}/callback"
export VITE_POST_LOGOUT_REDIRECT_URI="https://${DOMAIN}/"
```

> **Tip:** Guarda estas variables en un archivo `.env` (en `.gitignore`) para no
> tener que re-exportarlas cada vez que abras una terminal nueva:
> ```bash
> # Carga todas las variables en la sesión actual
> source .env
> ```

---

## Errores comunes y soluciones

### Errores en el entorno local

| Error | Causa | Solución |
|-------|-------|----------|
| Backend no arranca | Oracle aún iniciando | Esperar ~90s. `docker compose logs -f oracle-db` |
| `Invalid scopes: groups` al hacer login | El scope `groups` no existe en Keycloak como Client Scope — los grupos llegan por protocol mapper directo, no por scope | Verifica que `frontend/.env.local` tenga `VITE_OAUTH_SCOPE=openid profile email`. El `start-local.sh` crea este archivo desde `.env.local.example` que ya incluye la variable correcta. |
| `401 Unauthorized` al llamar la API tras login | Stale closure en el interceptor de Axios — el token no se envía | Verifica que `App.tsx` use `useRef` para el auth: `const authRef = useRef(auth); authRef.current = auth;` |
| "No se pudieron cargar los posts" | Backend caído o sin token | Verifica que el backend siga corriendo en su terminal. Si lo cerraste, reinícialo |
| `nesting depth (1001) exceeds maximum` en el log | Referencia circular `Post → comments → Comment.post → Post → ...` | Verifica que `Post.comments` y `Comment.post` tengan `@JsonIgnore` |
| "Invalid date" en los comentarios | Jackson serializa `Instant` como número Unix en vez de ISO 8601 | Verifica que `application.yml` tenga `write-dates-as-timestamps: false` |
| Los datos se borran al reiniciar el backend | `ddl-auto: create` borra y recrea tablas en cada arranque | El perfil `local-dev` debe tener `ddl-auto: update` |
| Keycloak aparece como `unhealthy` en `docker compose ps` | El health check del contenedor usa el endpoint de management que no está habilitado en `start-dev` | Normal en modo desarrollo — Keycloak funciona aunque el status diga unhealthy. Verificar con `curl http://localhost:8180/realms/oci-blog` |

### Errores en el despliegue OCI

| Error | Causa probable | Solución |
|-------|---------------|----------|
| `TypeError: Crypto.subtle is available only in secure contexts` | El login PKCE usa `crypto.subtle` que solo funciona en HTTPS | Asegúrate de haber completado el Paso 6.5 (cert-manager + nip.io). Nunca uses HTTP puro con esta app |
| `Error de autenticación: Invalid response Content-Type: text/html` al hacer login | `VITE_OCI_IAM_AUTHORITY` incluye `/oauth2/v1` — el discovery endpoint da 401 | Reconstruye el frontend con `VITE_OCI_IAM_AUTHORITY="${OCI_IAM_DOMAIN}"` (sin `/oauth2/v1`) |
| `Fallo de autenticación del cliente` / `client_authentication_failed` | Se creó Confidential Application en lugar de Mobile Application | Borra la app en OCI IAM y crea una nueva de tipo **Mobile Application** (no necesita client_secret) |
| `Couldn't retrieve remote JWK set: 401 Unauthorized` en logs del backend | El endpoint JWKS de IDCS requiere auth — Spring no puede descargarlo | Completa el Paso 9.6: descarga el JWKS con `oci raw-request` y créalo como ConfigMap |
| `JWT issuer does not match` / `No se pudieron cargar los posts` | `OCI_IAM_ISSUER_URI` en el ConfigMap no coincide con el claim `iss` del token | Verifica con: `curl -s "${OCI_IAM_DOMAIN}/.well-known/openid-configuration" \| python3 -c "import sys,json; print(json.load(sys.stdin)['issuer'])"` y copia ese valor exacto |
| `Schema-validation: missing table [posts]` en logs del backend | Primer despliegue con `ddl-auto: validate` — las tablas no existen aún | Asegúrate de que el ConfigMap tiene `SPRING_JPA_HIBERNATE_DDL_AUTO: "update"` |
| `java.nio.file.AccessDeniedException: /app/wallet/ojdbc.properties` | El Secret de la wallet se montó con `defaultMode: 0400` — el proceso (no-root) no puede leerlo | El `deployment.yaml` del proyecto ya tiene `defaultMode: 0444`. Si lo modificaste, revierte |
| Node pool en estado `FAILED` o `RegisterTimeOut` después de ~21 minutos | Terraform usa imagen genérica de Oracle Linux sin kubelet ni containerd | El `main.tf` ya usa `data.oci_containerengine_node_pool_option`. Verifica que el filtro incluya `-OKE-1.36` en el nombre. La imagen correcta: `Oracle-Linux-8.10-2026.04.30-3-OKE-1.36.0-1462` |
| El nodo tarda >5 min en aparecer en `kubectl get nodes` | El nodo aún está bootstrapping | Espera hasta 10 min. Si no aparece: `oci ce node-pool get --node-pool-id <OCID>` y busca `lifecycleState` |
| `ImagePullBackOff` en kubectl | No puede descargar la imagen de OCIR | Verifica que creaste `ocir-secret` y que el Auth Token no expiró |
| `CrashLoopBackOff` en kubectl | La app falla al arrancar | `kubectl logs <pod> -n oci-blog` para ver el error exacto |
| `ORA-01017` | Contraseña de la DB incorrecta | Verifica el Secret `blog-backend-secret` con: `kubectl get secret blog-backend-secret -n oci-blog -o jsonpath='{.data.ORACLE_ATP_PASSWORD}' \| base64 -d` |
| Pods en `Pending` | Sin recursos en el nodo | `kubectl get nodes` y `kubectl describe node` — verifica CPU y memoria disponibles |
| `CORS error` en el navegador | Origen no permitido | Actualiza `CORS_ALLOWED_ORIGINS` en el ConfigMap con `https://${DOMAIN}` (HTTPS, no HTTP) |
| `redirect_uri_mismatch` al hacer login | La URI en OCI IAM no coincide exactamente con la del frontend | Verifica que la Redirect URI en OCI IAM sea exactamente `https://${DOMAIN}/callback` |
| "La URL de desconexión no es válida" al cerrar sesión | El campo **Post-logout redirect URL** en OCI IAM no coincide con la URL que envía el frontend | En OCI IAM → tu app → edita el campo **Post-logout redirect URL** (campo separado del Redirect URL de login) y pon exactamente `https://${DOMAIN}/` — con el `/` final. OCI IAM hace match exacto de caracteres. |
| `docker buildx: not found` | BuildX no instalado | `docker buildx install` o actualiza Docker Desktop |
| `ImagePullBackOff: no image found for architecture "amd64"` | Imagen construida en Mac M-chip para arm64, el nodo OKE es x86_64 | Siempre usa `docker buildx build --platform linux/amd64 --push`. Nunca `docker build` + `docker push` por separado en Mac con Apple Silicon |
| `invalid_client` al intentar hacer login (todos los navegadores, 401 en el authorization endpoint) | El `client_id` en la imagen del frontend no coincide con el que existe en OCI IAM. Suele pasar si se recrea la app en OCI IAM después de hacer el build | Verifica el client_id real con: `oci raw-request --http-method GET --target-uri "${OCI_IAM_DOMAIN}/admin/v1/Apps?count=100&attributes=id,name,active,clientType" --request-body "" \| python3 -m json.tool`. El campo `name` de la app pública ES el client_id. Reconstruye el frontend con ese valor |
| El usuario puede hacer login pero no ve el botón de admin / solo tiene acceso de lectura | IDCS no incluye el claim `groups` en el JWT. El backend no asigna ROLE_ADMIN | Verifica que `OCI_IAM_USERINFO_URI` esté en el ConfigMap `blog-backend-config`. Verifica los logs del backend: `kubectl logs -n oci-blog -l app=blog-backend \| grep -i "grupos\|userinfo\|role"` |
| Login entra en loop / 401 en el authorization endpoint tras renovación silenciosa de token | Token expirado en SessionStorage → `automaticSilentRenew` intenta renovar → IDCS rechaza → loop | Limpia la sesión: F12 → Application → Session Storage → Clear. Intenta login de nuevo en ventana de incógnito |
| El botón "Regístrate" aparece en el navbar pero al enviar el formulario da error | La funcionalidad de auto-registro vía formulario no está habilitada en este lab (requiere configuración adicional de OCI IAM no cubierta aquí) | Usa "Iniciar sesión" con los usuarios creados manualmente en OCI IAM (Paso 4.4). En Keycloak local, usa el botón "Register" de la pantalla de login de Keycloak. |

---

## Gestión de costos

### ¿Qué es gratis y qué cuesta?

| Componente | ¿Cuesta? | Detalles |
|------------|----------|---------|
| Oracle ATP | **Gratis siempre** | OCI Always Free: hasta 2 ADBs de 20GB |
| OCI IAM Identity Domain | **Gratis siempre** | Tier Free incluido |
| OCIR (imágenes Docker) | **Gratis** | Hasta 500MB por región |
| OCI Load Balancer | **Gratis** | 1 flexible LB gratis siempre |
| OKE (el orquestador) | **Gratis** | Solo el control plane |
| **Nodo OKE VM.Standard.E4.Flex** | **Créditos de profesor** | ~$0.03/hr por 2 OCPU · se cubre con créditos del curso |

> **¿Por qué no A1.Flex (Always Free)?** El shape A1.Flex (ARM) es gratuito pero requiere
> una imagen OKE-optimizada para ARM — que actualmente no está disponible en la región
> mx-queretaro-1 para k8s v1.36. El `VM.Standard.E4.Flex` (x86_64) sí tiene imagen
> OKE-optimizada disponible y registra en ~3 minutos.

**El ATP, IAM, OCIR y Load Balancer son Always Free. Solo el nodo OKE consume créditos.**

### El Free Trial de OCI — $300 USD en créditos

Toda cuenta nueva recibe **$300 USD en créditos gratuitos** válidos por 30 días.
Son más que suficientes para el lab, incluso si usas recursos de pago.

> Regístrate en [oracle.com/cloud/free](https://www.oracle.com/cloud/free) —
> requiere tarjeta de crédito para los créditos de $300, pero no la cobra si
> te quedas dentro del Always Free tier.

### Limpia cuando ya no necesites el clúster

Si ya no necesitas el clúster OKE (y los nodos son de pago), bórralo:

```bash
# Borra los deployments
kubectl delete namespace oci-blog

# Borra el Ingress Controller (esto elimina el Load Balancer de OCI)
kubectl delete namespace ingress-nginx

# Borra el clúster desde la consola de OCI:
# Developer Services → Kubernetes Clusters → tu clúster → Delete
```

> **Nota:** La ATP, OCIR y OCI IAM Domain **no se eliminan** automáticamente.
> Mantenlos si quieres retomar el lab — son gratuitos (Always Free).

---

## Resumen visual del flujo completo

```
PARTE 1 — LOCAL (30 minutos)
─────────────────────────────────────────────────────
1. git clone
2. docker compose --profile full up -d --build
   └─ levanta los 4 servicios en contenedores
3. http://localhost:3000 → Login → Crear post → Comentar

   ── O modo desarrollo manual ──
2. docker compose up -d         ← solo Keycloak + Oracle
3. mvn spring-boot:run          ← backend local (perfil local-dev)
4. npm run dev                  ← frontend en :5173

PARTE 2 — OCI (90-120 minutos)
─────────────────────────────────────────────────────
Paso 1.   oci setup config           ← OCI CLI + API Key
Paso 2.   Crear compartment          ← consola web (1 min)
Paso 3.   terraform apply            ← crea VCN + ATP + OKE + OCIR (~10-15 min)
            └─ terraform output → ATP_OCID, OKE_CLUSTER_ID, BACKEND_IMAGE, etc.
Paso 4.   OCI IAM:
            4.1  Crea Identity Domain
            4.2  Verifica issuer real con discovery document (curl)
            4.3  Crea Mobile Application (no Confidential)
            4.4  Crea grupos Blog_Admins / Blog_Readers + usuarios
            4.5  Configura claim "groups" en token JWT
Paso 5.   docker login OCIR          ← Auth Token de OCI
Paso 6.   kubectl apply ingress-nginx → obtén LB_IP
Paso 6.5  HTTPS: cert-manager + ClusterIssuer + export DOMAIN="${LB_IP}.nip.io"
Paso 7.   docker buildx build --push backend (--platform linux/amd64)
           docker buildx build --push frontend (VITE_OCI_IAM_AUTHORITY=$OCI_IAM_DOMAIN, HTTPS)
Paso 8.   Actualiza redirect URIs en OCI IAM → https://${DOMAIN}/callback
Paso 9.   kubectl apply namespace + secrets (wallet, DB, OCIR)
Paso 9.6  Descarga JWKS (oci raw-request si 401) → kubectl apply idcs-jwks-config
Paso 10.  kubectl apply configmaps (OCI_IAM_ISSUER_URI + OCI_IAM_USERINFO_URI + HTTPS CORS)
Paso 11.  kubectl apply deployments + services + ingress (TLS con cert-manager)
Paso 12.  kubectl get pods -n oci-blog → Running ✅ (tarda ~60s en arrancar)
Paso 13.  https://${DOMAIN} → ¡Tu blog en OCI con HTTPS! 🎉

Para destruir toda la infraestructura:
  terraform destroy               ← elimina VCN + ATP + OKE + OCIR
```

---

*Guía preparada para el curso · Proyecto OCI Blog Lab*
*Spring Boot 3.3 · React + Vite · Oracle ATP · OKE · OCI IAM*
