---
title: "Higiene OCI"
description: "Limpia recursos de OCI para evitar costos y mantener el tenancy ordenado."
---

> **Para estudiantes y administradores.**
> Esta guía explica cómo identificar y eliminar recursos OCI que ya no necesitas,
> evitando costos innecesarios y manteniendo tu tenancy organizado.

---

## 1. Inventario — Ver todos tus recursos activos

El primer paso siempre es ver qué tienes. OCI Resource Search lo hace en un solo comando:

```bash
oci search resource structured-search \
  --query-text "query all resources where compartmentId = '<TU_COMPARTMENT_OCID>' \
    && lifecycleState != 'DELETED' \
    && lifecycleState != 'TERMINATED'" \
  --query "data.items[].{tipo:\"resource-type\", nombre:\"display-name\", estado:\"lifecycle-state\"}" \
  --output table
```

> Reemplaza `<TU_COMPARTMENT_OCID>` con tu OCID (o el del tenancy raíz).
> Lo encuentras en: OCI Console → Menú → Governance → Tenancy Details → OCID.

### Filtrar por tipo de recurso

```bash
# Solo instancias compute
oci search resource structured-search \
  --query-text "query Instance resources where compartmentId = '<COMPARTMENT_OCID>'"

# Solo bases de datos ATP
oci search resource structured-search \
  --query-text "query AutonomousDatabase resources where compartmentId = '<COMPARTMENT_OCID>'"

# Solo clusters OKE
oci search resource structured-search \
  --query-text "query Cluster resources where compartmentId = '<COMPARTMENT_OCID>'"
```

---

## 2. OCIR — Limpiar imágenes Docker antiguas

Las imágenes Docker acumuladas ocupan espacio (OCIR es gratis hasta 500 MB por región).

### Ver todos los repositorios y cuántas imágenes tienen

```bash
oci artifacts container repository list \
  --compartment-id '<COMPARTMENT_OCID>' \
  --all \
  --query "data.items[].{repo:\"display-name\", imagenes:\"image-count\", tamano_gb:\"billable-size-in-gbs\"}" \
  --output table
```

### Ver imágenes de un repositorio específico

```bash
oci artifacts container image list \
  --compartment-id '<COMPARTMENT_OCID>' \
  --repository-name '<NOMBRE_REPO>' \
  --all \
  --query "data[].{tag:\"display-name\", digest:digest, fecha:\"time-created\"}" \
  --output table
```

### Borrar una imagen específica

```bash
oci artifacts container image delete \
  --image-id '<IMAGE_OCID>' \
  --force
```

### Borrar TODAS las imágenes de un repositorio (cuidado)

```bash
# 1. Obtén los IDs de todas las imágenes
oci artifacts container image list \
  --compartment-id '<COMPARTMENT_OCID>' \
  --repository-name '<NOMBRE_REPO>' \
  --all 2>&1 | python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
for i in d.get('data', []):
    if isinstance(i, dict):
        print(i['id'])
" > /tmp/image_ids.txt

# 2. Borra cada imagen
while read ID; do
  oci artifacts container image delete --image-id "$ID" --force
  echo "Borrada: $ID"
done < /tmp/image_ids.txt
```

### Borrar un repositorio entero (debe estar vacío)

```bash
oci artifacts container repository delete \
  --repository-id '<REPO_OCID>' \
  --force
```

---

## 3. OKE — Limpiar clústeres y node pools

> ⚠️ Borra primero los node pools (instancias), luego el cluster.

### Listar clústeres

```bash
oci ce cluster list \
  --compartment-id '<COMPARTMENT_OCID>' \
  --all \
  --query "data[].{nombre:name, id:id, estado:\"lifecycle-state\", version:\"kubernetes-version\"}" \
  --output table
```

### Listar node pools de un cluster

```bash
oci ce node-pool list \
  --compartment-id '<COMPARTMENT_OCID>' \
  --cluster-id '<CLUSTER_OCID>' \
  --all \
  --query "data[].{nombre:name, id:id, estado:\"lifecycle-state\", nodos:\"node-config-details\".size}" \
  --output table
```

