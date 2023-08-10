/**
 * @type { import('cz-git').UserConfig }
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [2, 'never', ['upper-case']],
  },
  prompt: {
    scopes: ['bin', 'index', 'utils'],
  },
}
