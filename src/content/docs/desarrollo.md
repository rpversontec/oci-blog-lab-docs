---
title: "Guía de Desarrollo"
description: "Construye el blog con Spring Boot, React, Oracle DB y autenticación OAuth2."
---

> Universidad · Laboratorio de Aplicaciones Cloud  
> 5 sesiones × 2-3 horas · Spring Boot 3 + React + Oracle DB + OCI IAM

---

## Antes de empezar

Esta guía te lleva desde cero hasta una aplicación de blog completa con autenticación OAuth2.
En cada sesión construyes sobre lo de la sesión anterior; al final del Día 5 tienes exactamente
el mismo código que está en el repositorio de referencia del laboratorio.

**Prerequisitos**

| Conocimiento | Nivel mínimo |
|---|---|
| Java | Clases, interfaces, anotaciones |
| SQL | SELECT, INSERT, JOIN básicos |
| HTML / JS | DOM, fetch API |
| HTTP / REST | Verbos, códigos de estado, JSON |

**Herramientas que necesitas instalar antes del Día 1**

```bash
# Verificar versiones
java -version          # Java 17+
mvn -version           # Maven 3.9+
node -version          # Node 18+
docker -version        # Docker Desktop
curl --version
```

---

## Estructura del proyecto

```
oci-blog/
├── backend/           # Spring Boot 3
├── frontend/          # React + Vite + TypeScript
├── docker-compose.yml # Keycloak + Oracle 23c local
└── keycloak/
    └── realm-export.json
```

Paquete base Java: `com.ociblog`

---

# Día 1 — Backend: API REST sin seguridad

## ¿Qué vas a construir hoy?

Al terminar esta sesión tendrás un servidor Spring Boot corriendo en el puerto 8080 con endpoints
CRUD completos para posts y comentarios, conectado a una base de datos Oracle 23c en Docker.
No hay autenticación todavía — eso viene en el Día 2. El objetivo hoy es verificar que el modelo
de datos y la lógica de negocio funcionan con `curl`.

---

## 1.1 Generar el proyecto con Spring Initializr

