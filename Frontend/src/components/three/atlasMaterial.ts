import * as THREE from 'three';

export interface AtlasUniforms {
  uAtlasTexels: { value: THREE.Vector2 };
  uAtlasGrid: { value: THREE.Vector2 };
  uTileUvScale: { value: THREE.Vector2 };
  uMaxLod: { value: number };
  uSideRough: { value: number };
  uFrontRough: { value: number };
  uSideMetal: { value: number };
  uFrontMetal: { value: number };
  uEmissiveGold: { value: THREE.Color };
  uEmissiveOther: { value: THREE.Color };
  uGoldPulse: { value: number };
  uEmissiveBase: { value: number };
}

export interface AtlasMaterial {
  material: THREE.MeshStandardMaterial;
  uniforms: AtlasUniforms;
  dispose: () => void;
}

/**
 * Một material duy nhất cho toàn bộ bức tường.
 *
 * Cách cũ dùng mảng 6 material trên BoxGeometry. Mảng material khiến renderer
 * đẩy MỘT render item cho MỖI nhóm hình học — tức 6 lệnh vẽ cho mỗi mesh, nhân
 * với một mesh cho mỗi ảnh. Ở đây chỉ có một material và mặt trước/sau được
 * phân biệt ngay trong fragment shader theo pháp tuyến, nên cả bức tường là
 * một lệnh vẽ.
 *
 * `customProgramCacheKey` cố định bảo đảm chỉ một chương trình được biên dịch
 * trong toàn bộ vòng đời — đổi theme trở thành thao tác ghi uniform, không tạo
 * lại material và do đó không còn rò material như trước.
 */