### Borrar node pool

```bash
oci ce node-pool delete \
  --node-pool-id '<NODE_POOL_OCID>' \
  --force
```

### Borrar cluster (después de borrar todos los node pools)

```bash
oci ce cluster delete \
  --cluster-id '<CLUSTER_OCID>' \
  --force
```

---

## 4. ATP — Limpiar bases de datos Autonomous

### Listar todas las ATP

```bash
oci db autonomous-database list \
  --compartment-id '<COMPARTMENT_OCID>' \
  --all \
  --query "data[].{nombre:\"display-name\", id:id, estado:\"lifecycle-state\", cpu:\"cpu-core-count\", free:\"is-free-tier\"}" \
  --output table
```

### Detener (parar) una ATP sin borrarla

```bash
# Útil para ahorrar recursos sin perder datos
oci db autonomous-database stop \
  --autonomous-database-id '<ATP_OCID>'
```

### Borrar una ATP

```bash
oci db autonomous-database delete \
  --autonomous-database-id '<ATP_OCID>' \
  --force
```

---

## 5. Networking — Limpiar VCNs y recursos de red

> ⚠️ Borra en orden: subnets → gateways → security lists → route tables → VCN.

### Listar VCNs

```bash
oci network vcn list \
  --compartment-id '<COMPARTMENT_OCID>' \
  --all \
  --query "data[].{nombre:\"display-name\", id:id, cidr:\"cidr-block\", estado:\"lifecycle-state\"}" \
  --output table
```

### Listar subnets de una VCN

```bash
oci network subnet list \
  --compartment-id '<COMPARTMENT_OCID>' \
  --vcn-id '<VCN_OCID>' \
  --all \
  --query "data[].{nombre:\"display-name\", cidr:\"cidr-block\", id:id}" \
  --output table
```

### Borrar subnet

```bash
oci network subnet delete --subnet-id '<SUBNET_OCID>' --force
```

### Borrar Internet Gateway

```bash
oci network internet-gateway delete --ig-id '<IGW_OCID>' --force
```

### Borrar NAT Gateway

```bash
oci network nat-gateway delete --nat-gateway-id '<NGW_OCID>' --force
```

### Borrar Service Gateway

```bash
oci network service-gateway delete --service-gateway-id '<SGW_OCID>' --force
```

### Borrar Route Table (no la default)

```bash
oci network route-table delete --rt-id '<RT_OCID>' --force
```

### Borrar Security List (no la default)

```bash
oci network security-list delete --security-list-id '<SL_OCID>' --force
```

### Borrar VCN (después de borrar todo lo anterior)

```bash
oci network vcn delete --vcn-id '<VCN_OCID>' --force
```

---

## 6. Compute — Limpiar instancias y volúmenes

### Listar instancias

```bash
oci compute instance list \
  --compartment-id '<COMPARTMENT_OCID>' \
  --all \
  --query "data[].{nombre:\"display-name\", id:id, estado:\"lifecycle-state\", shape:shape, ad:\"availability-domain\"}" \
  --output table
```

### Terminar (borrar) una instancia

```bash
oci compute instance terminate \
  --instance-id '<INSTANCE_OCID>' \
  --preserve-boot-volume false \
  --force
```

### Listar boot volumes huérfanos

```bash
oci bv boot-volume list \
  --compartment-id '<COMPARTMENT_OCID>' \
  --availability-domain '<AD_NAME>' \
  --all \
  --query "data[].{nombre:\"display-name\", id:id, gb:\"size-in-gbs\", estado:\"lifecycle-state\"}" \
  --output table
```

### Borrar boot volume

```bash
oci bv boot-volume delete --boot-volume-id '<BOOT_VOLUME_OCID>' --force
```

---

## 7. NAT Gateway — Cuándo borrarlo

El NAT Gateway cuesta ~$0.045/hr (~$33/mes). Si tus nodos OKE ya están registrados
y no necesitas que los pods accedan a internet general, puedes borrarlo:

