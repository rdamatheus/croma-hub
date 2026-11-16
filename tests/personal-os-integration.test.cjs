const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/interno-personal-os.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'interno/personal-os/index.html'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'js/interno-navigation.js'), 'utf8');

test('entrada pessoal só é visível ao proprietário', () => {
  assert.match(nav, /key:'personal-os'.*roles:OWNER_ROLE/);
  assert.match(source, /protectInternalPage\(\{ roles: \['owner'\] \}\)/);
  assert.match(page, /<body hidden>/);
});

test('dados pessoais usam schema isolado e conta autenticada', () => {
  assert.match(source, /supabase\.schema\('personal_os'\)/);
  assert.match(source, /session\.user\.id/);
  assert.match(source, /\.eq\('workspace_id', workspaceId\)/);
  assert.doesNotMatch(source, /service_role|SUPABASE_SECRET_KEY|createClient\(/);
});

test('workspace só é inicializado após ação explícita', () => {
  assert.match(page, /id="activate"/);
  assert.match(source, /el\('activate'\)\.addEventListener\('click'/);
  assert.match(source, /db\.rpc\('ensure_personal_workspace'\)/);
});

test('núcleo mantém exclusão lógica e trilha de auditoria', () => {
  for (const entity of ['projects','tasks','goals','ideas','decisions']) assert.match(source, new RegExp(entity + ': \\{'));
  assert.match(source, /archived_at/);
  assert.match(source, /activity_log/);
  assert.match(source, /actor_user_id: userId/);
  assert.doesNotMatch(source, /\.delete\(/);
});

test('arquivo JavaScript tem sintaxe válida', () => {
  // Compila o módulo após retirar apenas imports e await de topo (sem executá-lo).
  const prepared = source
    .replace(/^import .*;\s*$/gm, '')
    .replace("const session = await protectInternalPage({ roles: ['owner'] });", "const session = { user: { id: 'test' } };")
    .replace(/\nawait initialize\(\);\s*$/, '\nvoid initialize();');
  assert.doesNotThrow(() => new Function(prepared));
});