Ve a [start.spring.io](https://start.spring.io) y configura:

| Campo | Valor |
|---|---|
| Project | Maven |
| Language | Java |
| Spring Boot | 3.3.x (la más reciente estable) |
| Group | `com.ociblog` |
| Artifact | `oci-blog-backend` |
| Packaging | Jar |
| Java | 17 |

Dependencias a seleccionar en la interfaz:

- Spring Web
- Spring Data JPA
- Validation
- Lombok
- Spring Boot Actuator

Haz clic en **Generate**, descomprime el ZIP dentro de tu carpeta `backend/`.

> ⚠️ Spring Initializr no incluye el driver Oracle JDBC. Lo agregaremos a mano en el siguiente paso.

---

## 1.2 Completar el pom.xml

> 📁 `backend/pom.xml`

Abre el `pom.xml` generado y agrega estas dependencias dentro de `<dependencies>`:

```xml
<!-- Oracle JDBC + UCP (connection pooling) -->
<dependency>
    <groupId>com.oracle.database.jdbc</groupId>
    <artifactId>ojdbc11</artifactId>
</dependency>
<dependency>
    <groupId>com.oracle.database.jdbc</groupId>
    <artifactId>ucp</artifactId>
</dependency>

<!-- Oracle Wallet (necesario para conectar a ATP con TLS) -->
<dependency>
    <groupId>com.oracle.database.security</groupId>
    <artifactId>oraclepki</artifactId>
    <version>21.13.0.0</version>
</dependency>
<dependency>
    <groupId>com.oracle.database.security</groupId>
    <artifactId>osdt_core</artifactId>
    <version>21.13.0.0</version>
</dependency>
<dependency>
    <groupId>com.oracle.database.security</groupId>
    <artifactId>osdt_cert</artifactId>
    <version>21.13.0.0</version>
</dependency>
```

> **¿Por qué ojdbc11 + ucp?** Oracle JDBC publica sus artefactos en Maven Central desde 2019.
> `ojdbc11` es el driver para Java 11+. `ucp` (Universal Connection Pool) sustituye al pool
> de HikariCP cuando conectas a Oracle ATP con wallets.

---

## 1.3 Configurar application.yml

> 📁 `backend/src/main/resources/application.yml`

Borra el `application.properties` generado y crea este YAML:

```yaml
spring:
  application:
    name: oci-blog-backend

  jackson:
    serialization:
      write-dates-as-timestamps: false   # fechas como ISO-8601, no como número

  datasource:
    url: jdbc:oracle:thin:@localhost:1521/FREEPDB1
    username: BLOGUSER
    password: <TU_PASSWORD_LOCAL>
    driver-class-name: oracle.jdbc.OracleDriver

  jpa:
    hibernate:
      ddl-auto: update                  # crea / modifica tablas al arrancar
    show-sql: true
    properties:
      hibernate:
        dialect: org.hibernate.dialect.OracleDialect
        jdbc:
          time_zone: UTC

server:
  port: 8080

app:
  cors:
    allowed-origins: ${CORS_ALLOWED_ORIGINS:http://localhost:5173}
```

> **¿Por qué `ddl-auto: update`?** En desarrollo nos ahorra escribir los DDL a mano.
> En producción (OCI) usaremos `validate` y scripts Flyway para controlar los cambios de esquema.

---

## 1.4 Levantar Oracle 23c Free en Docker

Antes de arrancar el backend necesitas la base de datos.

```bash
# Desde la raíz del proyecto
docker run -d \
  --name oracle-free \
  -p 1521:1521 \
  -e ORACLE_PASSWORD=Oracle123 \
  container-registry.oracle.com/database/free:latest
```

La primera vez tarda 2-3 minutos en inicializar. Verifica que está listo:

```bash
docker logs oracle-free 2>&1 | grep "DATABASE IS READY"
```

Crea el usuario de la aplicación:

```bash
docker exec -it oracle-free sqlplus sys/Oracle123@FREE as sysdba
```

```sql
-- Dentro de sqlplus
ALTER SESSION SET CONTAINER = FREEPDB1;
CREATE USER BLOGUSER IDENTIFIED BY <TU_PASSWORD_LOCAL>;
GRANT CONNECT, RESOURCE, CREATE SEQUENCE, CREATE TABLE TO BLOGUSER;
ALTER USER BLOGUSER QUOTA UNLIMITED ON USERS;
EXIT;
```

> **Error frecuente:** `ORA-12514: TNS:listener does not know of service requested` — espera un
> minuto más y reintenta. La base de datos todavía está iniciando.

---

## 1.5 Clase principal con JPA Auditing

> 📁 `backend/src/main/java/com/ociblog/OciBlogApplication.java`

```java
package com.ociblog;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

@SpringBootApplication
@EnableJpaAuditing
public class OciBlogApplication {
    public static void main(String[] args) {
        SpringApplication.run(OciBlogApplication.class, args);
    }
}
```

> **¿Por qué `@EnableJpaAuditing`?** Activa el mecanismo de Spring que rellena automáticamente
> los campos `@CreatedDate` y `@LastModifiedDate` en las entidades. Sin esta anotación esos campos
> quedarían en `null`.

---

## 1.6 Entidad Post

> 📁 `backend/src/main/java/com/ociblog/model/Post.java`

```java
package com.ociblog.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(
    name = "posts",
    indexes = {
        @Index(name = "idx_posts_author",    columnList = "author_id"),
        @Index(name = "idx_posts_published", columnList = "published")
    }
)
@EntityListeners(AuditingEntityListener.class)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Post {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "post_seq")
    @SequenceGenerator(name = "post_seq", sequenceName = "post_seq", allocationSize = 50)
    private Long id;

    @Column(nullable = false, length = 255)
    private String title;

    @Lob
    @Column(nullable = false)
    private String content;

    @Column(length = 500)
    private String summary;

    @Column(name = "author_id", nullable = false, length = 255)
    private String authorId;

    @Column(name = "author_name", length = 255)
    private String authorName;

    @Column(nullable = false)
    @Builder.Default
    private Boolean published = false;

    @OneToMany(
        mappedBy    = "post",
        cascade     = CascadeType.ALL,
        orphanRemoval = true,
        fetch       = FetchType.LAZY
    )
    @Builder.Default
    @JsonIgnore
    private List<Comment> comments = new ArrayList<>();

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
```

> **¿Por qué `@Lob` en content?** Un post puede ser largo. `@Lob` mapea a `CLOB` en Oracle,
> que soporta hasta 4 GB de texto. Para `title` y `summary` usamos `VARCHAR2` acotado.

> **¿Por qué `allocationSize = 50` en la secuencia?** Hibernate reserva bloques de 50 IDs de
> golpe para reducir los viajes a la base de datos al insertar registros en ráfaga.

---

## 1.7 Entidad Comment

> 📁 `backend/src/main/java/com/ociblog/model/Comment.java`

```java
package com.ociblog.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.Instant;

@Entity
@Table(
    name = "comments",
    indexes = @Index(name = "idx_comments_post", columnList = "post_id")
)
@EntityListeners(AuditingEntityListener.class)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Comment {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "comment_seq")
    @SequenceGenerator(name = "comment_seq", sequenceName = "comment_seq", allocationSize = 50)
    private Long id;

    @Column(nullable = false, length = 2000)
    private String content;

    @Column(name = "author_id", nullable = false, length = 255)
    private String authorId;

    @Column(name = "author_name", length = 255)
    private String authorName;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "post_id", nullable = false)
    @JsonIgnore
    private Post post;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
```

---

## 1.8 Repositorios

> 📁 `backend/src/main/java/com/ociblog/repository/PostRepository.java`

```java
package com.ociblog.repository;

import com.ociblog.model.Post;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface PostRepository extends JpaRepository<Post, Long> {

    Page<Post> findByPublishedTrueOrderByCreatedAtDesc(Pageable pageable);

    Optional<Post> findByIdAndPublishedTrue(Long id);

    Page<Post> findByAuthorIdOrderByCreatedAtDesc(String authorId, Pageable pageable);

    @Query("""
           SELECT p FROM Post p
           WHERE (:published IS NULL OR p.published = :published)
           ORDER BY p.createdAt DESC
           """)
    Page<Post> findAllWithFilter(@Param("published") Boolean published, Pageable pageable);
}
```

> 📁 `backend/src/main/java/com/ociblog/repository/CommentRepository.java`

```java
package com.ociblog.repository;

import com.ociblog.model.Comment;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CommentRepository extends JpaRepository<Comment, Long> {

    Page<Comment> findByPostIdOrderByCreatedAtAsc(Long postId, Pageable pageable);
}
```

---

## 1.9 DTOs de entrada

> 📁 `backend/src/main/java/com/ociblog/dto/PostRequest.java`

```java
package com.ociblog.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PostRequest(
    @NotBlank String title,
    @NotBlank String content,
    @Size(max = 500) String summary,
    Boolean published
) {}
```

> 📁 `backend/src/main/java/com/ociblog/dto/CommentRequest.java`

```java
package com.ociblog.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CommentRequest(
    @NotBlank @Size(max = 2000) String content
) {}
```

> **¿Por qué `record`?** Los records de Java 16+ son clases inmutables con `equals`, `hashCode`
> y `toString` generados automáticamente. Son perfectos para DTOs: concisos y sin boilerplate.

---

## 1.10 PostService

> 📁 `backend/src/main/java/com/ociblog/service/PostService.java`

```java
package com.ociblog.service;

import com.ociblog.dto.PostRequest;
import com.ociblog.model.Post;
import com.ociblog.repository.PostRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PostService {

    private final PostRepository postRepository;

    // ----- Lectura pública -----

    public Page<Post> getPublishedPosts(int page, int size) {
        Pageable pageable = PageRequest.of(page, size);
        return postRepository.findByPublishedTrueOrderByCreatedAtDesc(pageable);
    }

    public Post getPublishedPost(Long id) {
        return postRepository.findByIdAndPublishedTrue(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Post no encontrado"));
    }

    // ----- Lectura con filtro (para admins) -----

    public Page<Post> getAllPosts(Boolean published, int page, int size) {
        Pageable pageable = PageRequest.of(page, size);
        return postRepository.findAllWithFilter(published, pageable);
    }

    public Page<Post> getMyPosts(String authorId, int page, int size) {
        Pageable pageable = PageRequest.of(page, size);
        return postRepository.findByAuthorIdOrderByCreatedAtDesc(authorId, pageable);
    }

    // ----- Escritura -----

    @Transactional
    public Post createPost(PostRequest request, String authorId, String authorName) {
        Post post = Post.builder()
            .title(request.title())
            .content(request.content())
            .summary(request.summary())
            .authorId(authorId)
            .authorName(authorName)
            .published(request.published() != null ? request.published() : false)
            .build();
        return postRepository.save(post);
    }

    @Transactional
    public Post updatePost(Long id, PostRequest request, String requesterId, boolean isAdmin) {
        Post post = postRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Post no encontrado"));

        if (!isAdmin && !post.getAuthorId().equals(requesterId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No puedes editar este post");
        }

        post.setTitle(request.title());
        post.setContent(request.content());
        post.setSummary(request.summary());
        if (request.published() != null) {
            post.setPublished(request.published());
        }
        return postRepository.save(post);
    }

    @Transactional
    public void deletePost(Long id, String requesterId, boolean isAdmin) {
        Post post = postRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Post no encontrado"));

        if (!isAdmin && !post.getAuthorId().equals(requesterId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No puedes eliminar este post");
        }

        postRepository.delete(post);
    }

    // ----- Helper -----

    private String extractAuthorName(org.springframework.security.oauth2.jwt.Jwt jwt) {
        String name = jwt.getClaimAsString("name");
        if (name != null && !name.isBlank()) return name;
        String preferred = jwt.getClaimAsString("preferred_username");
        if (preferred != null && !preferred.isBlank()) return preferred;
        return jwt.getClaimAsString("email");
    }
}
```

---

## 1.11 CommentService

> 📁 `backend/src/main/java/com/ociblog/service/CommentService.java`

```java
package com.ociblog.service;

import com.ociblog.dto.CommentRequest;
import com.ociblog.model.Comment;
import com.ociblog.model.Post;
import com.ociblog.repository.CommentRepository;
import com.ociblog.repository.PostRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CommentService {

    private final CommentRepository commentRepository;
    private final PostRepository    postRepository;

    public Page<Comment> getByPostId(Long postId, int page, int size) {
        return commentRepository.findByPostIdOrderByCreatedAtAsc(postId, PageRequest.of(page, size));
    }

    @Transactional
    public Comment addComment(Long postId, CommentRequest request,
                              String authorId, String authorName) {
        Post post = postRepository.findByIdAndPublishedTrue(postId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Post no encontrado"));

        Comment comment = Comment.builder()
            .content(request.content())
            .authorId(authorId)
            .authorName(authorName)
            .post(post)
            .build();

        return commentRepository.save(comment);
    }

    @Transactional
    public void deleteComment(Long commentId, String requesterId, boolean isAdmin) {
        Comment comment = commentRepository.findById(commentId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Comentario no encontrado"));

        if (!isAdmin && !comment.getAuthorId().equals(requesterId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No puedes eliminar este comentario");
        }

        commentRepository.delete(comment);
    }
}
```

---

## 1.12 PostController (versión Día 1 — sin seguridad)

> 📁 `backend/src/main/java/com/ociblog/controller/PostController.java`

> **¿Por qué sin `@PreAuthorize` hoy?** En el Día 1 no tenemos Spring Security en el classpath.
> Todos los endpoints son públicos para poder probarlos con `curl`. En el Día 2 añadiremos
> la capa de seguridad y restringiremos los métodos de escritura.

```java
package com.ociblog.controller;

import com.ociblog.dto.PostRequest;
import com.ociblog.model.Post;
import com.ociblog.service.PostService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/posts")
@RequiredArgsConstructor
public class PostController {

    private final PostService postService;

    // Listado público paginado
    @GetMapping
    public Page<Post> listPublished(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "10") int size
    ) {
        return postService.getPublishedPosts(page, size);
    }

    // Detalle público de un post
    @GetMapping("/{id}")
    public Post getPost(@PathVariable Long id) {
        return postService.getPublishedPost(id);
    }

    // Crear post — en Día 1 usamos un autor estático; en Día 2 vendrá del JWT
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Post createPost(@Valid @RequestBody PostRequest request) {
        // Por ahora simplificamos el autor; en el Día 2 usaremos jwt.getSubject()
        return postService.createPost(request, "autor-local-01", "Estudiante Local");
    }

    // Actualizar post
    @PutMapping("/{id}")
    public Post updatePost(
        @PathVariable Long id,
        @Valid @RequestBody PostRequest request
    ) {
        // isAdmin = true para facilitar las pruebas locales sin autenticación
        return postService.updatePost(id, request, "autor-local-01", true);
    }

    // Eliminar post
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePost(@PathVariable Long id) {
        postService.deletePost(id, "autor-local-01", true);
    }
}
```

---

## 1.13 CommentController (versión Día 1 — sin seguridad)

> 📁 `backend/src/main/java/com/ociblog/controller/CommentController.java`

```java
package com.ociblog.controller;

import com.ociblog.dto.CommentRequest;
import com.ociblog.model.Comment;
import com.ociblog.service.CommentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/posts/{postId}/comments")
@RequiredArgsConstructor
public class CommentController {

    private final CommentService commentService;

    @GetMapping
    public Page<Comment> getComments(
        @PathVariable Long postId,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        return commentService.getByPostId(postId, page, size);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Comment addComment(
        @PathVariable Long postId,
        @Valid @RequestBody CommentRequest request
    ) {
        // En el Día 2 usaremos el JWT real
        return commentService.addComment(postId, request, "autor-local-01", "Estudiante Local");
    }

    @DeleteMapping("/{commentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteComment(
        @PathVariable Long postId,
        @PathVariable Long commentId
    ) {
        commentService.deleteComment(commentId, "autor-local-01", true);
    }
}
```

---

## ✅ Checkpoint — Día 1

Arranca el backend:

```bash
cd backend
mvn spring-boot:run
```

Deberías ver en la consola algo como:

```
Started OciBlogApplication in 4.3 seconds
```

Prueba los endpoints:

```bash
# 1. Crear un post
curl -s -X POST localhost:8080/api/posts \
  -H "Content-Type: application/json" \
  -d '{"title":"Mi primer post","content":"Hola mundo desde el lab","published":true}' \
  | python3 -m json.tool

# 2. Listar posts publicados
curl -s localhost:8080/api/posts | python3 -m json.tool

# 3. Ver un post por ID (reemplaza 1 con el id que devolvió el paso 1)
curl -s localhost:8080/api/posts/1 | python3 -m json.tool

# 4. Crear un comentario
curl -s -X POST localhost:8080/api/posts/1/comments \
  -H "Content-Type: application/json" \
  -d '{"content":"Qué buen post!"}' \
  | python3 -m json.tool

# 5. Listar comentarios
curl -s localhost:8080/api/posts/1/comments | python3 -m json.tool

# 6. Eliminar el post
curl -s -o /dev/null -w "%{http_code}" -X DELETE localhost:8080/api/posts/1
# Debe devolver 204
```

**Errores comunes en el Día 1**

| Síntoma | Causa probable | Solución |
|---|---|---|
| `Connection refused 1521` | Oracle Docker no levantó | `docker logs oracle-free` — espera a "DATABASE IS READY" |
| `ORA-01031: insufficient privileges` | Usuario mal configurado | Repite los GRANT del paso 1.4 |
| `Field 'author_id' doesn't have a default` | Falta `nullable=false` sin valor | Verifica que pasas `"autor-local-01"` en el controller |
| `Port 8080 already in use` | Proceso previo | `lsof -i :8080` y mata el proceso |

---

# Día 2 — Spring Security: JWT + Roles

## ¿Qué vas a construir hoy?

Añades Spring Security al backend para que los endpoints de escritura (POST, PUT, DELETE) requieran
un JWT válido emitido por Keycloak (local) o OCI IAM (producción). Al terminar, `curl` sin token
recibirá un 401, y solo los usuarios con el rol `ADMIN` podrán crear o borrar posts.

---

## 2.1 Levantar Keycloak para desarrollo local

Crea el archivo de configuración:

> 📁 `docker-compose.yml` (en la raíz del proyecto)

```yaml
version: "3.9"

services:
  keycloak:
    image: quay.io/keycloak/keycloak:24.0
    command: start-dev --import-realm
    environment:
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
    ports:
      - "8180:8080"
    volumes:
      - ./keycloak:/opt/keycloak/data/import
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:8080/health/ready || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 12

  oracle:
    image: container-registry.oracle.com/database/free:latest
    environment:
      ORACLE_PASSWORD: Oracle123
    ports:
      - "1521:1521"
    volumes:
      - oracle-data:/opt/oracle/oradata

volumes:
  oracle-data:
```

> 📁 `keycloak/realm-export.json`

```json
{
  "realm": "oci-blog",
  "enabled": true,
  "registrationAllowed": true,
  "registrationEmailAsUsername": false,
  "clients": [
    {
      "clientId": "oci-blog-app",
      "enabled": true,
      "publicClient": true,
      "redirectUris": ["http://localhost:5173/*", "http://localhost:3000/*"],
      "webOrigins": ["http://localhost:5173", "http://localhost:3000"],
      "standardFlowEnabled": true,
      "directAccessGrantsEnabled": false,
      "attributes": {
        "pkce.code.challenge.method": "S256"
      }
    },
    {
      "clientId": "oci-blog-backend",
      "enabled": true,
      "publicClient": false,
      "bearerOnly": true,
      "serviceAccountsEnabled": false
    }
  ],
  "roles": {
    "realm": [
      { "name": "ADMIN",  "description": "Puede crear y borrar posts" },
      { "name": "READER", "description": "Solo lectura" }
    ]
  },
  "groups": [
    {
      "name": "blog-admins",
      "realmRoles": ["ADMIN"]
    }
  ],
  "users": [
    {
      "username": "admin-user",
      "enabled": true,
      "credentials": [{ "type": "password", "value": "<TU_PASSWORD_ADMIN>", "temporary": false }],
      "realmRoles": ["ADMIN"]
    },
    {
      "username": "lector-user",
      "enabled": true,
      "credentials": [{ "type": "password", "value": "<TU_PASSWORD_LECTOR>", "temporary": false }],
      "realmRoles": ["READER"]
    }
  ]
}
```

Levanta los servicios:

```bash
docker compose up -d
```

---

## 2.2 Agregar dependencias de seguridad al pom.xml

> 📁 `backend/pom.xml`

Agrega dentro de `<dependencies>`:

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-oauth2-resource-server</artifactId>
</dependency>
```

---

## 2.3 JwtAuthConverter — extraer roles del JWT

> 📁 `backend/src/main/java/com/ociblog/security/JwtAuthConverter.java`

> **¿Por qué esta clase?** Keycloak pone los roles en `realm_access.roles`, OCI IAM los pone
> en `groups`. Esta clase normaliza ambas fuentes a `ROLE_ADMIN` / `ROLE_READER` que Spring
> Security entiende nativamente.

```java
package com.ociblog.security;

import org.springframework.core.convert.converter.Converter;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Component
public class JwtAuthConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    private final JwtGrantedAuthoritiesConverter defaultConverter =
        new JwtGrantedAuthoritiesConverter();

    @Override
    public AbstractAuthenticationToken convert(@NonNull Jwt jwt) {
        Collection<GrantedAuthority> authorities = Stream.concat(
            defaultConverter.convert(jwt).stream(),
            extractRoles(jwt).stream()
        ).collect(Collectors.toSet());

        return new JwtAuthenticationToken(jwt, authorities, jwt.getSubject());
    }

    private Collection<GrantedAuthority> extractRoles(Jwt jwt) {
        Set<String> roles = new HashSet<>();

        // Keycloak: realm_access.roles
        Map<String, Object> realmAccess = jwt.getClaimAsMap("realm_access");
        if (realmAccess != null) {
            Object realmRoles = realmAccess.get("roles");
            if (realmRoles instanceof List<?> list) {
                list.stream()
                    .filter(String.class::isInstance)
                    .map(String.class::cast)
                    .forEach(roles::add);
            }
        }

        // OCI IAM / IDCS: groups claim
        List<String> groups = jwt.getClaimAsStringList("groups");
        if (groups != null) {
            groups.stream()
                .map(g -> g.replaceAll("^.*/", ""))   // solo el nombre final
                .forEach(roles::add);
        }

        return roles.stream()
            .map(r -> new SimpleGrantedAuthority("ROLE_" + r.toUpperCase()))
            .collect(Collectors.toSet());
    }
}
```

---

## 2.4 SecurityConfig

> 📁 `backend/src/main/java/com/ociblog/security/SecurityConfig.java`

```java
package com.ociblog.security;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthConverter jwtAuthConverter;

    @Value("${app.cors.allowed-origins}")
    private String allowedOrigins;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(sm -> sm
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .cors(cors -> cors.configurationSource(corsSource()))
            .authorizeHttpRequests(auth -> auth
                // Actuator — solo health público
                .requestMatchers("/actuator/health").permitAll()
                // GET de posts y comentarios: público
                .requestMatchers(HttpMethod.GET, "/api/posts/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/posts/*/comments").permitAll()
                // Todo lo demás requiere autenticación; los roles se comprueban con @PreAuthorize
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthConverter))
            );

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of(allowedOrigins.split(",")));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
```

---

## 2.5 Actualizar application.yml con la sección de seguridad

> 📁 `backend/src/main/resources/application.yml`

Agrega esta sección al YAML existente:

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: ${OCI_IAM_ISSUER_URI:http://localhost:8180/realms/oci-blog}
```

---

## 2.6 Actualizar PostController con @PreAuthorize

> 📁 `backend/src/main/java/com/ociblog/controller/PostController.java`

Reemplaza el controller completo por esta versión con seguridad:

