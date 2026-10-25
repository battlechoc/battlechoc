# Builds the models that are made in code (dev/blender/models/<name>.py), saves each as
# dev/models/generated/<name>.blend (open it in Blender to look or edit) and, with --out DIR,
# exports it as GLB into DIR for a preview. Headless, from apps/pwa:
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b -P dev/blender/generate_models.py -- \
#       [--out dev/models-preview/v2] cacaotree xmasFactory cannon cannon@bronze
#
# name@variant hands the variant to the model's build() and adds it to the file names.
import importlib
import os
import sys

import bpy

sys.dont_write_bytecode = True
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
pwa = os.path.normpath(os.path.join(here, "..", ".."))

args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
out = None
names = []
while args:
    arg = args.pop(0)
    if arg == "--out":
        out = os.path.abspath(args.pop(0))
    else:
        names.append(arg)

generated = os.path.join(pwa, "dev", "models", "generated")
os.makedirs(generated, exist_ok=True)
if out:
    os.makedirs(out, exist_ok=True)

for spec in names:
    name, _, variant = spec.partition("@")
    file = spec.replace("@", "-")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    model = importlib.import_module("models." + name).build(variant or None)
    model.save(os.path.join(generated, file + ".blend"))
    if out:
        bpy.ops.export_scene.gltf(
            filepath=os.path.join(out, file + ".glb"),
            export_format="GLB",
            use_visible=True,
            export_cameras=False,
            export_lights=False,
            export_apply=True,
        )
    print(f"generated {file}")