export function createAtlasMaterial(map: THREE.Texture): AtlasMaterial {
  const uniforms: AtlasUniforms = {
    uAtlasTexels: { value: new THREE.Vector2(2048, 2048) },
    uAtlasGrid: { value: new THREE.Vector2(16, 16) },
    uTileUvScale: { value: new THREE.Vector2(1 / 16, 1 / 16) },
    uMaxLod: { value: 6 },
    uSideRough: { value: 0.35 },
    uFrontRough: { value: 0.45 },
    uSideMetal: { value: 0.2 },
    uFrontMetal: { value: 0.05 },
    uEmissiveGold: { value: new THREE.Color('#E8A33D') },
    uEmissiveOther: { value: new THREE.Color('#0B0C0E') },
    uGoldPulse: { value: 1 },
    uEmissiveBase: { value: 0.35 },
  };

  const material = new THREE.MeshStandardMaterial({ map });
  material.customProgramCacheKey = () => 'iris-atlas-v1';

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        attribute vec4 aTile;      // x=slot(-1 nếu không ảnh) y=gold z=reveal w=tỷ lệ khung ô
        // Màu thương hiệu đi bằng thuộc tính riêng thay vì instanceColor của
        // three: instanceColor được tạo lười ở lần setColorAt đầu tiên và việc
        // định nghĩa USE_INSTANCING_COLOR phụ thuộc thời điểm biên dịch shader.
        attribute vec3 aBrand;
        uniform vec2 uAtlasGrid;
        uniform vec2 uTileUvScale;
        varying vec2 vAtlasUv;
        varying vec3 vBrand;
        varying float vFaceFront;
        varying float vReveal;
        varying float vHasPhoto;
        varying float vGold;
      `,
      )
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `
        #include <beginnormal_vertex>
        // Pháp tuyến của BoxGeometry đúng bằng các trục đơn vị, nên mặt trước/sau
        // là hai mặt có |z| = 1.
        vFaceFront = step(0.5, abs(objectNormal.z));
      `,
      )
      .replace(
        '#include <uv_vertex>',
        /* glsl */ `
        #include <uv_vertex>
        float slot  = aTile.x;
        vHasPhoto   = step(0.0, slot);
        vGold       = aTile.y;
        vReveal     = aTile.z;
        vBrand      = aBrand;

        // Ô ảnh trong atlas là hình vuông còn ô trên tường có thể dẹt tới 2:1,
        // nên cắt vào giữa thay vì kéo méo ảnh.
        float aspect = max(aTile.w, 0.0001);
        vec2 crop = aspect >= 1.0 ? vec2(1.0, 1.0 / aspect) : vec2(aspect, 1.0);
        vec2 uvCropped = (uv - 0.5) * crop + 0.5;

        float s   = max(slot, 0.0);
        float col = mod(s, uAtlasGrid.x);
        float row = floor(s / uAtlasGrid.x);
        // Atlas đã được lật trong lúc giải mã, nên hàng 0 nằm ở đáy không gian UV.
        float vRow = uAtlasGrid.y - 1.0 - row;

        vAtlasUv = (vec2(col, vRow) + uvCropped) * uTileUvScale;
        vMapUv   = vAtlasUv;
      `,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform vec2  uAtlasTexels;
        uniform float uMaxLod;
        uniform float uSideRough, uFrontRough;
        uniform float uSideMetal, uFrontMetal;
        uniform vec3  uEmissiveGold, uEmissiveOther;
        uniform float uGoldPulse, uEmissiveBase;
        varying vec2  vAtlasUv;
        varying vec3  vBrand;
        varying float vFaceFront, vReveal, vHasPhoto, vGold;

        // Tự tính mức mipmap rồi chặn lại. Với atlas luỹ thừa 2 và ô căn theo
        // lưới ô, các mức từ 0 tới log2(tile) chỉ lấy trung bình bên trong đúng
        // một ô; vượt mức đó thì hai ô cạnh nhau bắt đầu trộn vào nhau.
        float atlasLod() {
          vec2 t  = vAtlasUv * uAtlasTexels;
          vec2 dx = dFdx(t), dy = dFdy(t);
          float d = max(dot(dx, dx), dot(dy, dy));
          return clamp(0.5 * log2(max(d, 1e-8)), 0.0, uMaxLod);
        }
      `,
      )
      // Bỏ hẳn bước lấy mẫu mặc định: nó chạy TRƯỚC <color_fragment>, nên nếu
      // dùng nó thì diffuseColor *= vColor sẽ nhuộm ảnh bằng màu chữ.
      .replace('#include <map_fragment>', '')
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        vec3 brandColor = diffuseColor.rgb * vBrand;
        vec3 photo = textureLod(map, vAtlasUv, atlasLod()).rgb;
        float useTex = vFaceFront * vHasPhoto * vReveal;
        diffuseColor.rgb = mix(brandColor, photo, useTex);
      `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        #include <roughnessmap_fragment>
        roughnessFactor = mix(uSideRough, uFrontRough, vFaceFront * vHasPhoto);
      `,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        /* glsl */ `
        #include <metalnessmap_fragment>
        metalnessFactor = mix(uSideMetal, uFrontMetal, vFaceFront * vHasPhoto);
      `,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `
        #include <emissivemap_fragment>
        vec3 glow = mix(uEmissiveOther, uEmissiveGold * uGoldPulse, vGold);
        // Mặt có ảnh không tự phát sáng, nếu không ảnh sẽ bị bệt màu.
        totalEmissiveRadiance = glow * uEmissiveBase * (1.0 - vFaceFront * vHasPhoto);
      `,
      );
  };

  return {
    material,
    uniforms,
    dispose: () => material.dispose(),
  };
}

/** Cập nhật uniform atlas khi ảnh atlas được thay (giữ chỗ → thật, hoặc đổi độ phân giải). */
export function applyAtlasUniforms(
  uniforms: AtlasUniforms,
  atlas: { columns: number; rows: number; width: number; height: number; tile: number },
) {
  uniforms.uAtlasGrid.value.set(atlas.columns, atlas.rows);
  uniforms.uTileUvScale.value.set(1 / atlas.columns, 1 / atlas.rows);
  uniforms.uAtlasTexels.value.set(atlas.width, atlas.height);
  // log2(tile) là mức "một texel mỗi ô"; lùi một mức cho biên an toàn.
  uniforms.uMaxLod.value = Math.max(0, Math.log2(atlas.tile) - 1);
}