```java
package com.ociblog.controller;

import com.ociblog.dto.PostRequest;
import com.ociblog.model.Post;
import com.ociblog.service.PostService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/posts")
@RequiredArgsConstructor
public class PostController {

    private final PostService postService;

    @GetMapping
    public Page<Post> listPublished(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "10") int size
    ) {
        return postService.getPublishedPosts(page, size);
    }

    @GetMapping("/{id}")
    public Post getPost(@PathVariable Long id) {
        return postService.getPublishedPost(id);
    }

    // Solo admins pueden crear posts
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('ADMIN')")
    public Post createPost(
        @Valid @RequestBody PostRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        String authorName = extractName(jwt);
        return postService.createPost(request, jwt.getSubject(), authorName);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public Post updatePost(
        @PathVariable Long id,
        @Valid @RequestBody PostRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        boolean isAdmin = true; // garantizado por @PreAuthorize
        return postService.updatePost(id, request, jwt.getSubject(), isAdmin);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('ADMIN')")
    public void deletePost(
        @PathVariable Long id,
        @AuthenticationPrincipal Jwt jwt
    ) {
        postService.deletePost(id, jwt.getSubject(), true);
    }

    // Panel de administración — todos los posts, con filtro de estado
    @GetMapping("/admin")
    @PreAuthorize("hasRole('ADMIN')")
    public Page<Post> adminList(
        @RequestParam(required = false) Boolean published,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        return postService.getAllPosts(published, page, size);
    }

    private String extractName(Jwt jwt) {
        String name = jwt.getClaimAsString("name");
        if (name != null && !name.isBlank()) return name;
        String preferred = jwt.getClaimAsString("preferred_username");
        if (preferred != null && !preferred.isBlank()) return preferred;
        return jwt.getClaimAsString("email");
    }
}
```

---

## 2.7 Actualizar CommentController con seguridad

> 📁 `backend/src/main/java/com/ociblog/controller/CommentController.java`

```java
package com.ociblog.controller;

import com.ociblog.dto.CommentRequest;
import com.ociblog.model.Comment;
import com.ociblog.service.CommentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/posts/{postId}/comments")
@RequiredArgsConstructor
public class CommentController {

    private final CommentService commentService;

    @GetMapping
    public Page<Comment> getComments(
        @PathVariable Long postId,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        return commentService.getByPostId(postId, page, size);
    }

    // Cualquier usuario autenticado puede comentar
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("isAuthenticated()")
    public Comment addComment(
        @PathVariable Long postId,
        @Valid @RequestBody CommentRequest request,
        @AuthenticationPrincipal Jwt jwt
    ) {
        String authorName = jwt.getClaimAsString("name") != null
            ? jwt.getClaimAsString("name")
            : jwt.getClaimAsString("preferred_username");
        return commentService.addComment(postId, request, jwt.getSubject(), authorName);
    }

    // Solo admins pueden borrar cualquier comentario
    @DeleteMapping("/{commentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('ADMIN')")
    public void deleteComment(
        @PathVariable Long postId,
        @PathVariable Long commentId,
        @AuthenticationPrincipal Jwt jwt
    ) {
        commentService.deleteComment(commentId, jwt.getSubject(), true);
    }
}
```

---

## ✅ Checkpoint — Día 2

```bash
# 1. Reinicia el backend
mvn spring-boot:run

# 2. GET público → 200
curl -s -o /dev/null -w "%{http_code}" localhost:8080/api/posts
# Esperado: 200

# 3. POST sin token → 401
curl -s -o /dev/null -w "%{http_code}" -X POST localhost:8080/api/posts \
  -H "Content-Type: application/json" \
  -d '{"title":"test","content":"test"}'
# Esperado: 401

# 4. Obtén un token de Keycloak para el admin-user
TOKEN=$(curl -s -X POST \
  http://localhost:8180/realms/oci-blog/protocol/openid-connect/token \
  -d "grant_type=password&client_id=oci-blog-app&username=admin-user&password=<TU_PASSWORD_ADMIN>" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 5. POST con token → 201
curl -s -o /dev/null -w "%{http_code}" -X POST localhost:8080/api/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Post con auth","content":"Funciona!","published":true}'
# Esperado: 201

# 6. POST con token de lector → 403
TOKEN_READER=$(curl -s -X POST \
  http://localhost:8180/realms/oci-blog/protocol/openid-connect/token \
  -d "grant_type=password&client_id=oci-blog-app&username=lector-user&password=<TU_PASSWORD_LECTOR>" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s -o /dev/null -w "%{http_code}" -X POST localhost:8080/api/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_READER" \
  -d '{"title":"No debería funcionar","content":"Soy lector"}'
# Esperado: 403
```

**Errores comunes en el Día 2**

| Síntoma | Causa | Solución |
|---|---|---|
| `401` incluso con token | `issuer-uri` incorrecta | Verifica `http://localhost:8180/realms/oci-blog/.well-known/openid-configuration` en el navegador |
| `403` para admin | El rol no llega en el JWT | Decodifica el token en [jwt.io](https://jwt.io) y verifica `realm_access.roles` |
| Keycloak no inicia | Puerto 8180 ocupado | Cambia el mapeo en docker-compose.yml |

---

# Día 3 — Frontend: React + OIDC

## ¿Qué vas a construir hoy?

Creas el frontend con React, Vite y TypeScript. Al terminar verás el listado de posts del backend
en el navegador, podrás iniciar sesión con Keycloak, y el estado del usuario persiste entre
recargas de página.

---

## 3.1 Crear el proyecto con Vite

```bash
# En la raíz del monorepo
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install react-router-dom axios react-oidc-context oidc-client-ts
```

---

## 3.2 vite.config.ts

> 📁 `frontend/vite.config.ts`

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
```

> **¿Por qué el proxy?** Evita problemas de CORS durante el desarrollo: el navegador habla
> siempre con Vite (5173) que reenvía internamente al backend (8080). En producción el nginx
> o un API Gateway cumple el mismo rol.

---

## 3.3 Variables de entorno

> 📁 `frontend/.env.local`

```env
VITE_OCI_IAM_AUTHORITY=http://localhost:8180/realms/oci-blog
VITE_OCI_IAM_CLIENT_ID=oci-blog-app
VITE_API_BASE_URL=http://localhost:8080/api
VITE_REDIRECT_URI=http://localhost:5173/callback
VITE_POST_LOGOUT_REDIRECT_URI=http://localhost:5173/
VITE_OAUTH_SCOPE=openid profile email
```

Agrega `.env.local` al `.gitignore`:

```bash
echo ".env.local" >> .gitignore
```

---

## 3.4 Tipos TypeScript

> 📁 `frontend/src/types/index.ts`

```typescript
export interface Post {
  id: number
  title: string
  content: string
  summary?: string
  authorId: string
  authorName?: string
  published: boolean
  createdAt: string
  updatedAt: string
}

export interface Comment {
  id: number
  content: string
  authorId: string
  authorName?: string
  createdAt: string
}

export interface PostRequest {
  title: string
  content: string
  summary?: string
  published?: boolean
}

export interface CommentRequest {
  content: string
}

export interface Page<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
  first: boolean
  last: boolean
}
```

---

## 3.5 Configuración OIDC

> 📁 `frontend/src/auth/authConfig.ts`

> **¿Por qué PKCE?** El flujo PKCE (Proof Key for Code Exchange) es el estándar para SPAs.
> No se usa ningún `client_secret` — el proof es un code challenge generado en el navegador.
> `react-oidc-context` lo implementa automáticamente con `response_type: 'code'`.

```typescript
import { WebStorageStateStore } from 'oidc-client-ts'
import type { UserManagerSettings } from 'oidc-client-ts'

export const oidcConfig: UserManagerSettings = {
  authority:                import.meta.env.VITE_OCI_IAM_AUTHORITY,
  client_id:                import.meta.env.VITE_OCI_IAM_CLIENT_ID,
  redirect_uri:             import.meta.env.VITE_REDIRECT_URI,
  post_logout_redirect_uri: import.meta.env.VITE_POST_LOGOUT_REDIRECT_URI,
  scope:                    import.meta.env.VITE_OAUTH_SCOPE ?? 'openid profile email',
  response_type:            'code',
  userStore:                new WebStorageStateStore({ store: window.sessionStorage }),
  automaticSilentRenew:     true,
  revokeTokensOnSignout:    false,
  monitorSession:           false,
  loadUserInfo:             true,
}
```

---

## 3.6 Servicio Axios

> 📁 `frontend/src/services/api.ts`

> **Dos interceptores importantes:**
> - **Request**: adjunta el token solo si existe y **no ha expirado** (`!user.expired`). Así los endpoints públicos siguen funcionando aunque el token venza sin que Spring Security los bloquee.
> - **Response**: si el backend devuelve `401`, invoca `onAuthError` para redirigir al login automáticamente.

```typescript
import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import { User } from 'oidc-client-ts'
import type { Post, PostRequest, CommentRequest, Comment, Page } from '../types'

const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
})

/**
 * Registra los interceptores de autenticación.
 *
 * Request interceptor: adjunta el Bearer Token solo si el usuario está
 * autenticado Y el token no ha expirado. Si el token venció, no se envía
 * el header — así los endpoints públicos siguen funcionando como anónimos.
 *
 * Response interceptor: si el backend devuelve 401 (token expirado/inválido),
 * invoca onAuthError para que el componente raíz pueda redirigir al login.
 */
export function setupAuthInterceptor(
  getUser: () => User | null,
  onAuthError?: () => void,
): void {
  apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const user = getUser()
    if (user?.access_token && !user.expired) {   // ← no enviar token expirado
      config.headers.Authorization = `Bearer ${user.access_token}`
    }
    return config
  })

  apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401 && onAuthError) {
        onAuthError()   // ← redirige al login si el backend rechaza el token
      }
      return Promise.reject(error)
    }
  )
}

// ─── Posts API ─────────────────────────────────────────────────────────────

export const postsApi = {
  getPublished: (page = 0, size = 10): Promise<Page<Post>> =>
    apiClient.get<Page<Post>>('/posts', { params: { page, size } }).then(r => r.data),

  getById: (id: number): Promise<Post> =>
    apiClient.get<Post>(`/posts/${id}`).then(r => r.data),

  getAll: (page = 0, size = 10, published?: boolean): Promise<Page<Post>> =>
    apiClient.get<Page<Post>>('/posts/admin/all', {
      params: { page, size, ...(published !== undefined && { published }) },
    }).then(r => r.data),

  create: (data: PostRequest): Promise<Post> =>
    apiClient.post<Post>('/posts', data).then(r => r.data),

  update: (id: number, data: PostRequest): Promise<Post> =>
    apiClient.put<Post>(`/posts/${id}`, data).then(r => r.data),

  delete: (id: number): Promise<void> =>
    apiClient.delete(`/posts/${id}`).then(() => undefined),
}

// ─── Comments API ──────────────────────────────────────────────────────────

export const commentsApi = {
  getByPost: (postId: number, page = 0, size = 20): Promise<Page<Comment>> =>
    apiClient.get<Page<Comment>>(`/posts/${postId}/comments`, {
      params: { page, size },
    }).then(r => r.data),

  add: (postId: number, data: CommentRequest): Promise<Comment> =>
    apiClient.post<Comment>(`/posts/${postId}/comments`, data).then(r => r.data),

  delete: (postId: number, commentId: number): Promise<void> =>
    apiClient.delete(`/posts/${postId}/comments/${commentId}`).then(() => undefined),
}
```

---

## 3.7 main.tsx

> 📁 `frontend/src/main.tsx`

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthProvider } from 'react-oidc-context'
import { BrowserRouter } from 'react-router-dom'
import { oidcConfig } from './auth/authConfig'
import { setAuthToken } from './services/api'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider
      {...oidcConfig}
      onSigninCallback={() => {
        // Limpia los parámetros OIDC de la URL tras el callback
        window.history.replaceState({}, document.title, window.location.pathname)
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
)
```

---

## 3.8 Navbar

> 📁 `frontend/src/components/Navbar.tsx`

```typescript
import { useAuth } from 'react-oidc-context'
import { Link } from 'react-router-dom'
import { setAuthToken } from '../services/api'

export default function Navbar() {
  const auth = useAuth()

  // Sincroniza el token de Axios con el estado de autenticación
  if (auth.user?.access_token) {
    setAuthToken(auth.user.access_token)
  } else {
    setAuthToken(null)
  }

  const roles: string[] = auth.user?.profile?.['realm_access']
    ? (auth.user.profile['realm_access'] as { roles: string[] }).roles
    : []
  const isAdmin = roles.includes('ADMIN')

  const handleLogin = () => auth.signinRedirect()

  const handleLogout = () =>
    auth.signoutRedirect({ post_logout_redirect_uri: import.meta.env.VITE_POST_LOGOUT_REDIRECT_URI })

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">OCI Blog</Link>

      <div className="navbar-right">
        {auth.isAuthenticated ? (
          <>
            <span className="navbar-user">
              {auth.user?.profile.name ?? auth.user?.profile.preferred_username}
              {isAdmin && <span className="badge-admin">Admin</span>}
            </span>
            {isAdmin && (
              <Link to="/posts/new" className="btn btn-primary btn-sm">
                Nuevo post
              </Link>
            )}
            <button className="btn btn-outline btn-sm" onClick={handleLogout}>
              Cerrar sesión
            </button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={handleLogin}>
            Iniciar sesión
          </button>
        )}
      </div>
    </nav>
  )
}
```

---

## 3.9 PostCard

