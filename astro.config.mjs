import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const [githubOwner, githubRepo] = process.env.GITHUB_REPOSITORY?.split('/') ?? [];
const isGitHubPagesBuild = Boolean(githubOwner && githubRepo);
const isUserPagesRepo = isGitHubPagesBuild && githubRepo === `${githubOwner}.github.io`;

export default defineConfig({
  site: isGitHubPagesBuild ? `https://${githubOwner}.github.io` : 'http://localhost:4321',
  base: isGitHubPagesBuild && !isUserPagesRepo ? `/${githubRepo}` : '/',
  integrations: [
    starlight({
      title: 'OCI Blog Lab',
      description: 'Guía paso a paso para construir un blog con Spring Boot y desplegarlo en OCI.',
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Laboratorio',
          items: [
            { label: 'Inicio', slug: '' },
            { label: 'Desarrollo', slug: 'desarrollo' },
            { label: 'Despliegue en OCI', slug: 'despliegue-estudiantes' },
            { label: 'Higiene OCI', slug: 'higiene-oci' },
          ],
        },
      ],
    }),
  ],
});
