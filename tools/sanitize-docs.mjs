import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const docsDir = join(root, 'src/content/docs');

const pages = [
  {
    input: 'GUIA_DESARROLLO.md',
    output: 'desarrollo.md',
    title: 'Guía de Desarrollo',
    description: 'Construye el blog con Spring Boot, React, Oracle DB y autenticación OAuth2.',
  },
  {
    input: 'GUIA_DESPLIEGUE_ESTUDIANTES.md',
    output: 'despliegue-estudiantes.md',
    title: 'Despliegue en OCI',
    description: 'Publica la aplicación en Oracle Cloud Infrastructure usando ATP, IAM, OKE y OCIR.',
  },
  {
    input: 'GUIA_HIGIENE_OCI.md',
    output: 'higiene-oci.md',
    title: 'Higiene OCI',
    description: 'Limpia recursos de OCI para evitar costos y mantener el tenancy ordenado.',
  },
  {
    input: 'GUIA_RAG.md',
    output: 'rag.md',
    title: 'Asistente RAG',
    description: 'Configura y despliega el asistente de chat con Oracle 23ai Vector Search, OpenAI embeddings y Groq.',
  },
];

function frontmatter({ title, description }) {
  return `---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(description)}\n---\n\n`;
}

function sanitize(content) {
  return content
    .replace(/^# .+\n+/, '')
    .replace(/ocid1\.tenancy\.oc1\.\.[A-Za-z0-9]+/g, 'ocid1.tenancy.oc1..<TU_TENANCY_OCID>')
    .replace(/ocid1\.user\.oc1\.\.[A-Za-z0-9]+/g, 'ocid1.user.oc1..<TU_USER_OCID>')
    .replace(/ocid1\.compartment\.oc1\.\.[A-Za-z0-9]+/g, 'ocid1.compartment.oc1..<TU_COMPARTMENT_OCID>')
    .replace(/ocid1\.autonomousdatabase\.oc1\.\.[A-Za-z0-9]+/g, 'ocid1.autonomousdatabase.oc1..<TU_ATP_OCID>')
    .replace(/ocid1\.cluster\.oc1\.\.[A-Za-z0-9]+/g, 'ocid1.cluster.oc1..<TU_CLUSTER_OCID>')
    .replace(/Namespace OCIR:\s*[A-Za-z0-9_-]+/g, 'Namespace OCIR: <TU_NAMESPACE_OCIR>')
    .replace(/TENANCY_NAMESPACE=[A-Za-z0-9_-]+/g, 'TENANCY_NAMESPACE=<TU_NAMESPACE_OCIR>')
    .replace(/(tenancy_namespace\s*=\s*")[^"]+(")/g, '$1<TU_NAMESPACE_OCIR>$2')
    .replace(/(db_admin_password\s*=\s*")[^"]+(")/g, '$1<TU_PASSWORD_SEGURO>$2')
    .replace(/(password:\s*)BlogPass\d+/g, '$1<TU_PASSWORD_LOCAL>')
    .replace(/("username":\s*"admin-user"[\s\S]*?"value":\s*")[^"]+(")/g, '$1<TU_PASSWORD_ADMIN>$2')
    .replace(/("username":\s*"lector-user"[\s\S]*?"value":\s*")[^"]+(")/g, '$1<TU_PASSWORD_LECTOR>$2')
    .replace(/password=admin\d+/g, 'password=<TU_PASSWORD_ADMIN>')
    .replace(/password=lector\d+/g, 'password=<TU_PASSWORD_LECTOR>')
    .replace(/\bBlogPass\d+\b/g, '<TU_PASSWORD_LOCAL>')
    .replace(/\badmin-user \/ [^\s`]+/g, 'admin-user / <TU_PASSWORD_ADMIN>')
    .replace(/\blector-user \/ [^\s`]+/g, 'lector-user / <TU_PASSWORD_LECTOR>')
    .replace(/password=admin(&|")/g, 'password=<TU_PASSWORD_KEYCLOAK>$1')
    .replace(/password=admin\d+/g, 'password=<TU_PASSWORD_ADMIN>')
    .replace(/password=lector\d+/g, 'password=<TU_PASSWORD_LECTOR>')
    .replace(/WalletZip#[^"'\s]+/g, '<TU_PASSWORD_WALLET>')
    .replace(/Admin#OCI\d+!/g, '<TU_PASSWORD_ATP>')
    .replace(/gsk_[A-Za-z0-9_]+/g, '<TU_GROQ_API_KEY>')
    .replace(/sk-[A-Za-z0-9_-]+/g, '<TU_OPENAI_API_KEY>')
    .replace(/admin\.blog@example\.com/g, 'admin.blog@example.edu')
    .replace(/reader\.blog@example\.com/g, 'reader.blog@example.edu');
}

await mkdir(docsDir, { recursive: true });

await writeFile(
  join(docsDir, 'index.mdx'),
  `---\ntitle: OCI Blog Lab\ndescription: Laboratorio para construir un blog con Spring Boot y desplegarlo en Oracle Cloud Infrastructure.\ntemplate: splash\nhero:\n  tagline: Spring Boot + React + Oracle Database + OCI + RAG\n  image:\n    file: ../../assets/oci-blog-lab.svg\n  actions:\n    - text: Empezar desarrollo\n      link: /desarrollo/\n      icon: right-arrow\n      variant: primary\n    - text: Ir al despliegue\n      link: /despliegue-estudiantes/\n      icon: external\n---\n\nimport { Card, CardGrid } from '@astrojs/starlight/components';\n\nSigue el laboratorio en orden. Primero construye la aplicación en tu equipo, después publícala en OCI, añade el asistente RAG y al final limpia los recursos que ya no necesites.\n\n<CardGrid>\n  <Card title=\"1. Desarrollo\" icon=\"rocket\">\n    Crea el backend, frontend, base de datos local y autenticación del blog.\n  </Card>\n  <Card title=\"2. Despliegue en OCI\" icon=\"cloud\">\n    Lleva la aplicación a Oracle Cloud con ATP, IAM, OCIR y OKE.\n  </Card>\n  <Card title=\"3. Asistente RAG\" icon=\"seti:oracle\">\n    Agrega un chat con búsqueda vectorial en Oracle 23ai, embeddings y Groq.\n  </Card>\n  <Card title=\"4. Higiene OCI\" icon=\"seti:terraform\">\n    Revisa los recursos activos y elimina lo que ya no uses para evitar costos.\n  </Card>\n</CardGrid>\n`,
);

for (const page of pages) {
  const source = await readFile(join(root, page.input), 'utf8');
  await writeFile(join(docsDir, page.output), frontmatter(page) + sanitize(source));
}