> 📁 `frontend/src/components/PostCard.tsx`

```typescript
import { Link } from 'react-router-dom'
import type { Post } from '../types'

interface Props {
  post: Post
}

export default function PostCard({ post }: Props) {
  const date = new Date(post.createdAt).toLocaleDateString('es-ES', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <article className="post-card">
      <h2 className="post-card-title">
        <Link to={`/posts/${post.id}`}>{post.title}</Link>
      </h2>
      {post.summary && <p className="post-card-summary">{post.summary}</p>}
      <footer className="post-card-meta">
        <span>{post.authorName ?? 'Autor desconocido'}</span>
        <span>{date}</span>
      </footer>
    </article>
  )
}
```

---

## 3.10 HomePage

> 📁 `frontend/src/pages/HomePage.tsx`

```typescript
import { useEffect, useState } from 'react'
import { postsApi } from '../services/api'
import PostCard from '../components/PostCard'
import type { Post } from '../types'

export default function HomePage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  useEffect(() => {
    setLoading(true)
    postsApi.list(page)
      .then(data => {
        setPosts(data.content)
        setTotalPages(data.totalPages)
      })
      .catch(() => setError('No se pudieron cargar los posts'))
      .finally(() => setLoading(false))
  }, [page])

  if (loading) return <div className="loading">Cargando...</div>
  if (error)   return <div className="error">{error}</div>

  return (
    <main className="container">
      <h1 className="page-title">Últimas entradas</h1>

      {posts.length === 0 ? (
        <p className="empty">No hay posts publicados todavía.</p>
      ) : (
        <div className="post-list">
          {posts.map(post => <PostCard key={post.id} post={post} />)}
        </div>
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
          >
            ← Anterior
          </button>
          <span>{page + 1} / {totalPages}</span>
          <button
            disabled={page + 1 >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            Siguiente →
          </button>
        </div>
      )}
    </main>
  )
}
```

---

## 3.11 App.tsx (versión Día 3)

> 📁 `frontend/src/App.tsx`

En el Día 3 solo necesitas la ruta principal y el callback. En el Día 4 añadirás las demás rutas.

```typescript
import { Routes, Route } from 'react-router-dom'
import { useAuth } from 'react-oidc-context'
import Navbar from './components/Navbar'
import HomePage from './pages/HomePage'

// Página de callback OIDC — maneja el redirect de vuelta desde el IdP
function CallbackPage() {
  const auth = useAuth()

  if (auth.isLoading) return <div className="loading">Procesando autenticación...</div>
  if (auth.error)    return <div className="error">Error: {auth.error.message}</div>

  // onSigninCallback en main.tsx limpia la URL; aquí solo mostramos un estado temporal
  return <div className="loading">Redirigiendo...</div>
}

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/"         element={<HomePage />} />
        <Route path="/callback" element={<CallbackPage />} />
      </Routes>
    </>
  )
}
```

---

## ✅ Checkpoint — Día 3

```bash
# En la carpeta frontend
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173). Deberías ver:

1. La barra de navegación con el botón "Iniciar sesión"
2. El listado de posts del backend (si creaste alguno en el Día 2)
3. Al hacer clic en "Iniciar sesión" te redirige a Keycloak
4. Tras el login vuelves a la app con tu nombre en la navbar

**Errores comunes en el Día 3**

| Síntoma | Causa | Solución |
|---|---|---|
| Pantalla en blanco con error CORS | Proxy de Vite no activo | Verifica que `vite.config.ts` tiene el proxy en `/api` |
| Loop infinito de redirects | `redirect_uri` no registrada en Keycloak | En Keycloak Admin → Clients → oci-blog-app → Valid redirect URIs: `http://localhost:5173/*` |
| "invalid_client" en Keycloak | `client_id` en `.env.local` no coincide | Debe ser `oci-blog-app` exactamente |

---

# Día 4 — Frontend completo + Docker Compose

## ¿Qué vas a construir hoy?

Completas todas las páginas del frontend (detalle de post, formulario de creación/edición,
rutas protegidas) y dockerizas tanto el backend como el frontend. Al terminar podrás levantar
toda la aplicación con un solo comando `docker compose up`.

---

## 4.1 index.css — Estilos base

> 📁 `frontend/src/index.css`

```css
/* Variables de diseño */
:root {
  --color-primary:    #0066cc;
  --color-primary-dark: #004d99;
  --color-text:       #1a1a1a;
  --color-text-light: #666666;
  --color-bg:         #ffffff;
  --color-bg-secondary: #f5f5f5;
  --color-border:     #e0e0e0;
  --color-error:      #cc0000;
  --color-success:    #007700;
  --radius:           6px;
  --shadow:           0 1px 3px rgba(0,0,0,.12);
  --max-width:        860px;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: system-ui, -apple-system, sans-serif;
  color: var(--color-text);
  background: var(--color-bg);
  line-height: 1.6;
}

/* Layout */
.container   { max-width: var(--max-width); margin: 0 auto; padding: 2rem 1rem; }
.page-title  { font-size: 2rem; font-weight: 700; margin-bottom: 1.5rem; }
.loading, .empty { text-align: center; color: var(--color-text-light); padding: 3rem; }
.error { color: var(--color-error); text-align: center; padding: 2rem; }

/* Navbar */
.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: .75rem 1.5rem;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg);
  position: sticky;
  top: 0;
  z-index: 100;
}
.navbar-brand {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-primary);
  text-decoration: none;
}
.navbar-right { display: flex; align-items: center; gap: .75rem; }
.navbar-user  { font-size: .9rem; color: var(--color-text-light); }

/* Botones */
.btn {
  display: inline-flex;
  align-items: center;
  gap: .4rem;
  padding: .5rem 1rem;
  border-radius: var(--radius);
  font-size: .95rem;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  text-decoration: none;
  transition: background .15s, border-color .15s;
}
.btn-primary         { background: var(--color-primary); color: #fff; }
.btn-primary:hover   { background: var(--color-primary-dark); }
.btn-outline         { border-color: var(--color-border); color: var(--color-text); background: transparent; }
.btn-outline:hover   { background: var(--color-bg-secondary); }
.btn-danger          { background: var(--color-error); color: #fff; border: none; }
.btn-danger:hover    { background: #aa0000; }
.btn-sm              { padding: .35rem .75rem; font-size: .85rem; }
.btn:disabled        { opacity: .5; cursor: not-allowed; }

/* Badge admin */
.badge-admin {
  display: inline-block;
  background: var(--color-primary);
  color: #fff;
  font-size: .7rem;
  font-weight: 700;
  padding: .1rem .4rem;
  border-radius: 3px;
  margin-left: .4rem;
  vertical-align: middle;
}

/* Lista de posts */
.post-list { display: flex; flex-direction: column; gap: 1.25rem; }
.post-card {
  padding: 1.25rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  background: var(--color-bg);
}
.post-card-title { font-size: 1.3rem; margin-bottom: .4rem; }
.post-card-title a { color: var(--color-text); text-decoration: none; }
.post-card-title a:hover { color: var(--color-primary); }
.post-card-summary { color: var(--color-text-light); font-size: .95rem; margin-bottom: .75rem; }
.post-card-meta { display: flex; gap: 1rem; font-size: .85rem; color: var(--color-text-light); }

/* Detalle de post */
.post-detail .post-header    { margin-bottom: 1.5rem; }
.post-detail .post-title     { font-size: 2rem; font-weight: 700; margin-bottom: .5rem; }
.post-detail .post-meta      { font-size: .9rem; color: var(--color-text-light); margin-bottom: 1rem; }
.post-detail .post-content   { line-height: 1.8; white-space: pre-wrap; }
.post-detail .post-actions   { display: flex; gap: .75rem; margin-top: 1.5rem; }

/* Comentarios */
.comments-section            { margin-top: 3rem; border-top: 1px solid var(--color-border); padding-top: 2rem; }
.comments-section h2         { font-size: 1.4rem; margin-bottom: 1rem; }
.comment-item                { padding: 1rem; background: var(--color-bg-secondary); border-radius: var(--radius); margin-bottom: .75rem; }
.comment-content             { margin-bottom: .4rem; }
.comment-meta                { font-size: .8rem; color: var(--color-text-light); }
.comment-form                { display: flex; flex-direction: column; gap: .75rem; margin-top: 1.5rem; }
.comment-form textarea       { padding: .75rem; border: 1px solid var(--color-border); border-radius: var(--radius); font-size: .95rem; resize: vertical; }

/* Formularios */
.form-group   { display: flex; flex-direction: column; gap: .4rem; margin-bottom: 1rem; }
.form-group label { font-weight: 500; font-size: .95rem; }
.form-group input,
.form-group textarea { padding: .6rem .75rem; border: 1px solid var(--color-border); border-radius: var(--radius); font-size: 1rem; }
.form-group input:focus,
.form-group textarea:focus { outline: none; border-color: var(--color-primary); }
.form-actions { display: flex; gap: .75rem; margin-top: 1.5rem; }
.form-error   { color: var(--color-error); font-size: .85rem; }

/* Paginación */
.pagination { display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 2rem; }
```

---

## 4.2 ProtectedRoute

> 📁 `frontend/src/components/ProtectedRoute.tsx`

```typescript
import { useAuth } from 'react-oidc-context'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  requireAdmin?: boolean
}

export default function ProtectedRoute({ children, requireAdmin = false }: Props) {
  const auth = useAuth()

  if (auth.isLoading) return <div className="loading">Cargando...</div>

  if (!auth.isAuthenticated) {
    auth.signinRedirect()
    return <div className="loading">Redirigiendo al login...</div>
  }

  if (requireAdmin) {
    const roles = (auth.user?.profile?.['realm_access'] as { roles?: string[] } | undefined)?.roles ?? []
    if (!roles.includes('ADMIN')) {
      return <div className="error">No tienes permiso para acceder a esta página.</div>
    }
  }

  return <>{children}</>
}
```

---

## 4.3 CallbackPage

> 📁 `frontend/src/pages/CallbackPage.tsx`

```typescript
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from 'react-oidc-context'

export default function CallbackPage() {
  const auth     = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!auth.isLoading && !auth.error) {
      navigate('/', { replace: true })
    }
  }, [auth.isLoading, auth.error, navigate])

  if (auth.isLoading) return <div className="loading">Completando autenticación...</div>
  if (auth.error)     return <div className="error">Error de autenticación: {auth.error.message}</div>

  return null
}
```

---

## 4.4 PostDetailPage

> 📁 `frontend/src/pages/PostDetailPage.tsx`

```typescript
import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from 'react-oidc-context'
import { postsApi, commentsApi } from '../services/api'
import type { Post, Comment, Page } from '../types'

export default function PostDetailPage() {
  const { id }    = useParams<{ id: string }>()
  const navigate  = useNavigate()
  const auth      = useAuth()

  const [post, setPost]       = useState<Post | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting]   = useState(false)

  const roles = (auth.user?.profile?.['realm_access'] as { roles?: string[] } | undefined)?.roles ?? []
  const isAdmin = roles.includes('ADMIN')

  useEffect(() => {
    if (!id) return
    const postId = Number(id)

    Promise.all([
      postsApi.get(postId),
      commentsApi.list(postId),
    ])
      .then(([p, c]) => {
        setPost(p)
        setComments(c.content)
      })
      .catch(() => setError('No se pudo cargar el post'))
      .finally(() => setLoading(false))
  }, [id])

  const handleDeletePost = async () => {
    if (!post || !window.confirm('¿Eliminar este post?')) return
    await postsApi.remove(post.id)
    navigate('/')
  }

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!post || !commentText.trim()) return
    setSubmitting(true)
    try {
      const newComment = await commentsApi.create(post.id, { content: commentText })
      setComments(prev => [...prev, newComment])
      setCommentText('')
    } catch {
      alert('No se pudo publicar el comentario')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteComment = async (commentId: number) => {
    if (!post || !window.confirm('¿Eliminar este comentario?')) return
    await commentsApi.remove(post.id, commentId)
    setComments(prev => prev.filter(c => c.id !== commentId))
  }

  if (loading) return <div className="loading">Cargando...</div>
  if (error)   return <div className="error">{error}</div>
  if (!post)   return <div className="error">Post no encontrado</div>

  const dateCreated = new Date(post.createdAt).toLocaleDateString('es-ES', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <main className="container post-detail">
      <div className="post-header">
        <h1 className="post-title">{post.title}</h1>
        <p className="post-meta">
          Por {post.authorName ?? 'Autor desconocido'} · {dateCreated}
        </p>

        {isAdmin && (
          <div className="post-actions">
            <Link to={`/posts/${post.id}/edit`} className="btn btn-outline btn-sm">
              Editar
            </Link>
            <button className="btn btn-danger btn-sm" onClick={handleDeletePost}>
              Eliminar
            </button>
          </div>
        )}
      </div>

      <div className="post-content">{post.content}</div>

      {/* Comentarios */}
      <section className="comments-section">
        <h2>Comentarios ({comments.length})</h2>

        {comments.map(c => (
          <div key={c.id} className="comment-item">
            <p className="comment-content">{c.content}</p>
            <p className="comment-meta">
              {c.authorName ?? 'Usuario'} · {new Date(c.createdAt).toLocaleDateString('es-ES')}
              {isAdmin && (
                <button
                  className="btn btn-danger btn-sm"
                  style={{ marginLeft: '1rem' }}
                  onClick={() => handleDeleteComment(c.id)}
                >
                  Borrar
                </button>
              )}
            </p>
          </div>
        ))}

        {auth.isAuthenticated ? (
          <form className="comment-form" onSubmit={handleAddComment}>
            <textarea
              rows={4}
              placeholder="Escribe tu comentario..."
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              required
            />
            <div>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Publicando...' : 'Publicar comentario'}
              </button>
            </div>
          </form>
        ) : (
          <p style={{ marginTop: '1rem', color: 'var(--color-text-light)' }}>
            <button className="btn btn-outline" onClick={() => auth.signinRedirect()}>
              Inicia sesión para comentar
            </button>
          </p>
        )}
      </section>
    </main>
  )
}
```

