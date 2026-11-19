# Photo quality images (optional)

Put these files in `static/photo/`. Settings → "Photo quality" uses them when they are present
(Low quality switches Photo quality off). Missing files keep the procedural look; ambient occlusion
and the sharper shadows work either way. A sky wider than 4096 px is refused (2k is plenty).
The normal and roughness maps are only used together with `ground_diff.jpg`.

| File | What | Suggested source (CC0) |
| --- | --- | --- |
| `sky.hdr` | Equirectangular HDR of a sky without ground (2k is enough). Lights the scene, the sun direction is taken from its brightest spot. | Poly Haven "… puresky" HDRIs, e.g. `kloofendal_48d_partly_cloudy_puresky_2k.hdr` |
| `ground_diff.jpg` | Grass colour map, tileable | Poly Haven or ambientCG grass textures (2k JPG) |
| `ground_nor.jpg` | Matching normal map (OpenGL convention) | same set (`_nor_gl`) |
| `ground_rough.jpg` | Matching roughness map | same set (`_rough`) |

One repeat of the ground texture covers `PHOTO_ASSETS.groundTileMetres` (3 m) in `src/photo.js`;
change it to match the scale of the texture you pick. With a real sky the scene is lit by the image;
the light levels are `PHOTO_LIGHT` in the same file and may need tuning for the HDRI you pick.
