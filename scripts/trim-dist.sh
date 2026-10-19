#!/usr/bin/env bash
# Removes source and unused assets from the build so they are never deployed.
# They stay in public/ for local use (e.g. ?fidelity=original).
set -euo pipefail

cd "$(dirname "$0")/../dist"

rm -f \
	assets/Assets.zip \
	assets/subsurfHD.glb assets/atoms.glb assets/bands.glb \
	assets/subsurf.glb assets/subsurf.gltf assets/subsurf.bin \
	assets/ThickMap.png assets/ThickMap.jpg assets/bckgrnd.png \
	assets/AO.png assets/AO.jpg assets/checker.png \
	bin/worley_32.bin
rm -rf hdr