---

## 4.5 PostForm (componente compartido)

> 📁 `frontend/src/components/PostForm.tsx`

```typescript
import { useState } from 'react'
import type { PostRequest, Post } from '../types'

interface Props {
  initial?: Post
  onSubmit: (data: PostRequest) => Promise<void>
  submitLabel?: string
}

export default function PostForm({ initial, onSubmit, submitLabel = 'Guardar' }: Props) {
  const [title,     setTitle]     = useState(initial?.title     ?? '')
  const [content,   setContent]   = useState(initial?.content   ?? '')
  const [summary,   setSummary]   = useState(initial?.summary   ?? '')
  const [published, setPublished] = useState(initial?.published ?? false)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSubmit({ title, content, summary: summary || undefined, published })
    } catch (err: unknown) {
      setError('No se pudo guardar el post. Verifica que tienes los permisos necesarios.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="title">Título *</label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          required
          maxLength={255}
          placeholder="Título del post"
        />
      </div>

      <div className="form-group">
        <label htmlFor="summary">Resumen</label>
        <input
          id="summary"
          type="text"
          value={summary}
          onChange={e => setSummary(e.target.value)}
          maxLength={500}
          placeholder="Descripción breve (opcional)"
        />
      </div>

      <div className="form-group">
        <label htmlFor="content">Contenido *</label>
        <textarea
          id="content"
          rows={12}
          value={content}
          onChange={e => setContent(e.target.value)}
          required
          placeholder="Escribe aquí el contenido del post..."
          style={{ resize: 'vertical' }}
        />
      </div>

      <div className="form-group">
        <label style={{ flexDirection: 'row', gap: '.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={published}
            onChange={e => setPublished(e.target.checked)}
          />
          Publicar inmediatamente
        </label>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Guardando...' : submitLabel}
        </button>
        <button type="button" className="btn btn-outline" onClick={() => history.back()}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
```

---

## 4.6 CreatePostPage y EditPostPage

> 📁 `frontend/src/pages/CreatePostPage.tsx`

```typescript
import { useNavigate } from 'react-router-dom'
import { postsApi } from '../services/api'
import PostForm from '../components/PostForm'
import type { PostRequest } from '../types'

export default function CreatePostPage() {
  const navigate = useNavigate()

  const handleCreate = async (data: PostRequest) => {
    const post = await postsApi.create(data)
    navigate(`/posts/${post.id}`)
  }

  return (
    <main className="container">
      <h1 className="page-title">Nuevo post</h1>
      <PostForm onSubmit={handleCreate} submitLabel="Publicar" />
    </main>
  )
}
```

> 📁 `frontend/src/pages/EditPostPage.tsx`

```typescript
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { postsApi } from '../services/api'
import PostForm from '../components/PostForm'
import type { Post, PostRequest } from '../types'

export default function EditPostPage() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [post, setPost]     = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    postsApi.get(Number(id))
      .then(setPost)
      .finally(() => setLoading(false))
  }, [id])

  const handleUpdate = async (data: PostRequest) => {
    await postsApi.update(Number(id), data)
    navigate(`/posts/${id}`)
  }

  if (loading) return <div className="loading">Cargando...</div>
  if (!post)   return <div className="error">Post no encontrado</div>

  return (
    <main className="container">
      <h1 className="page-title">Editar post</h1>
      <PostForm initial={post} onSubmit={handleUpdate} submitLabel="Guardar cambios" />
    </main>
  )
}
```

---

## 4.7 App.tsx completo (versión Día 4)

> 📁 `frontend/src/App.tsx`

```typescript
import { Routes, Route } from 'react-router-dom'
import Navbar           from './components/Navbar'
import ProtectedRoute   from './components/ProtectedRoute'
import HomePage         from './pages/HomePage'
import PostDetailPage   from './pages/PostDetailPage'
import CreatePostPage   from './pages/CreatePostPage'
import EditPostPage     from './pages/EditPostPage'
import CallbackPage     from './pages/CallbackPage'

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/"               element={<HomePage />} />
        <Route path="/posts/:id"      element={<PostDetailPage />} />
        <Route path="/callback"       element={<CallbackPage />} />

        {/* Rutas protegidas — solo admins */}
        <Route
          path="/posts/new"
          element={
            <ProtectedRoute requireAdmin>
              <CreatePostPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/posts/:id/edit"
          element={
            <ProtectedRoute requireAdmin>
              <EditPostPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  )
}
```

---

## 4.8 Dockerfile para el backend

> 📁 `backend/Dockerfile`

> **¿Por qué multi-stage?** La primera etapa compila con Maven (imagen grande con JDK).
> La segunda etapa solo copia el JAR resultante a una imagen JRE ligera. La imagen final
> es ~200 MB en lugar de ~500 MB.

```dockerfile
# ---- Etapa 1: compilación ----
FROM eclipse-temurin:17-jdk-alpine AS builder
WORKDIR /build

COPY pom.xml .
COPY src ./src

RUN apk add --no-cache maven && \
    mvn -q -DskipTests package

# ---- Etapa 2: runtime ----
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

COPY --from=builder /build/target/oci-blog-backend-*.jar app.jar

# Wallet de Oracle ATP (se monta en producción con un volumen)
RUN mkdir -p /app/wallet

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
```

---

## 4.9 Dockerfile para el frontend

> 📁 `frontend/Dockerfile`

> **¿Por qué ARG para las variables VITE_*?** Vite incrusta las variables de entorno en el
> bundle en tiempo de compilación (`import.meta.env.*`). Por eso deben pasarse como argumentos
> de build de Docker, no como variables de entorno del contenedor en runtime.

```dockerfile
# ---- Etapa 1: build ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Las variables VITE_* se inyectan en tiempo de compilación
ARG VITE_OCI_IAM_AUTHORITY
ARG VITE_OCI_IAM_CLIENT_ID
ARG VITE_REDIRECT_URI
ARG VITE_POST_LOGOUT_REDIRECT_URI
ARG VITE_OAUTH_SCOPE
ARG VITE_API_BASE_URL

ENV VITE_OCI_IAM_AUTHORITY=$VITE_OCI_IAM_AUTHORITY
ENV VITE_OCI_IAM_CLIENT_ID=$VITE_OCI_IAM_CLIENT_ID
ENV VITE_REDIRECT_URI=$VITE_REDIRECT_URI
ENV VITE_POST_LOGOUT_REDIRECT_URI=$VITE_POST_LOGOUT_REDIRECT_URI
ENV VITE_OAUTH_SCOPE=$VITE_OAUTH_SCOPE
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# ---- Etapa 2: nginx ----
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
```

