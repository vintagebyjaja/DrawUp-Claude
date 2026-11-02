#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
output_dir="${1:?Usage: bash regenerate.sh OUTPUT_DIRECTORY}"
mkdir -p "$output_dir"
output_dir="$(cd -- "$output_dir" && pwd)"
python "$script_dir/prepare_textures.py" "$output_dir"
blender --background --factory-startup --python-exit-code 1 --python "$script_dir/build_monroe.py" -- --output "$output_dir" --skip-renders
for format in blend glb obj fbx; do
  blender --background --factory-startup --python-exit-code 1 --python "$script_dir/validate_monroe.py" -- "$output_dir" "$format"
done
python "$script_dir/compare_exports.py" "$output_dir"
blender --background --factory-startup --python-exit-code 1 --python "$script_dir/render_monroe.py" -- "$output_dir"
