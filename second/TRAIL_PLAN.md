# Snow Trail Hybrid Plan (Texture + Local Deformation)

## Goal
Add a performant ski trail system using **(A) a texture-based trail mask** for wide coverage and **(B) a small local deformation patch** under the skier for immediate depth/edge detail.

---

## Phase 0 — Prep & Decisions
- **Coordinate system**: confirm terrain UV mapping / world-to-trail UV mapping.
- **Trail resolution**: pick texture size (e.g. 512×512 or 1024×1024) and world coverage area (e.g. 120m × 120m around player).
- **Patch size**: choose local deformation grid (e.g. 32×32 or 64×64) and world size (e.g. 8m × 8m).

---

## Phase 1 — Texture Trail (Wide Coverage)
**Objective:** persistent ski trails with minimal geometry cost.

1. **Render target setup**
   - Create a low-res trail texture (canvas or render target).
   - Maintain a world-space origin and scale for UV projection.

2. **Stamping system**
   - Each frame (or every N frames), stamp two ellipses for left/right skis.
   - Stamps are drawn into the trail texture (darkening/raising height, optional normal map).

3. **Shader integration**
   - Modify snow material shader to sample trail mask and adjust albedo/roughness + optional parallax/normal.
   - Blend by mask intensity.

4. **Persistence & scrolling**
   - Keep trail texture centered on player or allow finite map size and reuse with wrap.
   - If centered, shift origin and reproject coordinates.

Deliverable: visible trails with low GPU/CPU overhead.

---

## Phase 2 — Local Deformation Patch (High Detail Near Skis)
**Objective:** add subtle geometry deformation right beneath the skier.

1. **Patch mesh**
   - Create a small plane mesh (grid) that follows the skier.
   - Update vertex heights based on recent ski positions.

2. **Deformation logic**
   - For each frame, apply a small negative displacement in the patch near ski contact points.
   - Apply simple smoothing kernel (e.g. 1–2 passes) to avoid spikes.

3. **Normal update**
   - Recompute normals only for the patch after deformation.

Deliverable: localized “groove” detail under the skier without modifying the full terrain.

---

## Phase 3 — Integration & Balancing
1. **Visual blending**
   - Ensure patch mesh sits slightly below the snow surface to avoid z-fighting.
   - Match patch material to terrain, but add micro-shadowing if needed.

2. **Performance tuning**
   - Trail stamping rate (every frame vs every N frames).
   - Trail texture size (512 vs 1024).
   - Patch resolution (32×32 vs 64×64).

3. **Debug tools**
   - Toggle trail texture display.
   - Toggle patch mesh display.

---

## Phase 4 — Optional Enhancements
- Add **snow spray** particles when turning hard.
- Fade trails over time (decay in texture).
- Add **depth bias** using the trail mask in shader for stronger grooves.

---

## Proposed Defaults
- Trail texture: **512×512** covering **120m × 120m**
- Stamp rate: **every 2 frames**
- Patch: **64×64** grid covering **8m × 8m**