```bash
# 1. Primero actualiza la route table de workers para quitar la ruta NAT
# (o Terraform lo maneja si borras el recurso del .tf y haces apply)

# 2. Borra el NAT Gateway
oci network nat-gateway delete \
  --nat-gateway-id '<NGW_OCID>' \
  --force
```

> **Nota**: Los pods del blog solo necesitan acceder a OCIR y Oracle ATP,
> ambos accesibles via Service Gateway (gratis). El NAT solo fue necesario
> durante el bootstrap inicial de los nodos OKE.

---

## 8. OCI IAM Identity Domain — Limpiar aplicaciones OIDC

> Solo borra aplicaciones que tú creaste. NUNCA borres: `OCI Console`, `IAM DataSafe`, `IAM LoginClient`.

### Listar aplicaciones en la Identity Domain

```bash
ENDPOINT="https://<TU_IDENTITY_DOMAIN_URL>"  # Ej: https://idcs-xxxxx.identity.oraclecloud.com

oci identity-domains apps list \
  --endpoint "$ENDPOINT" \
  --query "data.resources[].{nombre:\"display-name\", id:id, activa:active}" \
  --output table 2>/dev/null || \
oci identity-domains apps list \
  --endpoint "$ENDPOINT" 2>&1 | python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
for r in d['data'].get('resources', []):
    print(f'{r[\"display-name\"]:40} {r[\"id\"]:40} activa={r.get(\"active\")}')
"
```

### Borrar una aplicación (primero desactivar, luego borrar)

```bash
ENDPOINT="https://<TU_IDENTITY_DOMAIN_URL>"
APP_ID="<ID_DE_LA_APP>"   # ID SCIM, no el OCID

# Paso 1 — Desactivar
oci identity-domains app patch \
  --endpoint "$ENDPOINT" \
  --app-id "$APP_ID" \
  --operations '[{"op":"replace","path":"active","value":false}]' \
  --schemas '["urn:ietf:params:scim:api:messages:2.0:PatchOp"]'

# Paso 2 — Borrar
oci identity-domains app delete \
  --endpoint "$ENDPOINT" \
  --app-id "$APP_ID" \
  --force
```

---

## 9. Terraform — Destruir toda la infraestructura del lab

Cuando termines el lab y quieras borrar TODO lo que creó Terraform:

```bash
cd /ruta/al/proyecto/terraform

# Ver qué va a borrar
terraform plan -destroy

# Borrar todo (pide confirmación)
terraform destroy

# O sin confirmación (cuidado)
terraform destroy -auto-approve
```

> Esto borra VCN, subnets, ATP, OKE cluster, node pool, OCIR repos y gateways.
> Los secretos de Kubernetes y las imágenes subidas NO los gestiona Terraform
> (los creaste con kubectl y docker push).

---

## 10. Checklist de higiene periódica

Revisa esto una vez por semana si tienes recursos activos:

```
[ ] oci search resource → revisar qué hay corriendo
[ ] OCIR → borrar imágenes con tags "unknown" o muy antiguas
[ ] Compute → terminar instancias STOPPED que ya no necesitas
[ ] Boot volumes → borrar volúmenes huérfanos (instancia terminada pero volumen vivo)
[ ] NAT Gateway → borrar si los nodos OKE ya están registrados y no necesitas internet
[ ] ATP → parar si no la usas (STOPPED no cobra OCPU, solo almacenamiento)
[ ] Load Balancers → borrar si no hay servicios activos (cobra por hora)
```

---

## Referencia rápida — OCIDs de este proyecto

> Estos valores son específicos de este tenancy. Guárdalos.

```
Tenancy OCID:   ocid1.tenancy.oc1..<TU_TENANCY_OCID>
Namespace OCIR: <TU_NAMESPACE_OCIR>
Región:         mx-queretaro-1
OCIR Host:      mx-queretaro-1.ocir.io
```

Para ver el OCID de cualquier recurso:

```bash
oci search resource free-text-search --text '<nombre-del-recurso>' \
  --query "data.items[].{nombre:\"display-name\", ocid:identifier, tipo:\"resource-type\"}" \
  --output table
```
