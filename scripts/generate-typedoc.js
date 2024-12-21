const typedoc = require('typedoc');
const path = require('path');

async function main() {
  const app = new typedoc.Application();

  // TypeDoc options
  app.options.addReader(new typedoc.TSConfigReader());
  app.bootstrap({
    entryPoints: ['./src/client/src/types'],
    out: './docs/generated/types',
    excludePrivate: true,
    excludeProtected: true,
    excludeExternals: true
  });

  const project = app.convert();
  if (project) {
    await app.generateDocs(project, './docs/generated/types');
  }
}

main().catch(console.error);