> 📁 `frontend/nginx.conf`

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # Reescribe todas las rutas a index.html para el routing de React
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy hacia el backend
    location /api/ {
        proxy_pass http://backend:8080/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 4.10 docker-compose.yml completo

> 📁 `docker-compose.yml`

```yaml
version: "3.9"

services:

  # ---- Infraestructura base (siempre levanta) ----

  keycloak:
    image: quay.io/keycloak/keycloak:24.0
    command: start-dev --import-realm
    environment:
      KEYCLOAK_ADMIN:          admin
      KEYCLOAK_ADMIN_PASSWORD: admin
    ports:
      - "8180:8080"
    volumes:
      - ./keycloak:/opt/keycloak/data/import
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8080/health/ready || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 15

  oracle:
    image: container-registry.oracle.com/database/free:latest
    environment:
      ORACLE_PASSWORD: Oracle123
    ports:
      - "1521:1521"
    volumes:
      - oracle-data:/opt/oracle/oradata
    healthcheck:
      test: ["CMD-SHELL", "echo 'SELECT 1 FROM DUAL;' | sqlplus -s system/Oracle123@localhost:1521/FREEPDB1 | grep -q '1'"]
      interval: 15s
      timeout: 10s
      retries: 20

  # ---- Aplicación (perfil "full") ----

  backend:
    build: ./backend
    profiles: ["full"]
    ports:
      - "8080:8080"
    environment:
      SPRING_DATASOURCE_URL:      jdbc:oracle:thin:@oracle:1521/FREEPDB1
      SPRING_DATASOURCE_USERNAME: BLOGUSER
      SPRING_DATASOURCE_PASSWORD: <TU_PASSWORD_LOCAL>
      OCI_IAM_ISSUER_URI:         http://keycloak:8080/realms/oci-blog
      CORS_ALLOWED_ORIGINS:       http://localhost:3000
    depends_on:
      oracle:
        condition: service_healthy
      keycloak:
        condition: service_healthy

  frontend:
    build:
      context: ./frontend
      args:
        VITE_OCI_IAM_AUTHORITY:         http://localhost:8180/realms/oci-blog
        VITE_OCI_IAM_CLIENT_ID:         oci-blog-app
        VITE_REDIRECT_URI:              http://localhost:3000/callback
        VITE_POST_LOGOUT_REDIRECT_URI:  http://localhost:3000/
        VITE_OAUTH_SCOPE:               openid profile email
        VITE_API_BASE_URL:              http://localhost:3000/api
    profiles: ["full"]
    ports:
      - "3000:80"
    depends_on:
      - backend

volumes:
  oracle-data:
```

---

## ✅ Checkpoint — Día 4

```bash
# Paso 1: levanta la infraestructura base
docker compose up -d

# Espera a que Keycloak y Oracle estén healthy (~2 minutos)
docker compose ps

# Paso 2: levanta la app completa en contenedores
docker compose --profile full up -d --build

# Verifica logs del backend
docker compose logs backend --tail 30

# Abre la app
open http://localhost:3000
```

Verifica en el navegador:

1. La página de inicio carga la lista de posts
2. Puedes hacer clic en "Iniciar sesión" y autenticarte con `admin-user / <TU_PASSWORD_ADMIN>`
3. Como admin ves el badge "Admin" y el botón "Nuevo post"
4. Puedes crear un post, verlo en el listado y borrarlo

**Errores comunes en el Día 4**

| Síntoma | Causa | Solución |
|---|---|---|
| Backend no conecta a Oracle | Oracle todavía inicializando | `docker compose logs oracle` — espera healthcheck |
| Frontend carga pero no hay posts | El backend no pudo crear el usuario BLOGUSER | Conéctate a Oracle y repite los GRANTs del Día 1 |
| Keycloak loop en 8180 | `realm-export.json` con error de sintaxis | `docker compose logs keycloak` |
| `VITE_*` undefined en el frontend | Variables no pasadas como ARG al build | Revisa que el build de Docker pasa `--build-arg` o que el `docker-compose.yml` tiene la sección `args` |

---

# Día 5 — Despliegue en OCI

## ¿Qué cambia entre local y OCI?

Al desplegar en OCI cambias tres cosas principales:

| Componente | Local (Días 1-4) | OCI |
|---|---|---|
| Base de datos | Oracle 23c Free en Docker | Oracle ATP (managed) |
| IdP (proveedor de identidad) | Keycloak en Docker | OCI IAM (IDCS) |
| Hosting | `localhost` | OKE (Kubernetes) o App Service |

Los cambios de código son mínimos — todo está parametrizado con variables de entorno.

## Referencia de despliegue

El despliegue paso a paso en OCI (configuración de ATP wallet, OCI IAM domain, secrets en Vault,
y manifiestos de Kubernetes) está documentado en:

> 📄 [Guía de despliegue en OCI](/despliegue-estudiantes/)

Antes de ir a ese documento, verifica que tienes el checkpoint del Día 4 funcionando
completamente en local. Un error común es ir a despliegue sin haber probado la app
localmente con Docker Compose.

## Diferencias clave que debes entender

### 1. Oracle ATP con Wallet

En OCI la conexión a la base de datos usa mutual TLS. En lugar de
`jdbc:oracle:thin:@localhost:1521/FREEPDB1` usarás una cadena de conexión con TNS name
y el wallet montado en `/app/wallet`:

```
jdbc:oracle:thin:@(description=...)
```

El wallet se descarga desde la consola de OCI (ATP → DB Connection → Download Wallet) y se
monta en el pod de Kubernetes como un Secret.

### 2. OCI IAM (IDCS) como IdP

La URL del issuer cambia de `http://localhost:8180/realms/oci-blog` a algo del estilo:

```
https://<your-idcs-tenant>.identity.oraclecloud.com/
```

Los roles en OCI IAM se configuran mediante Grupos (Groups) mapeados a Claims en el Access Token.
El `JwtAuthConverter` que ya escribiste en el Día 2 soporta el claim `groups` nativamente.

> ⚠️ OCI IAM clásico (IDCS) expone los grupos solo si los configuras explícitamente en el
> "App" → "Token Customization". Si los grupos no aparecen en el JWT, verifica ese paso
> en la [Guía de despliegue en OCI](/despliegue-estudiantes/).

### 3. Logout con OCI IAM

El endpoint de logout de OCI IAM tiene una forma diferente a Keycloak. La URL correcta es:

```
https://<tenant>.identity.oraclecloud.com/oauth2/v1/userlogout
```

No uses `/oidc/logout` — ese endpoint no invalida la sesión en OCI IAM correctamente.
Consulta la guía de despliegue para la configuración exacta de `post_logout_redirect_uri`.

---

## Resumen de archivos por día

| Día | Archivos creados / modificados |
|---|---|
| 1 | `pom.xml`, `application.yml`, `OciBlogApplication.java`, `model/Post.java`, `model/Comment.java`, `repository/PostRepository.java`, `repository/CommentRepository.java`, `dto/PostRequest.java`, `dto/CommentRequest.java`, `service/PostService.java`, `service/CommentService.java`, `controller/PostController.java`, `controller/CommentController.java` |
| 2 | `pom.xml` (+security), `security/JwtAuthConverter.java`, `security/SecurityConfig.java`, `application.yml` (+security), `controller/PostController.java` (updated), `controller/CommentController.java` (updated), `docker-compose.yml`, `keycloak/realm-export.json` |
| 3 | `frontend/` (proyecto Vite), `vite.config.ts`, `.env.local`, `types/index.ts`, `auth/authConfig.ts`, `services/api.ts`, `main.tsx`, `components/Navbar.tsx`, `components/PostCard.tsx`, `pages/HomePage.tsx`, `App.tsx` |
| 4 | `index.css`, `components/ProtectedRoute.tsx`, `pages/CallbackPage.tsx`, `pages/PostDetailPage.tsx`, `components/PostForm.tsx`, `pages/CreatePostPage.tsx`, `pages/EditPostPage.tsx`, `App.tsx` (full), `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`, `docker-compose.yml` (full) |
| 5 | Sin cambios de código — solo configuración de OCI |
| 6 | `dto/PostSource.java`, `dto/ChatRequest.java`, `dto/ChatResponse.java`, `client/EmbeddingClient.java`, `client/GroqChatClient.java`, `service/VectorStoreService.java`, `service/RagService.java`, `controller/ChatController.java`, `OciBlogApplication.java` (+`@EnableAsync`), `config/SecurityConfig.java` (+chat routes), `repository/PostRepository.java` (+`countByPublishedTrue`), `service/PostService.java` (+auto-index), `application.yml` (+`ai:` section), `frontend/src/components/ChatWidget.tsx`, `frontend/src/App.tsx` (+ChatWidget) |

---

## Referencias

- [Spring Boot 3 Docs](https://docs.spring.io/spring-boot/docs/current/reference/html/)
- [Spring Security OAuth2 Resource Server](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/index.html)
- [react-oidc-context](https://github.com/authts/react-oidc-context)
- [oidc-client-ts](https://github.com/authts/oidc-client-ts)
- [Oracle JDBC Maven](https://www.oracle.com/database/technologies/maven-central-guide.html)
- [OCI IAM IDCS Token Customization](https://docs.oracle.com/en/cloud/paas/identity-cloud/uaids/add-custom-attributes-tokens.html)

---

# Día 6 — Asistente de Chat con RAG e Inteligencia Artificial

## ¿Qué vas a construir hoy?

Un asistente conversacional integrado en el blog que responde preguntas sobre los artículos publicados. El asistente usa **RAG (Retrieval-Augmented Generation)**: antes de responder, busca semánticamente los artículos más relevantes en Oracle 23ai y los entrega como contexto al LLM, evitando alucinaciones. Al terminar, tendrás un botón de chat flotante (burbuja verde) en todas las páginas del blog.

```
Usuario pregunta "¿Qué artículos hay sobre Kubernetes?"
       ↓
EmbeddingClient  →  OpenAI text-embedding-3-small  →  float[1536]
       ↓
VectorStoreService  →  Oracle VECTOR_DISTANCE(COSINE)  →  top-5 posts similares
       ↓
RagService  →  prompt con contexto  →  GroqChatClient (llama-3.1-8b-instant)
       ↓
ChatWidget (burbuja flotante verde) muestra la respuesta + fuentes
```

---

## Breve teoría (10 minutos)

### ¿Qué es un embedding?

Un embedding es una representación numérica del significado de un texto, expresada como un vector de 1536 números decimales. Textos semánticamente similares tienen vectores cercanos en el espacio vectorial.

```
"Spring Boot framework Java"  →  [0.12, -0.34, 0.78, ...]  (1536 números)
"Spring Boot tutorial"        →  [0.11, -0.33, 0.79, ...]  (muy cercano)
"Recetas de cocina mexicana"  →  [-0.91, 0.02, -0.44, ...] (muy lejano)
```

### ¿Cómo funciona RAG en 3 pasos?

1. **Indexación** (una vez por post): genera el embedding del contenido y lo guarda en Oracle como `VECTOR(1536, FLOAT32)`.
2. **Retrieval** (en cada pregunta): genera el embedding de la pregunta y busca los posts con mayor similitud coseno usando `VECTOR_DISTANCE(COSINE)` en SQL.
3. **Generation** (en cada pregunta): envía los posts recuperados como contexto al LLM, que genera una respuesta en lenguaje natural.

### ¿Por qué Oracle 23ai?

Oracle 23ai introduce el tipo de dato `VECTOR` nativo y la función `VECTOR_DISTANCE()`. No existe en Oracle 19c ni 21c. El ATP del proyecto ya usa `db_version = "23ai"` en Terraform.

---

## 6.1 Obtener las API keys

Necesitas dos claves antes de escribir una sola línea de código.

**Groq (LLM — gratis):**
1. [console.groq.com](https://console.groq.com) → Sign up → **API Keys** → **Create API Key**
2. Copia la clave: `<TU_GROQ_API_KEY>`

**OpenAI (embeddings — ~$0 para el lab):**
1. [platform.openai.com](https://platform.openai.com) → Sign up → **API keys** → **Create new secret key**
2. **Billing** → añade al menos $5 de crédito (cost real del lab: < $0.05)
3. Copia la clave: `<TU_OPENAI_API_KEY>`

Expórtalas en tu terminal para el resto del día:

```bash
export GROQ_API_KEY=<TU_GROQ_API_KEY>
export OPENAI_API_KEY=<TU_OPENAI_API_KEY>
```

---

## 6.2 DTOs del asistente

> 📁 `backend/src/main/java/com/ociblog/dto/PostSource.java`

```java
package com.ociblog.dto;

/** Referencia a un artículo devuelto como fuente por el asistente. */
public record PostSource(Long id, String title, String authorName) {}
```

> 📁 `backend/src/main/java/com/ociblog/dto/ChatRequest.java`

```java
package com.ociblog.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * history: últimos intercambios de la conversación (opcional).
 *   El frontend envía los N turnos anteriores para que el LLM
 *   tenga contexto y pueda responder preguntas de seguimiento.
 *   Máximo 10 pares para no exceder el contexto del modelo.
 */
public record ChatRequest(

    @NotBlank(message = "La pregunta no puede estar vacía")
    @Size(max = 1000, message = "La pregunta no puede exceder 1000 caracteres")
    String question,

    @Size(max = 10, message = "El historial no puede exceder 10 turnos")
    List<ChatTurn> history

) {
    /** Un turno de la conversación: rol ("user" o "assistant") + contenido. */
    public record ChatTurn(String role, String content) {}
}
```

> 📁 `backend/src/main/java/com/ociblog/dto/ChatResponse.java`

```java
package com.ociblog.dto;

import java.util.List;

public record ChatResponse(String answer, List<PostSource> sources) {}
```

---

## 6.3 EmbeddingClient — llama a OpenAI

> 📁 `backend/src/main/java/com/ociblog/client/EmbeddingClient.java`

> **¿Por qué Java HttpClient y no una librería?** Java 11 incluye `java.net.http.HttpClient` que soporta HTTP/2 y es suficiente para estas llamadas. Evitamos añadir dependencias Maven (Spring AI, Retrofit, etc.) para mantener el proyecto ligero y enseñar cómo funciona la integración directa.

```java
package com.ociblog.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

@Component
@Slf4j
public class EmbeddingClient {

    private final String apiKey;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public EmbeddingClient(
            @Value("${ai.embedding.openai.api-key:}") String apiKey,
            ObjectMapper objectMapper) {
        this.apiKey = apiKey;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    /**
     * Genera el vector de 1536 dimensiones para el texto dado.
     * El texto se trunca a 8000 caracteres para no superar los límites del modelo.
     */
    public float[] embed(String text) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("Embeddings no configurados — añade OPENAI_API_KEY");
        }
        try {
            String truncated = text.length() > 8000 ? text.substring(0, 8000) : text;
            String body = objectMapper.writeValueAsString(Map.of(
                    "model", "text-embedding-3-small",
                    "input", truncated
            ));
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.openai.com/v1/embeddings"))
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofSeconds(30))
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();

            HttpResponse<String> response = httpClient.send(
                    request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                throw new RuntimeException("OpenAI Embeddings API error: HTTP "
                        + response.statusCode() + " — " + response.body());
            }

            JsonNode root = objectMapper.readTree(response.body());
            JsonNode arr  = root.path("data").get(0).path("embedding");
            float[] result = new float[arr.size()];
            for (int i = 0; i < arr.size(); i++) {
                result[i] = (float) arr.get(i).asDouble();
            }
            log.debug("Embedding generado: {} dims para {} chars", result.length, text.length());
            return result;

        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Error al generar embedding: " + e.getMessage(), e);
        }
    }
}
```

---

## 6.4 GroqChatClient — llama al LLM

> 📁 `backend/src/main/java/com/ociblog/client/GroqChatClient.java`

> **¿Por qué Groq?** Groq tiene una API compatible con OpenAI, es gratuito en el tier free y sus modelos Llama 3.1 responden en < 1 segundo. Los estudiantes pueden usarla sin tarjeta de crédito.

```java
package com.ociblog.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

@Component
@Slf4j
public class GroqChatClient {

    private final String apiKey;
    private final String model;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public GroqChatClient(
            @Value("${ai.groq.api-key:}") String apiKey,
            @Value("${ai.groq.model:llama-3.1-8b-instant}") String model,
            ObjectMapper objectMapper) {
        this.apiKey = apiKey;
        this.model  = model;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    /**
     * Envía una conversación al LLM incluyendo el historial de turnos anteriores.
     *
     * La secuencia de mensajes que recibe Groq:
     *   [system]    → instrucciones + contexto RAG
     *   [user]      → turno 1 (de history)
     *   [assistant] → turno 2 (de history)
     *   ...
     *   [user]      → pregunta actual
     *
     * Esto permite respuestas de seguimiento como "¿y sobre el segundo?" porque
     * el LLM conoce el contexto previo.
     */
    public String chat(String systemPrompt, String userMessage, List<ChatTurn> history) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("Chat no configurado — añade GROQ_API_KEY");
        }
        try {
            List<Map<String, String>> messages = new ArrayList<>();
            messages.add(Map.of("role", "system", "content", systemPrompt));

            if (history != null) {
                for (ChatTurn turn : history) {
                    messages.add(Map.of("role", turn.role(), "content", turn.content()));
                }
            }
            messages.add(Map.of("role", "user", "content", userMessage));

            Map<String, Object> requestBody = Map.of(
                    "model",       model,
                    "messages",    messages,
                    "temperature", 0.4,
                    "max_tokens",  1024
            );

            String body = objectMapper.writeValueAsString(requestBody);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.groq.com/openai/v1/chat/completions"))
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofSeconds(60))
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();

            HttpResponse<String> response = httpClient.send(
                    request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                throw new RuntimeException("Groq Chat API error: HTTP "
                        + response.statusCode() + " — " + response.body());
            }

            JsonNode root = objectMapper.readTree(response.body());
            return root.path("choices").get(0).path("message").path("content").asText();

        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Error al llamar a Groq: " + e.getMessage(), e);
        }
    }
}
```

---

## 6.5 VectorStoreService — Oracle 23ai VECTOR

> 📁 `backend/src/main/java/com/ociblog/service/VectorStoreService.java`

> ⚠️ **Oracle 23ai requerido.** El tipo `VECTOR(1536, FLOAT32)` y la función `VECTOR_DISTANCE(COSINE)` solo existen en Oracle Database 23ai. El Terraform del proyecto ya incluye `db_version = "23ai"`. Si ves `No se pudo crear la tabla post_embeddings` en los logs, verifica que tu ATP es 23ai.

> **¿Por qué no usar Spring AI?** Spring AI añade una capa de abstracción útil en producción, pero aquí usamos JdbcTemplate directamente para que entiendas exactamente cómo funciona el almacenamiento vectorial en Oracle: `TO_VECTOR()` para convertir arrays a vectores y `VECTOR_DISTANCE()` para calcular similitud.

```java
package com.ociblog.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class VectorStoreService {

    private final JdbcTemplate jdbcTemplate;

    @Value("${ai.embedding.dimensions:1536}")
    private int dimensions;

    /**
     * Crea la tabla post_embeddings al arrancar si no existe.
     * VECTOR(1536, FLOAT32): columna para almacenar embeddings de 1536 dimensiones.
     * ON DELETE CASCADE: al borrar un post, su embedding se borra automáticamente.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void initialize() {
        try {
            jdbcTemplate.execute(
                "DECLARE BEGIN " +
                "  EXECUTE IMMEDIATE 'CREATE TABLE post_embeddings (" +
                "    post_id   NUMBER(19) NOT NULL, " +
                "    embedding VECTOR(1536, FLOAT32) NOT NULL, " +
                "    CONSTRAINT pk_post_emb PRIMARY KEY (post_id), " +
                "    CONSTRAINT fk_post_emb FOREIGN KEY (post_id) " +
                "      REFERENCES posts(id) ON DELETE CASCADE" +
                "  )'; " +
                "EXCEPTION WHEN OTHERS THEN " +
                "  IF SQLCODE != -955 THEN RAISE; END IF; " +  // -955 = tabla ya existe
                "END;"
            );
            log.info("Tabla post_embeddings lista (Oracle 23ai VECTOR)");
        } catch (Exception e) {
            log.warn("No se pudo crear la tabla post_embeddings. " +
                     "Verifica que el ATP sea Oracle 23ai. Error: {}", e.getMessage());
        }
    }

    /** Inserta o actualiza el embedding de un post (upsert con MERGE INTO). */
    public void upsertEmbedding(Long postId, float[] embedding) {
        String vec = toVectorString(embedding);
        jdbcTemplate.update(
            "MERGE INTO post_embeddings pe USING DUAL ON (pe.post_id = ?) " +
            "WHEN MATCHED     THEN UPDATE SET pe.embedding = TO_VECTOR(?, 1536, FLOAT32) " +
            "WHEN NOT MATCHED THEN INSERT (post_id, embedding) " +
            "                      VALUES (?, TO_VECTOR(?, 1536, FLOAT32))",
            postId, vec, postId, vec
        );
        log.debug("Embedding guardado para post_id={}", postId);
    }

    /**
     * Busca los topK posts más similares usando VECTOR_DISTANCE(COSINE).
     * La búsqueda ocurre en Oracle SQL — sin cargar vectores en memoria.
     * Incluye pub_date (fecha de publicación formateada) para que el LLM
     * pueda responder preguntas como "¿cuándo se publicó este post?".
     */
    public List<Map<String, Object>> findSimilar(float[] queryEmbedding, int topK) {
        return jdbcTemplate.queryForList(
            "SELECT p.id, p.title, p.summary, p.author_name, " +
            "       TO_CHAR(CAST(p.created_at AS DATE), 'DD/MM/YYYY') AS pub_date, " +
            "       SUBSTR(p.content, 1, 2000) AS content, " +
            "       VECTOR_DISTANCE(pe.embedding, TO_VECTOR(?, 1536, FLOAT32), COSINE) AS score " +
            "FROM posts p JOIN post_embeddings pe ON p.id = pe.post_id " +
            "WHERE p.published = 1 " +
            "ORDER BY score ASC " +
            "FETCH FIRST ? ROWS ONLY",
            toVectorString(queryEmbedding), topK
        );
    }

    public long countIndexed() {
        Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM post_embeddings", Long.class);
        return count != null ? count : 0L;
    }

    public boolean isIndexed(Long postId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM post_embeddings WHERE post_id = ?",
                Integer.class, postId);
        return count != null && count > 0;
    }

    /**
     * Convierte float[] al formato que Oracle TO_VECTOR() acepta: "[f1,f2,f3,...]"
     * SIN espacios — Arrays.toString() añade espacios que Oracle rechaza.
     */
    private String toVectorString(float[] embedding) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < embedding.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(embedding[i]);
        }
        return sb.append(']').toString();
    }
}
```

---

## 6.6 RagService — el pipeline completo

> 📁 `backend/src/main/java/com/ociblog/service/RagService.java`

> **¿Por qué `@Async` en `indexPost()`?** Generar un embedding tarda ~300ms (llamada a OpenAI). Si fuera síncrono, el endpoint `POST /api/posts` tardaría 300ms extra en responder. Con `@Async`, el post se guarda inmediatamente y el embedding se genera en segundo plano — la respuesta al admin es instantánea.
>
> **¿Por qué `@EventListener` en `autoReindexOnStartup()`?** Al desplegar el RAG en un cluster con posts existentes, nadie tiene que llamar manualmente al endpoint de reindex — el backend lo hace solo al arrancar si detecta posts sin indexar.

```java
package com.ociblog.service;

import com.ociblog.client.EmbeddingClient;
import com.ociblog.client.GroqChatClient;
import com.ociblog.dto.ChatResponse;
import com.ociblog.dto.PostSource;
import com.ociblog.model.Post;
import com.ociblog.repository.PostRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class RagService {

    private final EmbeddingClient    embeddingClient;
    private final VectorStoreService vectorStore;
    private final GroqChatClient     groqChatClient;
    private final PostRepository     postRepository;

    // ── Pipeline RAG ──────────────────────────────────────────────────────────

    /**
     * Pipeline RAG completo con soporte de conversación multi-turno.
     *
     * La búsqueda vectorial siempre se hace con la pregunta actual (no con el historial
     * completo) para mantener la relevancia de los documentos recuperados.
     * El historial permite preguntas de seguimiento como "¿y el segundo post?" o
     * "explícame más sobre eso".
     */
    public ChatResponse ask(String question, List<ChatTurn> history) {
        log.info("Procesando pregunta RAG: '{}' (historial: {} turnos)",
                question, history == null ? 0 : history.size());

        float[] queryEmbedding = embeddingClient.embed(question);
        List<Map<String, Object>> posts = vectorStore.findSimilar(queryEmbedding, 5);

        if (posts.isEmpty()) {
            return new ChatResponse("No encontré artículos relevantes para tu pregunta.", List.of());
        }

        String answer = groqChatClient.chat(buildSystemPrompt(posts), question, history);
        List<PostSource> sources = buildSources(posts);

        log.info("Respuesta RAG generada con {} fuentes", sources.size());
        return new ChatResponse(answer, sources);
    }

    // ── Indexación ────────────────────────────────────────────────────────────

    /**
     * Genera y almacena el embedding de un post de forma asíncrona.
     * Se llama desde PostService.createPost() y PostService.updatePost().
     * Los errores se loguean pero no interrumpen el flujo del backend.
     */
    @Async
    public void indexPost(Long postId) {
        try {
            Post post = postRepository.findById(postId).orElse(null);
            if (post == null || !Boolean.TRUE.equals(post.getPublished())) return;

            String text = post.getTitle()
                    + ". " + (post.getSummary() != null ? post.getSummary() : "")
                    + " " + post.getContent();

            float[] embedding = embeddingClient.embed(text);
            vectorStore.upsertEmbedding(postId, embedding);
            log.info("Post indexado: id={}, título='{}'", postId, post.getTitle());
        } catch (Exception e) {
            log.warn("Error al indexar post_id={}: {}", postId, e.getMessage());
        }
    }

    /**
     * Al arrancar, indexa automáticamente los posts que aún no tienen embedding.
     * Útil tras el primer despliegue del RAG o tras una migración de datos.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void autoReindexOnStartup() {
        try {
            long total   = postRepository.countByPublishedTrue();
            long indexed = vectorStore.countIndexed();
            if (total == 0)       { log.info("Auto-reindex: no hay posts publicados."); return; }
            if (indexed >= total) { log.info("Auto-reindex: todos los posts ({}) ya indexados.", total); return; }
            log.info("Auto-reindex: {} de {} posts sin indexar — iniciando...", total - indexed, total);
            reindexAll();
        } catch (Exception e) {
            log.warn("Auto-reindex falló (¿falta OPENAI_API_KEY?): {}", e.getMessage());
        }
    }

    public void reindexAll() {
        postRepository.findAll().stream()
                .filter(p -> Boolean.TRUE.equals(p.getPublished()))
                .forEach(p -> indexPost(p.getId()));
    }

    public Map<String, Object> getIndexStatus() {
        return Map.of(
            "indexedPosts",       vectorStore.countIndexed(),
            "totalPublishedPosts", postRepository.countByPublishedTrue()
        );
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private String buildSystemPrompt(List<Map<String, Object>> posts) {
        StringBuilder sb = new StringBuilder();
        sb.append("Eres el asistente del OCI Blog. Responde en español de forma concisa y amigable.\n");
        sb.append("Usa ÚNICAMENTE la información de los siguientes artículos para responder.\n");
        sb.append("Si la respuesta no está en los artículos, di \"No encontré información sobre ese tema en el blog.\"\n");
        sb.append("Cuando menciones un artículo, indica su título entre comillas.\n\n");
        sb.append("ARTÍCULOS DISPONIBLES:\n");

        for (Map<String, Object> post : posts) {
            sb.append("---\n");
            sb.append("Título: ").append(getString(post, "title")).append("\n");
            sb.append("Autor: ").append(getString(post, "author_name")).append("\n");
            String pubDate = getString(post, "pub_date");
            if (!pubDate.isBlank()) sb.append("Fecha de publicación: ").append(pubDate).append("\n");
            sb.append("Resumen: ").append(getString(post, "summary")).append("\n");
            String content = getString(post, "content");
            sb.append("Contenido (extracto): ")
              .append(content.length() > 500 ? content.substring(0, 500) : content)
              .append("\n");
        }
        sb.append("---\n");
        return sb.toString();
    }

    private List<PostSource> buildSources(List<Map<String, Object>> posts) {
        List<PostSource> sources = new ArrayList<>();
        for (Map<String, Object> post : posts) {
            Object idObj = post.get("id");
            Long id = idObj instanceof Number ? ((Number) idObj).longValue() : null;
            if (id != null) {
                sources.add(new PostSource(id,
                        getString(post, "title"),
                        getString(post, "author_name")));
            }
        }
        return sources;
    }

    private String getString(Map<String, Object> map, String key) {
        Object val = map.get(key);
        return val != null ? val.toString() : "";
    }
}
```

---

## 6.7 ChatController

> 📁 `backend/src/main/java/com/ociblog/controller/ChatController.java`

> **`/api/chat` es público** — cualquier visitante del blog puede preguntar sin autenticarse. Los endpoints de administración (`/api/admin/rag/*`) requieren `ROLE_ADMIN` y sirven para monitorear y forzar la reindexación.

```java
package com.ociblog.controller;

import com.ociblog.dto.ChatRequest;
import com.ociblog.service.RagService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class ChatController {

    private final RagService ragService;

    @PostMapping("/chat")
    public ResponseEntity<?> chat(@Valid @RequestBody ChatRequest request) {
        try {
            ChatResponse response = ragService.ask(request.question(), request.history());
            return ResponseEntity.ok(response);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(503).body(Map.of(
                "error", "El asistente no está configurado. " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of(
                "error", "Error al procesar tu pregunta. Inténtalo de nuevo."));
        }
    }

    @PostMapping("/admin/rag/reindex")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> reindex() {
        ragService.reindexAll();
        return ResponseEntity.ok(Map.of("message", "Reindexación iniciada"));
    }

    @GetMapping("/admin/rag/status")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> status() {
        return ResponseEntity.ok(ragService.getIndexStatus());
    }
}
```

---

## 6.8 Cambios en archivos existentes del backend

### OciBlogApplication.java — añadir `@EnableAsync`

> 📁 `backend/src/main/java/com/ociblog/OciBlogApplication.java`

Añade `@EnableAsync` para que los métodos anotados con `@Async` se ejecuten en hilos separados:

```java
@SpringBootApplication
@EnableJpaAuditing
@EnableAsync          // ← añadir esta anotación
public class OciBlogApplication { ... }
```

### application.yml — sección `ai:`

Añade al final del bloque raíz (fuera de cualquier perfil `---`):

```yaml
# ─── Asistente RAG ──────────────────────────────────────────────────────────
ai:
  groq:
    api-key: ${GROQ_API_KEY:}               # <TU_GROQ_API_KEY> — de console.groq.com
    model: ${GROQ_MODEL:llama-3.1-8b-instant}
  embedding:
    openai:
      api-key: ${OPENAI_API_KEY:}            # <TU_OPENAI_API_KEY> — de platform.openai.com
    dimensions: 1536

# Pool de hilos para @Async (indexación de embeddings en segundo plano)
spring:
  task:
    execution:
      pool:
        core-size: 2
        max-size: 4
        queue-capacity: 100
```

### SecurityConfig.java — rutas del chat y BearerTokenResolver

Añade estas tres reglas **antes** de `.anyRequest().authenticated()`:

```java
.requestMatchers(HttpMethod.POST, "/api/chat").permitAll()
.requestMatchers(HttpMethod.GET,  "/api/admin/rag/status").hasRole("ADMIN")
.requestMatchers(HttpMethod.POST, "/api/admin/rag/reindex").hasRole("ADMIN")
```

Añade `.bearerTokenResolver(optionalBearerTokenResolver())` al bloque `oauth2ResourceServer`:

```java
.oauth2ResourceServer(oauth2 -> oauth2
    .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthConverter))
    .bearerTokenResolver(optionalBearerTokenResolver())  // ← añadir
)
```

Y el bean correspondiente (permite que endpoints públicos funcionen aunque el cliente envíe un token vencido):

```java
@Bean
public BearerTokenResolver optionalBearerTokenResolver() {
    DefaultBearerTokenResolver resolver = new DefaultBearerTokenResolver();
    resolver.setAllowFormEncodedBodyParameter(false);
    resolver.setAllowUriQueryParameter(false);
    return request -> {
        try {
            return resolver.resolve(request);
        } catch (Exception e) {
            // Token mal formado — tratar como anónimo en lugar de bloquear
            return null;
        }
    };
}
```

Imports necesarios:
```java
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
```

> **¿Por qué?** Por defecto Spring Security lanza 401 si recibe un Bearer token inválido o expirado, **incluso en endpoints públicos**. Con este resolver, un token malformado o vencido se descarta silenciosamente y la petición continúa como anónima. El 401 solo se emite cuando el endpoint realmente requiere autenticación.

### PostRepository.java — método de conteo

```java
long countByPublishedTrue();
```

### PostService.java — auto-indexado al crear/publicar posts

> **¿Por qué `@Lazy`?** Inyectar `RagService` por constructor en `PostService` crea una dependencia circular con `PostRepository`. `@Lazy` retrasa la resolución del bean hasta el primer uso, rompiendo el ciclo.

Añade como campo (no en el constructor):

```java
@Autowired
@Lazy
private RagService ragService;
```

Añade también estos imports:
```java
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
```

En `createPost()`, después del `save()`:
```java
Post saved = postRepository.save(post);

// ⚠️ Usar afterCommit() en lugar de llamar indexPost() directamente.
// indexPost() es @Async y corre en otro hilo — si se llama antes de que
// la transacción haga commit, findById() no encuentra el post y lo omite.
if (Boolean.TRUE.equals(saved.getPublished())) {
    Long postId = saved.getId();
    TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
        @Override
        public void afterCommit() {
            ragService.indexPost(postId);
        }
    });
}
return saved;
```

En `updatePost()`, después del `save()`:
```java
Post saved = postRepository.save(post);

if (Boolean.TRUE.equals(saved.getPublished())) {
    Long postId = saved.getId();
    TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
        @Override
        public void afterCommit() {
            ragService.indexPost(postId);
        }
    });
}
return saved;
```

---

## 6.9 ChatWidget — la burbuja flotante

> 📁 `frontend/src/components/ChatWidget.tsx`

> **`fetch` en lugar de axios** — el endpoint `/api/chat` es público (no requiere token). Usamos `fetch` directamente para que el componente no dependa del interceptor de autenticación de Axios.

> **Persistencia en `localStorage`** — la conversación se guarda automáticamente y sobrevive recargas de página. El botón "🗑 Nueva" del header permite borrarla. El historial (últimos 6 mensajes) se envía al backend en cada petición para habilitar preguntas de seguimiento.

```typescript
import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

interface PostSource {
  id: number
  title: string
  authorName: string | null
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: PostSource[]
}

const API_BASE    = import.meta.env.VITE_API_BASE_URL ?? '/api'
const STORAGE_KEY = 'oci-blog-chat-history'
const MAX_HISTORY = 6   // últimos N turnos enviados al backend (3 pares user/assistant)

const WELCOME: ChatMessage = {
  role: 'assistant',
  content: '¡Hola! Soy el asistente del blog. Puedo responder preguntas sobre ' +
           'los artículos publicados. Prueba: "¿Hay posts sobre Kubernetes?" o ' +
           '"¿Cuándo se publicó el artículo de Spring Boot?"',
}

// ── Helpers de persistencia ──────────────────────────────────────────────────

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [WELCOME]
    const parsed = JSON.parse(raw) as ChatMessage[]
    return parsed.length > 0 ? parsed : [WELCOME]
  } catch {
    return [WELCOME]
  }
}

function saveHistory(messages: ChatMessage[]) {
  try {
    const toSave = messages.filter(m => m !== WELCOME)
    if (toSave.length === 0) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave.slice(-50)))
    }
  } catch {
    // localStorage lleno — no bloquear la UI
  }
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function ChatWidget() {
  const navigate = useNavigate()

  const [messages,  setMessages]  = useState<ChatMessage[]>(loadHistory)
  const [isOpen,    setIsOpen]    = useState(false)
  const [input,     setInput]     = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  // Persistir en localStorage cada vez que cambia el historial
  useEffect(() => { saveHistory(messages) }, [messages])

  // Auto-scroll al nuevo mensaje
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Focus al abrir
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100)
  }, [isOpen])

  const clearHistory = useCallback(() => {
    setMessages([WELCOME])
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  const send = async () => {
    const q = input.trim()
    if (!q || isLoading) return

    const userMsg: ChatMessage = { role: 'user', content: q }
    setInput('')
    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)

    try {
      // Construir historial: últimos MAX_HISTORY turnos (sin el mensaje de bienvenida)
      const history = messages
        .filter(m => m !== WELCOME)
        .slice(-MAX_HISTORY)
        .map(m => ({ role: m.role, content: m.content }))

      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history }),
      })

      const data = await res.json() as { answer?: string; sources?: PostSource[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)

      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: data.answer!, sources: data.sources ?? [] },
      ])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Lo siento, ocurrió un error: ${msg}` },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={{ position:'fixed', bottom:24, right:24, zIndex:1000,
                  display:'flex', flexDirection:'column', alignItems:'flex-end' }}>

      {isOpen && (
        <div style={{ width:360, height:520, background:'#fff', borderRadius:16,
                      boxShadow:'0 8px 32px rgba(0,0,0,0.18)',
                      display:'flex', flexDirection:'column', marginBottom:12,
                      overflow:'hidden' }}>

          {/* Header con botón de nueva conversación */}
          <div style={{ background:'#16a34a', color:'#fff', padding:'12px 16px',
                        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontWeight:600, fontSize:15 }}>Asistente del Blog</span>
              <button
                onClick={clearHistory}
                title="Borrar conversación y empezar de nuevo"
                style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'#fff',
                         borderRadius:6, padding:'3px 8px', fontSize:11, cursor:'pointer' }}>
                🗑 Nueva
              </button>
            </div>
            <button onClick={() => setIsOpen(false)}
                    style={{ background:'none', border:'none', color:'#fff',
                             fontSize:20, cursor:'pointer', lineHeight:1 }}>×</button>
          </div>

          {/* Mensajes */}
          <div style={{ flex:1, overflowY:'auto', padding:12, display:'flex',
                        flexDirection:'column', gap:10, background:'#f8fafc' }}>
            {messages.map((msg, i) => (
              <div key={i}>
                <div style={{
                  alignSelf: msg.role==='user' ? 'flex-end' : 'flex-start',
                  display:'inline-block',
                  maxWidth:'85%', padding:'10px 14px', fontSize:14, lineHeight:1.5,
                  borderRadius: msg.role==='user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.role==='user' ? '#16a34a' : '#fff',
                  color:       msg.role==='user' ? '#fff'     : '#1e293b',
                  boxShadow:   msg.role==='user' ? 'none' : '0 1px 4px rgba(0,0,0,0.10)',
                  float:       msg.role==='user' ? 'right' : 'left',
                  clear:'both',
                }}>
                  {msg.content}
                </div>
                {msg.role==='assistant' && msg.sources && msg.sources.length > 0 && (
                  <div style={{ clear:'both', marginTop:6, display:'flex', flexWrap:'wrap', gap:4 }}>
                    {msg.sources.map(src => (
                      <button
                        key={src.id}
                        onClick={() => { navigate(`/posts/${src.id}`); setIsOpen(false) }}
                        title={src.title}
                        style={{ background:'#dcfce7', color:'#15803d', border:'1px solid #bbf7d0',
                                 borderRadius:12, padding:'2px 10px', fontSize:12, cursor:'pointer' }}>
                        📄 {src.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div style={{ background:'#fff', borderRadius:'16px 16px 16px 4px',
                            padding:'10px 16px', fontSize:20, letterSpacing:2,
                            boxShadow:'0 1px 4px rgba(0,0,0,0.10)', color:'#64748b',
                            display:'inline-block' }}>
                ···
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding:'10px 12px', borderTop:'1px solid #e2e8f0',
                        display:'flex', gap:8, background:'#fff' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Escribe tu pregunta... (Enter para enviar)"
              rows={1}
              disabled={isLoading}
              style={{ flex:1, resize:'none', padding:'8px 14px', borderRadius:20,
                       border:'1px solid #d1d5db', fontSize:14, outline:'none',
                       fontFamily:'inherit', lineHeight:1.4 }}
            />
            <button
              onClick={send}
              disabled={isLoading || !input.trim()}
              style={{ width:38, height:38, borderRadius:'50%', border:'none',
                       background: isLoading || !input.trim() ? '#9ca3af' : '#16a34a',
                       color:'#fff', cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
                       fontSize:16, display:'flex', alignItems:'center', justifyContent:'center',
                       flexShrink:0, alignSelf:'flex-end' }}>
              ➤
            </button>
          </div>
        </div>
      )}

      <button onClick={() => setIsOpen(o => !o)}
              style={{ width:56, height:56, borderRadius:'50%', background:'#16a34a',
                       border:'none', cursor:'pointer', fontSize:24,
                       boxShadow:'0 4px 16px rgba(0,0,0,0.20)',
                       display:'flex', alignItems:'center', justifyContent:'center',
                       color:'#fff', flexShrink:0 }}>
        {isOpen ? '×' : '💬'}
      </button>
    </div>
  )
}
```

### Añadir ChatWidget a App.tsx

En `frontend/src/App.tsx`, importa y añade `<ChatWidget />` al final del return:

```typescript
import ChatWidget from './components/ChatWidget'

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        {/* ... tus rutas ... */}
      </Routes>
      <ChatWidget />   {/* ← aparece en todas las páginas */}
    </>
  )
}
```

---

## ✅ Checkpoint — Día 6

### 1. Arranca el backend con las claves

```bash
cd backend
export GROQ_API_KEY=<TU_GROQ_API_KEY>
export OPENAI_API_KEY=<TU_OPENAI_API_KEY>
export SPRING_PROFILES_ACTIVE=local-dev

mvn spring-boot:run
```

Verifica en los logs:

```
INFO VectorStoreService : Tabla post_embeddings lista (Oracle 23ai VECTOR)
INFO RagService         : Auto-reindex: no hay posts publicados todavía.
```

### 2. Crea un post publicado

```bash
TOKEN=$(curl -s -X POST \
  'http://localhost:8180/realms/oci-blog/protocol/openid-connect/token' \
  -d 'grant_type=password&client_id=oci-blog-app&username=admin-user&password=<TU_PASSWORD_ADMIN>' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s -X POST http://localhost:8080/api/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Mi primer post con RAG","content":"Este artículo habla sobre Spring Boot, Oracle 23ai y búsqueda vectorial con RAG.","summary":"Intro a RAG con Oracle","published":true}'
```

Verifica el indexado en los logs:

```
INFO RagService : Post indexado exitosamente: id=1, título='Mi primer post con RAG'
```

### 3. Prueba el chat

```bash
curl -s -X POST http://localhost:8080/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "¿Qué artículos hay sobre Spring Boot?"}' \
  | python3 -m json.tool
```

Respuesta esperada:
```json
{
  "answer": "Hay un artículo sobre Spring Boot: \"Mi primer post con RAG\"...",
  "sources": [{ "id": 1, "title": "Mi primer post con RAG", "authorName": "admin-user" }]
}
```

### 4. Verifica el widget en el navegador

```bash
cd frontend && npm run dev
```

Abre [http://localhost:5173](http://localhost:5173). Deberías ver el botón 💬 verde en la esquina inferior derecha. Haz clic y pregunta algo.

**Errores comunes en el Día 6**

| Síntoma | Causa | Solución |
|---|---|---|
| HTTP 503 "El asistente no está configurado" | `GROQ_API_KEY` o `OPENAI_API_KEY` vacías | Verifica que exportaste las variables antes de `mvn spring-boot:run` |
| `WARN: No se pudo crear la tabla post_embeddings` | Oracle en Docker no es 23c | Usa la imagen `gvenzl/oracle-free:23.5-slim-faststart` en `docker-compose.yml` |
| Post creado pero no se indexa | `@EnableAsync` falta en `OciBlogApplication.java` | Añade `@EnableAsync` |
| `UnsatisfiedDependencyException` circular | `RagService` inyectado por constructor en `PostService` | Usa `@Autowired @Lazy private RagService ragService;` como campo |
| Widget no aparece | `ChatWidget` no se añadió a `App.tsx` | Verifica que `<ChatWidget />` está al final del return de `App` |

---

Una vez que funcione en local, despliega en OCI siguiendo:

> 📄 [Guía de despliegue en OCI](/despliegue-estudiantes/) (infraestructura OCI + Kubernetes)
> 📄 [Guía operativa RAG](/rag/) (API keys en K8s + imágenes con RAG + verificación)
