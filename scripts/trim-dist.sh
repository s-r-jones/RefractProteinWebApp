#!/usr/bin/env bash
# Removes the source models from the build so they are never deployed.
# They stay in public/ for local use (e.g. ?fidelity=original).
set -euo pipefail

cd "$(dirname "$0")/../dist"

rm -f assets/subsurfHD.glb assets/atoms.glb assets/bands.glb
