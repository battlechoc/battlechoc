# Helpers for building game models from code in headless Blender (dev/blender/models/<name>.py),
# from scratch or around one of the user's hand-made meshes (Model.include).
# All parts go into one bmesh with material slots, because the game instances the primitives of a
# model's first node only: a model must be one object. Units: a board cell is 1 wide, the tile's
# top is at z = TILE (Blender is z-up; the glTF export turns it y-up).
import math
import random

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector
from mathutils.bvhtree import BVHTree

from shared import smooth_by_angle

TILE = 0.26

# the matte look of the game (see modernize_models.py): non-metals reflect half as much
MATTE = 0.85
SPECULAR_LEVEL = 0.25
SPECULAR_TINT = 0.5


def placement(at=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    return Matrix.LocRotScale(Vector(at), Euler(rot), Vector(scale))


def aim(model, direction):
    """Turns a model built facing +x towards `direction` and centres it on its cell."""
    model.transform(Matrix.Rotation(math.atan2(direction[1], direction[0]), 4, "Z"))
    xs = [vert.co.x for vert in model.bm.verts]
    ys = [vert.co.y for vert in model.bm.verts]
    model.transform(Matrix.Translation((-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, 0)))


class Model:
    def __init__(self, name, seed=1):
        self.name = name
        self.bm = bmesh.new()
        self.materials = {}
        self.random = random.Random(seed)

    def include(self, path):
        """Adds the visible meshes of another .blend (the user's hand-made models) with their
        modifiers applied and their materials as they are. Returns the new faces."""
        with bpy.data.libraries.load(path) as (source, target):
            target.objects = list(source.objects)
        depsgraph_objects = []
        for obj in target.objects:
            if obj is not None and obj.type == "MESH" and not obj.hide_render:
                bpy.context.scene.collection.objects.link(obj)
                depsgraph_objects.append(obj)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        faces = []
        for obj in depsgraph_objects:
            evaluated = obj.evaluated_get(depsgraph)
            mesh = evaluated.to_mesh()
            slots = []
            for slot in obj.material_slots:
                material = slot.material
                if material.name not in self.materials:
                    self.materials[material.name] = (len(self.materials), {"existing": material})
                slots.append(self.materials[material.name][0])
            count = len(self.bm.faces)
            self.bm.from_mesh(mesh)
            self.bm.faces.ensure_lookup_table()
            for face in self.bm.faces[count:]:
                face.material_index = slots[face.material_index] if slots else 0
                faces.append(face)
            evaluated.to_mesh_clear()
            bpy.data.objects.remove(obj)
        return faces

    def material(self, name, color, roughness=MATTE, metallic=0.0, emission=None, strength=0.0, double_sided=False):
        """The slot index of a material (made once per name). Colours are linear RGB."""
        if name not in self.materials:
            settings = dict(
                color=color,
                roughness=roughness,
                metallic=metallic,
                emission=emission,
                strength=strength,
                double_sided=double_sided,
            )
            self.materials[name] = (len(self.materials), settings)
        return self.materials[name][0]

    # -- parts -------------------------------------------------------------------------------

    def _part(self, verts, mat, bevel=0.0, segments=2, angle=30, normals=True):
        faces = list({face for vert in verts for face in vert.link_faces})
        for face in faces:
            face.material_index = mat
            face.smooth = True
        if normals:
            bmesh.ops.recalc_face_normals(self.bm, faces=faces)
        if bevel:
            edges = [
                edge
                for edge in {edge for face in faces for edge in face.edges}
                if edge.is_manifold and edge.calc_face_angle(0) > math.radians(angle)
            ]
            if edges:
                made = bmesh.ops.bevel(
                    self.bm,
                    geom=edges,
                    offset=bevel,
                    offset_type="OFFSET",
                    segments=segments,
                    profile=0.5,
                    affect="EDGES",
                    clamp_overlap=True,
                )
                # the new faces would take the material of slot 0
                for face in made["faces"]:
                    face.material_index = mat
                    face.smooth = True
                # bevelling replaces some of the part's faces
                faces = [face for face in faces if face.is_valid] + list(made["faces"])
        return faces

    def box(self, size, at, mat, rot=(0, 0, 0), bevel=0.0, segments=2):
        made = bmesh.ops.create_cube(self.bm, size=1.0, matrix=placement(at, rot, size))
        return self._part(made["verts"], mat, bevel, segments)

    def cylinder(self, radius, depth, at, mat, rot=(0, 0, 0), radius2=None, segments=16, bevel=0.0, caps=True):
        """Along the local z axis, centred on `at`."""
        made = bmesh.ops.create_cone(
            self.bm,
            cap_ends=caps,
            cap_tris=False,
            segments=segments,
            radius1=radius,
            radius2=radius if radius2 is None else radius2,
            depth=depth,
            matrix=placement(at, rot),
        )
        return self._part(made["verts"], mat, bevel, normals=caps)

    def sphere(self, radius, at, mat, scale=(1, 1, 1), rot=(0, 0, 0), segments=12, rings=8):
        made = bmesh.ops.create_uvsphere(
            self.bm, u_segments=segments, v_segments=rings, radius=radius, matrix=placement(at, rot, scale)
        )
        return self._part(made["verts"], mat)

    def blob(self, radius, at, mat, scale=(1, 1, 1), subdivisions=2, noise=0.0):
        """An icosphere, its surface pushed in and out a little for a lumpy shape."""
        made = bmesh.ops.create_icosphere(
            self.bm, subdivisions=subdivisions, radius=radius, matrix=placement(at, (0, 0, 0), scale)
        )
        if noise:
            centre = Vector(at)
            for vert in made["verts"]:
                offset = vert.co - centre
                vert.co = centre + offset * (1 + self.random.uniform(-noise, noise))
        return self._part(made["verts"], mat)

    def tube(self, points, radius, mat, segments=8, caps=True, closed=False, profile=None):
        """A tube through `points`; `radius` is one value or one per point. `closed` joins the
        end to the start (a ring) and leaves out the caps. `profile(angle)` scales the radius
        around the tube (ridges)."""
        points = [Vector(point) for point in points]
        radii = radius if isinstance(radius, (list, tuple)) else [radius] * len(points)
        count = len(points)
        rings = []
        normal = None
        for i, point in enumerate(points):
            if closed:
                tangent = (points[(i + 1) % count] - points[i - 1]).normalized()
            else:
                tangent = (points[min(i + 1, count - 1)] - points[max(i - 1, 0)]).normalized()
            if normal is None:
                reference = Vector((0, 0, 1)) if abs(tangent.z) < 0.9 else Vector((1, 0, 0))
                normal = tangent.cross(reference).normalized()
            else:
                # carried along the curve so the tube does not twist
                normal = (normal - tangent * normal.dot(tangent)).normalized()
            binormal = tangent.cross(normal)
            ring = []
            for k in range(segments):
                angle = 2 * math.pi * k / segments
                scale = profile(angle) if profile else 1.0
                ring.append(self.bm.verts.new(point + radii[i] * scale * (math.cos(angle) * normal + math.sin(angle) * binormal)))
            rings.append(ring)
        pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
        for first, second in pairs:
            for k in range(segments):
                self.bm.faces.new((first[k], first[(k + 1) % segments], second[(k + 1) % segments], second[k]))
        if caps and not closed:
            self.bm.faces.new(list(reversed(rings[0])))
            self.bm.faces.new(rings[-1])
        return self._part([vert for ring in rings for vert in ring], mat, normals=True)

    def ring(self, centre, axis, radius, thickness, mat, segments=24, minor=6):
        """A torus around `axis` (a wheel rim, a wreath)."""
        axis = Vector(axis).normalized()
        reference = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
        u = axis.cross(reference).normalized()
        v = axis.cross(u)
        points = [
            Vector(centre) + radius * (math.cos(2 * math.pi * k / segments) * u + math.sin(2 * math.pi * k / segments) * v)
            for k in range(segments)
        ]
        return self.tube(points, thickness, mat, segments=minor, closed=True)

    def leaf(self, base, direction, up, length, width, mat, droop=0.25, fold=0.35):
        """A leaf with a midrib: pointing along `direction`, its face towards `up`, folded along
        the rib and drooping towards the tip."""
        d = Vector(direction).normalized()
        side = d.cross(Vector(up)).normalized()
        u = side.cross(d).normalized()
        base = Vector(base)
        ts = (0.0, 0.25, 0.55, 0.8, 1.0)

        def rib(t):
            return base + d * (length * t) - u * (droop * length * t * t)

        def half(t):
            return width * 0.5 * math.sin(math.pi * min(t, 0.98)) ** 0.7

        mid = [self.bm.verts.new(rib(t)) for t in ts]
        left = [self.bm.verts.new(rib(t) + side * half(t) - u * (fold * half(t))) for t in ts[1:4]]
        right = [self.bm.verts.new(rib(t) - side * half(t) - u * (fold * half(t))) for t in ts[1:4]]
        for edge in (left, right):
            self.bm.faces.new((mid[0], mid[1], edge[0]))
            self.bm.faces.new((mid[1], mid[2], edge[1], edge[0]))
            self.bm.faces.new((mid[2], mid[3], edge[2], edge[1]))
            self.bm.faces.new((mid[3], mid[4], edge[2]))
        return self._part(mid + left + right, mat, normals=False)

    def surface(self, origin, direction, offset=0.0):
        """Where a ray from `origin` along `direction` first meets the model built so far, moved
        `offset` back towards the origin; None if it misses. For details that lie on a mesh."""
        if getattr(self, "_tree_faces", None) != len(self.bm.faces):
            self._tree = BVHTree.FromBMesh(self.bm)
            self._tree_faces = len(self.bm.faces)
        direction = Vector(direction).normalized()
        hit, _, _, _ = self._tree.ray_cast(Vector(origin), direction)
        return None if hit is None else hit - direction * offset

    def grow(self, factor):
        """Scales the whole model about the middle of the tile's top."""
        self.transform(Matrix.Translation((0, 0, TILE)) @ Matrix.Scale(factor, 4) @ Matrix.Translation((0, 0, -TILE)))

    def transform(self, matrix, faces=None):
        verts = {vert for face in faces if face.is_valid for vert in face.verts} if faces else self.bm.verts
        bmesh.ops.transform(self.bm, matrix=matrix, verts=list(verts))

    # -- output ------------------------------------------------------------------------------

    def save(self, path, smooth_angle=50):
        """`smooth_angle` None keeps the shading of the faces as they are (included meshes)."""
        mesh = bpy.data.meshes.new(self.name)
        self.bm.normal_update()
        self.bm.to_mesh(mesh)
        self.bm.free()
        if smooth_angle is not None:
            smooth_by_angle(mesh, math.radians(smooth_angle))
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        for name, (_, settings) in sorted(self.materials.items(), key=lambda item: item[1][0]):
            mesh.materials.append(settings["existing"] if "existing" in settings else make_material(name, **settings))
        bpy.ops.wm.save_as_mainfile(filepath=path)
        return obj


def make_material(name, color, roughness, metallic, emission, strength, double_sided):
    material = bpy.data.materials.new(name)
    if material.node_tree is None:
        material.use_nodes = True
    bsdf = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if not metallic:
        bsdf.inputs["Specular IOR Level"].default_value = SPECULAR_LEVEL
        bsdf.inputs["Specular Tint"].default_value = (SPECULAR_TINT, SPECULAR_TINT, SPECULAR_TINT, 1)
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    material.diffuse_color = (*color, 1)
    material.use_backface_culling = not double_sided
    return material
