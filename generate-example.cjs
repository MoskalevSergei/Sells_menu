#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node --version
python3 --version
npm run check
