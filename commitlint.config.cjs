/** Conventional Commits, with scopes limited to the parts of this repo. */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        // apps
        'web', 'e2e',
        // go
        'api-gateway', 'delivery', 'tracking', 'chat',
        // nestjs
        'auth', 'user', 'restaurant', 'menu', 'cart', 'order', 'notification',
        // fastapi
        'payment', 'search',
        // shared / infra
        'contracts', 'libs', 'deploy', 'k8s', 'ci', 'docs', 'deps', 'repo',
      ],
    ],
    'body-max-line-length': [0],
  },
};
