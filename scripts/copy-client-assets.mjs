import { cpSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function copy(source, destination) {
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination);
}

copy('src/client/index.html', 'dist/client/index.html');
copy(
  'src/client/components/confirmation-modal.css',
  'dist/client/components/confirmation-modal.css'
);
copy(
  'src/client/components/chat/chat.css',
  'dist/client/components/chat/chat.css'
);

copy(
  'src/client/components/settings/settings.css',
  'dist/client/components/settings/settings.css'
);

copy(
  'src/client/components/skills/skills.css',
  'dist/client/components/skills/skills.css'
);

copy(
  'src/client/components/projects/projects.css',
  'dist/client/components/projects/projects.css'
);

copy('node_modules/marked/lib/marked.esm.js', 'dist/client/vendor/marked.esm.js');

console.log('Client static assets copied.');
