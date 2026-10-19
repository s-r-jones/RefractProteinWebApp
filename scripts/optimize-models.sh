#!/usr/bin/env bash
# Builds low/medium/high fidelity versions of the protein models.
# Originals in public/assets/*.glb are kept as the "original" fidelity.
# Draco instead of meshopt: meshopt's quantization adds a node scale, and three.js
# multiplies transmission thickness by world scale, which tints the protein orange.
set -euo pipefail

cd "$(dirname "$0")/../public/assets"

gltf_transform="npx -y --registry=https://registry.npmjs.org @gltf-transform/cli@4.5.1"
models=( subsurfHD atoms bands )

build_fidelity() {
	local fidelity_name=$1
	local keep_ratio=$2

	for model in "${models[@]}"; do
		$gltf_transform weld "$model.glb" "/tmp/$model.welded.glb"
		$gltf_transform simplify "/tmp/$model.welded.glb" "/tmp/$model.simplified.glb" --ratio "$keep_ratio" --error 0.01
		$gltf_transform draco "/tmp/$model.simplified.glb" "$model.$fidelity_name.glb" --encode-speed 0 --decode-speed 0 --quantize-normal 8
	done
}

build_fidelity low 0.05
build_fidelity medium 0.2
build_fidelity high 0.5
