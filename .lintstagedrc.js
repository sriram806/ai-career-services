module.exports = {
  '*.{ts,tsx}': ['eslint --fix --max-warnings=0', 'prettier --write'],
  '*.{js,jsx}': ['prettier --write'],
  '*.{json,md,yaml,yml}': ['prettier --write'],
  '*.py': ['black --check', 'ruff check'],
};
